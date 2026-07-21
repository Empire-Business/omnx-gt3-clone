-- ══════════════════════════════════════════════════════════════
-- Fix: RLS recursão + chicken-and-egg na criação de conversa
-- ══════════════════════════════════════════════════════════════

-- ── Remove políticas problemáticas ────────────────────────────
DROP POLICY IF EXISTS "chat_conv_select"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conv_insert"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conv_update"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_part_select"  ON public.chat_participants;
DROP POLICY IF EXISTS "chat_part_insert"  ON public.chat_participants;
DROP POLICY IF EXISTS "chat_part_update"  ON public.chat_participants;
DROP POLICY IF EXISTS "chat_part_delete"  ON public.chat_participants;
DROP POLICY IF EXISTS "chat_msg_select"   ON public.chat_messages;
DROP POLICY IF EXISTS "chat_msg_insert"   ON public.chat_messages;
DROP POLICY IF EXISTS "chat_msg_update"   ON public.chat_messages;
DROP POLICY IF EXISTS "chat_msg_delete"   ON public.chat_messages;
DROP POLICY IF EXISTS "chat_react_select" ON public.chat_reactions;
DROP POLICY IF EXISTS "chat_react_insert" ON public.chat_reactions;
DROP POLICY IF EXISTS "chat_react_delete" ON public.chat_reactions;

DROP FUNCTION IF EXISTS public.chat_is_participant(UUID);
DROP FUNCTION IF EXISTS public.chat_my_employee_id();

-- ── Funções SECURITY DEFINER (bypassam RLS internamente) ──────

-- Retorna o employee_id do usuário autenticado
CREATE OR REPLACE FUNCTION public.chat_my_employee_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Retorna todos os conversation_ids em que o usuário participa
-- SECURITY DEFINER evita recursão infinita quando consultada dentro de RLS
CREATE OR REPLACE FUNCTION public.chat_my_conversation_ids()
RETURNS TABLE(conversation_id UUID) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cp.conversation_id
  FROM public.chat_participants cp
  WHERE cp.employee_id = public.chat_my_employee_id();
$$;

-- ── GRANTS ────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_participants   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_reactions      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions  TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_conversations
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_conv_select" ON public.chat_conversations
  FOR SELECT USING (
    id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "chat_conv_update" ON public.chat_conversations
  FOR UPDATE USING (
    id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_participants
-- Usa chat_my_conversation_ids() para evitar recursão
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_part_select" ON public.chat_participants
  FOR SELECT USING (
    conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

-- Permite inserir participantes se o usuário criou a conversa OU já é participante
CREATE POLICY "chat_part_insert" ON public.chat_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id
        AND (
          c.created_by = public.chat_my_employee_id()
          OR conversation_id IN (SELECT ci.conversation_id FROM public.chat_my_conversation_ids() ci)
        )
    )
  );

CREATE POLICY "chat_part_update" ON public.chat_participants
  FOR UPDATE USING (employee_id = public.chat_my_employee_id());

CREATE POLICY "chat_part_delete" ON public.chat_participants
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_messages
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_msg_select" ON public.chat_messages
  FOR SELECT USING (
    conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

CREATE POLICY "chat_msg_insert" ON public.chat_messages
  FOR INSERT WITH CHECK (
    conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
    AND employee_id = public.chat_my_employee_id()
  );

CREATE POLICY "chat_msg_update" ON public.chat_messages
  FOR UPDATE USING (employee_id = public.chat_my_employee_id());

CREATE POLICY "chat_msg_delete" ON public.chat_messages
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_reactions
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_react_select" ON public.chat_reactions
  FOR SELECT USING (
    message_id IN (
      SELECT m.id FROM public.chat_messages m
      WHERE m.conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
    )
  );

CREATE POLICY "chat_react_insert" ON public.chat_reactions
  FOR INSERT WITH CHECK (
    employee_id = public.chat_my_employee_id()
    AND message_id IN (
      SELECT m.id FROM public.chat_messages m
      WHERE m.conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
    )
  );

CREATE POLICY "chat_react_delete" ON public.chat_reactions
  FOR DELETE USING (employee_id = public.chat_my_employee_id());
