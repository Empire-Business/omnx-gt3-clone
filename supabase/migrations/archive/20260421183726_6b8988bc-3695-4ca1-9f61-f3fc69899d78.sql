-- ============================================================
-- v8.3.0 — Fase 2: Pinned messages, mentions, channel topic
-- ============================================================

-- 1) chat_messages: pinned + deleted_for (apagar para mim)
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_for uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned
  ON public.chat_messages (conversation_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

-- 2) chat_conversations: topic + description (description já existe; topic é novo)
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS topic text;

-- 3) chat_mentions
CREATE TABLE IF NOT EXISTS public.chat_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  mentioned_employee_id uuid NOT NULL,
  mention_type text NOT NULL DEFAULT 'user', -- 'user' | 'here' | 'channel'
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_mentioned_unread
  ON public.chat_mentions (mentioned_employee_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_mentions_message
  ON public.chat_mentions (message_id);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_tenant
  ON public.chat_mentions (tenant_id);

ALTER TABLE public.chat_mentions ENABLE ROW LEVEL SECURITY;

-- SELECT: mencionado vê suas menções; autor da mensagem vê quem mencionou
DROP POLICY IF EXISTS chat_mentions_select ON public.chat_mentions;
CREATE POLICY chat_mentions_select
  ON public.chat_mentions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      mentioned_employee_id = public.chat_my_employee_id()
      OR EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.id = chat_mentions.message_id
          AND m.employee_id = public.chat_my_employee_id()
      )
    )
  );

-- INSERT: somente o autor da mensagem pode criar menções (e dentro do seu tenant)
DROP POLICY IF EXISTS chat_mentions_insert ON public.chat_mentions;
CREATE POLICY chat_mentions_insert
  ON public.chat_mentions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_mentions.message_id
        AND m.employee_id = public.chat_my_employee_id()
    )
  );

-- UPDATE: mencionado pode marcar como lida
DROP POLICY IF EXISTS chat_mentions_update ON public.chat_mentions;
CREATE POLICY chat_mentions_update
  ON public.chat_mentions
  FOR UPDATE
  TO authenticated
  USING (mentioned_employee_id = public.chat_my_employee_id())
  WITH CHECK (mentioned_employee_id = public.chat_my_employee_id());

-- 4) Realtime
ALTER TABLE public.chat_mentions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_mentions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mentions';
  END IF;
END $$;
