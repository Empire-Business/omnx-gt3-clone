-- ─── Canais de área sempre visíveis aos admins ─────────────────────────
-- Regra: toda área tem um canal no chat (criado ou já existente). O canal era
-- criado, mas ensure_area_channel só adicionava como membros os COLABORADORES
-- com cargo na área. Num tenant sem cargos preenchidos ainda, o canal nascia
-- com 0 membros — e como a UII (useChatChannels) lista apenas canais em que o
-- usuário é membro, o canal ficava invisível, inclusive para o admin que criou
-- a área ("os canais não foram criados", na percepção do usuário).
--
-- Correção:
--   1. ensure_area_channel passa a adicionar também os ADMINS do tenant como
--      membros do canal — garante que todo canal de área tenha membro e seja
--      visível a quem gerencia, independente de colaboradores alocados.
--   2. A função vira idempotente/self-healing: sincroniza os membros a cada
--      chamada (não retorna cedo quando o canal já existe).
--   3. Backfill: garante o canal + membros para todas as áreas já existentes.

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
    INSERT INTO public.chat_channels (tenant_id, name, area_id, is_dm, created_by)
    VALUES (p_tenant_id, p_area_name, p_area_id, false, auth.uid())
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

-- Backfill: garante canal + membros para todas as áreas já existentes.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, tenant_id, name FROM public.company_areas LOOP
    PERFORM public.ensure_area_channel(r.id, r.tenant_id, r.name);
  END LOOP;
END $$;
