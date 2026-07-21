-- ══════════════════════════════════════════════════════════════
-- Favoritos por usuário em canais/grupos/DMs do chat.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chat_user_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  channel_id  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS chat_user_favorites_user_idx
  ON public.chat_user_favorites(user_id);

ALTER TABLE public.chat_user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_user_favorites_select ON public.chat_user_favorites;
CREATE POLICY chat_user_favorites_select ON public.chat_user_favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_user_favorites_insert ON public.chat_user_favorites;
CREATE POLICY chat_user_favorites_insert ON public.chat_user_favorites
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_user_favorites_delete ON public.chat_user_favorites;
CREATE POLICY chat_user_favorites_delete ON public.chat_user_favorites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
