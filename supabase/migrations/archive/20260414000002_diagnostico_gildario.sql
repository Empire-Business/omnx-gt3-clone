-- Diagnóstico: estado dos dados de todos os usuários (para identificar gildásio)
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== DIAGNÓSTICO DE USUÁRIOS ===';
  RAISE NOTICE 'nome | user_id | profile_tenant | employee_tenant | role | status_employee | tem_profile | tem_role';

  FOR r IN
    SELECT
      COALESCE(p.full_name, '[sem perfil]') AS nome,
      COALESCE(e.user_id::text, p.user_id::text, '[?]') AS user_id,
      COALESCE(p.tenant_id::text, '[NULL]') AS profile_tenant,
      COALESCE(e.tenant_id::text, '[sem employee]') AS employee_tenant,
      COALESCE(ur.role::text, '[sem role]') AS role,
      COALESCE(e.status::text, '[sem employee]') AS employee_status,
      (p.user_id IS NOT NULL) AS tem_profile,
      (ur.user_id IS NOT NULL) AS tem_role
    FROM (
      SELECT DISTINCT user_id FROM public.employees
      UNION
      SELECT DISTINCT user_id FROM public.profiles
    ) u
    LEFT JOIN public.profiles  p  ON p.user_id  = u.user_id
    LEFT JOIN public.employees e  ON e.user_id  = u.user_id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
    ORDER BY COALESCE(p.full_name, '')
  LOOP
    RAISE NOTICE '% | % | % | % | % | % | % | %',
      r.nome, r.user_id, r.profile_tenant, r.employee_tenant,
      r.role, r.employee_status, r.tem_profile, r.tem_role;
  END LOOP;

  RAISE NOTICE '=== FIM DO DIAGNÓSTICO ===';
END $$;
