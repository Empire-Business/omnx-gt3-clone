-- Labels de conversas
CREATE TABLE public.chat_conversation_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366F1',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE public.chat_conversation_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_labels_select ON public.chat_conversation_labels
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY chat_labels_insert ON public.chat_conversation_labels
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY chat_labels_update ON public.chat_conversation_labels
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY chat_labels_delete ON public.chat_conversation_labels
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

-- Atribuição de labels
CREATE TABLE public.chat_conversation_label_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  label_id uuid NOT NULL REFERENCES public.chat_conversation_labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, label_id)
);

ALTER TABLE public.chat_conversation_label_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_label_assign_select ON public.chat_conversation_label_assignments
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY chat_label_assign_insert ON public.chat_conversation_label_assignments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY chat_label_assign_delete ON public.chat_conversation_label_assignments
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Colunas em chat_participants
ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS muted_until timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS unread_override boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chat_participants_pinned ON public.chat_participants(employee_id, pinned_at) WHERE pinned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_participants_archived ON public.chat_participants(employee_id, archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_label_assign_conv ON public.chat_conversation_label_assignments(conversation_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversation_labels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversation_label_assignments;