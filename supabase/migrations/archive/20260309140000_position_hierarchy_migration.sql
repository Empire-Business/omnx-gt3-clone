-- Migration: Position-to-Position Hierarchy
-- Changes org chart from person-to-person (manager_id) to position-to-position (reports_to_id)
-- Created: 2026-03-09

-- ============================================================================
-- 1. Add reports_to_id column to positions table
-- ============================================================================

ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS reports_to_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.positions.reports_to_id IS 'The position this role reports to (position-based hierarchy)';

-- ============================================================================
-- 2. Add constraint to prevent self-reference
-- ============================================================================

ALTER TABLE public.positions
ADD CONSTRAINT positions_no_self_reference
CHECK (reports_to_id IS NULL OR reports_to_id != id);

-- ============================================================================
-- 3. Unique partial index: only one CEO position per tenant (reports_to_id IS NULL)
--    Note: This allows multiple positions with reports_to_id = NULL only if explicitly
--    needed (e.g., co-CEOs). Comment out if strict single-CEO is required.
-- ============================================================================

-- Uncomment below for strict single CEO per tenant:
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_one_ceo_per_tenant
-- ON public.positions(tenant_id)
-- WHERE reports_to_id IS NULL AND level = 0;

-- ============================================================================
-- 4. Function to detect cycles in position hierarchy
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_position_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    visited_ids UUID[];
    current_id UUID;
BEGIN
    -- If reports_to_id is NULL, no cycle possible
    IF NEW.reports_to_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Self-reference is already handled by constraint, but double-check
    IF NEW.reports_to_id = NEW.id THEN
        RAISE EXCEPTION 'Um cargo não pode reportar para si mesmo';
    END IF;

    -- Traverse up the hierarchy to detect cycles
    visited_ids := ARRAY[NEW.id];
    current_id := NEW.reports_to_id;

    WHILE current_id IS NOT NULL LOOP
        -- Check if we've seen this position before (cycle detected)
        IF current_id = ANY(visited_ids) THEN
            RAISE EXCEPTION 'Ciclo detectado na hierarquia de cargos';
        END IF;

        visited_ids := array_append(visited_ids, current_id);

        -- Get the parent of current position
        SELECT reports_to_id INTO current_id
        FROM public.positions
        WHERE id = current_id;
    END LOOP;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. Trigger for cycle detection
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_check_position_cycle ON public.positions;
CREATE TRIGGER trigger_check_position_cycle
    BEFORE INSERT OR UPDATE OF reports_to_id ON public.positions
    FOR EACH ROW
    EXECUTE FUNCTION public.check_position_cycle();

-- ============================================================================
-- 6. Function to migrate existing manager_id data to reports_to_id
--    This converts person-to-person hierarchy to position-to-position
-- ============================================================================

CREATE OR REPLACE FUNCTION public.migrate_manager_to_position_hierarchy()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    emp RECORD;
    manager_position_id UUID;
    employee_primary_position_id UUID;
BEGIN
    -- For each employee with a manager
    FOR emp IN
        SELECT e.id as employee_id, e.manager_id, e.tenant_id
        FROM public.employees e
        WHERE e.manager_id IS NOT NULL
    LOOP
        -- Get the manager's primary position
        SELECT ep.position_id INTO manager_position_id
        FROM public.employee_positions ep
        WHERE ep.employee_id = emp.manager_id
          AND ep.is_primary = TRUE
        LIMIT 1;

        -- If manager has no primary position, try old position_id column
        IF manager_position_id IS NULL THEN
            SELECT position_id INTO manager_position_id
            FROM public.employees
            WHERE id = emp.manager_id
            LIMIT 1;
        END IF;

        -- Get the employee's primary position
        SELECT ep.position_id INTO employee_primary_position_id
        FROM public.employee_positions ep
        WHERE ep.employee_id = emp.employee_id
          AND ep.is_primary = TRUE
        LIMIT 1;

        -- If employee has no primary position, try old position_id column
        IF employee_primary_position_id IS NULL THEN
            SELECT position_id INTO employee_primary_position_id
            FROM public.employees
            WHERE id = emp.employee_id
            LIMIT 1;
        END IF;

        -- If both positions exist, set up the hierarchy
        IF manager_position_id IS NOT NULL AND employee_primary_position_id IS NOT NULL THEN
            UPDATE public.positions
            SET reports_to_id = manager_position_id
            WHERE id = employee_primary_position_id
              AND reports_to_id IS NULL; -- Don't overwrite existing hierarchy
        END IF;
    END LOOP;
