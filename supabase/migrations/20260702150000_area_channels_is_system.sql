-- ─── Canais de área são canais oficiais (is_system) ────────────────────
-- A UI do chat (src/pages/Chat.tsx) categoriza os canais assim:
--   • "Canais"        = !is_dm && is_system
--   • "grupos custom" = !is_dm && !is_system
--   • "DMs"           = is_dm
-- Os canais de área eram criados com is_system = false, então apareciam como
-- "grupo custom" em vez de na seção "Canais". Como são canais oficiais gerados
-- pela estrutura organizacional, devem ter is_system = true.
--
-- Correção:
--   1. ensure_area_channel passa a criar o canal com is_system = true.
--   2. Backfill: marca is_system = true nos canais de área já existentes.

CREATE OR REPLACE FUNCTION public.ensure_area_channel(p_area_id uuid, p_tenant_id uuid, p_area_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_channel_id UUID;
BEGIN
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE area_id = p_area_id
  LIMIT 1;

  IF v_channel_id IS NULL THEN
    INSERT INTO public.chat_channels (tenant_id, name, area_id, is_dm, is_system, created_by)
    VALUES (p_tenant_id, p_area_name, p_area_id, false, true, auth.uid())
    RETURNING id INTO v_channel_id;
  END IF;

  -- Colaboradores ativos com cargo na área
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  SELECT v_channel_id, e.user_id, 'member'
  FROM public.employees e
  JOIN public.employee_positions ep ON ep.employee_id = e.id
  JOIN public.positions p            ON p.id = ep.position_id
  LEFT JOIN public.subareas sa       ON sa.id = p.subarea_id
  WHERE e.status = 'active'
    AND e.user_id IS NOT NULL
    AND (p.area_id = p_area_id OR sa.area_id = p_area_id)
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  -- Admins do tenant: garantem canal sempre visível a quem gerencia
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  SELECT v_channel_id, ur.user_id, 'admin'
  FROM public.user_roles ur
  JOIN public.profiles pr ON pr.user_id = ur.user_id
  WHERE ur.role = 'admin'
    AND pr.tenant_id = p_tenant_id
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN v_channel_id;
END;
$function$;

-- Backfill: canais de área existentes viram is_system = true.
UPDATE public.chat_channels
SET is_system = true
WHERE area_id IS NOT NULL
  AND is_system = false;
