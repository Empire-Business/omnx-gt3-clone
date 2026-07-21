-- Adiciona coluna de anexos à tabela feed_posts
ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Bucket para armazenar mídia do Feed
INSERT INTO storage.buckets (id, name, public)
VALUES ('feed-attachments', 'feed-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Política: usuários autenticados podem fazer upload no próprio tenant
CREATE POLICY "feed_attachments_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'feed-attachments');

-- Política: leitura pública (bucket público)
CREATE POLICY "feed_attachments_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'feed-attachments');

-- Política: dono pode deletar
CREATE POLICY "feed_attachments_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'feed-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
