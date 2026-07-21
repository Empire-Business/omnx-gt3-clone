-- ============================================================
-- FIX: restaura "criador enxerga a própria tarefa" em tasks_select
-- ------------------------------------------------------------
-- REGRESSÃO: a migration 20260601180000_tasks_select_rls_perf.sql
-- reescreveu tasks_select com ALTER POLICY para otimizar o branch
-- de `manager` (get_readable_project_ids). No processo, o comentário
-- afirmava que "as branches de admin e member permanecem inalteradas",
-- mas a cláusula `OR tasks.created_by = auth.uid()` — adicionada em
-- 20260515120000_tasks_select_member_created_by.sql — foi PERDIDA.
--
-- CONSEQUÊNCIA: ao criar uma tarefa, o frontend usa
-- `.insert(...).select().single()`. O RETURNING aplica a policy de
-- SELECT à linha recém-inserida. Se quem cria (member ou manager) não
-- consegue "ver" a tarefa (ex.: atribuída a outra pessoa, sem projeto
-- legível, ou sem responsável), o RETURNING viola RLS e o INSERT
-- INTEIRO falha com 403 "new row violates row-level security policy".
-- Sintoma reportado: "ninguém consegue criar tarefas pelo chat".
--
-- CORREÇÃO: readicionar `OR tasks.created_by = auth.uid()` nos branches
-- de member E manager. O criador sempre enxerga o que criou — semântica
-- segura e necessária para o RETURNING do INSERT. Otimização de perf
-- (get_readable_project_ids) preservada.
-- ============================================================

ALTER POLICY tasks_select ON public.tasks USING (
  (tenant_id = get_user_tenant_id()) AND (
    (NOT EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid()))
    OR is_admin()
    OR (has_role(auth.uid(), 'manager'::app_role) AND (
        ((project_id IS NOT NULL) AND (project_id IN (SELECT public.get_readable_project_ids())))
        OR EXISTS (SELECT 1 FROM employees e WHERE e.id = tasks.assignee_id AND e.user_id = auth.uid() AND e.tenant_id = get_user_tenant_id())
        OR EXISTS (SELECT 1 FROM task_assignees ta JOIN employees e ON e.id = ta.employee_id WHERE ta.task_id = tasks.id AND e.user_id = auth.uid() AND ta.tenant_id = get_user_tenant_id())
        OR ((assignee_id IS NOT NULL) AND (assignee_id IN (SELECT get_subordinate_employee_ids())))
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = tasks.id AND ta.tenant_id = get_user_tenant_id() AND ta.employee_id IN (SELECT get_subordinate_employee_ids()))
        OR tasks.created_by = auth.uid()
    ))
    OR (has_role(auth.uid(), 'member'::app_role) AND (
        EXISTS (SELECT 1 FROM employees e WHERE e.id = tasks.assignee_id AND e.user_id = auth.uid() AND e.tenant_id = get_user_tenant_id())
        OR EXISTS (SELECT 1 FROM task_assignees ta JOIN employees e ON e.id = ta.employee_id WHERE ta.task_id = tasks.id AND e.user_id = auth.uid() AND ta.tenant_id = get_user_tenant_id())
        OR tasks.created_by = auth.uid()
    ))
  )
);
