-- ══════════════════════════════════════════════════════════════
-- Canais de área: cada company_area ganha um canal de chat
-- automático com seus colaboradores como participantes
-- ══════════════════════════════════════════════════════════════

-- ── Retorna IDs de colaboradores ativos de uma área ───────────
CREATE OR REPLACE FUNCTION public.area_employee_ids(p_area_id UUID)
RETURNS TABLE(emp_id UUID) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT e.id
  FROM public.employees e
  JOIN public.employee_positions ep ON ep.employee_id = e.id
  JOIN public.positions p            ON p.id = ep.position_id
  LEFT JOIN public.subareas sa       ON sa.id = p.subarea_id
  WHERE e.status = 'active'
    AND (p.area_id = p_area_id OR sa.area_id = p_area_id);
$$;

-- ── Garante que um canal existe para a área ───────────────────
CREATE OR REPLACE FUNCTION public.ensure_area_channel(
  p_area_id UUID, p_tenant_id UUID, p_area_name TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT id INTO v_conv_id
  FROM public.chat_conversations
  WHERE area_id = p_area_id AND type = 'area'
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

  INSERT INTO public.chat_conversations (tenant_id, type, name, area_id)
  VALUES (p_tenant_id, 'area', p_area_name, p_area_id)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.chat_participants (conversation_id, employee_id, role)
  SELECT v_conv_id, ae.emp_id, 'member'
  FROM public.area_employee_ids(p_area_id) ae
  ON CONFLICT (conversation_id, employee_id) DO NOTHING;

  RETURN v_conv_id;
END;
$$;

-- ── Cria canais para todas as áreas existentes ────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, tenant_id, name FROM public.company_areas LOOP
    PERFORM public.ensure_area_channel(r.id, r.tenant_id, r.name);
  END LOOP;
END $$;

-- ── Trigger: nova área → criar canal automaticamente ──────────
CREATE OR REPLACE FUNCTION public.trg_area_channel_create()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.ensure_area_channel(NEW.id, NEW.tenant_id, NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS area_channel_create ON public.company_areas;
CREATE TRIGGER area_channel_create
  AFTER INSERT ON public.company_areas
  FOR EACH ROW EXECUTE FUNCTION public.trg_area_channel_create();

-- ── Trigger: área renomeada → sincroniza nome do canal ────────
CREATE OR REPLACE FUNCTION public.trg_area_channel_rename()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.name <> OLD.name THEN
    UPDATE public.chat_conversations
    SET name = NEW.name
    WHERE area_id = NEW.id AND type = 'area';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS area_channel_rename ON public.company_areas;
CREATE TRIGGER area_channel_rename
  AFTER UPDATE ON public.company_areas
  FOR EACH ROW EXECUTE FUNCTION public.trg_area_channel_rename();

-- ── Trigger: colaborador recebe posição → entra no canal da área
CREATE OR REPLACE FUNCTION public.trg_sync_employee_area_channel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_area_id UUID;
  v_conv_id UUID;
BEGIN
  -- Resolve area_id via posição direta ou subárea
  SELECT COALESCE(p.area_id, sa.area_id) INTO v_area_id
  FROM public.positions p
  LEFT JOIN public.subareas sa ON sa.id = p.subarea_id
  WHERE p.id = NEW.position_id;

  IF v_area_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_conv_id
  FROM public.chat_conversations
  WHERE area_id = v_area_id AND type = 'area'
  LIMIT 1;

  IF v_conv_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.chat_participants (conversation_id, employee_id, role)
  VALUES (v_conv_id, NEW.employee_id, 'member')
  ON CONFLICT (conversation_id, employee_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_employee_area_channel ON public.employee_positions;
CREATE TRIGGER sync_employee_area_channel
  AFTER INSERT ON public.employee_positions
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_employee_area_channel();
