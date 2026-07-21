-- Diagnóstico: por que gildásio não vê projetos
DO $$
DECLARE
  r RECORD;
  gildasio_user_id UUID := '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';
  gildasio_employee_id UUID;
  gildasio_tenant_id UUID;
BEGIN
  -- 1. Dados básicos do gildásio
  SELECT e.id, e.tenant_id INTO gildasio_employee_id, gildasio_tenant_id
  FROM public.employees e WHERE e.user_id = gildasio_user_id LIMIT 1;

  RAISE NOTICE '=== GILDÁSIO ===';
  RAISE NOTICE 'user_id: %', gildasio_user_id;
  RAISE NOTICE 'employee_id: %', gildasio_employee_id;
  RAISE NOTICE 'tenant_id: %', gildasio_tenant_id;

  -- 2. Role atual
  FOR r IN SELECT role FROM public.user_roles WHERE user_id = gildasio_user_id LOOP
    RAISE NOTICE 'role: %', r.role;
  END LOOP;

  -- 3. Projetos do tenant
  RAISE NOTICE '';
  RAISE NOTICE '=== PROJETOS DO TENANT ===';
  FOR r IN
    SELECT id, name, created_by, tenant_id
    FROM public.projects
    WHERE tenant_id = gildasio_tenant_id
  LOOP
    RAISE NOTICE 'projeto: % | nome: % | created_by: % | criado_por_gildasio: %',
      r.id, r.name, r.created_by, (r.created_by = gildasio_user_id);
  END LOOP;

  -- 4. employee_projects do gildásio
  RAISE NOTICE '';
  RAISE NOTICE '=== EMPLOYEE_PROJECTS DE GILDÁSIO ===';
  FOR r IN
    SELECT ep.project_id, ep.role_in_project, p.name AS project_name
    FROM public.employee_projects ep
    JOIN public.projects p ON p.id = ep.project_id
    WHERE ep.employee_id = gildasio_employee_id
  LOOP
    RAISE NOTICE 'project_id: % | projeto: % | role: %',
      r.project_id, r.project_name, r.role_in_project;
  END LOOP;
  IF NOT FOUND THEN
    RAISE NOTICE '[nenhuma entrada em employee_projects para gildásio]';
  END IF;

  -- 5. Posições do gildásio
  RAISE NOTICE '';
  RAISE NOTICE '=== POSIÇÕES DE GILDÁSIO ===';
  FOR r IN
    SELECT ep.position_id, pos.title
    FROM public.employee_positions ep
    JOIN public.positions pos ON pos.id = ep.position_id
    WHERE ep.employee_id = gildasio_employee_id
  LOOP
    RAISE NOTICE 'position_id: % | título: %', r.position_id, r.title;
  END LOOP;
  IF NOT FOUND THEN
    RAISE NOTICE '[nenhuma posição atribuída a gildásio]';
  END IF;

  -- 6. Simula user_can_read_project para cada projeto
  RAISE NOTICE '';
  RAISE NOTICE '=== SIMULAÇÃO user_can_read_project ===';
  FOR r IN
    SELECT id, name, created_by FROM public.projects WHERE tenant_id = gildasio_tenant_id
  LOOP
    RAISE NOTICE 'projeto "%": created_by_match=%, em_employee_projects=%',
      r.name,
      (r.created_by = gildasio_user_id),
      EXISTS (
        SELECT 1 FROM public.employee_projects ep2
        JOIN public.employees e2 ON e2.id = ep2.employee_id
        WHERE ep2.project_id = r.id
          AND e2.user_id = gildasio_user_id
          AND ep2.tenant_id = gildasio_tenant_id
      );
  END LOOP;

END $$;
