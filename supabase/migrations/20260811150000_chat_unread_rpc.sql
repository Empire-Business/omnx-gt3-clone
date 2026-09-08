-- ══════════════════════════════════════════════════════════════
-- Performance do chat: mata dois loops N+1 que faziam UMA requisição
-- HTTP POR CANAL, em polling contínuo.
--
-- Antes:
--   • useChatUnread      → 1 request por canal, a cada 20s, em TODA página
--   • useChatLastMessages→ 1 request por canal, a cada 30s, na lista de conversas
--
-- O usuário com mais canais do sistema é membro de 28 (média geral: 2,4), ou
-- seja ~140 requisições por minuto só para montar contadores e prévias. Em 4G
-- isso mantém o rádio do celular praticamente sempre ativo — trava a interface,
-- esquenta o aparelho e drena a bateria.
--
-- Depois: 1 requisição para cada caso, agregando no banco.
--
-- Segurança: ambas são SECURITY DEFINER mas filtram SEMPRE por auth.uid() e
-- só enxergam canais dos quais o usuário chamador é membro — não é possível
-- ler contagem nem prévia de canal alheio passando ids arbitrários.
-- Índice aproveitado: idx_chat_messages_channel (channel_id, created_at DESC).
-- ══════════════════════════════════════════════════════════════

-- ── Contagem de não lidas por canal (substitui o loop de counts) ──
CREATE OR REPLACE FUNCTION public.get_chat_unread_counts()
RETURNS TABLE (channel_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.channel_id,
    count(msg.id) AS unread_count
  FROM public.chat_channel_members m
  LEFT JOIN public.chat_messages msg
    ON msg.channel_id = m.channel_id
   AND msg.author_id <> m.user_id
   AND msg.created_at > coalesce(m.last_read_at, '1970-01-01'::timestamptz)
  WHERE m.user_id = auth.uid()
  GROUP BY m.channel_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_unread_counts() TO authenticated;

-- ── Última mensagem de cada canal (substitui o loop de prévias) ──
-- DISTINCT ON + o índice (channel_id, created_at DESC) resolve tudo num
-- índice-scan só. O EXISTS garante que ids de canais alheios passados no
-- array simplesmente não retornam nada.
CREATE OR REPLACE FUNCTION public.get_chat_last_messages(p_channel_ids uuid[])
RETURNS TABLE (
  channel_id uuid,
  content text,
  created_at timestamptz,
  author_id uuid,
  attachments jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (msg.channel_id)
    msg.channel_id,
    msg.content,
    msg.created_at,
    msg.author_id,
    msg.attachments
  FROM public.chat_messages msg
  WHERE msg.channel_id = ANY(p_channel_ids)
    AND EXISTS (
      SELECT 1
      FROM public.chat_channel_members m
      WHERE m.channel_id = msg.channel_id
        AND m.user_id = auth.uid()
    )
  ORDER BY msg.channel_id, msg.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_last_messages(uuid[]) TO authenticated;
