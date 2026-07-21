-- ============================================================
-- Migração: reuniões recorrentes + bot de sistema (notificações)
-- Fatia 2 + Fatia 3 do roadmap GT3 v8.12.0
-- ============================================================

-- ── Fatia 2: Recorrência em meetings ────────────────────────────
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_pattern jsonb,
    -- {freq: 'daily'|'weekly', byday: ['MO','TU','WE','TH','FR','SA','SU'],
    --  time: 'HH:MM', tz: 'America/Sao_Paulo', end_date: 'YYYY-MM-DD'|null}
  ADD COLUMN IF NOT EXISTS reminder_minutes_before integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_occurrence_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS meetings_next_occurrence_idx
  ON public.meetings (next_occurrence_at)
  WHERE is_recurring = true;

-- Calcula próximo horário a partir de um padrão de recorrência
CREATE OR REPLACE FUNCTION public.compute_next_meeting_occurrence(
  p_pattern jsonb,
  p_after timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_freq text;
  v_byday text[];
  v_time text;
  v_tz text;
  v_end_date date;
  v_candidate timestamptz;
  v_local_date date;
  v_dow text;
  v_dows text[] := ARRAY['SU','MO','TU','WE','TH','FR','SA'];
BEGIN
  IF p_pattern IS NULL THEN
    RETURN NULL;
  END IF;

  v_freq := COALESCE(p_pattern->>'freq', 'weekly');
  v_byday := CASE
    WHEN p_pattern->'byday' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_pattern->'byday'))
    ELSE ARRAY['MO','TU','WE','TH','FR']
  END;
  v_time := COALESCE(p_pattern->>'time', '09:00');
  v_tz := COALESCE(p_pattern->>'tz', 'America/Sao_Paulo');
  v_end_date := NULLIF(p_pattern->>'end_date','')::date;

  -- Busca a próxima ocorrência até 60 dias adiante
  FOR i IN 0..60 LOOP
    v_local_date := (timezone(v_tz, p_after))::date + i;
    IF v_end_date IS NOT NULL AND v_local_date > v_end_date THEN
      RETURN NULL;
    END IF;

    v_dow := v_dows[EXTRACT(DOW FROM v_local_date)::int + 1];
    IF v_freq = 'daily' OR v_dow = ANY(v_byday) THEN
      v_candidate := timezone(
        v_tz,
        (v_local_date::text || ' ' || v_time)::timestamp
      );
      IF v_candidate > p_after THEN
        RETURN v_candidate;
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- Trigger: recalcula next_occurrence_at quando padrão/horário muda;
-- também reseta last_reminder_sent_at para que o cron renotifique adiamentos.
CREATE OR REPLACE FUNCTION public.meetings_recurrence_recompute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_recurring THEN
    NEW.next_occurrence_at := public.compute_next_meeting_occurrence(
      NEW.recurrence_pattern, now()
    );
  ELSE
    -- Para reuniões pontuais, next_occurrence_at espelha scheduled_date+time
    IF NEW.scheduled_date IS NOT NULL THEN
      NEW.next_occurrence_at := (NEW.scheduled_date::text || ' ' ||
        COALESCE(NEW.scheduled_time::text, '09:00')
      )::timestamp AT TIME ZONE 'America/Sao_Paulo';
    END IF;
  END IF;

  -- Renotifica se horário/recorrência mudou
  IF TG_OP = 'UPDATE' AND (
    OLD.next_occurrence_at IS DISTINCT FROM NEW.next_occurrence_at
    OR OLD.recurrence_pattern IS DISTINCT FROM NEW.recurrence_pattern
    OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
    OR OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time
  ) THEN
    NEW.last_reminder_sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meetings_recurrence_recompute_trg ON public.meetings;
CREATE TRIGGER meetings_recurrence_recompute_trg
  BEFORE INSERT OR UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.meetings_recurrence_recompute();

-- RLS adicional: apenas admins podem criar/editar reuniões recorrentes.
-- Reuniões pontuais continuam acessíveis a admin/manager (policies originais).
DROP POLICY IF EXISTS meetings_recurring_admin_only ON public.meetings;
CREATE POLICY meetings_recurring_admin_only ON public.meetings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (NOT is_recurring OR public.is_admin())
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (NOT is_recurring OR public.is_admin())
  );

-- ── Fatia 3: Bot de sistema para notificações ──────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_system_bot boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_system_bot_idx
  ON public.profiles (tenant_id) WHERE is_system_bot = true;

