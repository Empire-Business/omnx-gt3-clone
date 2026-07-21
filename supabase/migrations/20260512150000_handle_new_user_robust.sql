-- ─── UNIQUE constraints obrigatórios pelo trigger ─────────────────
-- Sem eles, ON CONFLICT no handle_new_user falha com "no unique constraint matching".
-- IF NOT EXISTS pra ser idempotente em bancos antigos que já têm.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_role_key'
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_user_id_key'
  ) THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Versão robusta do trigger handle_new_user:
-- 1. Detecta se é primeiro user (sem invited_tenant_id) e cria tenant + admin role
-- 2. Cria também employee record (faltava nas versões anteriores — fazia user
--    cadastrado fora do dashboard ficar sem visibilidade no organograma)
-- 3. Lida com slug duplicado (caso o user.id colida — improvável mas seguro)
-- 4. Idempotente: ON CONFLICT DO NOTHING em todos os inserts

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant_id UUID;
  _invited_tenant_id UUID;
  _role app_role;
  _slug TEXT;
BEGIN
  _invited_tenant_id := (NEW.raw_user_meta_data->>'invited_tenant_id')::UUID;

  IF _invited_tenant_id IS NOT NULL THEN
    -- Usuário convidado: entra no tenant existente como member
    _tenant_id := _invited_tenant_id;
    _role := 'member';
  ELSE
    -- Usuário se cadastrou sozinho → cria tenant novo, vira admin
    -- Slug derivado de NEW.id (UUID) garante unicidade
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

    -- Se o tenant não foi criado (slug colidiu), busca o existente
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

  -- Employee (faltava — sem isso o user some do organograma/Kanban)
  INSERT INTO public.employees (user_id, tenant_id, status)
  VALUES (NEW.id, _tenant_id, 'active')
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

  RETURN NEW;
END;
$$;

-- Garante que o trigger esteja registrado em auth.users (idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Trigger handler para auth.users. Primeiro user de um tenant vira admin; convidados (invited_tenant_id) viram member. Cria profile + role + employee.';
