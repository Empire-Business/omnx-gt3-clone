-- Add Trello-like features to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS labels jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_url text DEFAULT NULL;

-- labels format: [{"text": "Bug", "color": "#ef4444"}, ...]
-- attachments format: [{"name": "file.pdf", "url": "https://...", "type": "application/pdf", "size": 1024, "uploaded_at": "2026-01-01T00:00:00Z"}, ...]
COMMENT ON COLUMN public.tasks.labels IS 'Colored labels array [{text, color}]';
COMMENT ON COLUMN public.tasks.attachments IS 'File attachments [{name, url, type, size, uploaded_at}]';
COMMENT ON COLUMN public.tasks.cover_url IS 'Cover image URL displayed on card';