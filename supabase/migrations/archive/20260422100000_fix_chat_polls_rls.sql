-- Fix chat_polls_update RLS: managers could update any poll in tenant
-- regardless of whether they participate in the conversation.
-- Restrict to polls in conversations where the manager is a participant.

DROP POLICY IF EXISTS chat_polls_update ON public.chat_polls;

CREATE POLICY chat_polls_update ON public.chat_polls
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      (is_admin() OR has_role(auth.uid(), 'manager'::app_role))
      AND conversation_id IN (
        SELECT conversation_id FROM public.chat_my_conversation_ids()
      )
    )
  );
