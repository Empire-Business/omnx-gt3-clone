-- Migration: Multiple positions, CEO flag, and separation of Admin role
-- Created: 2026-02-20

-- 1. Add is_ceo flag to employees table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_ceo BOOLEAN DEFAULT FALSE;

-- 2. Create employee_positions table for multiple positions per employee
CREATE TABLE IF NOT EXISTS public.employee_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES public.positions(id),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, position_id)
);

-- 3. Add index for employee_positions
CREATE INDEX IF NOT EXISTS idx_employee_positions_employee ON public.employee_positions(employee_id);

-- 4. Drop and recreate view for CEO detection
DROP VIEW IF EXISTS public.organograma_view;

CREATE VIEW public.organograma_view AS
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
    e.is_ceo,
    ep.position_id as primary_position_id,
    (
        SELECT COUNT(*) FROM tasks t
        WHERE t.assignee_id = e.id AND t.status NOT IN ('done')
    ) as pending_tasks,
    (
        SELECT COUNT(*) FROM employee_projects ep2
        JOIN projects pr ON pr.id = ep2.project_id
        WHERE ep2.employee_id = e.id AND pr.status = 'active'
    ) as active_projects
FROM employees e
LEFT JOIN profiles p ON p.user_id = e.user_id
LEFT JOIN positions pos ON pos.id = e.position_id
LEFT JOIN subareas sa ON sa.id = pos.subarea_id
LEFT JOIN company_areas ca ON ca.id = sa.area_id
LEFT JOIN LATERAL (
    SELECT position_id FROM employee_positions
    WHERE employee_id = e.id AND is_primary = TRUE
    LIMIT 1
) ep ON true
WHERE e.status = 'active';

-- 5. Enable RLS on employee_positions
ALTER TABLE public.employee_positions ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies for employee_positions
CREATE POLICY "Users can view positions in their tenant"
    ON public.employee_positions FOR SELECT
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN profiles p ON p.user_id = auth.uid()
            WHERE e.tenant_id = p.tenant_id
        )
    );

CREATE POLICY "Admins can manage positions in their tenant"
    ON public.employee_positions FOR ALL
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN profiles p ON p.user_id = auth.uid()
            JOIN user_roles ur ON ur.user_id = auth.uid()
            WHERE e.tenant_id = p.tenant_id AND ur.role = 'admin'
        )
    );

-- 7. Update existing employees where manager_id is null to is_ceo = true (only if no other criteria)
-- This is a one-time migration - we'll set CEO based on having no manager
-- Run manually if needed: UPDATE employees SET is_ceo = TRUE WHERE manager_id IS NULL AND is_ceo = FALSE;

COMMENT ON COLUMN public.employees.is_ceo IS 'Flag indicating this employee is the CEO of the organization';
COMMENT ON TABLE public.employee_positions IS 'Allows employees to hold multiple positions';
