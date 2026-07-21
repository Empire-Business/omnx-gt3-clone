-- Fix: member vê projetos onde é membro direto E tarefas atribuídas a ele
--
-- Problema anterior:
--   - user_can_read_project só cobria member via posição/subárea
--     (user_project_matches_position_or_area), ignorando employee_projects
--   - tasks_select só verificava assignee_id para manager, não para member
--
-- Correção:
--   1. user_can_read_project: member vê projeto se está em employee_projects
--      OU se coincide posição/subárea (comportamento anterior mantido)
--   2. tasks_select: member vê tarefa se é assignee_id OU está em task_assignees

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Função user_can_read_project — adiciona membership direto para member
-- ──────────────────────────────────────────────────────────────────────────────
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
        -- Member: membro direto do projeto OU coincide posição/subárea
        OR (
          public.has_role(auth.uid(), 'member')
          AND (
            EXISTS (
              SELECT 1
              FROM public.employee_projects ep
              JOIN public.employees e ON e.id = ep.employee_id
              WHERE ep.project_id = p.id
                AND e.user_id = auth.uid()
                AND ep.tenant_id = public.get_user_tenant_id()
            )
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
      )
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Política tasks_select — adiciona assignee check para member
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Admin legacy vê tudo
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      -- Admin com role vê tudo
      OR public.is_admin()
      -- Qualquer role: tarefa de projeto visível
      OR (
        tasks.project_id IS NOT NULL
        AND public.user_can_read_project(tasks.project_id)
      )
      -- Manager: vê tarefas atribuídas a ele (assignee_id legado)
      OR (
        public.has_role(auth.uid(), 'manager')
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = tasks.assignee_id
            AND e.tenant_id = public.get_user_tenant_id()
            AND e.user_id = auth.uid()
        )
      )
      -- Member: vê tarefas atribuídas diretamente a ele
      OR (
        public.has_role(auth.uid(), 'member')
        AND (
          -- assignee_id legado (coluna tasks.assignee_id)
          EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = tasks.assignee_id
              AND e.tenant_id = public.get_user_tenant_id()
              AND e.user_id = auth.uid()
          )
          -- múltiplos assignees (tabela task_assignees)
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
