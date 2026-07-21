CREATE TABLE task_recurrence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom')),
  interval_days INT,
  days_of_week INT[],
  day_of_month INT,
  end_date DATE,
  next_occurrence DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_task_recurrence_task ON task_recurrence(task_id);
CREATE INDEX idx_task_recurrence_tenant ON task_recurrence(tenant_id);
CREATE INDEX idx_task_recurrence_next ON task_recurrence(next_occurrence) WHERE is_active = true;

ALTER TABLE task_recurrence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_recurrence_select" ON task_recurrence
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "task_recurrence_insert" ON task_recurrence
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "task_recurrence_update" ON task_recurrence
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "task_recurrence_delete" ON task_recurrence
  FOR DELETE USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
