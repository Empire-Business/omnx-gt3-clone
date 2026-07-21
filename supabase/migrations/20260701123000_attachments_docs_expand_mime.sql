-- ══════════════════════════════════════════════════════════════
-- attachments + process-documents: expande o allowlist de MIME
--
-- A migration 20260624121000_storage_bucket_limits.sql definiu um allowlist
-- restrito nesses buckets, bloqueando .md (text/markdown), variantes de zip
-- do Windows (application/x-zip-compressed, application/octet-stream), json,
-- csv, pptx, rar, 7z, etc. Diferente do chat, esses buckets NÃO têm blocklist
-- de XSS no frontend, então o bucket precisa continuar sendo a barreira —
-- por isso mantemos um allowlist, mas ampliado.
--
-- Tipos adicionados são "download-only" (o navegador nunca os renderiza inline),
-- portanto NÃO reintroduzem o vetor de XSS. svg+xml / text/html / xhtml
-- continuam FORA do allowlist de propósito.
-- file_size_limit permanece em 25 MB (não era o problema reportado).
-- Aplicado em produção (opbdoulspzlabxzevffc) via Management API.
-- ══════════════════════════════════════════════════════════════

update storage.buckets
set allowed_mime_types = array[
      -- imagens (inertes para XSS, exceto svg que fica de fora)
      'image/jpeg','image/png','image/webp','image/gif',
      -- documentos office / pdf
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      -- texto (sem text/html)
      'text/plain','text/markdown','text/csv',
      'application/json',
      -- arquivos compactados (incl. variantes do Windows)
      'application/zip','application/x-zip-compressed',
      'application/x-7z-compressed',
      'application/x-rar-compressed','application/vnd.rar',
      'application/gzip','application/x-tar',
      -- catch-all: navegador sempre baixa, nunca executa
      'application/octet-stream',
      -- mídia
      'audio/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg',
      'video/mp4','video/webm','video/quicktime'
    ]
where id in ('attachments','process-documents');
