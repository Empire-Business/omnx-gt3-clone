-- ══════════════════════════════════════════════════════════════
-- chat-attachments: liberar TODOS os tipos de arquivo
--   • allowed_mime_types = NULL  → bucket aceita qualquer MIME
--   • Mantém file_size_limit em 25 MB
--   • A defesa contra XSS (svg+xml / text/html) passa a ser feita no
--     frontend (CHAT_ATTACHMENT_MIME_BLOCKLIST em src/hooks/useChat.ts),
--     já que o bucket é público.
-- Substitui o allowlist de 20260501100000_chat_attachments_harden.sql.
-- ══════════════════════════════════════════════════════════════

UPDATE storage.buckets
SET
  file_size_limit = 26214400,  -- 25 MB
  allowed_mime_types = NULL
WHERE id = 'chat-attachments';
