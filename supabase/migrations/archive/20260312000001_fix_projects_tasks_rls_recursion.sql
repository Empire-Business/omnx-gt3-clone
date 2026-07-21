-- Fix: infinite recursion between projects_select and tasks_select
--
-- The cycle:
--   projects_select → queries tasks (to check assignee)
--   tasks_select    → queries projects (to check created_by)
--
-- Fix: replace the direct projects lookup in tasks_select with a
-- SECURITY DEFINER function that bypasses RLS, breaking the cycle.

-- Helper: returns created_by of a project without going through RLS
CREATE OR REPLACE FUNCTION public.get_project_created_by(p_project_id uuid)
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT created_by FROM public.projects WHERE id = p_project_id;
$$;

-- Recreate tasks_select using the helper instead of a direct subquery into projects
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = tasks.assignee_id AND e.user_id = auth.uid()
      )
      OR (
        tasks.project_id IS NOT NULL
        AND public.get_project_created_by(tasks.project_id) = auth.uid()
      )
    )
  );
