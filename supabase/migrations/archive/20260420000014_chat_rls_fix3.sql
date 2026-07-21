-- ══════════════════════════════════════════════════════════════
-- Fix 3: simplificar INSERT policies — apenas verificar que o
-- usuário é um employee autenticado válido
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "chat_conv_insert"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_part_insert"  ON public.chat_participants;

-- Qualquer employee autenticado pode criar uma conversa
-- (tenant_id é enviado pelo cliente e isolado pelo SELECT policy)
CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (
    public.chat_my_employee_id() IS NOT NULL
  );

-- Criador ou participante existente pode adicionar participantes
CREATE POLICY "chat_part_insert" ON public.chat_participants
  FOR INSERT WITH CHECK (
    public.chat_my_employee_id() IS NOT NULL
    AND (
      public.chat_user_created_conversation(conversation_id)
      OR conversation_id IN (
        SELECT ci.conversation_id FROM public.chat_my_conversation_ids() ci
      )
    )
  );
