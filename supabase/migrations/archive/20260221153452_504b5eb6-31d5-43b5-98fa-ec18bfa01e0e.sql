
-- Webhooks configuration table (W2.2)
CREATE TABLE public.webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhooks_select" ON public.webhooks FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "webhooks_insert_admin" ON public.webhooks FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "webhooks_update_admin" ON public.webhooks FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "webhooks_delete_admin" ON public.webhooks FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_admin());

-- Webhook logs for debugging
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_logs_select" ON public.webhook_logs FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "webhook_logs_insert" ON public.webhook_logs FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Index for performance
CREATE INDEX idx_webhook_logs_webhook_id ON public.webhook_logs(webhook_id);
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX idx_webhooks_tenant_id ON public.webhooks(tenant_id);
