-- ══════════════════════════════════════════════════════════════
-- QUEM SAIU DA EMPRESA PARA DE RECEBER NOTIFICAÇÃO
--
-- Relatado em produção (03/09/2026): uma colaboradora foi desativada em
-- Colaboradores e CONTINUOU recebendo o e-mail de mensagens não lidas do
-- chat, a ponto de pedir por escrito a remoção do cadastro porque a caixa
-- dela estava lotando.
--
-- Causa: `get_unread_chat_for_email` monta a lista de destinatários a partir
-- de `chat_channel_members` e nunca olha para `employees`. Ou seja, a função
-- ignora completamente:
--   • `employees.status` — desativado ('inactive') e afastado ('on_leave')
--     recebiam igual a quem está ativo;
--   • o banimento da conta em `auth.users.banned_until` — banir tira o login,
--     mas não tirava o e-mail.
-- E `chat_channel_members.user_id` NÃO tem foreign key para `auth.users`
-- (confirmado no schema), então a linha de participação no canal também não
-- some sozinha quando a pessoa é removida — ela fica lá, gerando e-mail para
-- sempre.
--
-- Desativar, banir ou desligar alguém precisa calar TODOS os canais de aviso.
-- Esta migration fecha o caminho do e-mail. O push de chat tinha o mesmo furo
-- e foi corrigido no mesmo commit, em
-- `supabase/functions/send-chat-notification/index.ts` (a busca em
-- `employees` ganhou `.eq("status", "active")`).
--
-- Decisão de desenho, deliberada: o filtro exclui quem TEM vínculo não-ativo
-- no tenant, em vez de exigir vínculo ativo. Assim resolve o caso real
-- (pessoa desligada) sem calar silenciosamente algum usuário legítimo que,
-- por qualquer motivo, não tenha linha em `employees` — errar para o lado de
-- "manda demais" é recuperável; errar para "some com o aviso de alguém que
-- ainda trabalha aqui" é o tipo de bug que ninguém reporta e todo mundo sofre.
--
-- Não mexe em `chat_channel_members`: a participação no canal é histórico e
-- continua valendo se a pessoa for reativada. O que muda é só quem recebe.
-- ══════════════════════════════════════════════════════════════

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
STABLE
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
    AND NOT public.is_channel_muted(cm.channel_id, cm.user_id)
    -- Desligado, desativado ou afastado NO TENANT DESTE CANAL → nada de email.
    -- O vínculo é por (user_id, tenant_id): alguém inativo na empresa A e
    -- ativo na empresa B continua recebendo os avisos da B.
    AND NOT EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.user_id = cm.user_id
        AND e.tenant_id = ch.tenant_id
        AND e.status <> 'active'
    )
    -- Conta banida (manage-access → action 'ban') → nada de email.
    -- Banir tirava o login e deixava o e-mail saindo.
    AND NOT EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id = cm.user_id
        AND au.banned_until IS NOT NULL
        AND au.banned_until > now()
    );
$$;

-- Mesma exposição da versão anterior: só o service_role (Edge Function) chama.
REVOKE EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_chat_for_email(interval) TO service_role;

COMMENT ON FUNCTION public.get_unread_chat_for_email(interval) IS
  'Destinatários do digest de mensagens não lidas. Exclui canal silenciado, colaborador não-ativo no tenant do canal e conta banida. Só service_role executa.';
