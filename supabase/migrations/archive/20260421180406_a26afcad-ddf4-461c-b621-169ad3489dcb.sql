-- =========================================================================
-- Fase 1 do Chat Corporativo (v8.2.0)
-- Realtime + Threads + Presença + Mensagens Salvas
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. chat_messages.thread_root_id  (Threads estilo Slack)
-- -------------------------------------------------------------------------
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS thread_root_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_root
  ON public.chat_messages(thread_root_id)
  WHERE thread_root_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created
  ON public.chat_messages(conversation_id, created_at DESC);

-- -------------------------------------------------------------------------
-- 2. chat_presence  (Online/Offline + Status + DND)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE,
  tenant_id uuid NOT NULL,
  is_online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  dnd_until timestamptz,
  status_text text,
  status_emoji text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_presence_tenant
  ON public.chat_presence(tenant_id);

ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;

-- Helper: my employee id for presence (security definer to bypass RLS recursion)
CREATE OR REPLACE FUNCTION public.chat_presence_my_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;

DROP POLICY IF EXISTS chat_presence_select ON public.chat_presence;
CREATE POLICY chat_presence_select
  ON public.chat_presence
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS chat_presence_insert ON public.chat_presence;
CREATE POLICY chat_presence_insert
  ON public.chat_presence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND employee_id = public.chat_presence_my_employee_id()
  );

DROP POLICY IF EXISTS chat_presence_update ON public.chat_presence;
CREATE POLICY chat_presence_update
  ON public.chat_presence
  FOR UPDATE
  TO authenticated
  USING (employee_id = public.chat_presence_my_employee_id())
  WITH CHECK (employee_id = public.chat_presence_my_employee_id());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_chat_presence_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_presence_updated_at ON public.chat_presence;
CREATE TRIGGER trg_chat_presence_updated_at
  BEFORE UPDATE ON public.chat_presence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chat_presence_updated_at();

-- -------------------------------------------------------------------------
-- 3. chat_starred_messages  (Mensagens salvas/favoritadas)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_starred_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_starred_employee
  ON public.chat_starred_messages(employee_id, tenant_id, created_at DESC);

ALTER TABLE public.chat_starred_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_starred_select ON public.chat_starred_messages;
CREATE POLICY chat_starred_select
  ON public.chat_starred_messages
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND employee_id = public.chat_presence_my_employee_id()
  );

DROP POLICY IF EXISTS chat_starred_insert ON public.chat_starred_messages;
CREATE POLICY chat_starred_insert
  ON public.chat_starred_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND employee_id = public.chat_presence_my_employee_id()
  );

DROP POLICY IF EXISTS chat_starred_delete ON public.chat_starred_messages;
CREATE POLICY chat_starred_delete
  ON public.chat_starred_messages
  FOR DELETE
  TO authenticated
  USING (employee_id = public.chat_presence_my_employee_id());

-- -------------------------------------------------------------------------
-- 4. Realtime publication
-- -------------------------------------------------------------------------
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.chat_presence REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_presence;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;