END;
$$;

-- Execute the migration (comment out if you want to run manually)
-- SELECT public.migrate_manager_to_position_hierarchy();

-- ============================================================================
-- 7. Drop and recreate organograma_view with position hierarchy info
-- ============================================================================

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
    e.manager_id, -- Keep for backwards compatibility during transition
    e.status,
    e.is_ceo,
    ep.position_id as primary_position_id,
    -- Manager info from position hierarchy
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
-- Manager employee (person in the parent position)
LEFT JOIN employee_positions manager_ep ON manager_ep.position_id = pos.reports_to_id AND manager_ep.is_primary = TRUE
LEFT JOIN employees manager_emp ON manager_emp.id = manager_ep.employee_id
LEFT JOIN profiles manager_profile ON manager_profile.user_id = manager_emp.user_id
WHERE e.status = 'active';

-- ============================================================================
-- 8. Create position_hierarchy_view for all positions (including vacant)
-- ============================================================================

CREATE OR REPLACE VIEW public.position_hierarchy_view
WITH (security_invoker = true)
AS
SELECT
    pos.id as position_id,
    pos.tenant_id,
    pos.title as position_title,
    pos.description,
    pos.level,
    pos.reports_to_id,
    parent_pos.title as reports_to_title,
    pos.subarea_id,
    sa.name as subarea_name,
    sa.color as subarea_color,
    pos.area_id,
    ca.name as area_name,
    ca.type as area_type,
    ca.color as area_color,
    pos.sort_order,
    -- Primary employee in this position
    emp.id as employee_id,
    p.full_name as employee_name,
    p.avatar_url as employee_avatar_url,
    e.is_ceo as is_employee_ceo,
    e.status as employee_status,
    -- Count of employees in this position
    (
        SELECT COUNT(*) FROM employee_positions ep2
        WHERE ep2.position_id = pos.id
    ) as employee_count
FROM positions pos
LEFT JOIN subareas sa ON sa.id = pos.subarea_id
LEFT JOIN company_areas ca ON ca.id = COALESCE(pos.area_id, sa.area_id)
-- Parent position
LEFT JOIN positions parent_pos ON parent_pos.id = pos.reports_to_id
-- Primary employee (the main person in this position)
LEFT JOIN LATERAL (
    SELECT employee_id FROM employee_positions
    WHERE position_id = pos.id AND is_primary = TRUE
    LIMIT 1
) primary_ep ON true
LEFT JOIN employees emp ON emp.id = primary_ep.employee_id
LEFT JOIN profiles p ON p.user_id = emp.user_id
LEFT JOIN employees e ON e.id = emp.id;

-- ============================================================================
-- 9. Add index for reports_to_id queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_positions_reports_to ON public.positions(reports_to_id);

-- ============================================================================
-- 10. Grant permissions on new view
-- ============================================================================

GRANT SELECT ON public.position_hierarchy_view TO authenticated;
GRANT SELECT ON public.position_hierarchy_view TO anon;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON VIEW public.position_hierarchy_view IS 'Shows all positions with their hierarchy and optional employee info. Includes vacant positions (no employee assigned).';
COMMENT ON FUNCTION public.check_position_cycle() IS 'Trigger function to prevent cycles in position hierarchy';
COMMENT ON FUNCTION public.migrate_manager_to_position_hierarchy() IS 'One-time migration function to convert manager_id hierarchy to reports_to_id hierarchy';
