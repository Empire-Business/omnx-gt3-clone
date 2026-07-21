-- ══════════════════════════════════════════════════════════════
-- Fix 2: subqueries em políticas RLS não podem acessar tabelas
-- com RLS próprio diretamente — precisam de SECURITY DEFINER
-- ══════════════════════════════════════════════════════════════

-- Retorna o tenant_id do usuário autenticado (SECURITY DEFINER bypassa RLS de employees)
CREATE OR REPLACE FUNCTION public.chat_my_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Verifica se o usuário criou a conversa (SECURITY DEFINER bypassa RLS de chat_conversations)
CREATE OR REPLACE FUNCTION public.chat_user_created_conversation(p_conv_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = p_conv_id
      AND created_by = public.chat_my_employee_id()
  );
$$;

-- ── Recria políticas com funções SECURITY DEFINER ─────────────

DROP POLICY IF EXISTS "chat_conv_insert"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_part_insert"  ON public.chat_participants;

-- Conversa: qualquer employee autenticado pode criar
CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (
    tenant_id = public.chat_my_tenant_id()
  );

-- Participante: criador da conversa OU participante existente pode adicionar
CREATE POLICY "chat_part_insert" ON public.chat_participants
  FOR INSERT WITH CHECK (
    public.chat_user_created_conversation(conversation_id)
    OR conversation_id IN (
      SELECT ci.conversation_id FROM public.chat_my_conversation_ids() ci
    )
  );
