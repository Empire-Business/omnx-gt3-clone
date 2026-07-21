-- Migration: Add is_ceo column to employees (fallback)
-- This ensures the is_ceo column exists

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_ceo BOOLEAN DEFAULT FALSE;

-- Create employee_positions table if not exists
CREATE TABLE IF NOT EXISTS public.employee_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES public.positions(id),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, position_id)
);

-- Enable RLS
ALTER TABLE public.employee_positions ENABLE ROW LEVEL SECURITY;

-- RLS Policy for viewing
DROP POLICY IF EXISTS "Users can view positions in their tenant" ON public.employee_positions;
CREATE POLICY "Users can view positions in their tenant"
    ON public.employee_positions FOR SELECT
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN profiles p ON p.user_id = auth.uid()
            WHERE e.tenant_id = p.tenant_id
        )
    );

-- RLS Policy for admin management
DROP POLICY IF EXISTS "Admins can manage positions in their tenant" ON public.employee_positions;
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
