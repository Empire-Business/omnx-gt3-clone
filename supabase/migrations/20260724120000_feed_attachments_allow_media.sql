-- ══════════════════════════════════════════════════════════════
-- feed-attachments: alinha o bucket com a feature (vídeo/áudio/arquivo)
--
-- A migration 20260624121000_storage_bucket_limits.sql colocou o bucket
-- `feed-attachments` no grupo "só imagem, 5 MB" (image/jpeg|png|webp|gif).
-- Mas o Feed SEMPRE suportou anexar vídeo, áudio e documentos:
--   - MediaComposer usa accept="image/*,video/*" + gravação de áudio +
--     input de documentos (pdf/office/zip/…), com MAX_FILE_SIZE = 50 MB.
--   - uploadFeedFiles() envia tudo para o bucket `feed-attachments`.
-- Resultado do descompasso: qualquer upload que não fosse imagem batia
-- 400 (mime não permitido) — ninguém conseguia postar vídeo/áudio/arquivo
-- no feed. Reportado ao publicar um vídeo de divulgação do app mobile.
--
-- Correção: allowlist ampliado (imagens + vídeo + áudio + office/pdf/zip)
-- e file_size_limit elevado para 50 MB, casando com o frontend.
--
-- Segurança: svg+xml, text/html e xhtml continuam FORA de propósito —
-- o bucket é public=true e servido inline, então esses tipos seriam vetor
-- de XSS. Todos os tipos abaixo são inertes ou download-only. Mesma
-- política das migrations 20260624121000 e 20260701123000.
--
-- Aplicado em produção (opbdoulspzlabxzevffc) em 2026-07-24 via Management API.
-- ══════════════════════════════════════════════════════════════

update storage.buckets
set file_size_limit = 52428800, -- 50 MB (== MAX_FILE_SIZE do MediaComposer)
    allowed_mime_types = array[
      -- imagens (sem svg)
      'image/jpeg','image/png','image/webp','image/gif',
      -- vídeo
      'video/mp4','video/webm','video/quicktime','video/x-msvideo','video/mpeg',
      -- áudio (inclui gravação in-app: webm/ogg/mp4)
      'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav',
      -- documentos office / pdf / texto
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain','text/csv',
      -- compactados
      'application/zip','application/x-rar-compressed','application/vnd.rar'
    ]
where id = 'feed-attachments';
