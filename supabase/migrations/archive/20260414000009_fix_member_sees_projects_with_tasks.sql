-- Fix: member vê projetos que têm tarefas atribuídas a ele
--
-- Regra final para member:
--   1. Criou o projeto (created_by)
--   2. Foi adicionado como membro direto (employee_projects)
--   3. Tem tarefa atribuída no projeto (assignee_id ou task_assignees)
--   4. Coincide posição/subárea com membros do projeto (comportamento anterior)

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
        -- Admin legacy (sem row em user_roles) vê tudo
        NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
        -- Admin com role vê tudo
        OR public.is_admin()
        -- Manager: criou, tem tarefa atribuída, ou está na subárea/posição
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_has_project_assigned_task(p.id)
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
        -- Member: criou, é membro direto, tem tarefa atribuída, ou coincide área
        OR (
          public.has_role(auth.uid(), 'member')
          AND (
            -- 1. Criou o projeto
            p.created_by = auth.uid()
            -- 2. Adicionado como membro direto
            OR EXISTS (
              SELECT 1
              FROM public.employee_projects ep
              JOIN public.employees e ON e.id = ep.employee_id
              WHERE ep.project_id = p.id
                AND e.user_id = auth.uid()
                AND ep.tenant_id = public.get_user_tenant_id()
            )
            -- 3a. Tem tarefa atribuída via assignee_id (legado)
            OR public.user_has_project_assigned_task(p.id)
            -- 3b. Tem tarefa atribuída via task_assignees (múltiplos assignees)
            OR EXISTS (
              SELECT 1
              FROM public.tasks t
              JOIN public.task_assignees ta ON ta.task_id = t.id
              JOIN public.employees e ON e.id = ta.employee_id
              WHERE t.project_id = p.id
                AND t.tenant_id = public.get_user_tenant_id()
                AND e.user_id = auth.uid()
                AND ta.tenant_id = public.get_user_tenant_id()
            )
            -- 4. Coincide posição/subárea com membros do projeto
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
      )
  );
$$;
