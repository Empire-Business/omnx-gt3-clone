
-- Revert migration 20260226174405: remove all anon_select_* policies that were added by mistake

DROP POLICY IF EXISTS "anon_select_company_areas" ON public.company_areas;
DROP POLICY IF EXISTS "anon_select_employee_positions" ON public.employee_positions;
DROP POLICY IF EXISTS "anon_select_employee_projects" ON public.employee_projects;
DROP POLICY IF EXISTS "anon_select_employees" ON public.employees;
DROP POLICY IF EXISTS "anon_select_positions" ON public.positions;
DROP POLICY IF EXISTS "anon_select_process_areas" ON public.process_areas;
DROP POLICY IF EXISTS "anon_select_process_positions" ON public.process_positions;
DROP POLICY IF EXISTS "anon_select_process_steps" ON public.process_steps;
DROP POLICY IF EXISTS "anon_select_processes" ON public.processes;
DROP POLICY IF EXISTS "anon_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "anon_select_projects" ON public.projects;
DROP POLICY IF EXISTS "anon_select_subareas" ON public.subareas;
DROP POLICY IF EXISTS "anon_select_tasks" ON public.tasks;
DROP POLICY IF EXISTS "anon_select_tenants" ON public.tenants;
DROP POLICY IF EXISTS "anon_select_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "anon_select_webhook_logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "anon_select_webhooks" ON public.webhooks;
