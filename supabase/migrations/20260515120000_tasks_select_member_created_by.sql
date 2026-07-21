-- ============================================================
-- tasks_select — members também enxergam tarefas que criaram
-- ------------------------------------------------------------
-- Antes: member só lia tasks onde era assignee (assignee_id ou
-- task_assignees). Consequência: ao criar tarefa via UI, o
-- RETURNING do INSERT vinha vazio → cliente recebia PGRST116
-- e a UI exibia "falha ao criar" mesmo a row tendo sido gravada.
--
-- Agora: member também lê tasks com created_by = auth.uid().
-- Admin/manager mantêm o comportamento original.
-- ============================================================

DROP POLICY IF EXISTS tasks_select ON public.tasks;

CREATE POLICY tasks_select ON public.tasks
FOR SELECT TO authenticated
USING (
  (tenant_id = public.get_user_tenant_id())
  AND (
    -- Usuário sem role (transição/setup) — comportamento legado
    (NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid()))
    OR public.is_admin()
    OR (
      public.has_role(auth.uid(), 'manager'::public.app_role)
      AND (
        (project_id IS NOT NULL AND public.user_can_read_project(project_id))
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
    OR (
      public.has_role(auth.uid(), 'member'::public.app_role)
      AND (
        -- Atribuída a ele (assignee_id direto)
        EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = tasks.assignee_id
            AND e.user_id = auth.uid()
            AND e.tenant_id = public.get_user_tenant_id()
        )
        -- Atribuída a ele (multi-assignees)
        OR EXISTS (
          SELECT 1 FROM public.task_assignees ta
          JOIN public.employees e ON e.id = ta.employee_id
          WHERE ta.task_id = tasks.id
            AND e.user_id = auth.uid()
            AND ta.tenant_id = public.get_user_tenant_id()
        )
        -- ⬇ NOVO: criada por ele
        OR tasks.created_by = auth.uid()
      )
    )
  )
);
