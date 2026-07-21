-- Fix task_recurrence RLS — INSERT/UPDATE/DELETE rejeitavam quando user
-- não era admin/manager nem o assignee_id principal da tarefa. Resultado:
-- usuário comum criava task sem assignee e não conseguia adicionar
-- recorrência (403 Forbidden).
--
-- Relaxa pra incluir também:
-- - Criador da tarefa (tasks.created_by = auth.uid())
-- - Multi-assignees (task_assignees + employees.user_id)
-- - Mantém: admin/manager + assignee primário

DROP POLICY IF EXISTS "task_recurrence_insert" ON public.task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_update" ON public.task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_delete" ON public.task_recurrence;

CREATE POLICY "task_recurrence_insert" ON public.task_recurrence
  FOR INSERT TO authenticated WITH CHECK (
    tenant_id IN (
      SELECT prof.tenant_id FROM public.profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      -- Admin/manager
      EXISTS (
        SELECT 1 FROM public.user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin', 'manager')
      )
      OR
      -- Criador da task
      EXISTS (
        SELECT 1 FROM public.tasks AS t
        WHERE t.id = task_recurrence.task_id
          AND t.created_by = auth.uid()
      )
      OR
      -- Assignee primário
      EXISTS (
        SELECT 1 FROM public.tasks AS t
        JOIN public.employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
      OR
      -- Multi-assignee (task_assignees → employees.user_id)
      EXISTS (
        SELECT 1 FROM public.task_assignees AS ta
        JOIN public.employees AS emp ON emp.id = ta.employee_id
        WHERE ta.task_id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "task_recurrence_update" ON public.task_recurrence
  FOR UPDATE TO authenticated USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM public.profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles AS ur
        WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'manager')
      )
      OR EXISTS (
        SELECT 1 FROM public.tasks AS t
        WHERE t.id = task_recurrence.task_id AND t.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.tasks AS t
        JOIN public.employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id AND emp.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.task_assignees AS ta
        JOIN public.employees AS emp ON emp.id = ta.employee_id
        WHERE ta.task_id = task_recurrence.task_id AND emp.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "task_recurrence_delete" ON public.task_recurrence
  FOR DELETE TO authenticated USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM public.profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles AS ur
        WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'manager')
      )
      OR EXISTS (
        SELECT 1 FROM public.tasks AS t
        WHERE t.id = task_recurrence.task_id AND t.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.tasks AS t
        JOIN public.employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id AND emp.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.task_assignees AS ta
        JOIN public.employees AS emp ON emp.id = ta.employee_id
        WHERE ta.task_id = task_recurrence.task_id AND emp.user_id = auth.uid()
      )
    )
  );
