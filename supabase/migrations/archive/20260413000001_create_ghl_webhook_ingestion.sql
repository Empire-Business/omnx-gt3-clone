-- GoHighLevel webhook ingestion
-- Stores raw inbound payloads from GHL with tenant isolation and a per-source token.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.hash_ghl_webhook_token(token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT encode(digest(token, 'sha256'), 'hex');
$$;

CREATE TABLE IF NOT EXISTS public.ghl_webhook_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'GHL',
  token_hash TEXT NOT NULL UNIQUE,
  location_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_received_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ghl_webhook_sources_tenant_id_idx
  ON public.ghl_webhook_sources(tenant_id);

CREATE INDEX IF NOT EXISTS ghl_webhook_sources_token_hash_idx
  ON public.ghl_webhook_sources(token_hash)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.ghl_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.ghl_webhook_sources(id) ON DELETE CASCADE,
  event_type TEXT,
  ghl_location_id TEXT,
  ghl_contact_id TEXT,
  ghl_opportunity_id TEXT,
  ghl_conversation_id TEXT,
  ghl_workflow_id TEXT,
  request_method TEXT NOT NULL DEFAULT 'POST',
  request_url TEXT,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  query_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  raw_body TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_status TEXT NOT NULL DEFAULT 'stored'
    CHECK (processing_status IN ('stored', 'processing', 'processed', 'failed', 'ignored')),
  processing_error TEXT
);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_tenant_id_idx
  ON public.ghl_webhook_events(tenant_id);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_source_id_idx
  ON public.ghl_webhook_events(source_id);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_received_at_idx
  ON public.ghl_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_event_type_idx
  ON public.ghl_webhook_events(event_type);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_ghl_contact_id_idx
  ON public.ghl_webhook_events(ghl_contact_id);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_payload_gin_idx
  ON public.ghl_webhook_events USING GIN (payload);

ALTER TABLE public.ghl_webhook_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_webhook_sources_select"
  ON public.ghl_webhook_sources FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "ghl_webhook_sources_insert"
  ON public.ghl_webhook_sources FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "ghl_webhook_sources_update"
  ON public.ghl_webhook_sources FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_admin())
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "ghl_webhook_sources_delete"
  ON public.ghl_webhook_sources FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "ghl_webhook_events_select"
  ON public.ghl_webhook_events FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "ghl_webhook_events_update"
  ON public.ghl_webhook_events FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_admin())
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin());

CREATE OR REPLACE FUNCTION public.set_ghl_webhook_sources_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_ghl_webhook_sources_updated_at
  BEFORE UPDATE ON public.ghl_webhook_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ghl_webhook_sources_updated_at();
