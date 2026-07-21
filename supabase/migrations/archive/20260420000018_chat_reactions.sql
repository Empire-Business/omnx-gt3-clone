-- ══════════════════════════════════════════════════════════════
-- Reações a mensagens do chat
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chat_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  emoji       TEXT NOT NULL CHECK (char_length(emoji) <= 8),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, employee_id, emoji)
);

CREATE INDEX IF NOT EXISTS chat_reactions_message_idx ON public.chat_reactions(message_id);
CREATE INDEX IF NOT EXISTS chat_reactions_employee_idx ON public.chat_reactions(employee_id);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select" ON public.chat_reactions;
CREATE POLICY "reactions_select" ON public.chat_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages cm
      JOIN public.chat_participants cp ON cp.conversation_id = cm.conversation_id
      WHERE cm.id = chat_reactions.message_id
        AND cp.employee_id IN (
          SELECT id FROM public.employees WHERE user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "reactions_insert" ON public.chat_reactions;
CREATE POLICY "reactions_insert" ON public.chat_reactions
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "reactions_delete" ON public.chat_reactions;
CREATE POLICY "reactions_delete" ON public.chat_reactions
  FOR DELETE USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );
