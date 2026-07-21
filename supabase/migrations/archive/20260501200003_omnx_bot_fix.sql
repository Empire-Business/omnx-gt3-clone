-- ══════════════════════════════════════════════════════════════
-- Fix: profiles.user_id (e não .id), triggers e seed de membros
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_bot_user_id CONSTANT UUID := '00000000-0000-0000-0000-0000000B0001';
BEGIN
  -- Cria profile do bot por tenant (chave: user_id + tenant_id)
  INSERT INTO public.profiles (user_id, full_name, avatar_url, tenant_id)
  SELECT v_bot_user_id, 'OMNX Bot', NULL, t.id
  FROM public.tenants t
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'profiles seed skipped: %', SQLERRM;
END $$;

-- Trigger: novo tenant → cria canal omnx-bot
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

-- Seed: adiciona usuários atuais ao canal omnx-bot do tenant deles
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
  RAISE NOTICE 'omnx-bot member seed skipped: %', SQLERRM;
END $$;
