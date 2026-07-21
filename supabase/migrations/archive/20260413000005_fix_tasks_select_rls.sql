-- Fix: tasks_select com mesmo padrão 3 camadas de projects_select
-- Admin legacy (sem role), admin com role, e manager/member restrito por projeto

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Admin legacy (sem row em user_roles) vê tudo
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      -- Admin com role vê tudo
      OR public.is_admin()
      -- Tarefas de projetos visíveis ao usuário
      OR (
        tasks.project_id IS NOT NULL
        AND public.user_can_read_project(tasks.project_id)
      )
      -- Manager vê tarefas assignadas a ele
      OR (
        public.has_role(auth.uid(), 'manager')
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = tasks.assignee_id
            AND e.tenant_id = public.get_user_tenant_id()
            AND e.user_id = auth.uid()
        )
      )
    )
  );
