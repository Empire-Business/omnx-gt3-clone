-- Multiple assignees per task
CREATE TABLE task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, employee_id)
);

CREATE INDEX idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_employee ON task_assignees(employee_id);
CREATE INDEX idx_task_assignees_tenant ON task_assignees(tenant_id);

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_assignees_select" ON task_assignees
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "task_assignees_insert" ON task_assignees
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "task_assignees_delete" ON task_assignees
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Migrate existing assignee_id data
INSERT INTO task_assignees (task_id, employee_id, tenant_id)
SELECT id, assignee_id, tenant_id FROM tasks WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;
