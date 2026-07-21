-- ══════════════════════════════════════════════════════════════
-- Fix RLS: profiles.id não existe — usar profiles.user_id
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS notes_insert ON public.notes;
CREATE POLICY notes_insert ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS scheduled_messages_insert ON public.scheduled_messages;
CREATE POLICY scheduled_messages_insert ON public.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );
