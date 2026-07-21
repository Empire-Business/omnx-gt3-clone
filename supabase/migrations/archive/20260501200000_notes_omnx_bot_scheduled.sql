-- ══════════════════════════════════════════════════════════════════════════════
-- Notes (bloco de anotações por usuário) + scheduled_messages + omnx_bot user
-- ══════════════════════════════════════════════════════════════════════════════

-- ───────────────────────── NOTES ─────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  user_id      UUID NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  body_md      TEXT NOT NULL DEFAULT '',
  tags         TEXT[] NOT NULL DEFAULT '{}',
  color        TEXT,                      -- nome semântico ou hex (opcional)
  pinned       BOOLEAN NOT NULL DEFAULT false,
  archived     BOOLEAN NOT NULL DEFAULT false,
  attachments  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_user_idx       ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS notes_tenant_idx     ON public.notes(tenant_id);
CREATE INDEX IF NOT EXISTS notes_tags_gin_idx   ON public.notes USING gin(tags);
CREATE INDEX IF NOT EXISTS notes_pinned_idx     ON public.notes(user_id, pinned)
  WHERE archived = false;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.notes_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS notes_touch ON public.notes;
CREATE TRIGGER notes_touch
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_touch_updated_at();

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notes_select ON public.notes;
CREATE POLICY notes_select ON public.notes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notes_insert ON public.notes;
CREATE POLICY notes_insert ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS notes_update ON public.notes;
CREATE POLICY notes_update ON public.notes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notes_delete ON public.notes;
CREATE POLICY notes_delete ON public.notes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;

-- ──────────────────── SCHEDULED MESSAGES ────────────────────
-- Mensagens que o OMNX Bot deve enviar em horário específico
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  created_by    UUID NOT NULL,            -- usuário que pediu o agendamento
  channel_id    UUID,                     -- canal de destino (mutuamente exclusivo com recipient_user_id)
  recipient_user_id UUID,                 -- destino quando for DM (criamos/encontramos a DM no envio)
  content       TEXT NOT NULL,
  send_at       TIMESTAMPTZ NOT NULL,
  sent_at       TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed | cancelled
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_messages_target_chk
    CHECK (channel_id IS NOT NULL OR recipient_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS scheduled_messages_pending_idx
  ON public.scheduled_messages(send_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS scheduled_messages_creator_idx
  ON public.scheduled_messages(created_by, status);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_messages_select ON public.scheduled_messages;
CREATE POLICY scheduled_messages_select ON public.scheduled_messages
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS scheduled_messages_insert ON public.scheduled_messages;
CREATE POLICY scheduled_messages_insert ON public.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS scheduled_messages_update ON public.scheduled_messages;
CREATE POLICY scheduled_messages_update ON public.scheduled_messages
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS scheduled_messages_delete ON public.scheduled_messages;
CREATE POLICY scheduled_messages_delete ON public.scheduled_messages
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- ──────────────────── OMNX BOT (system user/profile) ────────────────────
-- O OMNX Bot é um "usuário" sintético do sistema. Cada tenant tem seu canal
-- individual com o bot. As mensagens do bot são inseridas pela edge function
-- usando service_role, então não dependem de policy de INSERT no canal.

-- ID fixo do bot (mesmo padrão de outros system users do projeto)
DO $$
DECLARE
  v_bot_user_id CONSTANT UUID := '00000000-0000-0000-0000-0000000B0001';
BEGIN
  -- Garante linha em profiles para o bot (se não existir)
  INSERT INTO public.profiles (id, full_name, avatar_url, tenant_id)
  SELECT v_bot_user_id, 'OMNX Bot', NULL, t.id
  FROM public.tenants t
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN others THEN
  -- Schema de profiles pode variar entre instalações; ignora silenciosamente
  RAISE NOTICE 'profiles seed skipped: %', SQLERRM;
END $$;

-- Cria canal omnx-bot para cada tenant existente que ainda não tenha
DO $$
DECLARE
  t_id UUID;
  v_bot_user_id CONSTANT UUID := '00000000-0000-0000-0000-0000000B0001';
BEGIN
  FOR t_id IN SELECT id FROM public.tenants LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.chat_channels
      WHERE tenant_id = t_id AND name = 'omnx-bot'
    ) THEN
      INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
      VALUES (t_id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas', false, true, v_bot_user_id);
    END IF;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'omnx-bot channel seed skipped: %', SQLERRM;
END $$;

-- Trigger para criar canal omnx-bot automaticamente em novos tenants
CREATE OR REPLACE FUNCTION public.create_omnx_bot_channel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bot_user_id CONSTANT UUID := '00000000-0000-0000-0000-0000000B0001';
BEGIN
  INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
  VALUES (NEW.id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas', false, true, v_bot_user_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS create_omnx_bot_on_tenant ON public.tenants;
CREATE TRIGGER create_omnx_bot_on_tenant
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_omnx_bot_channel();

-- Adiciona automaticamente novos usuários como membros do canal omnx-bot do tenant deles
CREATE OR REPLACE FUNCTION public.add_user_to_omnx_bot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE tenant_id = NEW.tenant_id AND name = 'omnx-bot' AND is_system = true
  LIMIT 1;
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (v_channel_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS add_user_to_omnx_bot_trg ON public.profiles;
CREATE TRIGGER add_user_to_omnx_bot_trg
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.add_user_to_omnx_bot();

-- Adiciona usuários existentes ao canal do bot do tenant deles
DO $$
DECLARE
  ch RECORD;
BEGIN
  FOR ch IN
    SELECT c.id AS channel_id, c.tenant_id
    FROM public.chat_channels c
    WHERE c.is_system = true AND c.name = 'omnx-bot'
  LOOP
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT ch.channel_id, p.id
    FROM public.profiles p
    WHERE p.tenant_id = ch.tenant_id
    ON CONFLICT DO NOTHING;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'omnx-bot member seed skipped: %', SQLERRM;
END $$;
