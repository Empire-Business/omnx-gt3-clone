-- Chat/comments and daily completion tracking for recurring tasks

-- Comments table
CREATE TABLE task_recurrence_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrence_id UUID NOT NULL REFERENCES task_recurrence(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  author_id UUID NOT NULL REFERENCES employees(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rec_comments_recurrence ON task_recurrence_comments(recurrence_id);
CREATE INDEX idx_rec_comments_tenant ON task_recurrence_comments(tenant_id);

ALTER TABLE task_recurrence_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_comments_select" ON task_recurrence_comments
  FOR SELECT USING (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );
CREATE POLICY "rec_comments_insert" ON task_recurrence_comments
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );
CREATE POLICY "rec_comments_delete" ON task_recurrence_comments
  FOR DELETE USING (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
    AND author_id IN (
      SELECT emp.id FROM employees AS emp WHERE emp.user_id = auth.uid()
    )
  );

-- Completions table
CREATE TABLE task_recurrence_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrence_id UUID NOT NULL REFERENCES task_recurrence(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  completed_by UUID NOT NULL REFERENCES employees(id),
  completion_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recurrence_id, completion_date)
);

CREATE INDEX idx_rec_completions_recurrence ON task_recurrence_completions(recurrence_id);
CREATE INDEX idx_rec_completions_date ON task_recurrence_completions(completion_date);

ALTER TABLE task_recurrence_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_completions_select" ON task_recurrence_completions
  FOR SELECT USING (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );
CREATE POLICY "rec_completions_insert" ON task_recurrence_completions
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );
CREATE POLICY "rec_completions_delete" ON task_recurrence_completions
  FOR DELETE USING (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );
