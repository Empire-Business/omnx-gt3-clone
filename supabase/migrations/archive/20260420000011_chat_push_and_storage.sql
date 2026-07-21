-- ══════════════════════════════════════════════════════════════
-- Push subscriptions + bucket de anexos do chat
-- ══════════════════════════════════════════════════════════════

-- ── Push subscriptions (Web Push API) ─────────────────────────
CREATE TABLE public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  tenant_id   UUID NOT NULL,
  endpoint    TEXT NOT NULL,
  keys        JSONB NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX push_subs_employee_idx ON public.push_subscriptions(employee_id);
CREATE INDEX push_subs_tenant_idx   ON public.push_subscriptions(tenant_id);

CREATE POLICY "push_subs_own_select" ON public.push_subscriptions
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "push_subs_own_insert" ON public.push_subscriptions
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "push_subs_own_delete" ON public.push_subscriptions
  FOR DELETE USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- ── Bucket para anexos do chat ────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "chat_attach_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attach_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attach_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
