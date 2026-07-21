-- Resolve qual tenant carregar baseado no hostname público (custom_domain).
-- É uma função pública (anon pode chamar) porque precisa rodar ANTES do login,
-- pra aplicar nome/logo/cor já na tela de Auth.
--
-- Retorna APENAS campos de branding — nunca dados sensíveis.

CREATE OR REPLACE FUNCTION public.get_tenant_by_domain(p_domain TEXT)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  slug            TEXT,
  logo_url        TEXT,
  logo_dark_url   TEXT,
  favicon_url     TEXT,
  primary_color   TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.logo_url,
    t.logo_dark_url,
    t.favicon_url,
    t.primary_color
  FROM public.tenants t
  WHERE LOWER(t.custom_domain) = LOWER(p_domain)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_by_domain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_by_domain(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_tenant_by_domain(TEXT) IS
  'Resolve tenant pelo hostname (custom_domain) — retorna só campos de branding públicos. Usada no boot do app antes do login.';
