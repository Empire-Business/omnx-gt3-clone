-- Segurança (hardening): define file_size_limit e allowed_mime_types nos buckets.
-- Buckets eram public=true sem restrição de mime, permitindo upload de
-- image/svg+xml ou text/html que, servidos inline, executam JS (XSS), e
-- arquivos arbitrariamente grandes (abuso/custo).
-- Aplicado em produção (opbdoulspzlabxzevffc) em 2026-06-24 via Management API.

-- Buckets exclusivamente de imagem (5MB)
update storage.buckets
set file_size_limit = coalesce(file_size_limit, 5242880),
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id in ('avatars','chat-avatars','branding','platform-thumbnails','feed-attachments');

-- Buckets de anexos/documentos (25MB) — imagens + pdf + office + mídia, SEM svg/html
update storage.buckets
set file_size_limit = coalesce(file_size_limit, 26214400),
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain','application/zip','audio/webm','audio/mpeg','video/mp4','video/webm'
    ]
where id in ('attachments','chat-attachments','process-documents');
