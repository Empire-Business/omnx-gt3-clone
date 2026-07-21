-- ─── Canais de área: created_by ────────────────────────────────────────
-- Ao criar uma área, o trigger trg_area_channel_create chama
-- ensure_area_channel(), que insere um registro em chat_channels SEM definir
-- created_by. Como chat_channels.created_by era NOT NULL sem default, QUALQUER
-- criação de área falhava com:
--   "null value in column created_by of relation chat_channels violates
--    not-null constraint"
--
-- Correção:
--   1. created_by passa a ser opcional — canais criados automaticamente por
--      trigger/sistema podem não ter um criador humano.
--   2. ensure_area_channel passa a registrar auth.uid() (o usuário que criou a
--      área) quando disponível.

ALTER TABLE public.chat_channels ALTER COLUMN created_by DROP NOT NULL;

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

  IF v_channel_id IS NOT NULL THEN RETURN v_channel_id; END IF;

  INSERT INTO public.chat_channels (tenant_id, name, area_id, is_dm, created_by)
  VALUES (p_tenant_id, p_area_name, p_area_id, false, auth.uid())
  RETURNING id INTO v_channel_id;

  -- Adiciona todos os colaboradores ativos da area como membros
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

  RETURN v_channel_id;
END;
$function$;
