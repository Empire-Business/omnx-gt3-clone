
-- Fix 1: organograma_view - change from SECURITY DEFINER to SECURITY INVOKER (default)
-- Drop and recreate as regular view (INVOKER is default, which respects caller's RLS)
DROP VIEW IF EXISTS public.organograma_view;

CREATE VIEW public.organograma_view
WITH (security_invoker = true)
AS
SELECT
  e.id as employee_id,
  e.tenant_id,
  e.user_id,
  p.full_name,
  p.avatar_url,
  pos.title as position_title,
  pos.level,
  sa.name as subarea_name,
  sa.color as subarea_color,
  ca.name as area_name,
  ca.type as area_type,
  ca.color as area_color,
  e.manager_id,
  e.status,
  (
    SELECT COUNT(*) FROM tasks t
    WHERE t.assignee_id = e.id AND t.status NOT IN ('done')
  ) as pending_tasks,
  (
    SELECT COUNT(*) FROM employee_projects ep
    JOIN projects pr ON pr.id = ep.project_id
    WHERE ep.employee_id = e.id AND pr.status = 'active'
  ) as active_projects
FROM employees e
LEFT JOIN profiles p ON p.user_id = e.user_id
LEFT JOIN positions pos ON pos.id = e.position_id
LEFT JOIN subareas sa ON sa.id = pos.subarea_id
LEFT JOIN company_areas ca ON ca.id = sa.area_id
WHERE e.status = 'active';

-- Fix 2 & 3: Set search_path on functions missing it
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_employee_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'Um funcionário não pode ser seu próprio gestor';
  END IF;
  RETURN NEW;
END;
$$;
