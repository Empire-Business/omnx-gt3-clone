-- Fix: organograma_view was producing duplicate rows per employee when
-- multiple employees shared the same reports_to_id position as their
-- primary position. The manager_ep JOIN lacked LIMIT 1, causing N rows
-- per employee (one per person occupying the parent position).
-- Solution: use LATERAL + LIMIT 1, consistent with how primary position is resolved.

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
    pos.reports_to_id as position_reports_to_id,
    parent_pos.title as manager_position_title,
    sa.id as subarea_id,
    sa.name as subarea_name,
    sa.color as subarea_color,
    ca.id as area_id,
    ca.name as area_name,
    ca.type as area_type,
    ca.color as area_color,
    e.manager_id,
    e.status,
    e.is_ceo,
    ep.position_id as primary_position_id,
    -- Manager info from position hierarchy (LATERAL ensures at most one row)
    manager_emp.id as manager_employee_id,
    manager_profile.full_name as manager_name,
    -- Task counts
    (
        SELECT COUNT(*) FROM tasks t
        WHERE t.assignee_id = e.id AND t.status NOT IN ('done')
    ) as pending_tasks,
    (
        SELECT COUNT(*) FROM employee_projects ep2
        JOIN projects pr ON pr.id = ep2.project_id
        WHERE ep2.employee_id = e.id AND pr.status = 'active'
    ) as active_projects,
    (
        SELECT COUNT(*) FROM tasks t
        WHERE t.assignee_id = e.id AND t.status = 'done'
          AND t.updated_at >= date_trunc('week', CURRENT_DATE)
    ) as tasks_completed_this_week
FROM employees e
LEFT JOIN profiles p ON p.user_id = e.user_id
-- Primary position via employee_positions
LEFT JOIN LATERAL (
    SELECT position_id FROM employee_positions
    WHERE employee_id = e.id AND is_primary = TRUE
    LIMIT 1
) ep ON true
LEFT JOIN positions pos ON pos.id = ep.position_id
LEFT JOIN subareas sa ON sa.id = pos.subarea_id
LEFT JOIN company_areas ca ON ca.id = COALESCE(pos.area_id, sa.area_id)
-- Parent position (who this position reports to)
LEFT JOIN positions parent_pos ON parent_pos.id = pos.reports_to_id
-- Manager employee: use LATERAL + LIMIT 1 to prevent row multiplication
-- when multiple employees share the same parent position as primary
LEFT JOIN LATERAL (
    SELECT employee_id FROM employee_positions
    WHERE position_id = pos.reports_to_id AND is_primary = TRUE
    LIMIT 1
) manager_ep ON pos.reports_to_id IS NOT NULL
LEFT JOIN employees manager_emp ON manager_emp.id = manager_ep.employee_id
LEFT JOIN profiles manager_profile ON manager_profile.user_id = manager_emp.user_id
WHERE e.status = 'active';
