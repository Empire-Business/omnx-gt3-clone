-- ══════════════════════════════════════════════════════════════
-- Chat: silenciar conversa (grupo E DM) respeitado de verdade.
--
-- Bugs corrigidos:
--   1. chat_channel_mutes NÃO tinha policy de UPDATE. O toggleMute do
--      frontend usa upsert com onConflict (channel_id,user_id); quando já
--      existia um registro para o par, o ON CONFLICT DO UPDATE era
--      bloqueado pelo RLS e o silenciamento falhava. Sintoma relatado em
--      produção: "abri os dados do grupo, cliquei em silenciar, não
--      funciona" — acontece a partir da 2ª tentativa em qualquer canal.
--   2. get_unread_chat_for_email ignorava mutes → o digest por email
--      continuava chegando de canais silenciados.
--
-- O push de mensagem (edge function send-chat-notification) e os badges
-- globais foram corrigidos no código da aplicação, usando o helper
-- is_channel_muted criado aqui como fonte única da regra de expiração.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Policy de UPDATE faltante ──────────────────────────────
-- Sem isto o upsert de re-silenciamento (trocar 1h por 24h, ou
-- silenciar um canal que já teve mute no passado) falha com
-- "new row violates row-level security policy".
DROP POLICY IF EXISTS "user updates own mute" ON public.chat_channel_mutes;
CREATE POLICY "user updates own mute"
  ON public.chat_channel_mutes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 2. Helper: mute ativo (permanente ou não expirado) ─────────
-- Fonte única da regra "mute vale agora?", usada pela RPC de email e
-- disponível para triggers/edge functions futuras.
CREATE OR REPLACE FUNCTION public.is_channel_muted(
  p_channel_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_channel_mutes m
    WHERE m.channel_id = p_channel_id
      AND m.user_id = p_user_id
      AND (m.expires_at IS NULL OR m.expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_channel_muted(uuid, uuid) TO authenticated, service_role;

-- ── 3. Email de não-lidas passa a respeitar o mute ────────────
CREATE OR REPLACE FUNCTION public.get_unread_chat_for_email(
  p_quiet interval DEFAULT interval '5 minutes'
)
RETURNS TABLE (
  tenant_id uuid,
  channel_id uuid,
  channel_name text,
  is_dm boolean,
  user_id uuid,
  unread_count integer,
  latest_message_at timestamptz,
  latest_sender_id uuid,
  latest_sender_name text,
  latest_preview text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ch.tenant_id,
    cm.channel_id,
    ch.name AS channel_name,
    ch.is_dm,
    cm.user_id,
    u.unread_count,
    lm.created_at AS latest_message_at,
    lm.author_id AS latest_sender_id,
    pr.full_name AS latest_sender_name,
    left(coalesce(lm.content, ''), 140) AS latest_preview
  FROM public.chat_channel_members cm
  JOIN public.chat_channels ch ON ch.id = cm.channel_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS unread_count
    FROM public.chat_messages m
    WHERE m.channel_id = cm.channel_id
      AND m.author_id <> cm.user_id
      AND m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
  ) u
  JOIN LATERAL (
    SELECT m2.author_id, m2.content, m2.created_at
    FROM public.chat_messages m2
    WHERE m2.channel_id = cm.channel_id
      AND m2.author_id <> cm.user_id
      AND m2.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
    ORDER BY m2.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN public.profiles pr ON pr.user_id = lm.author_id
  LEFT JOIN public.chat_email_notifications en
    ON en.channel_id = cm.channel_id AND en.user_id = cm.user_id
  WHERE u.unread_count > 0
    AND lm.created_at <= now() - p_quiet
    AND lm.created_at > coalesce(en.last_emailed_message_at, 'epoch'::timestamptz)
    -- Canal silenciado por este destinatário → nada de email
    AND NOT public.is_channel_muted(cm.channel_id, cm.user_id);
$$;

REVOKE EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) TO service_role;

-- ── 4. Índice de leitura por usuário ──────────────────────────
-- O push e os badges consultam por user_id/channel_id; só existia
-- índice parcial em expires_at.
CREATE INDEX IF NOT EXISTS idx_chat_channel_mutes_user
  ON public.chat_channel_mutes (user_id, channel_id);
