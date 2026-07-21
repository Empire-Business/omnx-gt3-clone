-- UNIQUE constraints necessários pra o trigger handle_new_user funcionar.
-- Sem eles, ON CONFLICT (user_id, role) e ON CONFLICT (user_id) falham com
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Idempotente: usa DO blocks + IF NOT EXISTS no pg_constraint.

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
