-- Fix: infinite recursion in processes_select RLS (42P17)
--
-- The cycle:
--   processes_select → queries process_positions (RLS applied)
--   process_positions policy → references back to processes
--   → infinite recursion
--
-- Fix: replace the direct process_positions subquery in processes_select with a
-- SECURITY DEFINER function that bypasses RLS, breaking the cycle.
-- Same pattern as 20260312000001_fix_projects_tasks_rls_recursion.sql.
--
-- Also adds OR created_by = auth.uid() so managers can read their own newly
-- created processes before any positions are linked (fixes PGRST116 on INSERT RETURNING).

CREATE OR REPLACE FUNCTION public.user_has_process_access(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.process_positions pp
    JOIN public.employee_positions ep ON ep.position_id = pp.position_id
    JOIN public.employees e ON e.id = ep.employee_id
    WHERE pp.process_id = p_process_id
      AND e.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "processes_select" ON public.processes;

CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR created_by = auth.uid()
      OR public.user_has_process_access(id)
    )
  );
