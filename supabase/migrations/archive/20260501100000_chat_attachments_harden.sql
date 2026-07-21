-- ══════════════════════════════════════════════════════════════
-- Hardening do bucket chat-attachments
--   • Reduz limite de tamanho: 50MB → 25MB
--   • Remove image/svg+xml do allowlist (vetor de XSS via <svg onload>)
--   • Mantém bucket público para compatibilidade com URLs já gravadas
--     em chat_messages.attachments (migração para bucket privado +
--     signed URLs exige conversão das URLs existentes — ver TODO).
--
-- TODO (futuro): tornar o bucket privado e migrar atachments existentes
-- para signed URLs, atualizando jsonb.attachments[*].url.
-- ══════════════════════════════════════════════════════════════

UPDATE storage.buckets
SET
  file_size_limit = 26214400,  -- 25 MB
  allowed_mime_types = ARRAY[
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
  ]
WHERE id = 'chat-attachments';
