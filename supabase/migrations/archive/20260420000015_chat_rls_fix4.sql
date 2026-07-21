-- ══════════════════════════════════════════════════════════════
-- Fix 4:
-- 1. push_subscriptions: adiciona política UPDATE (faltava para upsert)
-- 2. chat_conv_insert: simplifica para auth.uid() IS NOT NULL
--    (diagnostica se o problema é chat_my_employee_id() retornando NULL)
-- ══════════════════════════════════════════════════════════════

-- ── push_subscriptions: UPDATE policy ─────────────────────────
DROP POLICY IF EXISTS "push_subs_own_update" ON public.push_subscriptions;

CREATE POLICY "push_subs_own_update" ON public.push_subscriptions
  FOR UPDATE USING (
    employee_id = public.chat_my_employee_id()
  ) WITH CHECK (
    employee_id = public.chat_my_employee_id()
  );

-- ── chat_conversations INSERT: máxima permissividade ──────────
DROP POLICY IF EXISTS "chat_conv_insert" ON public.chat_conversations;

CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── EXECUTE grants explícitos nas funções helper ──────────────
GRANT EXECUTE ON FUNCTION public.chat_my_employee_id()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_my_conversation_ids()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_my_tenant_id()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_user_created_conversation(UUID) TO authenticated;
