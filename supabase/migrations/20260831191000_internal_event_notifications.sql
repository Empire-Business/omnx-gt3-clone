-- ══════════════════════════════════════════════════════════════
-- internal_event_notifications — trilha de idempotência dos avisos
-- de eventos internos próximos (Edge Function `notify-upcoming-events`).
--
-- Motivação: a função roda no pg_cron a cada minuto. Sem uma trava
-- persistente, cada execução reenviaria o mesmo lembrete para as mesmas
-- pessoas. A UNIQUE (event_id, employee_id, window_key) é a trava: a função
-- faz INSERT ... ON CONFLICT DO NOTHING RETURNING e só notifica quem ela
-- conseguiu "reservar" naquela rodada. Duas execuções concorrentes não
-- duplicam — a segunda simplesmente não recebe linhas de volta.
--
-- Se a notificação falhar depois da reserva, a função APAGA a linha
-- reservada para que a próxima rodada tente de novo.
--
-- Dependência: `internal_events` / `employees`. As FKs são criadas dentro de
-- blocos condicionais porque a migration de `internal_events` está sendo
-- escrita em paralelo e a ordem de aplicação pode ficar invertida — a tabela
-- de controle precisa aplicar de qualquer jeito.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.internal_event_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  event_id    uuid NOT NULL,
  employee_id uuid NOT NULL,
  -- user_id fica desnormalizado aqui só para a RLS de leitura do próprio
  -- usuário não precisar de join com employees.
  user_id     uuid,
  -- Qual janela de aviso já foi disparada para essa pessoa nesse evento.
  window_key  text NOT NULL CHECK (window_key IN ('t24h', 't15m')),
  channel     text NOT NULL DEFAULT 'in_app',
  sent_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_event_notifications_unique
    UNIQUE (event_id, employee_id, window_key)
);

-- FK para tenants (essa tabela existe com certeza).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'internal_event_notifications_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.internal_event_notifications
      ADD CONSTRAINT internal_event_notifications_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'internal_events'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'internal_event_notifications_event_id_fkey'
  ) THEN
    ALTER TABLE public.internal_event_notifications
      ADD CONSTRAINT internal_event_notifications_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES public.internal_events(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'internal_event_notifications_employee_id_fkey'
  ) THEN
    ALTER TABLE public.internal_event_notifications
      ADD CONSTRAINT internal_event_notifications_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Índice do caminho quente: "o que já mandei para esse evento".
CREATE INDEX IF NOT EXISTS internal_event_notifications_event_idx
  ON public.internal_event_notifications (event_id, window_key);

CREATE INDEX IF NOT EXISTS internal_event_notifications_tenant_idx
  ON public.internal_event_notifications (tenant_id, sent_at DESC);

-- ── RLS ────────────────────────────────────────────────────────
-- Escrita é exclusiva do service_role (a Edge Function). Nenhuma policy de
-- INSERT/UPDATE/DELETE é criada de propósito: com RLS ligada e sem policy,
-- anon/authenticated não escrevem. O service_role ignora RLS.
ALTER TABLE public.internal_event_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own event notifications"
  ON public.internal_event_notifications;
CREATE POLICY "user reads own event notifications"
  ON public.internal_event_notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin reads tenant event notifications"
  ON public.internal_event_notifications;
CREATE POLICY "admin reads tenant event notifications"
  ON public.internal_event_notifications FOR SELECT
  USING (public.is_admin() AND tenant_id = public.get_user_tenant_id());

COMMENT ON TABLE public.internal_event_notifications IS
  'Trilha de idempotência dos lembretes de eventos internos. Uma linha por (evento, colaborador, janela de aviso). Escrita apenas pela Edge Function notify-upcoming-events (service_role).';
