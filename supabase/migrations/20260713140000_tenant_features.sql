-- ─── tenant_features (override manual de features por integração) ──────────
-- Central de Integrações: cada feature (reuniões, IA, gravação, e-mail, push)
-- ACENDE sozinha quando a chave de API correspondente está conectada e saudável
-- (verificado em tempo real pela edge function `integrations-status`, lendo do
-- Vault/env). Esta tabela guarda APENAS o override do admin para DESLIGAR uma
-- feature que está disponível — nunca serve para ligar o que não tem chave.
--
-- Regra efetiva de visibilidade (aplicada no front, ver useIntegrations):
--   visível = (chave presente E saudável) E NOT manually_disabled
--
-- Ausência de linha = feature NÃO desligada manualmente (default seguro). Por
-- isso o clone recém-criado não precisa de seed: sem linha + sem chave = feature
-- some; sem linha + com chave = feature aparece.
--
-- Segurança: leitura por qualquer membro do tenant (o front precisa saber o que
-- mostrar); escrita apenas por admin do mesmo tenant. NENHUMA chave de API vive
-- aqui — segredos ficam no Vault/secrets, nunca no banco em texto puro.

CREATE TABLE IF NOT EXISTS public.tenant_features (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key       TEXT        NOT NULL, -- 'meetings' | 'ai' | 'recording' | 'email' | 'push'
  manually_disabled BOOLEAN     NOT NULL DEFAULT false,
  updated_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_features_tenant ON public.tenant_features(tenant_id);

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro do tenant (necessário para o gate de UI de todos os papéis)
DROP POLICY IF EXISTS "tenant_features_select" ON public.tenant_features;
CREATE POLICY "tenant_features_select" ON public.tenant_features
  FOR SELECT USING (
    tenant_id = public.get_user_tenant_id()
  );

-- Escrita (insert/update/delete): apenas admin do mesmo tenant
DROP POLICY IF EXISTS "tenant_features_insert" ON public.tenant_features;
CREATE POLICY "tenant_features_insert" ON public.tenant_features
  FOR INSERT WITH CHECK (
    tenant_id = public.get_user_tenant_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "tenant_features_update" ON public.tenant_features;
CREATE POLICY "tenant_features_update" ON public.tenant_features
  FOR UPDATE USING (
    tenant_id = public.get_user_tenant_id() AND public.is_admin()
  ) WITH CHECK (
    tenant_id = public.get_user_tenant_id() AND public.is_admin()
  );

DROP POLICY IF EXISTS "tenant_features_delete" ON public.tenant_features;
CREATE POLICY "tenant_features_delete" ON public.tenant_features
  FOR DELETE USING (
    tenant_id = public.get_user_tenant_id() AND public.is_admin()
  );
