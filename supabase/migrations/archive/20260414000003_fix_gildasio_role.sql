-- Fix: corrige a role do Gildasio Brito de 'member' para 'admin'
-- Causa: na criação do usuário via create-employee, o UPDATE de role falhou
-- silenciosamente ou o usuário foi recriado sem a role correta.

UPDATE public.user_roles
SET role = 'admin'
WHERE user_id = '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';

-- Confirmação
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT role INTO r FROM public.user_roles WHERE user_id = '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';
  IF r.role = 'admin' THEN
    RAISE NOTICE 'OK: Gildasio Brito agora tem role = admin';
  ELSE
    RAISE NOTICE 'ERRO: role atual = %, esperado admin', r.role;
  END IF;
END $$;
