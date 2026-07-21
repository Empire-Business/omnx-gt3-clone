-- Reverte role do Gildasio Brito para member
-- Ele deve ser member e ver apenas suas tarefas e projetos diretos
-- (a visibilidade correta é garantida pela migration 20260414000005)

UPDATE public.user_roles
SET role = 'member'
WHERE user_id = '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';

DO $$
DECLARE r RECORD;
BEGIN
  SELECT role INTO r FROM public.user_roles WHERE user_id = '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';
  RAISE NOTICE 'Gildasio Brito: role = %', r.role;
END $$;