-- Helper: garante que cada tenant tem um bot próprio.
-- O bot precisa de um auth.users companheiro — usamos um id determinístico
-- por tenant para facilitar idempotência.
CREATE OR REPLACE FUNCTION public.ensure_system_bot(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bot_user_id uuid;
BEGIN
  SELECT user_id INTO v_bot_user_id
    FROM public.profiles
   WHERE tenant_id = p_tenant_id AND is_system_bot = true
   LIMIT 1;

  IF v_bot_user_id IS NOT NULL THEN
    RETURN v_bot_user_id;
  END IF;

  -- Cria auth.users + profile do bot. Email único por tenant.
  v_bot_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, confirmed_at)
  VALUES (
    v_bot_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bot+' || p_tenant_id::text || '@empire.system',
    jsonb_build_object('full_name', 'Empire Bot', 'is_bot', true),
    jsonb_build_object('provider', 'system', 'providers', ARRAY['system']),
    now(), now(), now()
  );

  INSERT INTO public.profiles (user_id, tenant_id, full_name, is_system_bot)
  VALUES (v_bot_user_id, p_tenant_id, 'Empire Bot', true);

  -- Garante employees row para o bot poder participar de chat_conversations
  INSERT INTO public.employees (tenant_id, user_id, status, work_email)
  VALUES (p_tenant_id, v_bot_user_id, 'active', 'bot+' || p_tenant_id::text || '@empire.system')
  ON CONFLICT DO NOTHING;

  RETURN v_bot_user_id;
END;
$$;

-- Garante uma conversa direct (DM) entre dois employees, criando se não
-- existir. Retorna o id da conversa. Idempotente.
CREATE OR REPLACE FUNCTION public.ensure_dm_conversation(
  p_tenant_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_a uuid;
  v_emp_b uuid;
  v_conv_id uuid;
BEGIN
  SELECT id INTO v_emp_a FROM public.employees
    WHERE user_id = p_user_a AND tenant_id = p_tenant_id LIMIT 1;
  SELECT id INTO v_emp_b FROM public.employees
    WHERE user_id = p_user_b AND tenant_id = p_tenant_id LIMIT 1;

  IF v_emp_a IS NULL OR v_emp_b IS NULL THEN
    RETURN NULL;
  END IF;

  -- Procura DM existente onde ambos employees participam
  SELECT c.id INTO v_conv_id
    FROM public.chat_conversations c
    WHERE c.tenant_id = p_tenant_id
      AND c.type = 'direct'
      AND EXISTS (
        SELECT 1 FROM public.chat_participants p
        WHERE p.conversation_id = c.id AND p.employee_id = v_emp_a
      )
      AND EXISTS (
        SELECT 1 FROM public.chat_participants p
        WHERE p.conversation_id = c.id AND p.employee_id = v_emp_b
      )
    LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Cria nova conversa
  INSERT INTO public.chat_conversations (tenant_id, type, created_by)
  VALUES (p_tenant_id, 'direct', p_user_a)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.chat_participants (conversation_id, employee_id)
  VALUES (v_conv_id, v_emp_a), (v_conv_id, v_emp_b);

  RETURN v_conv_id;
END;
$$;

-- Backfill: cria bot para todos os tenants existentes
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.ensure_system_bot(t.id);
  END LOOP;
END$$;

-- Tabela de notificações já existe (assumido). Se não existir, comentar bloco abaixo.
-- Garante coluna metadata para roteamento de tipos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    EXECUTE 'ALTER TABLE public.notifications
             ADD COLUMN IF NOT EXISTS source text DEFAULT ''system''';
  END IF;
END$$;

-- ── pg_cron: dispatcher de reminders (Fatia 3) ──────────────────
-- Roda a cada minuto e chama a edge function system-bot-notify para
-- cada meeting que está dentro da janela reminder_minutes_before.
-- Requer GUCs configuradas no projeto:
--   ALTER DATABASE postgres SET app.functions_url = 'https://<ref>.supabase.co/functions/v1';
--   ALTER DATABASE postgres SET app.service_role_key = '<service-role-jwt>';
DO $$
DECLARE
  v_has_cron boolean;
  v_has_net  boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') INTO v_has_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net')  INTO v_has_net;

  IF v_has_cron AND v_has_net THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='meeting_reminder_dispatch') THEN
      PERFORM cron.unschedule('meeting_reminder_dispatch');
    END IF;

    PERFORM cron.schedule(
      'meeting_reminder_dispatch',
      '* * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.functions_url', true) || '/system-bot-notify',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := jsonb_build_object('type','meeting_reminder')
      );
      $cron$
    );
  END IF;
END$$;

COMMENT ON COLUMN public.meetings.recurrence_pattern IS
  'JSON: {freq: daily|weekly, byday: [MO,TU,...], time: HH:MM, tz, end_date}';
COMMENT ON COLUMN public.meetings.reminder_minutes_before IS
  'Minutos antes de next_occurrence_at em que o bot envia lembrete';
COMMENT ON COLUMN public.profiles.is_system_bot IS
  'Marca o usuário como bot de sistema (não aparece em listas humanas)';
