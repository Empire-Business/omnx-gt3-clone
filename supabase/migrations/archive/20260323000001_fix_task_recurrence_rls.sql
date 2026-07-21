-- Fix task_recurrence RLS policies
-- CRITICAL: use table aliases to avoid Postgres resolving unqualified
-- column names to the policy's target table (task_recurrence).
-- profiles uses user_id (not id), user_roles has NO tenant_id column.

DROP POLICY IF EXISTS "task_recurrence_select" ON task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_insert" ON task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_update" ON task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_delete" ON task_recurrence;

-- SELECT: any tenant member
CREATE POLICY "task_recurrence_select" ON task_recurrence
  FOR SELECT USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid()
    )
  );

-- INSERT: admin/manager OR task assignee (within same tenant)
CREATE POLICY "task_recurrence_insert" ON task_recurrence
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin', 'manager')
      )
      OR
      EXISTS (
        SELECT 1 FROM tasks AS t
        JOIN employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
    )
  );

-- UPDATE: admin/manager OR task assignee
CREATE POLICY "task_recurrence_update" ON task_recurrence
  FOR UPDATE USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin', 'manager')
      )
      OR
      EXISTS (
        SELECT 1 FROM tasks AS t
        JOIN employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
    )
  );

-- DELETE: admin/manager OR task assignee
CREATE POLICY "task_recurrence_delete" ON task_recurrence
  FOR DELETE USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin', 'manager')
      )
      OR
      EXISTS (
        SELECT 1 FROM tasks AS t
        JOIN employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
    )
  );
