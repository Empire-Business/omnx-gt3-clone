-- ============================================================
-- Member: visibilidade estrita por tarefas atribuídas
--
-- ANTES: member via "user_can_read_project" via posição/subárea ou
--        membro direto → via projeto visível → via todas tarefas do projeto
--
-- DEPOIS:
--   tasks   → member vê APENAS tarefas onde é assignee (assignee_id ou task_assignees)
--   projects → member vê APENAS projetos onde tem pelo menos 1 tarefa atribuída
-- ============================================================

-- ── TAREFAS ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Admin legacy: sem row em user_roles → vê tudo do tenant
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())

      -- Admin vê tudo
      OR public.is_admin()

      -- Manager: vê tarefas de projetos visíveis OU tarefas atribuídas a ele
      OR (
        public.has_role(auth.uid(), 'manager')
        AND (
          (tasks.project_id IS NOT NULL AND public.user_can_read_project(tasks.project_id))
          OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = tasks.assignee_id
              AND e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.task_assignees ta
            JOIN public.employees e ON e.id = ta.employee_id
            WHERE ta.task_id = tasks.id
              AND e.user_id = auth.uid()
              AND ta.tenant_id = public.get_user_tenant_id()
          )
        )
      )

      -- Member: vê APENAS tarefas onde é responsável (assignee_id ou task_assignees)
      OR (
        public.has_role(auth.uid(), 'member')
        AND (
          EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = tasks.assignee_id
              AND e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.task_assignees ta
            JOIN public.employees e ON e.id = ta.employee_id
            WHERE ta.task_id = tasks.id
              AND e.user_id = auth.uid()
              AND ta.tenant_id = public.get_user_tenant_id()
          )
        )
      )
    )
  );

-- ── PROJETOS ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Admin legacy: sem row em user_roles → vê tudo do tenant
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())

      -- Admin vê tudo
      OR public.is_admin()

      -- Manager: usa lógica existente (criou, tem tarefa, posição/subárea)
      OR (
        public.has_role(auth.uid(), 'manager')
        AND public.user_can_read_project(id)
      )

      -- Member: vê APENAS projetos onde tem pelo menos 1 tarefa atribuída
      OR (
        public.has_role(auth.uid(), 'member')
        AND (
          EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.employees e ON e.id = t.assignee_id
            WHERE t.project_id = projects.id
              AND e.user_id = auth.uid()
              AND t.tenant_id = public.get_user_tenant_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.task_assignees ta ON ta.task_id = t.id
            JOIN public.employees e ON e.id = ta.employee_id
            WHERE t.project_id = projects.id
              AND e.user_id = auth.uid()
              AND t.tenant_id = public.get_user_tenant_id()
          )
        )
      )
    )
  );
