
-- Add separate dark mode color columns to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS primary_color_dark text DEFAULT NULL;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS secondary_color_dark text DEFAULT NULL;
