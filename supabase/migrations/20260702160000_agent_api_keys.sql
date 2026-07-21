-- ─── agent_api_keys (lacuna do baseline) ───────────────────────────────
-- Chaves de API estáticas para integração com agentes externos (OpenClaw, n8n,
-- etc.). A tabela existia só no archive e ficou de fora do baseline init.sql,
-- então o feature "Chaves de API" (Configurações) quebrava no clone: a
-- edge function agent-gateway falhava ao inserir/listar.
-- Segurança: guarda apenas o SHA-256 do token (o token real nunca é armazenado).
-- RLS: apenas admin do mesmo tenant vê/cria/revoga.

CREATE TABLE IF NOT EXISTS public.agent_api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash     TEXT        NOT NULL UNIQUE, -- SHA-256 do token real
  name         TEXT        NOT NULL DEFAULT 'OpenClaw',
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_api_keys_tenant   ON public.agent_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_key_hash ON public.agent_api_keys(key_hash) WHERE is_active = true;

ALTER TABLE public.agent_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_api_keys_select" ON public.agent_api_keys;
CREATE POLICY "agent_api_keys_select" ON public.agent_api_keys
  FOR SELECT USING (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "agent_api_keys_insert" ON public.agent_api_keys;
CREATE POLICY "agent_api_keys_insert" ON public.agent_api_keys
  FOR INSERT WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "agent_api_keys_delete" ON public.agent_api_keys;
CREATE POLICY "agent_api_keys_delete" ON public.agent_api_keys
  FOR DELETE USING (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
