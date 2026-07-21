-- Post-dump setup: storage buckets e configurações que não são schema-only
-- Execute este script APÓS rodar setup-database-complete.sql (ou 00000000000000_init.sql)
-- em um projeto Supabase fresco.

-- =============================================================================
-- 1. Storage Buckets
-- =============================================================================
-- O pg_dump schema-only não inclui dados da tabela storage.buckets.
-- Sem estes INSERTs, uploads falharão com "bucket not found".

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('attachments',         'attachments',         true, NULL,       NULL),
  ('avatars',             'avatars',             true, NULL,       NULL),
  ('branding',            'branding',            true, NULL,       NULL),
  ('chat-attachments',    'chat-attachments',    true, 26214400,   ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/webm','video/ogg','video/quicktime',
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv',
    'application/zip','application/x-zip-compressed',
    'application/x-rar-compressed','application/vnd.rar',
    'application/x-7z-compressed'
  ]),
  ('chat-avatars',        'chat-avatars',        true, NULL,       NULL),
  ('feed-attachments',    'feed-attachments',    true, NULL,       NULL),
  ('platform-thumbnails', 'platform-thumbnails', true, 5242880,    NULL),
  ('process-documents',   'process-documents',   true, NULL,       NULL)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- 2. Verificação: tabelas na publication supabase_realtime
-- =============================================================================
-- O dump já inclui "ALTER PUBLICATION supabase_realtime ADD TABLE ...",
-- mas se por algum motivo estiverem faltando, este bloco garante.
-- (Comentado por padrão — descomente se o Realtime não funcionar.)

/*
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'chat_channel_members',
    'chat_channel_mutes',
    'chat_huddles',
    'chat_messages',
    'chat_pinned_messages',
    'chat_poll_votes',
    'chat_polls',
    'chat_presence',
    'chat_reactions',
    'chat_starred_messages',
    'meeting_ai_jobs',
    'meeting_guest_requests',
    'notes'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
*/

-- =============================================================================
-- 3. Verificação: RLS habilitado em todas as tabelas públicas
-- =============================================================================
-- O dump já deve incluir "ALTER TABLE ... ENABLE ROW LEVEL SECURITY",
-- mas este bloco garante que nenhuma tabela ficou desprotegida.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        'schema_migrations',  -- não existe em public
        'spatial_ref_sys'     -- postgis, se houver
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
