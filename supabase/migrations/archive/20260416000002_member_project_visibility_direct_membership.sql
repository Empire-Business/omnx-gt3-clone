-- Fix: member vê projeto quando é membro direto em employee_projects
--
-- Regra final para member em projetos:
--   1. Vê projeto quando possui tarefa atribuída no projeto
--      (tasks.assignee_id ou task_assignees)
--   2. Vê projeto quando foi adicionado como membro direto em employee_projects

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
        AND (
          public.user_has_project_assigned_task(id)
          OR EXISTS (
            SELECT 1
            FROM public.employee_projects ep
            JOIN public.employees e ON e.id = ep.employee_id
            WHERE ep.project_id = projects.id
              AND ep.tenant_id = public.get_user_tenant_id()
              AND e.tenant_id = public.get_user_tenant_id()
              AND e.user_id = auth.uid()
          )
        )
      )
    )
  );
