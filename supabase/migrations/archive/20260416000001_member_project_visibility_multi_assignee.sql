-- Fix: member vê projeto quando está adicionado na tarefa via multi-assignee
--
-- Regra desejada para member:
--   1. Continua vendo projeto quando tem tarefa atribuída via tasks.assignee_id
--   2. Passa a ver projeto também quando foi adicionado na tarefa via task_assignees

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
  )
  OR EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.task_assignees ta ON ta.task_id = t.id
    JOIN public.employees e ON e.id = ta.employee_id
    WHERE t.project_id = p_project_id
      AND t.tenant_id = public.get_user_tenant_id()
      AND ta.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND e.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR (
        public.has_role(auth.uid(), 'manager')
        AND public.user_can_read_project(id)
      )
      OR (
        public.has_role(auth.uid(), 'member')
        AND public.user_has_project_assigned_task(id)
      )
    )
  );
