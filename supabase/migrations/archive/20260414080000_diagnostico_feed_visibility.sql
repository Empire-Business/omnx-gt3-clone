-- ============================================================
-- Diagnóstico: visibilidade feed por sub área
-- TEMPORÁRIO — remover após resolver o bug
-- ============================================================

CREATE OR REPLACE FUNCTION public.diagnostico_feed_visibilidade()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid         uuid  := auth.uid();
  v_tenant_id   uuid  := public.get_user_tenant_id();
  v_employee    jsonb;
  v_positions   jsonb;
  v_ultimo_post jsonb;
  v_can_read    boolean;
BEGIN
  -- 1. Employee do usuário atual
  SELECT to_jsonb(e) INTO v_employee
  FROM public.employees e
  WHERE e.user_id = v_uid
    AND e.tenant_id = v_tenant_id
  LIMIT 1;

  -- 2. Posições via employee_positions com subarea/area resolvidos
  SELECT jsonb_agg(row_to_json(x)) INTO v_positions
  FROM (
    SELECT
      ep.employee_id,
      ep.position_id,
      ep.is_primary,
      pos.title          AS position_title,
      pos.subarea_id,
      pos.area_id        AS position_area_id,
      sa.name            AS subarea_name,
      sa.area_id         AS subarea_parent_area_id,
      COALESCE(pos.area_id, sa.area_id) AS resolved_area_id
    FROM public.employee_positions ep
    JOIN public.employees e   ON e.id  = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas sa ON sa.id = pos.subarea_id
    WHERE e.user_id = v_uid
      AND e.tenant_id = v_tenant_id
  ) x;

  -- 3. Último post com visibility_type = 'specific' e target subarea
  SELECT to_jsonb(p) INTO v_ultimo_post
  FROM public.feed_posts p
  WHERE p.tenant_id = v_tenant_id
    AND p.visibility_type = 'specific'
    AND p.visibility_targets::text LIKE '%subarea%'
  ORDER BY p.created_at DESC
  LIMIT 1;

  -- 4. Resultado da função de visibilidade para esse post
  IF v_ultimo_post IS NOT NULL THEN
    SELECT public.user_can_read_feed_post((v_ultimo_post->>'id')::uuid)
    INTO v_can_read;
  END IF;

  RETURN jsonb_build_object(
    'uid',            v_uid,
    'tenant_id',      v_tenant_id,
    'employee',       v_employee,
    'positions',      COALESCE(v_positions, '[]'::jsonb),
    'ultimo_post_subarea', v_ultimo_post,
    'user_can_read',  v_can_read
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnostico_feed_visibilidade() TO authenticated;
