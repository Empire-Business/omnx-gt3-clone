-- Migration: Process visibility restricted by position (v7.4.2)
-- Users only see processes linked to their positions via process_positions.
-- Admins continue to see all processes in the tenant.
-- Processes with no linked positions are invisible to non-admins.

-- ============================================================
-- processes: replace SELECT policy
-- ============================================================
DROP POLICY IF EXISTS "processes_select" ON public.processes;

CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.process_positions pp
        JOIN public.employee_positions ep ON ep.position_id = pp.position_id
        JOIN public.employees e ON e.id = ep.employee_id
        WHERE pp.process_id = processes.id
          AND e.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- process_steps: replace SELECT policy (inherits parent process visibility)
-- ============================================================
DROP POLICY IF EXISTS "steps_select" ON public.process_steps;

CREATE POLICY "steps_select" ON public.process_steps
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.process_positions pp
        JOIN public.employee_positions ep ON ep.position_id = pp.position_id
        JOIN public.employees e ON e.id = ep.employee_id
        WHERE pp.process_id = process_steps.process_id
          AND e.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- process_positions: replace SELECT policy
-- Users see position-links for processes they can access.
-- ============================================================
DROP POLICY IF EXISTS "process_positions_select" ON public.process_positions;

CREATE POLICY "process_positions_select" ON public.process_positions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.employee_positions ep
      JOIN public.employees e ON e.id = ep.employee_id
      WHERE ep.position_id = process_positions.position_id
        AND e.user_id = auth.uid()
    )
  );
