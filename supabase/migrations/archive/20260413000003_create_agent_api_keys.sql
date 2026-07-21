-- Migration: agent_api_keys
-- API Keys estáticas para integração com agentes externos (OpenClaw, etc.)
-- Mesmo padrão de segurança de ghl_webhook_sources: SHA-256 hash, nunca o token em plain text.

CREATE TABLE IF NOT EXISTS agent_api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash     TEXT        NOT NULL UNIQUE, -- SHA-256 do token real (token nunca é armazenado)
  name         TEXT        NOT NULL DEFAULT 'OpenClaw',
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_api_keys_tenant    ON agent_api_keys(tenant_id);
CREATE INDEX idx_agent_api_keys_key_hash  ON agent_api_keys(key_hash) WHERE is_active = true;

ALTER TABLE agent_api_keys ENABLE ROW LEVEL SECURITY;

-- Apenas admin do mesmo tenant pode ver as chaves
CREATE POLICY "agent_api_keys_select" ON agent_api_keys
  FOR SELECT USING (
    tenant_id = get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Apenas admin do mesmo tenant pode criar chaves
CREATE POLICY "agent_api_keys_insert" ON agent_api_keys
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Apenas admin do mesmo tenant pode revogar/excluir
CREATE POLICY "agent_api_keys_delete" ON agent_api_keys
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
