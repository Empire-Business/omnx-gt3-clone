-- ─── BRECHA 2 (Crítica) — Auto-cadastro em qualquer tenant via invited_tenant_id ─
--
-- handle_new_user() lia `invited_tenant_id` de raw_user_meta_data — dado 100%
-- controlado por quem se cadastra — e usava como tenant do novo usuário SEM
-- validar que existe um convite real. Um visitante podia chamar
-- supabase.auth.signUp({ options: { data: { invited_tenant_id: '<uuid-vitima>' }}})
-- direto do console (F12) e nascer como membro de qualquer empresa cliente.
--
-- No fluxo legítimo, invited_tenant_id só é setado server-side, com service_role,
-- por create-employee e create-tenant (Edge Functions). Essas funções passam a
-- registrar um CONVITE em tenant_invitations (tenant + email + token) antes de
-- criar o usuário, e handle_new_user só honra invited_tenant_id se houver um
-- convite correspondente válido. Caso contrário, ignora o campo e cai no fluxo
-- de auto-cadastro orgânico (cria tenant próprio, vira admin) — o atacante fica
-- isolado no próprio workspace vazio, sem acesso a dados de terceiros.

-- ── Tabela de convites ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email       text NOT NULL,
  token       text NOT NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at     timestamptz,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_lookup
  ON public.tenant_invitations (tenant_id, lower(email), token)
  WHERE used_at IS NULL;

-- RLS ligada e SEM policies para clientes: apenas service_role (Edge Functions)
-- e funções SECURITY DEFINER (handle_new_user) acessam a tabela. Convites nunca
-- são lidos/gravados pelo navegador.
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

-- ── handle_new_user: valida o convite antes de honrar invited_tenant_id ──────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant_id UUID;
  _invited_tenant_id UUID;
  _invite_token TEXT;
  _role app_role;
  _slug TEXT;
BEGIN
  _invited_tenant_id := (NEW.raw_user_meta_data->>'invited_tenant_id')::UUID;
  _invite_token      := NEW.raw_user_meta_data->>'invite_token';

  -- Só honra o convite se houver linha correspondente em tenant_invitations:
  -- mesmo tenant, mesmo email, mesmo token, não expirada e não usada.
  -- Consome o convite (used_at) para não permitir reaproveitamento.
  IF _invited_tenant_id IS NOT NULL AND _invite_token IS NOT NULL THEN
    UPDATE public.tenant_invitations
       SET used_at = now()
     WHERE tenant_id = _invited_tenant_id
       AND lower(email) = lower(NEW.email)
       AND token = _invite_token
       AND used_at IS NULL
       AND expires_at > now();
    IF FOUND THEN
      _tenant_id := _invited_tenant_id;
      _role := 'member';
    END IF;
  END IF;

  -- Sem convite válido → auto-cadastro orgânico: cria tenant próprio, vira admin.
  -- (Ignora qualquer invited_tenant_id forjado — o usuário fica no próprio
  --  workspace, sem acesso a dados de outra empresa.)
  IF _tenant_id IS NULL THEN
    _slug := NEW.id::text;

    INSERT INTO public.tenants (name, slug)
    VALUES (
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1),
        'Meu Workspace'
      ),
      _slug
    )
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO _tenant_id;

    IF _tenant_id IS NULL THEN
      SELECT id INTO _tenant_id FROM public.tenants WHERE slug = _slug;
    END IF;

    _role := 'admin';
  END IF;

  -- Profile
  INSERT INTO public.profiles (user_id, tenant_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    _tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), ''),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

  -- Role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Employee
  INSERT INTO public.employees (user_id, tenant_id, status)
  VALUES (NEW.id, _tenant_id, 'active')
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Trigger handler para auth.users. invited_tenant_id só é honrado com convite válido em tenant_invitations (tenant+email+token, não expirado/usado). Sem convite → cria tenant próprio como admin. Ver BRECHA 2 — docs/SEGURANCA.md.';
