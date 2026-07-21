
-- Add lifecycle columns to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS termination_date date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status_reason text;

-- Create employee_status_history table for audit trail
CREATE TABLE public.employee_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  old_status public.employee_status,
  new_status public.employee_status NOT NULL,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_status_history ENABLE ROW LEVEL SECURITY;

-- RLS: select for tenant members
CREATE POLICY "status_history_select"
ON public.employee_status_history
FOR SELECT
USING (tenant_id = get_user_tenant_id());

-- RLS: insert for admins only
CREATE POLICY "status_history_insert_admin"
ON public.employee_status_history
FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin());

-- RLS: delete for admins only
CREATE POLICY "status_history_delete_admin"
ON public.employee_status_history
FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_admin());

-- Index for fast lookups
CREATE INDEX idx_employee_status_history_employee ON public.employee_status_history(employee_id);
CREATE INDEX idx_employee_status_history_tenant ON public.employee_status_history(tenant_id);
