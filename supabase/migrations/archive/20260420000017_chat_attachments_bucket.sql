-- ══════════════════════════════════════════════════════════════
-- Garante que o bucket chat-attachments existe e é público
-- URLs públicas são necessárias para <audio>/<video>/<img> no browser
-- ══════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  52428800,  -- 50 MB
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'video/mp4','video/webm','video/ogg',
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv',
    'application/zip','application/x-rar-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Permite upload para qualquer usuário autenticado
DROP POLICY IF EXISTS "chat_attach_upload" ON storage.objects;
CREATE POLICY "chat_attach_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

-- Leitura pública (necessária para URLs em <audio>/<video>/<img>)
DROP POLICY IF EXISTS "chat_attach_read" ON storage.objects;
CREATE POLICY "chat_attach_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments');

-- Deleção apenas pelo dono (tenant_id é a primeira pasta)
DROP POLICY IF EXISTS "chat_attach_delete" ON storage.objects;
CREATE POLICY "chat_attach_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-attachments');
