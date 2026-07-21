-- Performance: corrige timeout ("canceling statement due to statement timeout")
-- ao carregar o quadro/lista de tarefas para usuários com papel `manager`.
--
-- CAUSA: a policy `tasks_select` chamava `user_can_read_project(project_id)`
-- POR LINHA de tarefa. Essa função dispara uma cascata de subconsultas
-- (user_has_project_assigned_task + user_project_matches_position_or_area, esta
-- com um JOIN por OR que vira nested loop). Com N tarefas isso era O(N) cascatas:
--   - Quadro de 1 projeto (82 tarefas): ~1,5 s
--   - Página Tarefas (todas, 849 tarefas): ~10,5 s  -> estourava o statement_timeout (8 s)
--
-- CORREÇÃO: substituir a checagem por-linha por pertinência a um conjunto
-- pré-computado UMA ÚNICA VEZ — `project_id IN (SELECT get_readable_project_ids())`.
-- O planner avalia o conjunto como "hashed SubPlan" (1x) e cada linha vira um
-- hash lookup. Passa a ser O(nº de projetos) avaliado 1x, em vez de O(nº de tarefas).
-- Medições (mesmo result set, semântica idêntica):
--   - Quadro de 1 projeto: 1536 ms -> 408 ms
--   - Página Tarefas (todas): 10538 ms -> 496 ms
--
-- `get_readable_project_ids()` é literalmente "os projetos para os quais
-- user_can_read_project() é verdadeiro", então a semântica de acesso é preservada.
-- As branches de admin e member da policy permanecem inalteradas.

-- Conjunto de projetos legíveis pelo usuário atual (avaliado uma vez por query).
create or replace function public.get_readable_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id
  from public.projects p
  where p.tenant_id = public.get_user_tenant_id()
    and public.user_can_read_project(p.id)
$$;

alter policy tasks_select on public.tasks using (
  (tenant_id = get_user_tenant_id()) AND (
    (NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid()))
    OR is_admin()
    OR (has_role(auth.uid(), 'manager'::app_role) AND (
        ((project_id IS NOT NULL) AND (project_id IN (SELECT public.get_readable_project_ids())))
        OR EXISTS (SELECT 1 FROM employees e WHERE e.id = tasks.assignee_id AND e.user_id = auth.uid() AND e.tenant_id = get_user_tenant_id())
        OR EXISTS (SELECT 1 FROM task_assignees ta JOIN employees e ON e.id = ta.employee_id WHERE ta.task_id = tasks.id AND e.user_id = auth.uid() AND ta.tenant_id = get_user_tenant_id())
        OR ((assignee_id IS NOT NULL) AND (assignee_id IN (SELECT get_subordinate_employee_ids())))
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = tasks.id AND ta.tenant_id = get_user_tenant_id() AND ta.employee_id IN (SELECT get_subordinate_employee_ids()))
    ))
    OR (has_role(auth.uid(), 'member'::app_role) AND (
        EXISTS (SELECT 1 FROM employees e WHERE e.id = tasks.assignee_id AND e.user_id = auth.uid() AND e.tenant_id = get_user_tenant_id())
        OR EXISTS (SELECT 1 FROM task_assignees ta JOIN employees e ON e.id = ta.employee_id WHERE ta.task_id = tasks.id AND e.user_id = auth.uid() AND ta.tenant_id = get_user_tenant_id())
    ))
  )
);
