-- Lembretes
CREATE TABLE public.chat_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid,
  remind_at timestamptz NOT NULL,
  text text,
  fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_reminders_due ON public.chat_reminders(remind_at) WHERE fired_at IS NULL;
CREATE INDEX idx_chat_reminders_emp ON public.chat_reminders(employee_id);

ALTER TABLE public.chat_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_reminders_select ON public.chat_reminders
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id() AND employee_id = chat_presence_my_employee_id());

CREATE POLICY chat_reminders_insert ON public.chat_reminders
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND employee_id = chat_presence_my_employee_id());

CREATE POLICY chat_reminders_update ON public.chat_reminders
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND employee_id = chat_presence_my_employee_id());

CREATE POLICY chat_reminders_delete ON public.chat_reminders
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND employee_id = chat_presence_my_employee_id());

-- Polls
CREATE TABLE public.chat_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  question text NOT NULL,
  multi boolean NOT NULL DEFAULT false,
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.chat_polls(id) ON DELETE CASCADE,
  text text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.chat_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.chat_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.chat_poll_options(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, option_id, employee_id)
);

CREATE INDEX idx_poll_options_poll ON public.chat_poll_options(poll_id);
CREATE INDEX idx_poll_votes_poll ON public.chat_poll_votes(poll_id);

ALTER TABLE public.chat_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_polls_select ON public.chat_polls
  FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids()));

CREATE POLICY chat_polls_insert ON public.chat_polls
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids())
  );

CREATE POLICY chat_polls_update ON public.chat_polls
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR is_admin() OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY chat_polls_delete ON public.chat_polls
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR is_admin() OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY chat_poll_options_select ON public.chat_poll_options
  FOR SELECT TO authenticated
  USING (poll_id IN (SELECT id FROM chat_polls WHERE conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids())));

CREATE POLICY chat_poll_options_insert ON public.chat_poll_options
  FOR INSERT TO authenticated
  WITH CHECK (poll_id IN (SELECT id FROM chat_polls WHERE created_by = auth.uid()));

CREATE POLICY chat_poll_options_delete ON public.chat_poll_options
  FOR DELETE TO authenticated
  USING (poll_id IN (SELECT id FROM chat_polls WHERE created_by = auth.uid()));

CREATE POLICY chat_poll_votes_select ON public.chat_poll_votes
  FOR SELECT TO authenticated
  USING (poll_id IN (SELECT id FROM chat_polls WHERE conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids())));

CREATE POLICY chat_poll_votes_insert ON public.chat_poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = chat_presence_my_employee_id()
    AND poll_id IN (SELECT id FROM chat_polls WHERE conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids()))
  );

CREATE POLICY chat_poll_votes_delete ON public.chat_poll_votes
  FOR DELETE TO authenticated
  USING (employee_id = chat_presence_my_employee_id());

-- Bookmarks do canal
CREATE TABLE public.chat_channel_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_bookmarks_conv ON public.chat_channel_bookmarks(conversation_id, sort_order);

ALTER TABLE public.chat_channel_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_bookmarks_select ON public.chat_channel_bookmarks
  FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids()));

CREATE POLICY chat_bookmarks_insert ON public.chat_channel_bookmarks
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))
  );

CREATE POLICY chat_bookmarks_update ON public.chat_channel_bookmarks
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY chat_bookmarks_delete ON public.chat_channel_bookmarks
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

-- Canvas/notas do canal
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS canvas_doc_id uuid;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_poll_options;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_bookmarks;