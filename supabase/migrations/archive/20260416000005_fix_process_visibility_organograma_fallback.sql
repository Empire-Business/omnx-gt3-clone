-- Fix: visibilidade de processos com fallback via organograma_view
--
-- Alguns usuários podem estar resolvidos no organograma mesmo quando
-- employees_hierarchy_view não retorna a combinação esperada para a policy.
-- Este fallback usa o mesmo conjunto de dados exibido pela UI.

CREATE OR REPLACE FUNCTION public.user_process_matches_position_or_area(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  WITH current_positions AS (
    SELECT DISTINCT
      current_pos.position_id,
      current_pos.subarea_id,
      current_pos.area_id
    FROM (
      SELECT
        ep.position_id,
        pos.subarea_id,
        COALESCE(pos.area_id, current_sa.area_id) AS area_id
      FROM public.employee_positions ep
      JOIN public.employees e ON e.id = ep.employee_id
      JOIN public.positions pos ON pos.id = ep.position_id
      LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
      WHERE e.user_id = auth.uid()
        AND e.tenant_id = public.get_user_tenant_id()
        AND pos.tenant_id = public.get_user_tenant_id()

      UNION

      SELECT
        ehv.primary_position_id AS position_id,
        ehv.subarea_id,
        ehv.area_id
      FROM public.employees_hierarchy_view ehv
      WHERE ehv.user_id = auth.uid()
        AND ehv.tenant_id = public.get_user_tenant_id()
        AND ehv.primary_position_id IS NOT NULL

      UNION

      SELECT
        ov.primary_position_id AS position_id,
        ov.subarea_id,
        ov.area_id
      FROM public.organograma_view ov
      WHERE ov.user_id = auth.uid()
        AND ov.tenant_id = public.get_user_tenant_id()
        AND ov.primary_position_id IS NOT NULL
    ) AS current_pos
  ),
  process_position_scope AS (
    SELECT
      pp.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_pos_sa.area_id) AS area_id
    FROM public.process_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    LEFT JOIN public.subareas process_pos_sa ON process_pos_sa.id = pos.subarea_id
    WHERE pp.process_id = p_process_id
      AND pos.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      p.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_primary_sa.area_id) AS area_id
    FROM public.processes p
    JOIN public.positions pos ON pos.id = p.position_id
    LEFT JOIN public.subareas process_primary_sa ON process_primary_sa.id = pos.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
      AND p.position_id IS NOT NULL
  ),
  process_area_scope AS (
    SELECT
      p.subarea_id,
      COALESCE(p.area_id, process_direct_sa.area_id) AS area_id
    FROM public.processes p
    LEFT JOIN public.subareas process_direct_sa ON process_direct_sa.id = p.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      pa.subarea_id,
      COALESCE(pa.area_id, process_area_sa.area_id) AS area_id
    FROM public.process_areas pa
    LEFT JOIN public.subareas process_area_sa ON process_area_sa.id = pa.subarea_id
    JOIN public.processes p ON p.id = pa.process_id
    WHERE pa.process_id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_position_scope process_pos
        ON process_pos.position_id = current_pos.position_id
        OR (
          process_pos.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_pos.subarea_id = current_pos.subarea_id
        )
        OR (
          process_pos.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_pos.area_id = current_pos.area_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_area_scope process_area
        ON (
          process_area.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_area.subarea_id = current_pos.subarea_id
        )
        OR (
          process_area.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_area.area_id = current_pos.area_id
        )
    );
$$;
