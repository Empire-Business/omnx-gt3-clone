-- ══════════════════════════════════════════════════════════════
-- Notificação por email de mensagens de chat não lidas.
-- Quando uma conversa fica 5 min sem atividade e ainda há mensagens
-- não lidas, um digest é enviado por email ao destinatário.
--
-- Componentes:
--   1. chat_email_notifications — dedupe por (channel_id, user_id)
--   2. get_unread_chat_for_email(interval) — RPC que lista conversas
--      elegíveis para email (silenciosas há `p_quiet` e com algo novo
--      desde o último email enviado)
--
-- A edge function `email-unread-chat` consome a RPC e faz o upsert.
-- ══════════════════════════════════════════════════════════════

-- ── Tabela de dedupe ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_email_notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  tenant_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_emailed_message_at timestamptz NOT NULL,
  emailed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_email_notifications_channel_user_key UNIQUE (channel_id, user_id)
);

-- RLS: deny-all para clientes. Só o service_role (edge function) acessa.
ALTER TABLE public.chat_email_notifications ENABLE ROW LEVEL SECURITY;

-- ── RPC: conversas elegíveis para email ───────────────────────
-- Retorna, por (canal, destinatário), as conversas que:
--   • têm mensagens não lidas (author <> destinatário, após last_read_at)
--   • estão silenciosas há >= p_quiet (mensagem mais recente não-lida)
--   • têm algo mais novo do que o último email já enviado
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
    AND lm.created_at > coalesce(en.last_emailed_message_at, 'epoch'::timestamptz);
$$;

-- Apenas o service_role pode executar (edge function via cron).
REVOKE EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) TO service_role;
