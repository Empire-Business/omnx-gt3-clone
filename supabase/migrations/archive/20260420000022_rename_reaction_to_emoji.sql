-- Renomeia coluna 'reaction' para 'emoji' em chat_reactions
-- A tabela foi criada originalmente com 'reaction' (migration 000010),
-- mas o código e a migration 000018 (IF NOT EXISTS ignorada) usam 'emoji'.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_reactions'
      AND column_name  = 'reaction'
  ) THEN
    ALTER TABLE public.chat_reactions RENAME COLUMN reaction TO emoji;
  END IF;
END $$;
