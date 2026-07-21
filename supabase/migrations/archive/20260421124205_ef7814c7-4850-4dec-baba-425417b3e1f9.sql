
CREATE TABLE IF NOT EXISTS public.feed_audio_transcriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  attachment_url text NOT NULL,
  transcription text NOT NULL,
  language text,
  model text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, attachment_url)
);

CREATE INDEX IF NOT EXISTS idx_feed_audio_transcriptions_tenant
  ON public.feed_audio_transcriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feed_audio_transcriptions_url
  ON public.feed_audio_transcriptions(attachment_url);

ALTER TABLE public.feed_audio_transcriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read transcriptions"
  ON public.feed_audio_transcriptions
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "tenant members can insert transcriptions"
  ON public.feed_audio_transcriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "admins can update transcriptions"
  ON public.feed_audio_transcriptions
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "admins can delete transcriptions"
  ON public.feed_audio_transcriptions
  FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());
