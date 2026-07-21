-- ══════════════════════════════════════════════════════════════
-- OMNX Bot por tenant — segue o mesmo padrão de ensure_system_bot
-- (cria auth.users real + profile + employee).
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ensure_omnx_bot(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bot_user_id uuid;
BEGIN
  -- Procura por email único de OMNX bot deste tenant
  SELECT u.id INTO v_bot_user_id
    FROM auth.users u
   WHERE u.email = 'omnx-bot+' || p_tenant_id::text || '@omnx.system'
   LIMIT 1;

  IF v_bot_user_id IS NOT NULL THEN
    RETURN v_bot_user_id;
  END IF;

  v_bot_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (
    v_bot_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'omnx-bot+' || p_tenant_id::text || '@omnx.system',
    now(),
    jsonb_build_object('full_name', 'OMNX Bot', 'is_bot', true, 'is_omnx_bot', true),
    jsonb_build_object('provider', 'system', 'providers', ARRAY['system']),
    now(), now()
  );

  INSERT INTO public.profiles (user_id, tenant_id, full_name, is_system_bot)
  VALUES (v_bot_user_id, p_tenant_id, 'OMNX Bot', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.employees (tenant_id, user_id, status, work_email)
  VALUES (p_tenant_id, v_bot_user_id, 'active', 'omnx-bot+' || p_tenant_id::text || '@omnx.system')
  ON CONFLICT DO NOTHING;

  RETURN v_bot_user_id;
END;
$$;

-- Cria o bot para todos os tenants existentes
DO $$
DECLARE
  t RECORD;
  v_bot_id uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    v_bot_id := public.ensure_omnx_bot(t.id);
  END LOOP;
END $$;

-- Atualiza/garante o canal omnx-bot do tenant com created_by = bot real
DO $$
DECLARE
  t RECORD;
  v_bot_id uuid;
  v_existing uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    v_bot_id := public.ensure_omnx_bot(t.id);
    SELECT id INTO v_existing
      FROM public.chat_channels
     WHERE tenant_id = t.id AND name = 'omnx-bot' AND is_system = true
     LIMIT 1;
    IF v_existing IS NULL THEN
      INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
      VALUES (t.id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas',
              false, true, v_bot_id);
    ELSE
      UPDATE public.chat_channels
        SET created_by = v_bot_id,
            description = COALESCE(description, 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas')
        WHERE id = v_existing;
    END IF;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'omnx-bot channel sync: %', SQLERRM;
END $$;

-- Garante que TODOS os usuários do tenant são membros do canal omnx-bot
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
    SELECT ch.channel_id, p.user_id
    FROM public.profiles p
    WHERE p.tenant_id = ch.tenant_id AND p.user_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'omnx-bot member seed: %', SQLERRM;
END $$;

-- Trigger: novo tenant → cria bot + canal
CREATE OR REPLACE FUNCTION public.create_omnx_bot_channel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bot_id uuid;
BEGIN
  v_bot_id := public.ensure_omnx_bot(NEW.id);
  INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
  VALUES (NEW.id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas',
          false, true, v_bot_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS create_omnx_bot_on_tenant ON public.tenants;
CREATE TRIGGER create_omnx_bot_on_tenant
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_omnx_bot_channel();

-- Trigger: novo profile → adiciona como membro do canal omnx-bot do tenant
CREATE OR REPLACE FUNCTION public.add_user_to_omnx_bot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE tenant_id = NEW.tenant_id AND name = 'omnx-bot' AND is_system = true
  LIMIT 1;
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (v_channel_id, NEW.user_id)
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
