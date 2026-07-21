
-- 1. Migrate existing employees.position_id data into employee_positions
INSERT INTO public.employee_positions (employee_id, position_id, is_primary)
SELECT id, position_id, true
FROM public.employees
WHERE position_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Recreate organograma_view to use employee_positions instead of employees.position_id
DROP VIEW IF EXISTS public.organograma_view;

CREATE VIEW public.organograma_view AS
SELECT 
    e.id AS employee_id,
    e.tenant_id,
    e.user_id,
    p.full_name,
    p.avatar_url,
    pos.title AS position_title,
    pos.level,
    sa.name AS subarea_name,
    sa.color AS subarea_color,
    ca.name AS area_name,
    ca.type AS area_type,
    ca.color AS area_color,
    e.manager_id,
    e.status,
    e.is_ceo,
    ep.position_id AS primary_position_id,
    (SELECT count(*) FROM tasks t WHERE t.assignee_id = e.id AND t.status <> 'done'::task_status) AS pending_tasks,
    (SELECT count(*) FROM employee_projects ep2 JOIN projects pr ON pr.id = ep2.project_id WHERE ep2.employee_id = e.id AND pr.status = 'active'::project_status) AS active_projects
FROM employees e
LEFT JOIN profiles p ON p.user_id = e.user_id
LEFT JOIN LATERAL (
    SELECT employee_positions.position_id
    FROM employee_positions
    WHERE employee_positions.employee_id = e.id AND employee_positions.is_primary = true
    LIMIT 1
) ep ON true
LEFT JOIN positions pos ON pos.id = ep.position_id
LEFT JOIN subareas sa ON sa.id = pos.subarea_id
LEFT JOIN company_areas ca ON ca.id = sa.area_id
WHERE e.status = 'active'::employee_status;

-- 3. Drop redundant columns
ALTER TABLE public.employees DROP COLUMN IF EXISTS position_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone;
