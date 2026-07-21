-- Recriar registros employees para todos os usuários existentes
INSERT INTO public.employees (tenant_id, user_id, status, is_ceo)
SELECT p.tenant_id, p.user_id, 'active'::employee_status,
  CASE WHEN ur.role = 'admin' THEN true ELSE false END
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.user_id
ON CONFLICT DO NOTHING;