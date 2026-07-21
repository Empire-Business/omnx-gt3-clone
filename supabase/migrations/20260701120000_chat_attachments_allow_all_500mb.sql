-- ══════════════════════════════════════════════════════════════
-- chat-attachments: restaura a política "libera TODOS os tipos" + 500 MB
--
-- A migration 20260624121000_storage_bucket_limits.sql (hardening) havia
-- reintroduzido um allowlist de MIME no bucket chat-attachments, o que
-- CONTRADIZIA a política documentada em 20260610120000 e implementada no
-- frontend (CHAT_ATTACHMENT_MIME_BLOCKLIST em src/hooks/useChat.ts).
-- Efeito colateral: .md (text/markdown), .zip vindos como
-- application/x-zip-compressed / application/octet-stream, json, csv, etc.
-- eram rejeitados no upload. Além disso o limite continuava em 25 MB,
-- embora o código já espere 500 MB (commit 6893ffb).
--
-- Política restaurada:
--   • allowed_mime_types = NULL  → bucket aceita qualquer MIME
--   • file_size_limit = 524288000 (500 MB)
--   • Defesa contra XSS (svg+xml / text/html / xhtml) fica no frontend,
--     já que o bucket é público (blocklist em useChat.ts).
-- ══════════════════════════════════════════════════════════════

UPDATE storage.buckets
SET
  file_size_limit = 524288000,   -- 500 MB
  allowed_mime_types = NULL
WHERE id = 'chat-attachments';
