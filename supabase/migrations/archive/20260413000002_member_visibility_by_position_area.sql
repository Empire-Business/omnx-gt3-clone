-- Migration: Member visibility by linked position or area (v7.9.6)
--
-- Members can read only projects/processes where their position OR area is linked.
-- Projects do not have a direct area/position column, so project linkage is inferred
-- from the positions/areas of employees attached through employee_projects.
-- Managers keep the previous creator/assigned-task exceptions.

ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.company_areas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subarea_id uuid REFERENCES public.subareas(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.process_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(process_id, position_id)
);

ALTER TABLE public.process_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "process_positions_manage_admin_manager" ON public.process_positions;
DROP POLICY IF EXISTS "process_positions_insert_admin_manager" ON public.process_positions;
DROP POLICY IF EXISTS "process_positions_update_admin_manager" ON public.process_positions;
DROP POLICY IF EXISTS "process_positions_delete_admin_manager" ON public.process_positions;

CREATE POLICY "process_positions_insert_admin_manager" ON public.process_positions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.processes p
      WHERE p.id = process_positions.process_id
        AND p.tenant_id = public.get_user_tenant_id()
        AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
    )
  );

CREATE POLICY "process_positions_update_admin_manager" ON public.process_positions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.processes p
      WHERE p.id = process_positions.process_id
        AND p.tenant_id = public.get_user_tenant_id()
        AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.processes p
      WHERE p.id = process_positions.process_id
        AND p.tenant_id = public.get_user_tenant_id()
        AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
      )
  );

CREATE POLICY "process_positions_delete_admin_manager" ON public.process_positions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.processes p
      WHERE p.id = process_positions.process_id
        AND p.tenant_id = public.get_user_tenant_id()
        AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
    )
  );

CREATE OR REPLACE FUNCTION public.user_has_project_assigned_task(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.employees e ON e.id = t.assignee_id
    WHERE t.project_id = p_project_id
      AND t.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND e.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_project_matches_position_or_area(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  WITH current_positions AS (
    SELECT
      ep.position_id,
      COALESCE(pos.area_id, current_sa.area_id) AS area_id
    FROM public.employee_positions ep
    JOIN public.employees e ON e.id = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
    WHERE e.user_id = auth.uid()
      AND e.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
  ),
  project_positions AS (
    SELECT
      ep.position_id,
      COALESCE(pos.area_id, project_sa.area_id) AS area_id
    FROM public.employee_projects epr
    JOIN public.employees e ON e.id = epr.employee_id
    JOIN public.employee_positions ep ON ep.employee_id = e.id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas project_sa ON project_sa.id = pos.subarea_id
    WHERE epr.project_id = p_project_id
      AND epr.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
  )
  SELECT EXISTS (
    SELECT 1
    FROM current_positions current_pos
    JOIN project_positions project_pos
      ON project_pos.position_id = current_pos.position_id
      OR (
        project_pos.area_id IS NOT NULL
        AND current_pos.area_id IS NOT NULL
        AND project_pos.area_id = current_pos.area_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_project(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_has_project_assigned_task(p.id)
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
        OR (
          public.has_role(auth.uid(), 'member')
          AND public.user_project_matches_position_or_area(p.id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_process_matches_position_or_area(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  WITH current_positions AS (
    SELECT
      ep.position_id,
      COALESCE(pos.area_id, current_sa.area_id) AS area_id
    FROM public.employee_positions ep
    JOIN public.employees e ON e.id = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
    WHERE e.user_id = auth.uid()
      AND e.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
  ),
  process_position_scope AS (
    SELECT
      pp.position_id,
      COALESCE(pos.area_id, process_pos_sa.area_id) AS area_id
    FROM public.process_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    LEFT JOIN public.subareas process_pos_sa ON process_pos_sa.id = pos.subarea_id
    WHERE pp.process_id = p_process_id
      AND pos.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      p.position_id,
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
      COALESCE(p.area_id, process_direct_sa.area_id) AS area_id
    FROM public.processes p
    LEFT JOIN public.subareas process_direct_sa ON process_direct_sa.id = p.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
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
          process_pos.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_pos.area_id = current_pos.area_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_area_scope process_area
        ON process_area.area_id IS NOT NULL
        AND current_pos.area_id IS NOT NULL
        AND process_area.area_id = current_pos.area_id
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_process_access(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT public.user_process_matches_position_or_area(p_process_id);
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_process(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.processes p
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_process_matches_position_or_area(p.id)
          )
        )
        OR (
          public.has_role(auth.uid(), 'member')
          AND public.user_process_matches_position_or_area(p.id)
        )
      )
  );
$$;

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.user_can_read_project(id));

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR (
        tasks.project_id IS NOT NULL
        AND public.user_can_read_project(tasks.project_id)
      )
      OR (
        public.has_role(auth.uid(), 'manager')
        AND EXISTS (
          SELECT 1
          FROM public.employees e
          WHERE e.id = tasks.assignee_id
            AND e.tenant_id = public.get_user_tenant_id()
            AND e.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "processes_select" ON public.processes;

CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated
  USING (public.user_can_read_process(id));

DROP POLICY IF EXISTS "steps_select" ON public.process_steps;

CREATE POLICY "steps_select" ON public.process_steps
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.user_can_read_process(process_id)
  );

DROP POLICY IF EXISTS "process_positions_select" ON public.process_positions;

CREATE POLICY "process_positions_select" ON public.process_positions
  FOR SELECT TO authenticated
  USING (public.user_can_read_process(process_id));

DROP POLICY IF EXISTS "tenant_select_process_areas" ON public.process_areas;

CREATE POLICY "tenant_select_process_areas" ON public.process_areas
  FOR SELECT TO authenticated
  USING (public.user_can_read_process(process_id));
