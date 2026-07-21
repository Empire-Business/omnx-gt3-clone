-- Permite que cada tenant tenha um domínio próprio (ex: app.empresa.com.br)
-- usado pra detectar qual workspace carregar baseado no hostname.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS custom_domain TEXT;

-- Garante que dois tenants não compartilhem o mesmo domínio.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_custom_domain_key
  ON public.tenants (LOWER(custom_domain))
  WHERE custom_domain IS NOT NULL;

COMMENT ON COLUMN public.tenants.custom_domain IS
  'Domínio personalizado do tenant (ex: app.empresa.com.br). Usado pra resolver tenant pelo hostname.';
