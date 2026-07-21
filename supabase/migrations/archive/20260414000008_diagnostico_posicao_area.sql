-- Diagnóstico: posição/área do gildásio vs projetos disponíveis
DO $$
DECLARE
  r RECORD;
  gildasio_user_id    UUID := '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';
  gildasio_emp_id     UUID := 'f47ab44f-6eef-4a96-a4a9-1c099b5b990d';
  gildasio_tenant_id  UUID := '42e95844-c632-4d8a-8e44-9c645ac813bf';
BEGIN

  -- 1. Posição completa de gildásio (position → subarea → area)
  RAISE NOTICE '=== POSIÇÃO DE GILDÁSIO ===';
  FOR r IN
    SELECT
      pos.id             AS position_id,
      pos.title,
      pos.subarea_id,
      pos.area_id,
      sa.name            AS subarea_name,
      ca.name            AS area_name
    FROM public.employee_positions ep
    JOIN public.positions  pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas      sa  ON sa.id  = pos.subarea_id
    LEFT JOIN public.company_areas ca  ON ca.id  = pos.area_id
    WHERE ep.employee_id = gildasio_emp_id
  LOOP
    RAISE NOTICE 'position_id=% | título=% | subarea_id=% | subarea=% | area_id=% | area=%',
      r.position_id, r.title, r.subarea_id, r.subarea_name, r.area_id, r.area_name;
  END LOOP;

  -- 2. Para cada projeto: quais employees estão em employee_projects,
  --    e quais posições/subareas/areas eles têm
  RAISE NOTICE '';
  RAISE NOTICE '=== MEMBROS DOS PROJETOS (employee_projects) ===';
  FOR r IN
    SELECT
      p.name   AS project_name,
      e.id     AS employee_id,
      pf.full_name,
      pos.id   AS position_id,
      pos.title,
      pos.subarea_id,
      pos.area_id,
      sa.name  AS subarea_name,
      ca.name  AS area_name
    FROM public.projects p
    JOIN public.employee_projects ep ON ep.project_id = p.id
    JOIN public.employees         e  ON e.id = ep.employee_id
    LEFT JOIN public.profiles pf ON pf.user_id = e.user_id
    LEFT JOIN public.employee_positions emppos ON emppos.employee_id = e.id
    LEFT JOIN public.positions  pos ON pos.id = emppos.position_id
    LEFT JOIN public.subareas   sa  ON sa.id  = pos.subarea_id
    LEFT JOIN public.company_areas ca ON ca.id = pos.area_id
    WHERE p.tenant_id = gildasio_tenant_id
    ORDER BY p.name
  LOOP
    RAISE NOTICE 'projeto=% | membro=% | position=% | subarea_id=% | subarea=% | area_id=% | area=%',
      r.project_name, r.full_name, r.title,
      r.subarea_id, r.subarea_name, r.area_id, r.area_name;
  END LOOP;

  -- 3. Quantos projetos têm pelo menos 1 membro em employee_projects?
  RAISE NOTICE '';
  RAISE NOTICE '=== PROJETOS COM MEMBROS ===';
  FOR r IN
    SELECT p.name, COUNT(ep.employee_id) AS qtd_membros
    FROM public.projects p
    LEFT JOIN public.employee_projects ep ON ep.project_id = p.id
    WHERE p.tenant_id = gildasio_tenant_id
    GROUP BY p.id, p.name
    HAVING COUNT(ep.employee_id) > 0
    ORDER BY p.name
  LOOP
    RAISE NOTICE 'projeto=% | membros=%', r.name, r.qtd_membros;
  END LOOP;

END $$;
