
-- F3.9: Update handle_new_user to support invited users (same tenant)
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
BEGIN
  -- Check if user was invited to an existing tenant
  _invited_tenant_id := (NEW.raw_user_meta_data->>'invited_tenant_id')::UUID;
  
  IF _invited_tenant_id IS NOT NULL THEN
    -- Invited user: join existing tenant as member
    _tenant_id := _invited_tenant_id;
    _role := 'member';
  ELSE
    -- Self-registered user: create new tenant, become admin
    INSERT INTO public.tenants (name, slug)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Minha Empresa'),
      NEW.id::text
    )
    RETURNING id INTO _tenant_id;
    _role := 'admin';
  END IF;

  -- Create profile
  INSERT INTO public.profiles (user_id, tenant_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    _tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Assign role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

-- F3.10: Create employee record for existing admin user (Bruno)
-- First check if employee already exists to be idempotent
INSERT INTO public.employees (tenant_id, user_id, status)
SELECT p.tenant_id, p.user_id, 'active'::employee_status
FROM public.profiles p
LEFT JOIN public.employees e ON e.user_id = p.user_id
WHERE e.id IS NULL;
