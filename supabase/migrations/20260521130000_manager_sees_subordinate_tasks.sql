-- Manager vê tarefas dos subordinados diretos e indiretos
-- Hierarquia: employee_positions → positions.reports_to_id (recursivo)

-- 1. Função que retorna todos os employee_ids subordinados ao manager logado
CREATE OR REPLACE FUNCTION public.get_subordinate_employee_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE manager_emp AS (
    SELECT e.id AS employee_id
    FROM employees e
    WHERE e.user_id = auth.uid()
      AND e.tenant_id = get_user_tenant_id()
  ),
  manager_positions AS (
    SELECT ep.position_id
    FROM employee_positions ep
    JOIN manager_emp me ON ep.employee_id = me.employee_id
  ),
  subordinate_positions AS (
    -- Diretos
    SELECT p.id AS position_id
    FROM positions p
    JOIN manager_positions mp ON p.reports_to_id = mp.position_id
    WHERE p.tenant_id = get_user_tenant_id()

    UNION ALL

    -- Indiretos (recursivo)
    SELECT p.id
    FROM positions p
    JOIN subordinate_positions sp ON p.reports_to_id = sp.position_id
    WHERE p.tenant_id = get_user_tenant_id()
  )
  SELECT DISTINCT ep.employee_id
  FROM employee_positions ep
  JOIN subordinate_positions sp ON ep.position_id = sp.position_id
  JOIN employees e ON e.id = ep.employee_id
  WHERE e.tenant_id = get_user_tenant_id();
$$;

-- 2. Recria a policy tasks_select adicionando visibilidade para subordinados do manager
DROP POLICY IF EXISTS tasks_select ON public.tasks;

CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND (
      -- Usuário sem role vê tudo (compatibilidade)
      NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid())

      -- Admin vê tudo
      OR is_admin()

      -- Manager: projetos acessíveis + tarefas atribuídas a ele + tarefas dos subordinados
      OR (
        has_role(auth.uid(), 'manager')
        AND (
          -- Projetos que o manager pode ler
          (project_id IS NOT NULL AND user_can_read_project(project_id))

          -- Tarefa atribuída diretamente ao manager
          OR EXISTS (
            SELECT 1 FROM employees e
            WHERE e.id = tasks.assignee_id
              AND e.user_id = auth.uid()
              AND e.tenant_id = get_user_tenant_id()
          )

          -- Manager está em task_assignees
          OR EXISTS (
            SELECT 1
            FROM task_assignees ta
            JOIN employees e ON e.id = ta.employee_id
            WHERE ta.task_id = tasks.id
              AND e.user_id = auth.uid()
              AND ta.tenant_id = get_user_tenant_id()
          )

          -- Tarefa atribuída a um subordinado (assignee_id)
          OR (
            assignee_id IS NOT NULL
            AND assignee_id IN (SELECT get_subordinate_employee_ids())
          )

          -- Subordinado está em task_assignees
          OR EXISTS (
            SELECT 1
            FROM task_assignees ta
            WHERE ta.task_id = tasks.id
              AND ta.tenant_id = get_user_tenant_id()
              AND ta.employee_id IN (SELECT get_subordinate_employee_ids())
          )
        )
      )

      -- Member: apenas tarefas onde é assignee
      OR (
        has_role(auth.uid(), 'member')
        AND (
          EXISTS (
            SELECT 1 FROM employees e
            WHERE e.id = tasks.assignee_id
              AND e.user_id = auth.uid()
              AND e.tenant_id = get_user_tenant_id()
          )
          OR EXISTS (
            SELECT 1
            FROM task_assignees ta
            JOIN employees e ON e.id = ta.employee_id
            WHERE ta.task_id = tasks.id
              AND e.user_id = auth.uid()
              AND ta.tenant_id = get_user_tenant_id()
          )
        )
      )
    )
  );
