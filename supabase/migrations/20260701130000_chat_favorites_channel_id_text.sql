-- ══════════════════════════════════════════════════════════════
-- chat_user_favorites.channel_id: uuid → text
--
-- O card virtual "Anotações" na lista de conversas usa a chave sentinela
-- '__anotacoes__' (não é um UUID). Ao favoritar/fixar o Anotações, o INSERT
-- em chat_user_favorites falhava com 22P02 (invalid input syntax for type uuid),
-- então o favoritar do Anotações não funcionava.
--
-- A coluna NÃO tem foreign key para chat_channels, então trocar o tipo para
-- text é seguro: UUIDs já existentes continuam batendo como texto no frontend
-- (comparação por string), e a chave '__anotacoes__' passa a caber.
-- A constraint UNIQUE (user_id, channel_id) e o índice são preservados.
-- Aplicado em produção (opbdoulspzlabxzevffc) via Management API.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.chat_user_favorites
  ALTER COLUMN channel_id TYPE text USING channel_id::text;
