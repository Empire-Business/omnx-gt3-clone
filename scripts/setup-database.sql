-- =============================================================================
-- EMPIRE MANAGER — Schema de Banco de Dados (SEM seeds de demo)
-- =============================================================================
-- INSTRUÇÕES:
-- 1. Crie um novo projeto no Supabase (https://supabase.com)
-- 2. No Dashboard, vá em: SQL Editor → New query
-- 3. Cole TODO o conteúdo deste arquivo e clique RUN
-- 4. Aguarde a execução (~30-60 segundos)
-- =============================================================================
-- AVISOS:
-- • Extensões pg_cron e pg_net requerem plano Pro+ do Supabase.
--   No plano Free, funcionalidades de recorrência automática não funcionam.
-- • Este script contém APENAS o schema (tabelas, RLS, functions, triggers,
--   storage buckets/policies). NÃO inclui dados de demonstração.
-- • Se quiser dados de demo, execute também: scripts/setup-database-seeds.sql
--   (mas os seeds podem falhar se os usuários de demo não existirem em auth.users)
-- =============================================================================

-- === MIGRATION BASE: 20260221001453_7143074d-3831-468a-b561-137604c9b0dd.sql ===

-- =============================================
-- MÓDULO 1.0: MODELO DE DADOS COMPLETO
-- Empire Manager V2.0
-- =============================================

-- 1. ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'member');
CREATE TYPE public.employee_status AS ENUM ('active', 'inactive', 'on_leave');
CREATE TYPE public.project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE public.task_status AS ENUM ('backlog', 'todo', 'doing', 'review', 'done');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.process_status AS ENUM ('draft', 'active', 'archived');

-- 2. TABELAS

-- tenants
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7C3AED',
  secondary_color TEXT,
  favicon_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- profiles (SEM role)
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- user_roles (RBAC separado)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- company_areas
CREATE TABLE public.company_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('acquisition', 'delivery', 'operation')),
  position TEXT NOT NULL CHECK (position IN ('left', 'right', 'bottom')),
  color TEXT DEFAULT '#7c3bed',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, type)
);

-- subareas
CREATE TABLE public.subareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  area_id UUID NOT NULL REFERENCES public.company_areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- positions (cargos)
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  subarea_id UUID NOT NULL REFERENCES public.subareas(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  responsibilities TEXT[],
  goals TEXT[],
  level INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  user_id UUID REFERENCES auth.users(id),
  position_id UUID REFERENCES public.positions(id),
  manager_id UUID REFERENCES public.employees(id),
  status employee_status DEFAULT 'active',
  admission_date DATE,
  phone TEXT,
  work_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  status project_status DEFAULT 'planning',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  start_date DATE,
  end_date DATE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- employee_projects
CREATE TABLE public.employee_projects (
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  role_in_project TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (employee_id, project_id)
);

-- tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES public.employees(id),
  created_by UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  status task_status DEFAULT 'backlog',
  priority task_priority DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- processes
CREATE TABLE public.processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  position_id UUID REFERENCES public.positions(id),
  name TEXT NOT NULL,
  description TEXT,
  status process_status DEFAULT 'draft',
  bpmn_data JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- process_steps
CREATE TABLE public.process_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  estimated_time INTEGER,
  responsible_position_id UUID REFERENCES public.positions(id),
  checklist_items TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ENABLE RLS ON ALL TABLES
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_steps ENABLE ROW LEVEL SECURITY;

-- 4. SECURITY DEFINER FUNCTIONS

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- 5. RLS POLICIES

-- tenants: users can only see their own tenant
CREATE POLICY "tenant_select" ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.get_user_tenant_id());

CREATE POLICY "tenant_update_admin" ON public.tenants
  FOR UPDATE TO authenticated
  USING (id = public.get_user_tenant_id() AND public.is_admin());

-- profiles: users see own tenant, edit own profile
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- user_roles: users see own roles, admin manages
CREATE POLICY "roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "roles_admin_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "roles_admin_insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "roles_admin_delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- company_areas
CREATE POLICY "areas_select" ON public.company_areas
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "areas_insert_admin" ON public.company_areas
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "areas_update_admin" ON public.company_areas
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "areas_delete_admin" ON public.company_areas
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- subareas
CREATE POLICY "subareas_select" ON public.subareas
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "subareas_insert_admin" ON public.subareas
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "subareas_update_admin" ON public.subareas
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "subareas_delete_admin" ON public.subareas
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- positions
CREATE POLICY "positions_select" ON public.positions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "positions_insert_admin" ON public.positions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "positions_update_admin" ON public.positions
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "positions_delete_admin" ON public.positions
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- employees
CREATE POLICY "employees_select" ON public.employees
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "employees_insert_admin" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "employees_update_admin" ON public.employees
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "employees_delete_admin" ON public.employees
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- projects
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "projects_insert_admin" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.is_admin() OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "projects_update_admin" ON public.projects
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.is_admin() OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "projects_delete_admin" ON public.projects
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- employee_projects
CREATE POLICY "emp_projects_select" ON public.employee_projects
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "emp_projects_insert_admin" ON public.employee_projects
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.is_admin() OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "emp_projects_delete_admin" ON public.employee_projects
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.is_admin() OR public.has_role(auth.uid(), 'manager')));

-- tasks
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "tasks_delete_admin" ON public.tasks
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND (public.is_admin() OR public.has_role(auth.uid(), 'manager')));

-- processes
CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "processes_insert_admin" ON public.processes
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "processes_update_admin" ON public.processes
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "processes_delete_admin" ON public.processes
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- process_steps
CREATE POLICY "steps_select" ON public.process_steps
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "steps_insert_admin" ON public.process_steps
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "steps_update_admin" ON public.process_steps
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "steps_delete_admin" ON public.process_steps
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- 6. TRIGGERS

-- update_updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_processes_updated_at BEFORE UPDATE ON processes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_company_areas_updated_at BEFORE UPDATE ON company_areas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_subareas_updated_at BEFORE UPDATE ON subareas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_process_steps_updated_at BEFORE UPDATE ON process_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- check_employee_hierarchy (evitar self-management)
CREATE OR REPLACE FUNCTION public.check_employee_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'Um funcionário não pode ser seu próprio gestor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_self_management
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION check_employee_hierarchy();

-- handle_new_user: auto-create tenant + profile + admin role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Minha Empresa'),
    NEW.id::text
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (user_id, tenant_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    new_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. VIEW: organograma_view
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

-- 8. INDICES
CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_position ON employees(position_id);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_sort ON tasks(status, sort_order);
CREATE INDEX idx_subareas_area ON subareas(area_id);
CREATE INDEX idx_positions_subarea ON positions(subarea_id);
CREATE INDEX idx_company_areas_tenant ON company_areas(tenant_id);
CREATE INDEX idx_process_steps_process ON process_steps(process_id);

-- 9. STORAGE: avatars bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- === MIGRATION: 20260220120000_multiple_positions_ceo_flag.sql ===
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

-- === MIGRATION: 20260220180000_add_branding_attachments_buckets.sql ===
-- Migration: Add branding and attachments buckets
-- Created: 2026-02-20

-- 1. BRANDING BUCKET (logo da empresa)
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true);

-- Políticas para branding (qualquer usuário autenticado do tenant pode ver)
CREATE POLICY "Brand assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

-- Admin do tenant pode fazer upload/update/delete logos
CREATE POLICY "Admins can upload branding"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'branding'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.tenant_id = (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
    AND ur.role = 'admin'
  )
);

CREATE POLICY "Admins can update branding"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'branding'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.tenant_id = (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
    AND ur.role = 'admin'
  )
);

CREATE POLICY "Admins can delete branding"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'branding'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.tenant_id = (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
    AND ur.role = 'admin'
  )
);


-- 2. ATTACHMENTS BUCKET (anexos do kanban/tarefas)
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);

-- Políticas para attachments (qualquer usuário autenticado pode ver)
CREATE POLICY "Attachments are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'attachments');

-- Usuários autenticados podem fazer upload de anexos
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can update attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'attachments'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Authenticated users can delete attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'attachments'
  AND auth.uid() IS NOT NULL
);

-- === MIGRATION: 20260220200000_add_ceo_column.sql ===
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

-- === MIGRATION: 20260221001529_a1ac838d-f6e8-471e-ae79-a317fc45a31b.sql ===

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

-- === MIGRATION: 20260221004356_9ab0c817-1d57-4dd6-8521-56a74b8eaeca.sql ===

-- F3.9: Update handle_new_user to support invited users (same tenant)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant_id UUID;
  _invited_tenant_id UUID;
  _role app_role;
BEGIN
  -- Check if user was invited to an existing tenant
  _invited_tenant_id := (NEW.raw_user_meta_data->>'invited_tenant_id')::UUID;
  
  IF _invited_tenant_id IS NOT NULL THEN
    -- Invited user: join existing tenant as member
    _tenant_id := _invited_tenant_id;
    _role := 'member';
  ELSE
    -- Self-registered user: create new tenant, become admin
    INSERT INTO public.tenants (name, slug)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Minha Empresa'),
      NEW.id::text
    )
    RETURNING id INTO _tenant_id;
    _role := 'admin';
  END IF;

  -- Create profile
  INSERT INTO public.profiles (user_id, tenant_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    _tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Assign role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

-- F3.10: Create employee record for existing admin user (Bruno)
-- First check if employee already exists to be idempotent
INSERT INTO public.employees (tenant_id, user_id, status)
SELECT p.tenant_id, p.user_id, 'active'::employee_status
FROM public.profiles p
LEFT JOIN public.employees e ON e.user_id = p.user_id
WHERE e.id IS NULL;

-- === MIGRATION: 20260221013141_d04d2d91-e0c7-4b36-8392-f29097a41c4d.sql ===
-- Add checklist_items column to tasks table for G2.9
ALTER TABLE public.tasks
ADD COLUMN checklist_items jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tasks.checklist_items IS 'Array of {text: string, checked: boolean} items for task checklists';
-- === MIGRATION: 20260221015940_901afaca-c2e4-4f2b-9a0d-2f66d594cafb.sql ===
-- Add Trello-like features to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS labels jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_url text DEFAULT NULL;

-- labels format: [{"text": "Bug", "color": "#ef4444"}, ...]
-- attachments format: [{"name": "file.pdf", "url": "https://...", "type": "application/pdf", "size": 1024, "uploaded_at": "2026-01-01T00:00:00Z"}, ...]
COMMENT ON COLUMN public.tasks.labels IS 'Colored labels array [{text, color}]';
COMMENT ON COLUMN public.tasks.attachments IS 'File attachments [{name, url, type, size, uploaded_at}]';
COMMENT ON COLUMN public.tasks.cover_url IS 'Cover image URL displayed on card';
-- === MIGRATION: 20260221144722_70aa25c7-dfe7-4df3-a858-56e103fb7ad2.sql ===

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

-- === MIGRATION: 20260221144800_d1f9402f-ad0f-4eb4-b18d-004d1102a32e.sql ===

-- Fix security definer view by setting it to SECURITY INVOKER (default, uses querying user's permissions)
ALTER VIEW public.organograma_view SET (security_invoker = on);

-- === MIGRATION: 20260221153452_504b5eb6-31d5-43b5-98fa-ec18bfa01e0e.sql ===

-- Webhooks configuration table (W2.2)
CREATE TABLE public.webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhooks_select" ON public.webhooks FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "webhooks_insert_admin" ON public.webhooks FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "webhooks_update_admin" ON public.webhooks FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "webhooks_delete_admin" ON public.webhooks FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_admin());

-- Webhook logs for debugging
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_logs_select" ON public.webhook_logs FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "webhook_logs_insert" ON public.webhook_logs FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Index for performance
CREATE INDEX idx_webhook_logs_webhook_id ON public.webhook_logs(webhook_id);
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX idx_webhooks_tenant_id ON public.webhooks(tenant_id);

-- === MIGRATION: 20260221155423_958cad12-3900-4d1b-bb9a-5088ce6d5997.sql ===

-- Add separate dark mode color columns to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS primary_color_dark text DEFAULT NULL;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS secondary_color_dark text DEFAULT NULL;

-- === MIGRATION: 20260221183504_2c2546d9-e585-4e00-8b84-8ed93ca296e6.sql ===

ALTER TABLE public.processes
ADD COLUMN IF NOT EXISTS process_markdown text,
ADD COLUMN IF NOT EXISTS flow_data jsonb,
ADD COLUMN IF NOT EXISTS original_prompt text;

-- === MIGRATION: 20260222023711_7b9e1692-b2cb-4833-a777-9b28a718d2f4.sql ===
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_dark_url text;
-- === MIGRATION: 20260222025644_10eafc72-5d1d-454a-8302-c28ae70dbd2f.sql ===

-- Module 18.1: Process multi-dimensional classification (N:N with areas/subareas)

-- Create process_areas junction table
CREATE TABLE public.process_areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES public.company_areas(id) ON DELETE CASCADE,
  subarea_id UUID REFERENCES public.subareas(id) ON DELETE SET NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(process_id, area_id, subarea_id)
);

-- Enable RLS
ALTER TABLE public.process_areas ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "tenant_select_process_areas" ON public.process_areas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM processes p WHERE p.id = process_areas.process_id AND p.tenant_id = get_user_tenant_id())
  );

CREATE POLICY "admin_manage_process_areas" ON public.process_areas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM processes p WHERE p.id = process_areas.process_id AND p.tenant_id = get_user_tenant_id()) AND is_admin()
  );

-- Migrate existing data from processes.area_id/subarea_id to process_areas
INSERT INTO public.process_areas (process_id, area_id, subarea_id, is_primary)
SELECT id, area_id, subarea_id, true
FROM public.processes
WHERE area_id IS NOT NULL;

-- === MIGRATION: 20260224160657_964e2f8a-4715-462f-aea4-92a5143d9c63.sql ===
-- Add owner_id to projects (the person responsible for the project as a whole)
ALTER TABLE public.projects
ADD COLUMN owner_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
-- === MIGRATION: 20260226175023_87c6cdef-cc80-4b9e-8318-835f5757e344.sql ===

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

-- === MIGRATION: 20260228172459_86188c2d-f394-4295-a808-45b13eed053d.sql ===

-- ==========================================
-- v6.0 — Sistema de Documentos de Processos
-- ==========================================

-- 1. Tabela de pastas
CREATE TABLE public.process_doc_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.process_doc_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de documentos
CREATE TABLE public.process_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID REFERENCES public.process_doc_folders(id) ON DELETE CASCADE,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'document' CHECK (type IN ('document', 'file')),
  file_path TEXT,
  file_size BIGINT,
  file_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX idx_doc_folders_process ON public.process_doc_folders(process_id);
CREATE INDEX idx_doc_folders_parent ON public.process_doc_folders(parent_id);
CREATE INDEX idx_doc_folders_tenant ON public.process_doc_folders(tenant_id);
CREATE INDEX idx_doc_folders_public_token ON public.process_doc_folders(public_token) WHERE public_token IS NOT NULL;

CREATE INDEX idx_documents_process ON public.process_documents(process_id);
CREATE INDEX idx_documents_folder ON public.process_documents(folder_id);
CREATE INDEX idx_documents_tenant ON public.process_documents(tenant_id);
CREATE INDEX idx_documents_public_token ON public.process_documents(public_token) WHERE public_token IS NOT NULL;

-- 4. updated_at triggers
CREATE TRIGGER set_updated_at_doc_folders
  BEFORE UPDATE ON public.process_doc_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_documents
  BEFORE UPDATE ON public.process_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. RLS
ALTER TABLE public.process_doc_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_documents ENABLE ROW LEVEL SECURITY;

-- Folders RLS: tenant select
CREATE POLICY "folders_select" ON public.process_doc_folders
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Folders RLS: public select via token (anon allowed)
CREATE POLICY "folders_public_select" ON public.process_doc_folders
  AS PERMISSIVE FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

-- Folders RLS: admin/manager manage
CREATE POLICY "folders_insert" ON public.process_doc_folders
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "folders_update" ON public.process_doc_folders
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "folders_delete" ON public.process_doc_folders
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- Documents RLS: tenant select
CREATE POLICY "documents_select" ON public.process_documents
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Documents RLS: public select via token (anon allowed)
CREATE POLICY "documents_public_select" ON public.process_documents
  AS PERMISSIVE FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

-- Documents RLS: also public if parent folder is public
CREATE POLICY "documents_folder_public_select" ON public.process_documents
  AS PERMISSIVE FOR SELECT TO anon
  USING (folder_id IN (SELECT id FROM public.process_doc_folders WHERE is_public = true AND public_token IS NOT NULL));

-- Documents RLS: admin/manager manage
CREATE POLICY "documents_insert" ON public.process_documents
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "documents_update" ON public.process_documents
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "documents_delete" ON public.process_documents
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- 6. Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('process-documents', 'process-documents', true);

-- Storage RLS: authenticated users in their tenant can upload
CREATE POLICY "process_docs_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'process-documents');

CREATE POLICY "process_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'process-documents');

CREATE POLICY "process_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'process-documents');

-- Storage: public read for anon (images in public docs)
CREATE POLICY "process_docs_public_read" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'process-documents');

-- === MIGRATION: 20260228194230_f1effadc-593e-40c5-a5ec-e370e6a9f329.sql ===

-- Project document folders
CREATE TABLE public.project_doc_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.project_doc_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project documents
CREATE TABLE public.project_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.project_doc_folders(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'document',
  file_path TEXT,
  file_size BIGINT,
  file_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_project_doc_folders_project ON public.project_doc_folders(project_id);
CREATE INDEX idx_project_doc_folders_parent ON public.project_doc_folders(parent_id);
CREATE INDEX idx_project_doc_folders_tenant ON public.project_doc_folders(tenant_id);
CREATE INDEX idx_project_doc_folders_token ON public.project_doc_folders(public_token) WHERE public_token IS NOT NULL;
CREATE INDEX idx_project_documents_project ON public.project_documents(project_id);
CREATE INDEX idx_project_documents_folder ON public.project_documents(folder_id);
CREATE INDEX idx_project_documents_tenant ON public.project_documents(tenant_id);
CREATE INDEX idx_project_documents_token ON public.project_documents(public_token) WHERE public_token IS NOT NULL;

-- Triggers
CREATE TRIGGER update_project_doc_folders_updated_at
  BEFORE UPDATE ON public.project_doc_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.project_doc_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- project_doc_folders policies
CREATE POLICY "pf_select" ON public.project_doc_folders FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "pf_public_select" ON public.project_doc_folders FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

CREATE POLICY "pf_insert" ON public.project_doc_folders FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "pf_update" ON public.project_doc_folders FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "pf_delete" ON public.project_doc_folders FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- project_documents policies
CREATE POLICY "pd_select" ON public.project_documents FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "pd_public_select" ON public.project_documents FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

CREATE POLICY "pd_folder_public_select" ON public.project_documents FOR SELECT TO anon
  USING (folder_id IN (SELECT id FROM public.project_doc_folders WHERE is_public = true AND public_token IS NOT NULL));

CREATE POLICY "pd_insert" ON public.project_documents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "pd_update" ON public.project_documents FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "pd_delete" ON public.project_documents FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- === MIGRATION: 20260228194833_715e4fdf-6214-41f9-bd19-630983723dd8.sql ===
DROP TABLE IF EXISTS public.process_documents;
DROP TABLE IF EXISTS public.process_doc_folders;
-- === MIGRATION: 20260228195153_71b81ece-5c1e-4b8e-8e6c-d6dd10cb2fc5.sql ===
-- Limpar todos os dados de exemplo, mantendo estrutura de auth/tenant intacta
-- Ordem respeitando FKs via CASCADE

TRUNCATE TABLE public.webhook_logs CASCADE;
TRUNCATE TABLE public.webhooks CASCADE;
TRUNCATE TABLE public.project_documents CASCADE;
TRUNCATE TABLE public.project_doc_folders CASCADE;
TRUNCATE TABLE public.process_steps CASCADE;
TRUNCATE TABLE public.process_areas CASCADE;
TRUNCATE TABLE public.process_positions CASCADE;
TRUNCATE TABLE public.tasks CASCADE;
TRUNCATE TABLE public.employee_projects CASCADE;
TRUNCATE TABLE public.employee_positions CASCADE;
TRUNCATE TABLE public.processes CASCADE;
TRUNCATE TABLE public.projects CASCADE;
TRUNCATE TABLE public.employees CASCADE;
TRUNCATE TABLE public.positions CASCADE;
TRUNCATE TABLE public.subareas CASCADE;
TRUNCATE TABLE public.company_areas CASCADE;
-- === MIGRATION: 20260301002511_7551d52c-901f-4f86-b8e7-b38343f6fbb3.sql ===
-- Recriar registros employees para todos os usuários existentes
INSERT INTO public.employees (tenant_id, user_id, status, is_ceo)
SELECT p.tenant_id, p.user_id, 'active'::employee_status,
  CASE WHEN ur.role = 'admin' THEN true ELSE false END
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.user_id
ON CONFLICT DO NOTHING;
-- === MIGRATION: 20260303131706_82f970ad-8d3d-4ad0-a59f-a61782842ad2.sql ===

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

-- === MIGRATION: 20260304184000_add_area_id_to_positions.sql ===
-- Migration: Add area_id to positions table and make subarea_id nullable
-- This allows area-level positions (Directors) that don't belong to a specific subarea

-- Step 1: Add area_id column to positions table
ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.company_areas(id) ON DELETE SET NULL;

-- Step 2: Make subarea_id nullable (was previously required)
ALTER TABLE public.positions
ALTER COLUMN subarea_id DROP NOT NULL;

-- Step 3: Add check constraint to ensure at least one of area_id or subarea_id is set
-- This ensures data integrity - a position must belong to either an area or a subarea
ALTER TABLE public.positions
DROP CONSTRAINT IF EXISTS positions_area_or_subarea_check;

ALTER TABLE public.positions
ADD CONSTRAINT positions_area_or_subarea_check
CHECK (area_id IS NOT NULL OR subarea_id IS NOT NULL);

-- Step 4: Create index for area_id lookups
CREATE INDEX IF NOT EXISTS idx_positions_area_id ON public.positions(area_id);

-- Step 5: Update existing positions to set area_id based on their subarea's parent area
-- This ensures data consistency for existing records
UPDATE public.positions p
SET area_id = s.area_id
FROM public.subareas s
WHERE p.subarea_id = s.id
AND p.area_id IS NULL;

-- Step 6: Add comment to document the change
COMMENT ON COLUMN public.positions.area_id IS 'Direct reference to area for area-level positions (e.g., Directors). Either area_id or subarea_id must be set.';

-- === MIGRATION: 20260304185000_auto_create_director.sql ===
-- =====================================================
-- Migration: Auto-create Director position for each area
-- =====================================================
-- Requires: 20260304184000_add_area_id_to_positions.sql
-- Verify area_id column exists before proceeding
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'positions' AND column_name = 'area_id'
  ) THEN
    RAISE EXCEPTION 'Migration prerequisite missing: area_id column does not exist in positions table';
  END IF;
END $$;

-- Function to auto-create director position when area is created
CREATE OR REPLACE FUNCTION create_director_position()
RETURNS TRIGGER AS $$
BEGIN
  -- Only insert if a director position doesn't already exist for this area
  INSERT INTO positions (title, area_id, subarea_id, tenant_id, level, sort_order, created_at, updated_at)
  SELECT 'Diretor', NEW.id, NULL, NEW.tenant_id, 1, 0, NOW(), NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM positions
    WHERE area_id = NEW.id
    AND title = 'Diretor'
    AND subarea_id IS NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on company_areas table
DROP TRIGGER IF EXISTS trigger_create_director ON company_areas;
CREATE TRIGGER trigger_create_director
AFTER INSERT ON company_areas
FOR EACH ROW
EXECUTE FUNCTION create_director_position();

-- Create director positions for existing areas (if they don't exist)
INSERT INTO positions (title, area_id, subarea_id, tenant_id, level, sort_order, created_at, updated_at)
SELECT 'Diretor', a.id, NULL, a.tenant_id, 1, 0, NOW(), NOW()
FROM company_areas a
WHERE NOT EXISTS (
  SELECT 1 FROM positions p 
  WHERE p.area_id = a.id 
  AND p.title = 'Diretor'
  AND p.subarea_id IS NULL
);

-- =====================================================
-- Rollback Steps (for documentation):
-- =====================================================
-- DROP TRIGGER IF EXISTS trigger_create_director ON company_areas;
-- DROP FUNCTION IF EXISTS create_director_position();
-- DELETE FROM positions WHERE title = 'Diretor' AND subarea_id IS NULL AND area_id IS NOT NULL;
-- === MIGRATION: 20260308212644_7bca12e1-2818-425b-b416-e301d1ab5c0d.sql ===

-- Meetings table
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  created_by uuid,
  transcript_raw text,
  transcript_final text,
  summary_markdown text,
  action_items jsonb DEFAULT '[]',
  key_points jsonb DEFAULT '[]',
  attention_points jsonb DEFAULT '[]',
  participants jsonb DEFAULT '[]',
  approval_status text DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  generated_projects jsonb DEFAULT '[]',
  generated_tasks jsonb DEFAULT '[]',
  soniox_session_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND is_admin());

-- Trigger for updated_at
CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Meeting approved items table
CREATE TABLE public.meeting_approved_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  item_type text NOT NULL,
  item_id uuid,
  original_suggestion jsonb,
  approved_at timestamptz DEFAULT now()
);

ALTER TABLE public.meeting_approved_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mai_select" ON public.meeting_approved_items FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "mai_insert" ON public.meeting_approved_items FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "mai_delete" ON public.meeting_approved_items FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND is_admin());

-- === MIGRATION: 20260309120000_meeting_enhancements.sql ===
-- Migration: Meeting Enhancements
-- Adds scheduled date/time, project linking, location, and attendees management

-- Add new columns to meetings table
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS scheduled_date DATE,
ADD COLUMN IF NOT EXISTS scheduled_time TIME,
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS location TEXT;

-- Create meeting_attendees table for explicit participant management
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'required' CHECK (role IN ('organizer', 'required', 'optional')),
  attendance_status TEXT DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'confirmed', 'declined', 'attended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, email)
);

-- Add tenant_id to meeting_attendees for RLS
ALTER TABLE meeting_attendees ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_date ON meetings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_meetings_project_id ON meetings(project_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting_id ON meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_employee_id ON meeting_attendees(employee_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_tenant_id ON meeting_attendees(tenant_id);

-- Enable RLS on meeting_attendees
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Users can view attendees from their tenant meetings" ON meeting_attendees;
DROP POLICY IF EXISTS "Users can insert attendees in their tenant meetings" ON meeting_attendees;
DROP POLICY IF EXISTS "Users can update attendees in their tenant meetings" ON meeting_attendees;
DROP POLICY IF EXISTS "Users can delete attendees from their tenant meetings" ON meeting_attendees;

-- RLS Policies for meeting_attendees
CREATE POLICY "Users can view attendees from their tenant meetings"
  ON meeting_attendees FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert attendees in their tenant meetings"
  ON meeting_attendees FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update attendees in their tenant meetings"
  ON meeting_attendees FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete attendees from their tenant meetings"
  ON meeting_attendees FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Trigger to set tenant_id from meeting when inserting attendee
CREATE OR REPLACE FUNCTION set_meeting_attendee_tenant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM meetings
    WHERE id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_meeting_attendee_tenant ON meeting_attendees;
CREATE TRIGGER trg_set_meeting_attendee_tenant
  BEFORE INSERT ON meeting_attendees
  FOR EACH ROW
  EXECUTE FUNCTION set_meeting_attendee_tenant();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_meeting_attendee_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_meeting_attendee_timestamp ON meeting_attendees;
CREATE TRIGGER trg_update_meeting_attendee_timestamp
  BEFORE UPDATE ON meeting_attendees
  FOR EACH ROW
  EXECUTE FUNCTION update_meeting_attendee_timestamp();

-- RLS Policy for meetings update (idempotent)
DROP POLICY IF EXISTS "Users can update meetings in their tenant" ON meetings;
CREATE POLICY "Users can update meetings in their tenant"
  ON meetings FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- === MIGRATION: 20260309140000_position_hierarchy_migration.sql ===
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
          AND t.completed_at >= date_trunc('week', CURRENT_DATE)
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
-- Fallback to old position_id if no primary in employee_positions
LEFT JOIN positions fallback_pos ON fallback_pos.id = e.position_id AND ep.position_id IS NULL
-- Use whichever position we found
LEFT JOIN subareas sa ON sa.id = COALESCE(pos.subarea_id, fallback_pos.subarea_id)
LEFT JOIN company_areas ca ON ca.id = COALESCE(pos.area_id, fallback_pos.area_id, sa.area_id)
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

-- === MIGRATION: 20260309150000_allow_ceo_position_no_area.sql ===
-- Allow CEO-level positions (level = 0) to exist without area_id or subarea_id
-- Previously the constraint required every position to belong to an area or subarea,
-- but the CEO sits above all areas and should not be tied to one.

ALTER TABLE public.positions
DROP CONSTRAINT IF EXISTS positions_area_or_subarea_check;

ALTER TABLE public.positions
ADD CONSTRAINT positions_area_or_subarea_check
CHECK (level = 0 OR area_id IS NOT NULL OR subarea_id IS NOT NULL);

-- === MIGRATION: 20260310000001_process_position_based_rls.sql ===
-- Migration: Process visibility restricted by position (v7.4.2)
-- Users only see processes linked to their positions via process_positions.
-- Admins continue to see all processes in the tenant.
-- Processes with no linked positions are invisible to non-admins.

-- ============================================================
-- processes: replace SELECT policy
-- ============================================================
DROP POLICY IF EXISTS "processes_select" ON public.processes;

CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.process_positions pp
        JOIN public.employee_positions ep ON ep.position_id = pp.position_id
        JOIN public.employees e ON e.id = ep.employee_id
        WHERE pp.process_id = processes.id
          AND e.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- process_steps: replace SELECT policy (inherits parent process visibility)
-- ============================================================
DROP POLICY IF EXISTS "steps_select" ON public.process_steps;

CREATE POLICY "steps_select" ON public.process_steps
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.process_positions pp
        JOIN public.employee_positions ep ON ep.position_id = pp.position_id
        JOIN public.employees e ON e.id = ep.employee_id
        WHERE pp.process_id = process_steps.process_id
          AND e.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- process_positions: replace SELECT policy
-- Users see position-links for processes they can access.
-- ============================================================
DROP POLICY IF EXISTS "process_positions_select" ON public.process_positions;

CREATE POLICY "process_positions_select" ON public.process_positions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.employee_positions ep
      JOIN public.employees e ON e.id = ep.employee_id
      WHERE ep.position_id = process_positions.position_id
        AND e.user_id = auth.uid()
    )
  );

-- === MIGRATION: 20260310000002_task_project_meeting_rls.sql ===
-- Migration: Restrict visibility of tasks, projects, meetings by assignment (v7.5.0)
-- Tasks: assignee OR project owner (created_by) OR admin
-- Projects: creator OR has assigned task here OR admin
-- Meetings: creator OR listed attendee OR admin
-- meeting_attendees: this row is me OR I created the meeting OR admin

-- ============================================================
-- tasks: admin OR assignee OR project owner
-- ============================================================
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = tasks.assignee_id AND e.user_id = auth.uid()
      )
      OR (
        tasks.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = tasks.project_id AND p.created_by = auth.uid()
        )
      )
    )
  );

-- ============================================================
-- projects: admin OR creator OR has assigned task here
-- ============================================================
DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR projects.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.tasks t
        JOIN public.employees e ON e.id = t.assignee_id
        WHERE t.project_id = projects.id AND e.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- meetings: admin OR creator OR listed attendee
-- ============================================================
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;

CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR meetings.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.meeting_attendees ma
        JOIN public.employees e ON e.id = ma.employee_id
        WHERE ma.meeting_id = meetings.id AND e.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- meeting_attendees SELECT: admin OR this row is me OR I created the meeting
-- ============================================================
DROP POLICY IF EXISTS "Users can view attendees from their tenant meetings" ON public.meeting_attendees;

CREATE POLICY "meeting_attendees_select" ON public.meeting_attendees
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = meeting_attendees.employee_id AND e.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE m.id = meeting_attendees.meeting_id AND m.created_by = auth.uid()
      )
    )
  );

-- === MIGRATION: 20260311000001_process_folders_tags.sql ===
-- process_folders: suporte a pastas e sub-pastas para processos
create table process_folders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  parent_id uuid references process_folders(id) on delete cascade,
  sort_order integer default 0,
  created_by uuid references profiles(user_id),
  created_at timestamptz default now()
);
alter table process_folders enable row level security;
create policy "process_folders_tenant_isolation" on process_folders
  for all using (tenant_id = (select tenant_id from profiles where user_id = auth.uid()));

-- Adicionar folder_id em processes
alter table processes add column folder_id uuid references process_folders(id) on delete set null;

-- process_tags: tags com cor para categorização
create table process_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  created_by uuid references profiles(user_id),
  created_at timestamptz default now()
);
alter table process_tags enable row level security;
create policy "process_tags_tenant_isolation" on process_tags
  for all using (tenant_id = (select tenant_id from profiles where user_id = auth.uid()));

-- process_tag_assignments: junction table processo <-> tag
create table process_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references processes(id) on delete cascade,
  tag_id uuid not null references process_tags(id) on delete cascade,
  created_at timestamptz default now(),
  unique(process_id, tag_id)
);
alter table process_tag_assignments enable row level security;
create policy "process_tag_assignments_tenant_isolation" on process_tag_assignments
  for all using (
    exists (
      select 1 from processes p
      where p.id = process_tag_assignments.process_id
      and p.tenant_id = (select tenant_id from profiles where user_id = auth.uid())
    )
  );

-- === MIGRATION: 20260311000002_fix_meeting_rls_recursion.sql ===
-- Fix: infinite recursion between meetings_select and meeting_attendees_select
--
-- The cycle:
--   meetings_select         → queries meeting_attendees (to check attendee)
--   meeting_attendees_select → queries meetings         (to check creator)
--
-- Fix: replace the direct meetings lookup in meeting_attendees_select with a
-- SECURITY DEFINER function that bypasses RLS, breaking the cycle.

-- Helper: returns the created_by of a meeting without going through RLS
CREATE OR REPLACE FUNCTION public.get_meeting_created_by(p_meeting_id uuid)
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT created_by FROM public.meetings WHERE id = p_meeting_id;
$$;

-- Recreate meeting_attendees_select using the helper instead of a direct subquery
DROP POLICY IF EXISTS "meeting_attendees_select" ON public.meeting_attendees;

CREATE POLICY "meeting_attendees_select" ON public.meeting_attendees
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = meeting_attendees.employee_id AND e.user_id = auth.uid()
      )
      -- Use SECURITY DEFINER function to avoid querying meetings with RLS (would recurse)
      OR public.get_meeting_created_by(meeting_attendees.meeting_id) = auth.uid()
    )
  );

-- === MIGRATION: 20260311000003_processes_manager_rls.sql ===
-- Migration: Allow managers to insert and update processes and process_steps
-- Previously restricted to admin only. Delete remains admin-only.

-- processes: INSERT
DROP POLICY IF EXISTS "processes_insert_admin" ON public.processes;
CREATE POLICY "processes_insert_admin" ON public.processes
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
  );

-- processes: UPDATE
DROP POLICY IF EXISTS "processes_update_admin" ON public.processes;
CREATE POLICY "processes_update_admin" ON public.processes
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
  );

-- process_steps: INSERT
DROP POLICY IF EXISTS "steps_insert_admin" ON public.process_steps;
CREATE POLICY "steps_insert_admin" ON public.process_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
  );

-- process_steps: UPDATE
DROP POLICY IF EXISTS "steps_update_admin" ON public.process_steps;
CREATE POLICY "steps_update_admin" ON public.process_steps
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
  );

-- === MIGRATION: 20260312000001_fix_projects_tasks_rls_recursion.sql ===
-- Fix: infinite recursion between projects_select and tasks_select
--
-- The cycle:
--   projects_select → queries tasks (to check assignee)
--   tasks_select    → queries projects (to check created_by)
--
-- Fix: replace the direct projects lookup in tasks_select with a
-- SECURITY DEFINER function that bypasses RLS, breaking the cycle.

-- Helper: returns created_by of a project without going through RLS
CREATE OR REPLACE FUNCTION public.get_project_created_by(p_project_id uuid)
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT created_by FROM public.projects WHERE id = p_project_id;
$$;

-- Recreate tasks_select using the helper instead of a direct subquery into projects
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = tasks.assignee_id AND e.user_id = auth.uid()
      )
      OR (
        tasks.project_id IS NOT NULL
        AND public.get_project_created_by(tasks.project_id) = auth.uid()
      )
    )
  );

-- === MIGRATION: 20260315000001_fix_processes_select_creator.sql ===
-- Fix: infinite recursion in processes_select RLS (42P17)
--
-- The cycle:
--   processes_select → queries process_positions (RLS applied)
--   process_positions policy → references back to processes
--   → infinite recursion
--
-- Fix: replace the direct process_positions subquery in processes_select with a
-- SECURITY DEFINER function that bypasses RLS, breaking the cycle.
-- Same pattern as 20260312000001_fix_projects_tasks_rls_recursion.sql.
--
-- Also adds OR created_by = auth.uid() so managers can read their own newly
-- created processes before any positions are linked (fixes PGRST116 on INSERT RETURNING).

CREATE OR REPLACE FUNCTION public.user_has_process_access(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.process_positions pp
    JOIN public.employee_positions ep ON ep.position_id = pp.position_id
    JOIN public.employees e ON e.id = ep.employee_id
    WHERE pp.process_id = p_process_id
      AND e.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "processes_select" ON public.processes;

CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR created_by = auth.uid()
      OR public.user_has_process_access(id)
    )
  );

-- === MIGRATION: 20260315000002_process_doc_folders_documents.sql ===
-- Tabela de pastas para documentos de processos
CREATE TABLE IF NOT EXISTS process_doc_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id  UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES process_doc_folders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT,
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  created_by  UUID REFERENCES profiles(user_id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de documentos/arquivos de processos
CREATE TABLE IF NOT EXISTS process_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id  UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  folder_id   UUID REFERENCES process_doc_folders(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  content     TEXT,
  type        TEXT NOT NULL DEFAULT 'document' CHECK (type IN ('document','file')),
  file_path   TEXT,
  file_size   BIGINT,
  file_type   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT,
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  created_by  UUID REFERENCES profiles(user_id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_process_doc_folders_process ON process_doc_folders(process_id);
CREATE INDEX IF NOT EXISTS idx_process_doc_folders_tenant ON process_doc_folders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_process ON process_documents(process_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_folder ON process_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_tenant ON process_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_token ON process_documents(public_token) WHERE public_token IS NOT NULL;

-- RLS
ALTER TABLE process_doc_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_documents ENABLE ROW LEVEL SECURITY;

-- Pastas: leitura por tenant (autenticado)
CREATE POLICY "pf_proc_select" ON process_doc_folders FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Pastas: escrita por admin/manager
CREATE POLICY "pf_proc_write" ON process_doc_folders FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- Documentos: leitura por tenant (autenticado)
CREATE POLICY "pd_proc_select" ON process_documents FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Documentos: escrita por admin/manager
CREATE POLICY "pd_proc_write" ON process_documents FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- Acesso público anônimo (tokens)
CREATE POLICY "pf_proc_public" ON process_doc_folders FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

CREATE POLICY "pd_proc_public" ON process_documents FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

-- === MIGRATION: 20260316000001_fix_user_roles_unique_constraint.sql ===
-- Fix user_roles: ensure only ONE role per user
-- Remove duplicates and add UNIQUE(user_id) constraint

-- 1. Create temp table with one role per user (prioritizing admin)
CREATE TEMP TABLE user_roles_dedup AS
WITH ranked_roles AS (
  SELECT
    id,
    user_id,
    role,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, id) as rn
  FROM user_roles
)
SELECT id FROM ranked_roles WHERE rn = 1;

-- 2. Delete rows not in the dedup list
DELETE FROM user_roles
WHERE id NOT IN (SELECT id FROM user_roles_dedup);

-- 3. Drop old composite constraint
ALTER TABLE user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- 4. Add single-column UNIQUE constraint
ALTER TABLE user_roles
ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);

-- === MIGRATION: 20260319000001_add_task_status_ajustes_arquivado.sql ===
-- Add 'ajustes' and 'arquivado' to task_status enum
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'ajustes' AFTER 'review';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'arquivado' AFTER 'done';

-- === MIGRATION: 20260319000002_create_task_assignees.sql ===
-- Multiple assignees per task
CREATE TABLE task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, employee_id)
);

CREATE INDEX idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_employee ON task_assignees(employee_id);
CREATE INDEX idx_task_assignees_tenant ON task_assignees(tenant_id);

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_assignees_select" ON task_assignees
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "task_assignees_insert" ON task_assignees
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "task_assignees_delete" ON task_assignees
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Migrate existing assignee_id data
INSERT INTO task_assignees (task_id, employee_id, tenant_id)
SELECT id, assignee_id, tenant_id FROM tasks WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- === MIGRATION: 20260319000003_create_task_recurrence.sql ===
CREATE TABLE task_recurrence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom')),
  interval_days INT,
  days_of_week INT[],
  day_of_month INT,
  end_date DATE,
  next_occurrence DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_task_recurrence_task ON task_recurrence(task_id);
CREATE INDEX idx_task_recurrence_tenant ON task_recurrence(tenant_id);
CREATE INDEX idx_task_recurrence_next ON task_recurrence(next_occurrence) WHERE is_active = true;

ALTER TABLE task_recurrence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_recurrence_select" ON task_recurrence
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "task_recurrence_insert" ON task_recurrence
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "task_recurrence_update" ON task_recurrence
  FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "task_recurrence_delete" ON task_recurrence
  FOR DELETE USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- === MIGRATION: 20260319000004_create_notifications.sql ===
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notifications_delete" ON notifications
  FOR DELETE USING (user_id = auth.uid());

-- === MIGRATION: 20260323000001_fix_task_recurrence_rls.sql ===
-- Fix task_recurrence RLS policies
-- CRITICAL: use table aliases to avoid Postgres resolving unqualified
-- column names to the policy's target table (task_recurrence).
-- profiles uses user_id (not id), user_roles has NO tenant_id column.

DROP POLICY IF EXISTS "task_recurrence_select" ON task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_insert" ON task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_update" ON task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_delete" ON task_recurrence;

-- SELECT: any tenant member
CREATE POLICY "task_recurrence_select" ON task_recurrence
  FOR SELECT USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid()
    )
  );

-- INSERT: admin/manager OR task assignee (within same tenant)
CREATE POLICY "task_recurrence_insert" ON task_recurrence
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin', 'manager')
      )
      OR
      EXISTS (
        SELECT 1 FROM tasks AS t
        JOIN employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
    )
  );

-- UPDATE: admin/manager OR task assignee
CREATE POLICY "task_recurrence_update" ON task_recurrence
  FOR UPDATE USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin', 'manager')
      )
      OR
      EXISTS (
        SELECT 1 FROM tasks AS t
        JOIN employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
    )
  );

-- DELETE: admin/manager OR task assignee
CREATE POLICY "task_recurrence_delete" ON task_recurrence
  FOR DELETE USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin', 'manager')
      )
      OR
      EXISTS (
        SELECT 1 FROM tasks AS t
        JOIN employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
    )
  );

-- === MIGRATION: 20260323000002_pg_cron_task_recurrence_processor.sql ===
-- Enable pg_cron and create function to process recurring tasks
-- Runs daily at 03:00 UTC (midnight BRT)

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Function: find due recurrences, create new tasks, advance next_occurrence
CREATE OR REPLACE FUNCTION public.process_task_recurrences()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  new_task_id UUID;
  tasks_created INT := 0;
  recurrences_deactivated INT := 0;
  next_date DATE;
BEGIN
  FOR rec IN
    SELECT
      tr.*,
      t.title,
      t.description,
      t.project_id,
      t.assignee_id,
      t.created_by,
      t.priority,
      t.checklist_items,
      t.labels
    FROM task_recurrence tr
    JOIN tasks t ON t.id = tr.task_id
    WHERE tr.is_active = true
      AND tr.next_occurrence <= CURRENT_DATE
  LOOP
    -- Create new task copying from the original
    INSERT INTO tasks (
      tenant_id, project_id, assignee_id, created_by,
      title, description, status, priority,
      due_date, checklist_items, labels
    ) VALUES (
      rec.tenant_id,
      rec.project_id,
      rec.assignee_id,
      rec.created_by,
      rec.title,
      rec.description,
      'todo',
      rec.priority,
      rec.next_occurrence::timestamptz,
      -- Reset checklist items to unchecked
      CASE
        WHEN rec.checklist_items IS NOT NULL AND jsonb_array_length(rec.checklist_items) > 0
        THEN (
          SELECT jsonb_agg(
            jsonb_set(item, '{checked}', 'false'::jsonb)
          )
          FROM jsonb_array_elements(rec.checklist_items) AS item
        )
        ELSE '[]'::jsonb
      END,
      rec.labels
    )
    RETURNING id INTO new_task_id;

    tasks_created := tasks_created + 1;

    -- Calculate next occurrence based on frequency
    next_date := CASE rec.frequency
      WHEN 'daily' THEN rec.next_occurrence + INTERVAL '1 day'
      WHEN 'weekly' THEN rec.next_occurrence + INTERVAL '7 days'
      WHEN 'biweekly' THEN rec.next_occurrence + INTERVAL '14 days'
      WHEN 'monthly' THEN rec.next_occurrence + INTERVAL '1 month'
      WHEN 'custom' THEN rec.next_occurrence + (COALESCE(rec.interval_days, 7) || ' days')::INTERVAL
      ELSE rec.next_occurrence + INTERVAL '7 days'
    END;

    -- Deactivate if past end_date, otherwise advance
    IF rec.end_date IS NOT NULL AND next_date > rec.end_date THEN
      UPDATE task_recurrence SET is_active = false WHERE id = rec.id;
      recurrences_deactivated := recurrences_deactivated + 1;
    ELSE
      UPDATE task_recurrence SET next_occurrence = next_date WHERE id = rec.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tasks_created', tasks_created,
    'recurrences_deactivated', recurrences_deactivated,
    'processed_at', now()
  );
END;
$$;

-- Schedule: every day at 03:00 UTC (midnight BRT)
SELECT cron.schedule(
  'process-task-recurrences',
  '0 3 * * *',
  $$SELECT public.process_task_recurrences()$$
);

-- === MIGRATION: 20260323000003_recurrence_comments_completions.sql ===
-- Chat/comments and daily completion tracking for recurring tasks

-- Comments table
CREATE TABLE task_recurrence_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrence_id UUID NOT NULL REFERENCES task_recurrence(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  author_id UUID NOT NULL REFERENCES employees(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rec_comments_recurrence ON task_recurrence_comments(recurrence_id);
CREATE INDEX idx_rec_comments_tenant ON task_recurrence_comments(tenant_id);

ALTER TABLE task_recurrence_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_comments_select" ON task_recurrence_comments
  FOR SELECT USING (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );
CREATE POLICY "rec_comments_insert" ON task_recurrence_comments
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );
CREATE POLICY "rec_comments_delete" ON task_recurrence_comments
  FOR DELETE USING (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
    AND author_id IN (
      SELECT emp.id FROM employees AS emp WHERE emp.user_id = auth.uid()
    )
  );

-- Completions table
CREATE TABLE task_recurrence_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrence_id UUID NOT NULL REFERENCES task_recurrence(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  completed_by UUID NOT NULL REFERENCES employees(id),
  completion_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recurrence_id, completion_date)
);

CREATE INDEX idx_rec_completions_recurrence ON task_recurrence_completions(recurrence_id);
CREATE INDEX idx_rec_completions_date ON task_recurrence_completions(completion_date);

ALTER TABLE task_recurrence_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_completions_select" ON task_recurrence_completions
  FOR SELECT USING (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );
CREATE POLICY "rec_completions_insert" ON task_recurrence_completions
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );
CREATE POLICY "rec_completions_delete" ON task_recurrence_completions
  FOR DELETE USING (
    tenant_id IN (SELECT prof.tenant_id FROM profiles AS prof WHERE prof.user_id = auth.uid())
  );

-- === MIGRATION: 20260409000001_create_task_comments.sql ===
-- Tabela de comentários de tarefas
CREATE TABLE IF NOT EXISTS public.task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS task_comments_task_id_idx   ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS task_comments_tenant_id_idx ON public.task_comments(tenant_id);

-- RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_insert" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_delete" ON public.task_comments;

-- SELECT: mesmos usuários que podem ver a tarefa (mesmo tenant)
CREATE POLICY "task_comments_select"
  ON public.task_comments FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- INSERT: apenas colaboradores do mesmo tenant
CREATE POLICY "task_comments_insert"
  ON public.task_comments FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- DELETE: apenas o autor pode deletar seu próprio comentário
CREATE POLICY "task_comments_delete"
  ON public.task_comments FOR DELETE
  USING (
    tenant_id = get_user_tenant_id()
    AND author_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- === MIGRATION: 20260409000002_create_announcements.sql ===
-- Módulo de Comunicados / Feed
-- Comunicados e postagens com controle de visibilidade por cargo, pessoa, área ou subárea

-- =====================================================================
-- 1. Tabela principal: announcements
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (char_length(title) > 0),
  content     TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'post' CHECK (type IN ('announcement', 'post')),
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  cover_url   TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  pinned      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS announcements_tenant_id_idx   ON public.announcements(tenant_id);
CREATE INDEX IF NOT EXISTS announcements_author_id_idx   ON public.announcements(author_id);
CREATE INDEX IF NOT EXISTS announcements_status_idx      ON public.announcements(status);
CREATE INDEX IF NOT EXISTS announcements_published_at_idx ON public.announcements(published_at DESC);

-- =====================================================================
-- 2. Tabela de visibilidade: quem pode ver cada comunicado
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.announcement_visibility (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL CHECK (target_type IN ('all', 'position', 'employee', 'area', 'subarea')),
  target_id       UUID  -- NULL when target_type = 'all'
);

CREATE INDEX IF NOT EXISTS announcement_visibility_ann_idx ON public.announcement_visibility(announcement_id);
CREATE INDEX IF NOT EXISTS announcement_visibility_tid_idx ON public.announcement_visibility(tenant_id);

-- =====================================================================
-- 3. RLS — announcements
-- =====================================================================

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer colaborador do tenant pode ver comunicados publicados
-- (filtragem de visibilidade feita na aplicação)
CREATE POLICY "announcements_select"
  ON public.announcements FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Criação: admin ou manager
CREATE POLICY "announcements_insert"
  ON public.announcements FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND (is_admin() OR has_role(auth.uid(), 'manager'))
  );

-- Atualização: apenas o autor ou admin
CREATE POLICY "announcements_update"
  ON public.announcements FOR UPDATE
  USING (
    tenant_id = get_user_tenant_id()
    AND (
      is_admin()
      OR author_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  );

-- Exclusão: apenas o autor ou admin
CREATE POLICY "announcements_delete"
  ON public.announcements FOR DELETE
  USING (
    tenant_id = get_user_tenant_id()
    AND (
      is_admin()
      OR author_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  );

-- =====================================================================
-- 4. RLS — announcement_visibility
-- =====================================================================

ALTER TABLE public.announcement_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcement_visibility_select"
  ON public.announcement_visibility FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "announcement_visibility_insert"
  ON public.announcement_visibility FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "announcement_visibility_delete"
  ON public.announcement_visibility FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- =====================================================================
-- 5. Trigger: updated_at
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_announcements_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_announcements_updated_at();

-- === MIGRATION: 20260410000002_backfill_task_project_labels.sql ===
-- Backfill project labels on existing tasks so cards reflect the selected project.
-- Idempotent: it removes stale project-name labels and appends the current project label.

WITH tenant_project_names AS (
  SELECT
    tenant_id,
    ARRAY_AGG(LOWER(name)) AS project_names
  FROM public.projects
  GROUP BY tenant_id
),
tasks_without_project AS (
  SELECT
    t.id,
    COALESCE(
      (
        SELECT jsonb_agg(label)
        FROM jsonb_array_elements(COALESCE(t.labels, '[]'::jsonb)) AS label
        WHERE NOT (
          LOWER(COALESCE(label->>'text', '')) = ANY(COALESCE(tpn.project_names, ARRAY[]::text[]))
        )
      ),
      '[]'::jsonb
    ) AS next_labels
  FROM public.tasks AS t
  LEFT JOIN tenant_project_names AS tpn
    ON tpn.tenant_id = t.tenant_id
  WHERE t.project_id IS NULL
),
project_label_candidates AS (
  SELECT
    t.id,
    COALESCE(
      (
        SELECT jsonb_agg(label)
        FROM jsonb_array_elements(COALESCE(t.labels, '[]'::jsonb)) AS label
        WHERE NOT (
          LOWER(COALESCE(label->>'text', '')) = ANY(COALESCE(tpn.project_names, ARRAY[]::text[]))
        )
      ),
      '[]'::jsonb
    ) ||
    jsonb_build_array(
      jsonb_build_object(
        'text', p.name,
        'color',
        CASE
          WHEN LOWER(p.name) = 'gt3' THEN '#2563eb'
          ELSE (
            ARRAY[
              '#2563eb',
              '#16a34a',
              '#ea580c',
              '#7c3aed',
              '#dc2626',
              '#0891b2',
              '#ca8a04',
              '#db2777',
              '#4f46e5',
              '#0f766e'
            ]
          )[
            (
              (
                ('x' || SUBSTRING(md5(p.id::text || ':' || LOWER(p.name)) FROM 1 FOR 8))::bit(32)::int
              ) % 10
            ) + 1
          ]
        END
      )
    ) AS next_labels
  FROM public.tasks AS t
  JOIN public.projects AS p
    ON p.id = t.project_id
  LEFT JOIN tenant_project_names AS tpn
    ON tpn.tenant_id = t.tenant_id
),
task_label_updates AS (
  SELECT * FROM tasks_without_project
  UNION ALL
  SELECT * FROM project_label_candidates
)
UPDATE public.tasks AS t
SET labels = u.next_labels
FROM task_label_updates AS u
WHERE u.id = t.id
  AND t.labels IS DISTINCT FROM u.next_labels;

-- === MIGRATION: 20260410000003_normalize_task_project_label_colors.sql ===
-- Normalize existing project labels so every project keeps a fixed color across all tasks.
-- Idempotent: it rewrites the project label color using the same project-based rule as the app.

WITH tenant_project_names AS (
  SELECT
    tenant_id,
    ARRAY_AGG(LOWER(name)) AS project_names
  FROM public.projects
  GROUP BY tenant_id
),
project_label_candidates AS (
  SELECT
    t.id,
    COALESCE(
      (
        SELECT jsonb_agg(label)
        FROM jsonb_array_elements(COALESCE(t.labels, '[]'::jsonb)) AS label
        WHERE NOT (
          LOWER(COALESCE(label->>'text', '')) = ANY(COALESCE(tpn.project_names, ARRAY[]::text[]))
        )
      ),
      '[]'::jsonb
    ) ||
    CASE
      WHEN t.project_id IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(
        jsonb_build_object(
          'text', p.name,
          'color',
          CASE
            WHEN LOWER(p.name) = 'gt3' THEN '#2563eb'
            ELSE (
              ARRAY[
                '#2563eb',
                '#16a34a',
                '#ea580c',
                '#7c3aed',
                '#dc2626',
                '#0891b2',
                '#ca8a04',
                '#db2777',
                '#4f46e5',
                '#0f766e'
              ]
            )[
              (
                (
                  ('x' || SUBSTRING(md5(p.id::text || ':' || LOWER(p.name)) FROM 1 FOR 8))::bit(32)::int
                ) % 10
              ) + 1
            ]
          END
        )
      )
    END AS next_labels
  FROM public.tasks AS t
  LEFT JOIN public.projects AS p
    ON p.id = t.project_id
  LEFT JOIN tenant_project_names AS tpn
    ON tpn.tenant_id = t.tenant_id
)
UPDATE public.tasks AS t
SET labels = plc.next_labels
FROM project_label_candidates AS plc
WHERE plc.id = t.id
  AND t.labels IS DISTINCT FROM plc.next_labels;

-- === MIGRATION: 20260410000004_ensure_unique_project_label_colors.sql ===
-- Ensure each project uses a unique task label color inside its tenant.
-- GT3 stays fixed in blue; the remaining projects receive unique HSL colors
-- based on their stable order by project name/id.

WITH tenant_project_names AS (
  SELECT
    tenant_id,
    ARRAY_AGG(LOWER(name)) AS project_names
  FROM public.projects
  GROUP BY tenant_id
),
ranked_projects AS (
  SELECT
    p.id,
    p.tenant_id,
    p.name,
    LOWER(p.name) AS normalized_name,
    ROW_NUMBER() OVER (
      PARTITION BY p.tenant_id
      ORDER BY LOWER(p.name), p.id
    ) AS order_index
  FROM public.projects AS p
),
ordered_projects AS (
  SELECT
    rp.id,
    rp.tenant_id,
    rp.name,
    CASE
      WHEN rp.normalized_name = 'gt3' THEN '#2563eb'
      ELSE format(
        'hsl(%s %s%% %s%%)',
        ROUND(((rp.order_index - 1) * 137.508)::numeric % 360),
        68 + ((rp.order_index - 1) % 3) * 4,
        46 + ((rp.order_index - 1) % 2) * 6
      )
    END AS color
  FROM ranked_projects AS rp
),
project_label_candidates AS (
  SELECT
    t.id,
    COALESCE(
      (
        SELECT jsonb_agg(label)
        FROM jsonb_array_elements(COALESCE(t.labels, '[]'::jsonb)) AS label
        WHERE NOT (
          LOWER(COALESCE(label->>'text', '')) = ANY(COALESCE(tpn.project_names, ARRAY[]::text[]))
        )
      ),
      '[]'::jsonb
    ) ||
    CASE
      WHEN t.project_id IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(
        jsonb_build_object(
          'text', op.name,
          'color', op.color
        )
      )
    END AS next_labels
  FROM public.tasks AS t
  LEFT JOIN ordered_projects AS op
    ON op.id = t.project_id
  LEFT JOIN tenant_project_names AS tpn
    ON tpn.tenant_id = t.tenant_id
)
UPDATE public.tasks AS t
SET labels = plc.next_labels
FROM project_label_candidates AS plc
WHERE plc.id = t.id
  AND t.labels IS DISTINCT FROM plc.next_labels;

-- === MIGRATION: 20260413000001_create_ghl_webhook_ingestion.sql ===
-- GoHighLevel webhook ingestion
-- Stores raw inbound payloads from GHL with tenant isolation and a per-source token.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.hash_ghl_webhook_token(token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT encode(digest(token, 'sha256'), 'hex');
$$;

CREATE TABLE IF NOT EXISTS public.ghl_webhook_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'GHL',
  token_hash TEXT NOT NULL UNIQUE,
  location_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_received_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ghl_webhook_sources_tenant_id_idx
  ON public.ghl_webhook_sources(tenant_id);

CREATE INDEX IF NOT EXISTS ghl_webhook_sources_token_hash_idx
  ON public.ghl_webhook_sources(token_hash)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.ghl_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.ghl_webhook_sources(id) ON DELETE CASCADE,
  event_type TEXT,
  ghl_location_id TEXT,
  ghl_contact_id TEXT,
  ghl_opportunity_id TEXT,
  ghl_conversation_id TEXT,
  ghl_workflow_id TEXT,
  request_method TEXT NOT NULL DEFAULT 'POST',
  request_url TEXT,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  query_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  raw_body TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_status TEXT NOT NULL DEFAULT 'stored'
    CHECK (processing_status IN ('stored', 'processing', 'processed', 'failed', 'ignored')),
  processing_error TEXT
);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_tenant_id_idx
  ON public.ghl_webhook_events(tenant_id);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_source_id_idx
  ON public.ghl_webhook_events(source_id);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_received_at_idx
  ON public.ghl_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_event_type_idx
  ON public.ghl_webhook_events(event_type);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_ghl_contact_id_idx
  ON public.ghl_webhook_events(ghl_contact_id);

CREATE INDEX IF NOT EXISTS ghl_webhook_events_payload_gin_idx
  ON public.ghl_webhook_events USING GIN (payload);

ALTER TABLE public.ghl_webhook_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ghl_webhook_sources_select"
  ON public.ghl_webhook_sources FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "ghl_webhook_sources_insert"
  ON public.ghl_webhook_sources FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "ghl_webhook_sources_update"
  ON public.ghl_webhook_sources FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_admin())
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "ghl_webhook_sources_delete"
  ON public.ghl_webhook_sources FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_admin());

CREATE POLICY "ghl_webhook_events_select"
  ON public.ghl_webhook_events FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "ghl_webhook_events_update"
  ON public.ghl_webhook_events FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_admin())
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin());

CREATE OR REPLACE FUNCTION public.set_ghl_webhook_sources_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_ghl_webhook_sources_updated_at
  BEFORE UPDATE ON public.ghl_webhook_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ghl_webhook_sources_updated_at();

-- === MIGRATION: 20260413000002_member_visibility_by_position_area.sql ===
-- Migration: Member visibility by linked position or area (v7.9.6)
--
-- Members can read only projects/processes where their position OR area is linked.
-- Projects do not have a direct area/position column, so project linkage is inferred
-- from the positions/areas of employees attached through employee_projects.
-- Managers keep the previous creator/assigned-task exceptions.

ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.company_areas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subarea_id uuid REFERENCES public.subareas(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.process_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(process_id, position_id)
);

ALTER TABLE public.process_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "process_positions_manage_admin_manager" ON public.process_positions;
DROP POLICY IF EXISTS "process_positions_insert_admin_manager" ON public.process_positions;
DROP POLICY IF EXISTS "process_positions_update_admin_manager" ON public.process_positions;
DROP POLICY IF EXISTS "process_positions_delete_admin_manager" ON public.process_positions;

CREATE POLICY "process_positions_insert_admin_manager" ON public.process_positions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.processes p
      WHERE p.id = process_positions.process_id
        AND p.tenant_id = public.get_user_tenant_id()
        AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
    )
  );

CREATE POLICY "process_positions_update_admin_manager" ON public.process_positions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.processes p
      WHERE p.id = process_positions.process_id
        AND p.tenant_id = public.get_user_tenant_id()
        AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.processes p
      WHERE p.id = process_positions.process_id
        AND p.tenant_id = public.get_user_tenant_id()
        AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
      )
  );

CREATE POLICY "process_positions_delete_admin_manager" ON public.process_positions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.processes p
      WHERE p.id = process_positions.process_id
        AND p.tenant_id = public.get_user_tenant_id()
        AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
    )
  );

CREATE OR REPLACE FUNCTION public.user_has_project_assigned_task(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.employees e ON e.id = t.assignee_id
    WHERE t.project_id = p_project_id
      AND t.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND e.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_project_matches_position_or_area(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  WITH current_positions AS (
    SELECT
      ep.position_id,
      COALESCE(pos.area_id, current_sa.area_id) AS area_id
    FROM public.employee_positions ep
    JOIN public.employees e ON e.id = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
    WHERE e.user_id = auth.uid()
      AND e.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
  ),
  project_positions AS (
    SELECT
      ep.position_id,
      COALESCE(pos.area_id, project_sa.area_id) AS area_id
    FROM public.employee_projects epr
    JOIN public.employees e ON e.id = epr.employee_id
    JOIN public.employee_positions ep ON ep.employee_id = e.id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas project_sa ON project_sa.id = pos.subarea_id
    WHERE epr.project_id = p_project_id
      AND epr.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
  )
  SELECT EXISTS (
    SELECT 1
    FROM current_positions current_pos
    JOIN project_positions project_pos
      ON project_pos.position_id = current_pos.position_id
      OR (
        project_pos.area_id IS NOT NULL
        AND current_pos.area_id IS NOT NULL
        AND project_pos.area_id = current_pos.area_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_project(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_has_project_assigned_task(p.id)
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
        OR (
          public.has_role(auth.uid(), 'member')
          AND public.user_project_matches_position_or_area(p.id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_process_matches_position_or_area(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  WITH current_positions AS (
    SELECT
      ep.position_id,
      COALESCE(pos.area_id, current_sa.area_id) AS area_id
    FROM public.employee_positions ep
    JOIN public.employees e ON e.id = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
    WHERE e.user_id = auth.uid()
      AND e.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
  ),
  process_position_scope AS (
    SELECT
      pp.position_id,
      COALESCE(pos.area_id, process_pos_sa.area_id) AS area_id
    FROM public.process_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    LEFT JOIN public.subareas process_pos_sa ON process_pos_sa.id = pos.subarea_id
    WHERE pp.process_id = p_process_id
      AND pos.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      p.position_id,
      COALESCE(pos.area_id, process_primary_sa.area_id) AS area_id
    FROM public.processes p
    JOIN public.positions pos ON pos.id = p.position_id
    LEFT JOIN public.subareas process_primary_sa ON process_primary_sa.id = pos.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
      AND p.position_id IS NOT NULL
  ),
  process_area_scope AS (
    SELECT
      COALESCE(p.area_id, process_direct_sa.area_id) AS area_id
    FROM public.processes p
    LEFT JOIN public.subareas process_direct_sa ON process_direct_sa.id = p.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      COALESCE(pa.area_id, process_area_sa.area_id) AS area_id
    FROM public.process_areas pa
    LEFT JOIN public.subareas process_area_sa ON process_area_sa.id = pa.subarea_id
    JOIN public.processes p ON p.id = pa.process_id
    WHERE pa.process_id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_position_scope process_pos
        ON process_pos.position_id = current_pos.position_id
        OR (
          process_pos.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_pos.area_id = current_pos.area_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_area_scope process_area
        ON process_area.area_id IS NOT NULL
        AND current_pos.area_id IS NOT NULL
        AND process_area.area_id = current_pos.area_id
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_process_access(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT public.user_process_matches_position_or_area(p_process_id);
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_process(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.processes p
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_process_matches_position_or_area(p.id)
          )
        )
        OR (
          public.has_role(auth.uid(), 'member')
          AND public.user_process_matches_position_or_area(p.id)
        )
      )
  );
$$;

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.user_can_read_project(id));

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR (
        tasks.project_id IS NOT NULL
        AND public.user_can_read_project(tasks.project_id)
      )
      OR (
        public.has_role(auth.uid(), 'manager')
        AND EXISTS (
          SELECT 1
          FROM public.employees e
          WHERE e.id = tasks.assignee_id
            AND e.tenant_id = public.get_user_tenant_id()
            AND e.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "processes_select" ON public.processes;

CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated
  USING (public.user_can_read_process(id));

DROP POLICY IF EXISTS "steps_select" ON public.process_steps;

CREATE POLICY "steps_select" ON public.process_steps
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.user_can_read_process(process_id)
  );

DROP POLICY IF EXISTS "process_positions_select" ON public.process_positions;

CREATE POLICY "process_positions_select" ON public.process_positions
  FOR SELECT TO authenticated
  USING (public.user_can_read_process(process_id));

DROP POLICY IF EXISTS "tenant_select_process_areas" ON public.process_areas;

CREATE POLICY "tenant_select_process_areas" ON public.process_areas
  FOR SELECT TO authenticated
  USING (public.user_can_read_process(process_id));

-- === MIGRATION: 20260413000003_create_agent_api_keys.sql ===
-- Migration: agent_api_keys
-- API Keys estáticas para integração com agentes externos (OpenClaw, etc.)
-- Mesmo padrão de segurança de ghl_webhook_sources: SHA-256 hash, nunca o token em plain text.

CREATE TABLE IF NOT EXISTS agent_api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash     TEXT        NOT NULL UNIQUE, -- SHA-256 do token real (token nunca é armazenado)
  name         TEXT        NOT NULL DEFAULT 'OpenClaw',
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_api_keys_tenant    ON agent_api_keys(tenant_id);
CREATE INDEX idx_agent_api_keys_key_hash  ON agent_api_keys(key_hash) WHERE is_active = true;

ALTER TABLE agent_api_keys ENABLE ROW LEVEL SECURITY;

-- Apenas admin do mesmo tenant pode ver as chaves
CREATE POLICY "agent_api_keys_select" ON agent_api_keys
  FOR SELECT USING (
    tenant_id = get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Apenas admin do mesmo tenant pode criar chaves
CREATE POLICY "agent_api_keys_insert" ON agent_api_keys
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Apenas admin do mesmo tenant pode revogar/excluir
CREATE POLICY "agent_api_keys_delete" ON agent_api_keys
  FOR DELETE USING (
    tenant_id = get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- === MIGRATION: 20260413000004_fix_projects_member_visibility.sql ===
-- Fix: member só vê projetos da sua área, admin vê tudo
--
-- Problema anterior: is_admin() retornava false quando o admin não tinha
-- row em user_roles, bloqueando todos os projetos.
--
-- Solução: política em 3 camadas:
--   1. Sem role explícita → vê tudo (cobre admin legacy sem row em user_roles)
--   2. Role admin → vê tudo (cobre admin com row em user_roles)
--   3. Manager/Member → user_can_read_project() (posição/área, já existe no banco)

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Usuário sem role explícita (admin legacy) vê tudo
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      -- Admin com role em user_roles vê tudo
      OR public.is_admin()
      -- Manager e member: visibilidade restrita por posição/área
      OR public.user_can_read_project(id)
    )
  );

-- === MIGRATION: 20260413000005_fix_tasks_select_rls.sql ===
-- Fix: tasks_select com mesmo padrão 3 camadas de projects_select
-- Admin legacy (sem role), admin com role, e manager/member restrito por projeto

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Admin legacy (sem row em user_roles) vê tudo
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      -- Admin com role vê tudo
      OR public.is_admin()
      -- Tarefas de projetos visíveis ao usuário
      OR (
        tasks.project_id IS NOT NULL
        AND public.user_can_read_project(tasks.project_id)
      )
      -- Manager vê tarefas assignadas a ele
      OR (
        public.has_role(auth.uid(), 'manager')
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = tasks.assignee_id
            AND e.tenant_id = public.get_user_tenant_id()
            AND e.user_id = auth.uid()
        )
      )
    )
  );

-- === MIGRATION: 20260413000006_fix_all_select_rls_admin_legacy.sql ===
-- Fix global: todas as políticas SELECT que usavam is_admin() puro
-- agora incluem fallback para admin sem row em user_roles.
--
-- Padrão aplicado em cada política SELECT:
--   NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid())  → admin legacy
--   OR is_admin()                                                       → admin com role
--   OR <condição original do role>                                      → manager/member

-- ──────────────────────────────────────────────
-- PROJECTS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR public.user_can_read_project(id)
    )
  );

-- ──────────────────────────────────────────────
-- TASKS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR (
        tasks.project_id IS NOT NULL
        AND public.user_can_read_project(tasks.project_id)
      )
      OR (
        public.has_role(auth.uid(), 'manager')
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = tasks.assignee_id
            AND e.tenant_id = public.get_user_tenant_id()
            AND e.user_id = auth.uid()
        )
      )
    )
  );

-- ──────────────────────────────────────────────
-- PROCESSES
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "processes_select" ON public.processes;
CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR public.user_can_read_process(id)
    )
  );

-- ──────────────────────────────────────────────
-- PROCESS STEPS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "steps_select" ON public.process_steps;
CREATE POLICY "steps_select" ON public.process_steps
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR public.user_can_read_process(process_id)
    )
  );

-- ──────────────────────────────────────────────
-- PROCESS POSITIONS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "process_positions_select" ON public.process_positions;
CREATE POLICY "process_positions_select" ON public.process_positions
  FOR SELECT TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
    OR public.is_admin()
    OR public.user_can_read_process(process_id)
  );

-- ──────────────────────────────────────────────
-- PROCESS AREAS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_select_process_areas" ON public.process_areas;
CREATE POLICY "tenant_select_process_areas" ON public.process_areas
  FOR SELECT TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
    OR public.is_admin()
    OR public.user_can_read_process(process_id)
  );

-- ──────────────────────────────────────────────
-- MEETINGS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR meetings.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.meeting_attendees ma
        JOIN public.employees e ON e.id = ma.employee_id
        WHERE ma.meeting_id = meetings.id AND e.user_id = auth.uid()
      )
    )
  );

-- ──────────────────────────────────────────────
-- MEETING ATTENDEES
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "meeting_attendees_select" ON public.meeting_attendees;
CREATE POLICY "meeting_attendees_select" ON public.meeting_attendees
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = meeting_attendees.employee_id AND e.user_id = auth.uid()
      )
      OR public.get_meeting_created_by(meeting_attendees.meeting_id) = auth.uid()
    )
  );

-- === MIGRATION: 20260413000007_fix_member_project_visibility_direct_assignment.sql ===
-- Fix: visibilidade de member por subárea (não por área geral)
--
-- Problema anterior: user_project_matches_position_or_area comparava por area_id
-- (nível de área, ex: "Aquisição"), que é muito amplo — todos os projetos com
-- qualquer membro em "Aquisição" apareciam para qualquer member da área.
--
-- Correção: comparar por subarea_id (ex: "Vendas") — mais específico.
-- Member da subárea "Vendas" só vê projetos com membros em "Vendas".
--
-- user_can_read_project também atualizado com fallback admin legacy (NOT EXISTS).

CREATE OR REPLACE FUNCTION public.user_project_matches_position_or_area(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  WITH current_positions AS (
    SELECT
      ep.position_id,
      pos.subarea_id
    FROM public.employee_positions ep
    JOIN public.employees e ON e.id = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    WHERE e.user_id = auth.uid()
      AND e.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
  ),
  project_positions AS (
    SELECT
      ep.position_id,
      pos.subarea_id
    FROM public.employee_projects epr
    JOIN public.employees e ON e.id = epr.employee_id
    JOIN public.employee_positions ep ON ep.employee_id = e.id
    JOIN public.positions pos ON pos.id = ep.position_id
    WHERE epr.project_id = p_project_id
      AND epr.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
  )
  SELECT EXISTS (
    SELECT 1
    FROM current_positions cur
    JOIN project_positions proj
      ON proj.position_id = cur.position_id
      OR (
        proj.subarea_id IS NOT NULL
        AND cur.subarea_id IS NOT NULL
        AND proj.subarea_id = cur.subarea_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_project(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        -- Admin legacy (sem row em user_roles) vê tudo
        NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
        -- Admin com role vê tudo
        OR public.is_admin()
        -- Manager: criou, tem tarefa atribuída, ou está na subárea/posição
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_has_project_assigned_task(p.id)
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
        -- Member: vê projetos com membros na mesma subárea ou posição
        OR (
          public.has_role(auth.uid(), 'member')
          AND public.user_project_matches_position_or_area(p.id)
        )
      )
  );
$$;

-- === MIGRATION: 20260413000008_task_comments_update_policy.sql ===
-- Permite que o autor edite o conteúdo do próprio comentário
CREATE POLICY "task_comments_update_own"
  ON public.task_comments
  FOR UPDATE
  USING (
    tenant_id = get_user_tenant_id()
    AND author_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND author_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- === MIGRATION: 20260413000010_fix_projects_select_rls.sql ===
-- Fix: restaura projects_select para permitir todos os membros do tenant
-- O RLS anterior (user_can_read_project) bloqueava admin quando não há
-- row em user_roles, pois is_admin() retornava false.
-- Voltamos ao comportamento original: todos no tenant veem todos os projetos.

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- === MIGRATION: 20260414000001_fix_profile_tenant_mismatch.sql ===
-- Fix: corrige profiles.tenant_id para usuários cujo perfil aponta para o
-- tenant errado (tenant gerado automaticamente pelo trigger antigo).
--
-- Causa: antes da migração 20260221004356, o trigger handle_new_user ignorava
-- invited_tenant_id e sempre criava um novo tenant para qualquer usuário.
-- Resultado: profile.tenant_id != employees.tenant_id → get_user_tenant_id()
-- retornava um UUID errado → o RLS bloqueava todos os projetos e tarefas.
--
-- Correção: para qualquer usuário cujo profile.tenant_id diverge do
-- employees.tenant_id, alinhamos o profile ao tenant correto (o do employee,
-- definido pelo admin que criou o usuário).

-- 1. Diagnóstico: exibe os usuários afetados antes de corrigir
DO $$
DECLARE
  r RECORD;
  affected_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT
      p.user_id,
      p.full_name,
      p.tenant_id   AS profile_tenant,
      e.tenant_id   AS employee_tenant
    FROM public.profiles p
    JOIN public.employees e ON e.user_id = p.user_id
    WHERE e.tenant_id != p.tenant_id
  LOOP
    RAISE NOTICE 'MISMATCH: user=% (%) | profile_tenant=% | employee_tenant=%',
      r.user_id, r.full_name, r.profile_tenant, r.employee_tenant;
    affected_count := affected_count + 1;
  END LOOP;

  IF affected_count = 0 THEN
    RAISE NOTICE 'Nenhum mismatch encontrado entre profiles e employees.';
  ELSE
    RAISE NOTICE 'Total de usuários com mismatch: %', affected_count;
  END IF;
END $$;

-- 2. Correção: alinha profile.tenant_id com employees.tenant_id
UPDATE public.profiles p
SET tenant_id = e.tenant_id
FROM public.employees e
WHERE e.user_id = p.user_id
  AND e.tenant_id != p.tenant_id;

-- 3. Diagnóstico pós-correção: exibe quantos foram corrigidos
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.profiles p
  JOIN public.employees e ON e.user_id = p.user_id
  WHERE e.tenant_id != p.tenant_id;

  IF remaining = 0 THEN
    RAISE NOTICE 'Correção aplicada com sucesso. Nenhum mismatch restante.';
  ELSE
    RAISE NOTICE 'ATENÇÃO: ainda existem % mismatch(es) após a correção.', remaining;
  END IF;
END $$;

-- 4. Tenants órfãos criados erroneamente pelo trigger antigo
-- (sem employees, sem projetos, sem nada — criados apenas como efeito colateral)
-- NÃO removemos automaticamente para evitar perda acidental de dados.
-- Para remover manualmente, use:
--   DELETE FROM public.tenants t
--   WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.tenant_id = t.id);

-- === MIGRATION: 20260414000002_diagnostico_gildario.sql ===
-- Diagnóstico: estado dos dados de todos os usuários (para identificar gildásio)
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== DIAGNÓSTICO DE USUÁRIOS ===';
  RAISE NOTICE 'nome | user_id | profile_tenant | employee_tenant | role | status_employee | tem_profile | tem_role';

  FOR r IN
    SELECT
      COALESCE(p.full_name, '[sem perfil]') AS nome,
      COALESCE(e.user_id::text, p.user_id::text, '[?]') AS user_id,
      COALESCE(p.tenant_id::text, '[NULL]') AS profile_tenant,
      COALESCE(e.tenant_id::text, '[sem employee]') AS employee_tenant,
      COALESCE(ur.role::text, '[sem role]') AS role,
      COALESCE(e.status::text, '[sem employee]') AS employee_status,
      (p.user_id IS NOT NULL) AS tem_profile,
      (ur.user_id IS NOT NULL) AS tem_role
    FROM (
      SELECT DISTINCT user_id FROM public.employees
      UNION
      SELECT DISTINCT user_id FROM public.profiles
    ) u
    LEFT JOIN public.profiles  p  ON p.user_id  = u.user_id
    LEFT JOIN public.employees e  ON e.user_id  = u.user_id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.user_id
    ORDER BY COALESCE(p.full_name, '')
  LOOP
    RAISE NOTICE '% | % | % | % | % | % | % | %',
      r.nome, r.user_id, r.profile_tenant, r.employee_tenant,
      r.role, r.employee_status, r.tem_profile, r.tem_role;
  END LOOP;

  RAISE NOTICE '=== FIM DO DIAGNÓSTICO ===';
END $$;

-- === MIGRATION: 20260414000003_fix_gildasio_role.sql ===
-- Fix: corrige a role do Gildasio Brito de 'member' para 'admin'
-- Causa: na criação do usuário via create-employee, o UPDATE de role falhou
-- silenciosamente ou o usuário foi recriado sem a role correta.

UPDATE public.user_roles
SET role = 'admin'
WHERE user_id = '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';

-- Confirmação
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT role INTO r FROM public.user_roles WHERE user_id = '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';
  IF r.role = 'admin' THEN
    RAISE NOTICE 'OK: Gildasio Brito agora tem role = admin';
  ELSE
    RAISE NOTICE 'ERRO: role atual = %, esperado admin', r.role;
  END IF;
END $$;

-- === MIGRATION: 20260414000004_revert_gildasio_to_member.sql ===
-- Reverte role do Gildasio Brito para member
-- Ele deve ser member e ver apenas suas tarefas e projetos diretos
-- (a visibilidade correta é garantida pela migration 20260414000005)

UPDATE public.user_roles
SET role = 'member'
WHERE user_id = '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';

DO $$
DECLARE r RECORD;
BEGIN
  SELECT role INTO r FROM public.user_roles WHERE user_id = '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';
  RAISE NOTICE 'Gildasio Brito: role = %', r.role;
END $$;

-- === MIGRATION: 20260414000005_fix_member_direct_visibility.sql ===
-- Fix: member vê projetos onde é membro direto E tarefas atribuídas a ele
--
-- Problema anterior:
--   - user_can_read_project só cobria member via posição/subárea
--     (user_project_matches_position_or_area), ignorando employee_projects
--   - tasks_select só verificava assignee_id para manager, não para member
--
-- Correção:
--   1. user_can_read_project: member vê projeto se está em employee_projects
--      OU se coincide posição/subárea (comportamento anterior mantido)
--   2. tasks_select: member vê tarefa se é assignee_id OU está em task_assignees

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Função user_can_read_project — adiciona membership direto para member
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_can_read_project(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        -- Admin legacy (sem row em user_roles) vê tudo
        NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
        -- Admin com role vê tudo
        OR public.is_admin()
        -- Manager: criou, tem tarefa atribuída, ou está na subárea/posição
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_has_project_assigned_task(p.id)
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
        -- Member: membro direto do projeto OU coincide posição/subárea
        OR (
          public.has_role(auth.uid(), 'member')
          AND (
            EXISTS (
              SELECT 1
              FROM public.employee_projects ep
              JOIN public.employees e ON e.id = ep.employee_id
              WHERE ep.project_id = p.id
                AND e.user_id = auth.uid()
                AND ep.tenant_id = public.get_user_tenant_id()
            )
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
      )
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Política tasks_select — adiciona assignee check para member
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Admin legacy vê tudo
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      -- Admin com role vê tudo
      OR public.is_admin()
      -- Qualquer role: tarefa de projeto visível
      OR (
        tasks.project_id IS NOT NULL
        AND public.user_can_read_project(tasks.project_id)
      )
      -- Manager: vê tarefas atribuídas a ele (assignee_id legado)
      OR (
        public.has_role(auth.uid(), 'manager')
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = tasks.assignee_id
            AND e.tenant_id = public.get_user_tenant_id()
            AND e.user_id = auth.uid()
        )
      )
      -- Member: vê tarefas atribuídas diretamente a ele
      OR (
        public.has_role(auth.uid(), 'member')
        AND (
          -- assignee_id legado (coluna tasks.assignee_id)
          EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = tasks.assignee_id
              AND e.tenant_id = public.get_user_tenant_id()
              AND e.user_id = auth.uid()
          )
          -- múltiplos assignees (tabela task_assignees)
          OR EXISTS (
            SELECT 1 FROM public.task_assignees ta
            JOIN public.employees e ON e.id = ta.employee_id
            WHERE ta.task_id = tasks.id
              AND e.user_id = auth.uid()
              AND ta.tenant_id = public.get_user_tenant_id()
          )
        )
      )
    )
  );

-- === MIGRATION: 20260414000006_fix_member_owner_visibility.sql ===
-- Fix: member vê projetos onde é proprietário (created_by)
--
-- Complemento da migration 20260414000005:
-- além de membro direto (employee_projects) e posição/subárea,
-- o member agora também vê projetos que ele mesmo criou.

CREATE OR REPLACE FUNCTION public.user_can_read_project(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        -- Admin legacy (sem row em user_roles) vê tudo
        NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
        -- Admin com role vê tudo
        OR public.is_admin()
        -- Manager: criou, tem tarefa atribuída, ou está na subárea/posição
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_has_project_assigned_task(p.id)
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
        -- Member: criou o projeto, é membro direto, ou coincide posição/subárea
        OR (
          public.has_role(auth.uid(), 'member')
          AND (
            p.created_by = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.employee_projects ep
              JOIN public.employees e ON e.id = ep.employee_id
              WHERE ep.project_id = p.id
                AND e.user_id = auth.uid()
                AND ep.tenant_id = public.get_user_tenant_id()
            )
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
      )
  );
$$;

-- === MIGRATION: 20260414000007_diagnostico_gildasio_projetos.sql ===
-- Diagnóstico: por que gildásio não vê projetos
DO $$
DECLARE
  r RECORD;
  gildasio_user_id UUID := '4b2087d1-62bd-410a-a8c4-c5c78adaf6d5';
  gildasio_employee_id UUID;
  gildasio_tenant_id UUID;
BEGIN
  -- 1. Dados básicos do gildásio
  SELECT e.id, e.tenant_id INTO gildasio_employee_id, gildasio_tenant_id
  FROM public.employees e WHERE e.user_id = gildasio_user_id LIMIT 1;

  RAISE NOTICE '=== GILDÁSIO ===';
  RAISE NOTICE 'user_id: %', gildasio_user_id;
  RAISE NOTICE 'employee_id: %', gildasio_employee_id;
  RAISE NOTICE 'tenant_id: %', gildasio_tenant_id;

  -- 2. Role atual
  FOR r IN SELECT role FROM public.user_roles WHERE user_id = gildasio_user_id LOOP
    RAISE NOTICE 'role: %', r.role;
  END LOOP;

  -- 3. Projetos do tenant
  RAISE NOTICE '';
  RAISE NOTICE '=== PROJETOS DO TENANT ===';
  FOR r IN
    SELECT id, name, created_by, tenant_id
    FROM public.projects
    WHERE tenant_id = gildasio_tenant_id
  LOOP
    RAISE NOTICE 'projeto: % | nome: % | created_by: % | criado_por_gildasio: %',
      r.id, r.name, r.created_by, (r.created_by = gildasio_user_id);
  END LOOP;

  -- 4. employee_projects do gildásio
  RAISE NOTICE '';
  RAISE NOTICE '=== EMPLOYEE_PROJECTS DE GILDÁSIO ===';
  FOR r IN
    SELECT ep.project_id, ep.role_in_project, p.name AS project_name
    FROM public.employee_projects ep
    JOIN public.projects p ON p.id = ep.project_id
    WHERE ep.employee_id = gildasio_employee_id
  LOOP
    RAISE NOTICE 'project_id: % | projeto: % | role: %',
      r.project_id, r.project_name, r.role_in_project;
  END LOOP;
  IF NOT FOUND THEN
    RAISE NOTICE '[nenhuma entrada em employee_projects para gildásio]';
  END IF;

  -- 5. Posições do gildásio
  RAISE NOTICE '';
  RAISE NOTICE '=== POSIÇÕES DE GILDÁSIO ===';
  FOR r IN
    SELECT ep.position_id, pos.title
    FROM public.employee_positions ep
    JOIN public.positions pos ON pos.id = ep.position_id
    WHERE ep.employee_id = gildasio_employee_id
  LOOP
    RAISE NOTICE 'position_id: % | título: %', r.position_id, r.title;
  END LOOP;
  IF NOT FOUND THEN
    RAISE NOTICE '[nenhuma posição atribuída a gildásio]';
  END IF;

  -- 6. Simula user_can_read_project para cada projeto
  RAISE NOTICE '';
  RAISE NOTICE '=== SIMULAÇÃO user_can_read_project ===';
  FOR r IN
    SELECT id, name, created_by FROM public.projects WHERE tenant_id = gildasio_tenant_id
  LOOP
    RAISE NOTICE 'projeto "%": created_by_match=%, em_employee_projects=%',
      r.name,
      (r.created_by = gildasio_user_id),
      EXISTS (
        SELECT 1 FROM public.employee_projects ep2
        JOIN public.employees e2 ON e2.id = ep2.employee_id
        WHERE ep2.project_id = r.id
          AND e2.user_id = gildasio_user_id
          AND ep2.tenant_id = gildasio_tenant_id
      );
  END LOOP;

END $$;

-- === MIGRATION: 20260414000008_diagnostico_posicao_area.sql ===
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

-- === MIGRATION: 20260414000009_fix_member_sees_projects_with_tasks.sql ===
-- Fix: member vê projetos que têm tarefas atribuídas a ele
--
-- Regra final para member:
--   1. Criou o projeto (created_by)
--   2. Foi adicionado como membro direto (employee_projects)
--   3. Tem tarefa atribuída no projeto (assignee_id ou task_assignees)
--   4. Coincide posição/subárea com membros do projeto (comportamento anterior)

CREATE OR REPLACE FUNCTION public.user_can_read_project(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        -- Admin legacy (sem row em user_roles) vê tudo
        NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
        -- Admin com role vê tudo
        OR public.is_admin()
        -- Manager: criou, tem tarefa atribuída, ou está na subárea/posição
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_has_project_assigned_task(p.id)
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
        -- Member: criou, é membro direto, tem tarefa atribuída, ou coincide área
        OR (
          public.has_role(auth.uid(), 'member')
          AND (
            -- 1. Criou o projeto
            p.created_by = auth.uid()
            -- 2. Adicionado como membro direto
            OR EXISTS (
              SELECT 1
              FROM public.employee_projects ep
              JOIN public.employees e ON e.id = ep.employee_id
              WHERE ep.project_id = p.id
                AND e.user_id = auth.uid()
                AND ep.tenant_id = public.get_user_tenant_id()
            )
            -- 3a. Tem tarefa atribuída via assignee_id (legado)
            OR public.user_has_project_assigned_task(p.id)
            -- 3b. Tem tarefa atribuída via task_assignees (múltiplos assignees)
            OR EXISTS (
              SELECT 1
              FROM public.tasks t
              JOIN public.task_assignees ta ON ta.task_id = t.id
              JOIN public.employees e ON e.id = ta.employee_id
              WHERE t.project_id = p.id
                AND t.tenant_id = public.get_user_tenant_id()
                AND e.user_id = auth.uid()
                AND ta.tenant_id = public.get_user_tenant_id()
            )
            -- 4. Coincide posição/subárea com membros do projeto
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
      )
  );
$$;

-- === MIGRATION: 20260414010000_announcement_comments_reactions.sql ===
-- ============================================================
-- Comentários e Reações em Comunicados (Feed social)
-- ============================================================

-- TABELA: announcement_comments
CREATE TABLE IF NOT EXISTS public.announcement_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
  content     TEXT NOT NULL CHECK (length(trim(content)) > 0),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ann_comments_ann    ON public.announcement_comments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_ann_comments_tenant ON public.announcement_comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ann_comments_author ON public.announcement_comments(author_id);

ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_comments_select" ON public.announcement_comments
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ann_comments_insert" ON public.announcement_comments
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ann_comments_update" ON public.announcement_comments
  FOR UPDATE USING (
    tenant_id = public.get_user_tenant_id() AND (
      author_id IN (
        SELECT id FROM public.employees
        WHERE user_id = auth.uid() AND tenant_id = public.get_user_tenant_id()
      )
      OR public.is_admin()
    )
  );

CREATE POLICY "ann_comments_delete" ON public.announcement_comments
  FOR DELETE USING (
    tenant_id = public.get_user_tenant_id() AND (
      author_id IN (
        SELECT id FROM public.employees
        WHERE user_id = auth.uid() AND tenant_id = public.get_user_tenant_id()
      )
      OR public.is_admin()
      OR public.has_role(auth.uid(), 'manager')
    )
  );

-- ============================================================

-- TABELA: announcement_reactions
CREATE TABLE IF NOT EXISTS public.announcement_reactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),
  reaction        TEXT NOT NULL DEFAULT 'like',
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(announcement_id, employee_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_ann_reactions_ann    ON public.announcement_reactions(announcement_id);
CREATE INDEX IF NOT EXISTS idx_ann_reactions_tenant ON public.announcement_reactions(tenant_id);

ALTER TABLE public.announcement_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_reactions_select" ON public.announcement_reactions
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ann_reactions_insert" ON public.announcement_reactions
  FOR INSERT WITH CHECK (
    tenant_id = public.get_user_tenant_id() AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE user_id = auth.uid() AND tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "ann_reactions_delete" ON public.announcement_reactions
  FOR DELETE USING (
    tenant_id = public.get_user_tenant_id() AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE user_id = auth.uid() AND tenant_id = public.get_user_tenant_id()
    )
  );

-- === MIGRATION: 20260414020000_task_recurrence_weekdays_specific_days.sql ===
-- ============================================================
-- Adiciona frequências 'weekdays' (dias úteis) e 'specific_days'
-- (dias específicos da semana) à tabela task_recurrence
-- ============================================================

-- 1. Remover o CHECK constraint existente e adicionar versão estendida
ALTER TABLE public.task_recurrence
  DROP CONSTRAINT IF EXISTS task_recurrence_frequency_check;

ALTER TABLE public.task_recurrence
  ADD CONSTRAINT task_recurrence_frequency_check
  CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom', 'weekdays', 'specific_days'));

-- 2. Substituir a função process_task_recurrences() com suporte às novas frequências
CREATE OR REPLACE FUNCTION public.process_task_recurrences()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  new_task_id UUID;
  tasks_created INT := 0;
  recurrences_deactivated INT := 0;
  next_date DATE;
BEGIN
  FOR rec IN
    SELECT
      tr.*,
      t.title,
      t.description,
      t.project_id,
      t.assignee_id,
      t.created_by,
      t.priority,
      t.checklist_items,
      t.labels
    FROM task_recurrence tr
    JOIN tasks t ON t.id = tr.task_id
    WHERE tr.is_active = true
      AND tr.next_occurrence <= CURRENT_DATE
  LOOP
    -- Criar nova tarefa copiando da original
    INSERT INTO tasks (
      tenant_id, project_id, assignee_id, created_by,
      title, description, status, priority,
      due_date, checklist_items, labels
    ) VALUES (
      rec.tenant_id,
      rec.project_id,
      rec.assignee_id,
      rec.created_by,
      rec.title,
      rec.description,
      'todo',
      rec.priority,
      rec.next_occurrence::timestamptz,
      CASE
        WHEN rec.checklist_items IS NOT NULL AND jsonb_array_length(rec.checklist_items) > 0
        THEN (
          SELECT jsonb_agg(
            jsonb_set(item, '{checked}', 'false'::jsonb)
          )
          FROM jsonb_array_elements(rec.checklist_items) AS item
        )
        ELSE '[]'::jsonb
      END,
      rec.labels
    )
    RETURNING id INTO new_task_id;

    tasks_created := tasks_created + 1;

    -- Calcular próxima ocorrência de acordo com a frequência
    next_date := CASE rec.frequency
      WHEN 'daily' THEN
        rec.next_occurrence + INTERVAL '1 day'

      WHEN 'weekly' THEN
        rec.next_occurrence + INTERVAL '7 days'

      WHEN 'biweekly' THEN
        rec.next_occurrence + INTERVAL '14 days'

      WHEN 'monthly' THEN
        rec.next_occurrence + INTERVAL '1 month'

      WHEN 'custom' THEN
        rec.next_occurrence + (COALESCE(rec.interval_days, 7) || ' days')::INTERVAL

      -- Apenas dias úteis (seg-sex): avança para o próximo dia que não seja sábado ou domingo
      WHEN 'weekdays' THEN (
        SELECT d::DATE
        FROM generate_series(
          rec.next_occurrence + INTERVAL '1 day',
          rec.next_occurrence + INTERVAL '8 days',
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
        ORDER BY d
        LIMIT 1
      )

      -- Dias específicos: avança para o próximo dia da semana que esteja em days_of_week[]
      -- EXTRACT(DOW): 0=Dom, 1=Seg, ..., 6=Sáb
      WHEN 'specific_days' THEN (
        SELECT d::DATE
        FROM generate_series(
          rec.next_occurrence + INTERVAL '1 day',
          rec.next_occurrence + INTERVAL '8 days',
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(DOW FROM d)::INT = ANY(COALESCE(rec.days_of_week, ARRAY[1,2,3,4,5]))
        ORDER BY d
        LIMIT 1
      )

      ELSE rec.next_occurrence + INTERVAL '7 days'
    END;

    -- Desativar se passou da data limite, senão avançar
    IF rec.end_date IS NOT NULL AND next_date > rec.end_date THEN
      UPDATE task_recurrence SET is_active = false WHERE id = rec.id;
      recurrences_deactivated := recurrences_deactivated + 1;
    ELSE
      UPDATE task_recurrence SET next_occurrence = next_date WHERE id = rec.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tasks_created', tasks_created,
    'recurrences_deactivated', recurrences_deactivated,
    'processed_at', now()
  );
END;
$$;

-- === MIGRATION: 20260414030000_member_strict_task_visibility.sql ===
-- ============================================================
-- Member: visibilidade estrita por tarefas atribuídas
--
-- ANTES: member via "user_can_read_project" via posição/subárea ou
--        membro direto → via projeto visível → via todas tarefas do projeto
--
-- DEPOIS:
--   tasks   → member vê APENAS tarefas onde é assignee (assignee_id ou task_assignees)
--   projects → member vê APENAS projetos onde tem pelo menos 1 tarefa atribuída
-- ============================================================

-- ── TAREFAS ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Admin legacy: sem row em user_roles → vê tudo do tenant
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())

      -- Admin vê tudo
      OR public.is_admin()

      -- Manager: vê tarefas de projetos visíveis OU tarefas atribuídas a ele
      OR (
        public.has_role(auth.uid(), 'manager')
        AND (
          (tasks.project_id IS NOT NULL AND public.user_can_read_project(tasks.project_id))
          OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = tasks.assignee_id
              AND e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.task_assignees ta
            JOIN public.employees e ON e.id = ta.employee_id
            WHERE ta.task_id = tasks.id
              AND e.user_id = auth.uid()
              AND ta.tenant_id = public.get_user_tenant_id()
          )
        )
      )

      -- Member: vê APENAS tarefas onde é responsável (assignee_id ou task_assignees)
      OR (
        public.has_role(auth.uid(), 'member')
        AND (
          EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = tasks.assignee_id
              AND e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.task_assignees ta
            JOIN public.employees e ON e.id = ta.employee_id
            WHERE ta.task_id = tasks.id
              AND e.user_id = auth.uid()
              AND ta.tenant_id = public.get_user_tenant_id()
          )
        )
      )
    )
  );

-- ── PROJETOS ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Admin legacy: sem row em user_roles → vê tudo do tenant
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())

      -- Admin vê tudo
      OR public.is_admin()

      -- Manager: usa lógica existente (criou, tem tarefa, posição/subárea)
      OR (
        public.has_role(auth.uid(), 'manager')
        AND public.user_can_read_project(id)
      )

      -- Member: vê APENAS projetos onde tem pelo menos 1 tarefa atribuída
      OR (
        public.has_role(auth.uid(), 'member')
        AND (
          EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.employees e ON e.id = t.assignee_id
            WHERE t.project_id = projects.id
              AND e.user_id = auth.uid()
              AND t.tenant_id = public.get_user_tenant_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.task_assignees ta ON ta.task_id = t.id
            JOIN public.employees e ON e.id = ta.employee_id
            WHERE t.project_id = projects.id
              AND e.user_id = auth.uid()
              AND t.tenant_id = public.get_user_tenant_id()
          )
        )
      )
    )
  );

-- === MIGRATION: 20260414040000_feed_posts.sql ===
-- ============================================================
-- Feed social — posts, reações e comentários
--
-- Separado dos comunicados (announcements): qualquer colaborador
-- pode postar no feed, enquanto comunicados são criados por admin/manager.
-- ============================================================

-- ── POSTS ────────────────────────────────────────────────────

CREATE TABLE public.feed_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  content    text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_posts_select" ON public.feed_posts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "feed_posts_insert" ON public.feed_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = feed_posts.employee_id
        AND e.user_id = auth.uid()
        AND e.tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "feed_posts_update" ON public.feed_posts
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = feed_posts.employee_id
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "feed_posts_delete" ON public.feed_posts
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager')
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = feed_posts.employee_id AND e.user_id = auth.uid()
      )
    )
  );

-- ── REAÇÕES ──────────────────────────────────────────────────

CREATE TABLE public.feed_reactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feed_post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reaction     text NOT NULL DEFAULT 'like',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_post_id, employee_id, reaction)
);

ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_reactions_select" ON public.feed_reactions
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "feed_reactions_insert" ON public.feed_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = feed_reactions.employee_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "feed_reactions_delete" ON public.feed_reactions
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = feed_reactions.employee_id AND e.user_id = auth.uid()
    )
  );

-- ── COMENTÁRIOS ──────────────────────────────────────────────

CREATE TABLE public.feed_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feed_post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  content      text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_comments_select" ON public.feed_comments
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "feed_comments_insert" ON public.feed_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = feed_comments.employee_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "feed_comments_delete" ON public.feed_comments
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager')
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = feed_comments.employee_id AND e.user_id = auth.uid()
      )
    )
  );

-- === MIGRATION: 20260414050000_feed_visibility.sql ===
-- ============================================================
-- Feed: visibilidade por alvo + tags
--
-- Adiciona colunas de visibilidade na tabela feed_posts:
--   visibility_type: 'all' | 'specific'
--   visibility_targets: JSON array de {type, id} (position/area/subarea/employee)
--   tags: array de texto
-- ============================================================

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS visibility_type text NOT NULL DEFAULT 'all'
    CHECK (visibility_type IN ('all', 'specific')),
  ADD COLUMN IF NOT EXISTS visibility_targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Atualizar política SELECT para respeitar visibilidade
DROP POLICY IF EXISTS "feed_posts_select" ON public.feed_posts;

CREATE POLICY "feed_posts_select" ON public.feed_posts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Visível para todos
      visibility_type = 'all'

      -- Admin/manager sempre veem tudo
      OR public.is_admin()
      OR public.has_role(auth.uid(), 'manager')

      -- O próprio autor sempre vê seu post
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = feed_posts.employee_id AND e.user_id = auth.uid()
      )

      -- Visibilidade específica: checar se o usuário está em algum dos targets
      OR (
        visibility_type = 'specific'
        AND (
          -- Target tipo 'employee': employee_id direto
          EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE t->>'type' = 'employee' AND t->>'id' = e.id::text
              )
          )
          -- Target tipo 'position': colaborador está nessa posição
          OR EXISTS (
            SELECT 1 FROM public.employees e
            JOIN public.employee_positions ep ON ep.employee_id = e.id
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE t->>'type' = 'position' AND t->>'id' = ep.position_id::text
              )
          )
          -- Target tipo 'area': via employee_positions → positions → subareas → area_id
          OR EXISTS (
            SELECT 1 FROM public.employees e
            JOIN public.employee_positions ep ON ep.employee_id = e.id
            JOIN public.positions p ON p.id = ep.position_id
            JOIN public.subareas s ON s.id = p.subarea_id
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE t->>'type' = 'area' AND t->>'id' = s.area_id::text
              )
          )
          -- Target tipo 'subarea': via employee_positions → positions → subareas
          OR EXISTS (
            SELECT 1 FROM public.employees e
            JOIN public.employee_positions ep ON ep.employee_id = e.id
            JOIN public.positions p ON p.id = ep.position_id
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE t->>'type' = 'subarea' AND t->>'id' = p.subarea_id::text
              )
          )
        )
      )
    )
  );

-- === MIGRATION: 20260414050001_feed_visibility_policy_fix.sql ===
-- Fix: política feed_posts_select com joins corretos para area/subarea
-- (employees não tem area_id/subarea_id direto — vem via employee_positions → positions → subareas)

DROP POLICY IF EXISTS "feed_posts_select" ON public.feed_posts;

CREATE POLICY "feed_posts_select" ON public.feed_posts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      visibility_type = 'all'
      OR public.is_admin()
      OR public.has_role(auth.uid(), 'manager')

      -- Autor sempre vê o próprio post
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = feed_posts.employee_id AND e.user_id = auth.uid()
      )

      -- Visibilidade específica
      OR (
        visibility_type = 'specific'
        AND (
          -- Por employee direto
          EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE t->>'type' = 'employee' AND t->>'id' = e.id::text
              )
          )
          -- Por cargo
          OR EXISTS (
            SELECT 1 FROM public.employees e
            JOIN public.employee_positions ep ON ep.employee_id = e.id
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE t->>'type' = 'position' AND t->>'id' = ep.position_id::text
              )
          )
          -- Por área (via employee_positions → positions → subareas → company_areas)
          OR EXISTS (
            SELECT 1 FROM public.employees e
            JOIN public.employee_positions ep ON ep.employee_id = e.id
            JOIN public.positions p ON p.id = ep.position_id
            JOIN public.subareas s ON s.id = p.subarea_id
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE t->>'type' = 'area' AND t->>'id' = s.area_id::text
              )
          )
          -- Por subárea (via employee_positions → positions → subareas)
          OR EXISTS (
            SELECT 1 FROM public.employees e
            JOIN public.employee_positions ep ON ep.employee_id = e.id
            JOIN public.positions p ON p.id = ep.position_id
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE t->>'type' = 'subarea' AND t->>'id' = p.subarea_id::text
              )
          )
        )
      )
    )
  );

-- === MIGRATION: 20260414060000_fix_feed_visibility_subarea.sql ===
-- ============================================================
-- Fix: política SELECT de feed_posts — visibilidade por área/subárea
--
-- Problemas corrigidos:
--   1. has_role('manager') global foi removido. Managers agora só
--      veem posts específicos se sua posição pertence ao target.
--   2. Adicionado fallback para employees.position_id (coluna legada)
--      além de employee_positions, para cobrir todos os colaboradores.
--   3. Checagem de área agora considera positions.area_id direto
--      (diretores) além de positions.subarea_id → subareas.area_id.
--
-- Regras de visibilidade:
--   - visibility_type = 'all'       → todos veem
--   - Admin                         → sempre vê tudo
--   - Autor                         → sempre vê o próprio post
--   - target tipo 'employee'        → apenas aquele colaborador
--   - target tipo 'area'            → quem tem posição nessa área
--   - target tipo 'subarea'         → quem tem posição nessa subárea
--   - target tipo 'position'        → quem ocupa esse cargo
-- ============================================================

DROP POLICY IF EXISTS "feed_posts_select" ON public.feed_posts;

CREATE POLICY "feed_posts_select" ON public.feed_posts
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      -- Visível para todos
      visibility_type = 'all'

      -- Admin sempre vê tudo
      OR public.is_admin()

      -- Autor sempre vê o próprio post
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = feed_posts.employee_id
          AND e.user_id = auth.uid()
      )

      -- Visibilidade específica
      OR (
        visibility_type = 'specific'
        AND (

          -- ── Target: employee direto ────────────────────────────
          EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE t->>'type' = 'employee'
                  AND t->>'id' = e.id::text
              )
          )

          -- ── Target: cargo / área / subárea via employee_positions ──
          OR EXISTS (
            SELECT 1 FROM public.employees e
            JOIN public.employee_positions ep ON ep.employee_id = e.id
            JOIN public.positions p ON p.id = ep.position_id
            WHERE e.user_id = auth.uid()
              AND e.tenant_id = public.get_user_tenant_id()
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(feed_posts.visibility_targets) AS t
                WHERE
                  -- Por cargo
                  (t->>'type' = 'position' AND t->>'id' = p.id::text)
                  -- Por área:
                  --   · positions.area_id direto (diretores)
                  --   · positions.subarea_id → subareas.area_id (demais)
                  OR (t->>'type' = 'area' AND (
                    t->>'id' = p.area_id::text
                    OR EXISTS (
                      SELECT 1 FROM public.subareas s
                      WHERE s.id = p.subarea_id
                        AND t->>'id' = s.area_id::text
                    )
                  ))
                  -- Por subárea: positions.subarea_id
                  OR (
                    t->>'type' = 'subarea'
                    AND p.subarea_id IS NOT NULL
                    AND t->>'id' = p.subarea_id::text
                  )
              )
          )


)
      )
    )
  );

-- === MIGRATION: 20260414070000_fix_feed_visibility_v2.sql ===
-- ============================================================
-- Fix v2: visibilidade feed_posts via função SECURITY DEFINER
--
-- Problema: a política RLS inline tentava fazer JOIN em
-- employee_positions/positions dentro do contexto do próprio
-- usuário — o que pode ser bloqueado por outras RLS ou
-- retornar resultado vazio por conta de recursão.
--
-- Solução: mesma abordagem usada em user_can_read_project —
-- função SECURITY DEFINER que resolve a visibilidade sem
-- depender de permissões do usuário para tabelas internas.
-- ============================================================

-- ── Função principal de visibilidade ─────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_read_feed_post(p_post_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feed_posts fp
    WHERE fp.id = p_post_id
      AND fp.tenant_id = public.get_user_tenant_id()
      AND (
        -- Visível para todos
        fp.visibility_type = 'all'

        -- Admin sempre vê tudo
        OR public.is_admin()

        -- Autor sempre vê o próprio post
        OR EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = fp.employee_id
            AND e.user_id = auth.uid()
        )

        -- Visibilidade específica
        OR (
          fp.visibility_type = 'specific'
          AND (
            -- Por employee direto
            EXISTS (
              SELECT 1 FROM public.employees e
              WHERE e.user_id = auth.uid()
                AND e.tenant_id = public.get_user_tenant_id()
                AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(fp.visibility_targets) AS t
                  WHERE t->>'type' = 'employee'
                    AND t->>'id' = e.id::text
                )
            )

            -- Por cargo / área / subárea
            OR EXISTS (
              -- Resolve todas as posições do usuário com area_id e subarea_id
              WITH current_positions AS (
                SELECT
                  pos.id        AS position_id,
                  pos.subarea_id,
                  COALESCE(pos.area_id, sa.area_id) AS area_id
                FROM public.employee_positions ep
                JOIN public.employees e   ON e.id  = ep.employee_id
                JOIN public.positions pos ON pos.id = ep.position_id
                LEFT JOIN public.subareas sa ON sa.id = pos.subarea_id
                WHERE e.user_id = auth.uid()
                  AND e.tenant_id = public.get_user_tenant_id()
                  AND pos.tenant_id = public.get_user_tenant_id()
              )
              SELECT 1
              FROM current_positions cp
              WHERE EXISTS (
                SELECT 1 FROM jsonb_array_elements(fp.visibility_targets) AS t
                WHERE
                  -- Cargo exato
                  (t->>'type' = 'position' AND t->>'id' = cp.position_id::text)
                  -- Área: area_id do cargo (direto ou via subárea)
                  OR (
                    t->>'type' = 'area'
                    AND cp.area_id IS NOT NULL
                    AND t->>'id' = cp.area_id::text
                  )
                  -- Subárea: subarea_id direto do cargo
                  OR (
                    t->>'type' = 'subarea'
                    AND cp.subarea_id IS NOT NULL
                    AND t->>'id' = cp.subarea_id::text
                  )
              )
            )
          )
        )
      )
  );
$$;

-- ── Revogar acesso público / conceder ao role autenticado ────

REVOKE ALL ON FUNCTION public.user_can_read_feed_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_read_feed_post(uuid) TO authenticated;

-- ── Substituir política SELECT ────────────────────────────────

DROP POLICY IF EXISTS "feed_posts_select" ON public.feed_posts;

CREATE POLICY "feed_posts_select" ON public.feed_posts
  FOR SELECT TO authenticated
  USING (public.user_can_read_feed_post(id));

-- === MIGRATION: 20260414080000_diagnostico_feed_visibility.sql ===
-- ============================================================
-- Diagnóstico: visibilidade feed por sub área
-- TEMPORÁRIO — remover após resolver o bug
-- ============================================================

CREATE OR REPLACE FUNCTION public.diagnostico_feed_visibilidade()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid         uuid  := auth.uid();
  v_tenant_id   uuid  := public.get_user_tenant_id();
  v_employee    jsonb;
  v_positions   jsonb;
  v_ultimo_post jsonb;
  v_can_read    boolean;
BEGIN
  -- 1. Employee do usuário atual
  SELECT to_jsonb(e) INTO v_employee
  FROM public.employees e
  WHERE e.user_id = v_uid
    AND e.tenant_id = v_tenant_id
  LIMIT 1;

  -- 2. Posições via employee_positions com subarea/area resolvidos
  SELECT jsonb_agg(row_to_json(x)) INTO v_positions
  FROM (
    SELECT
      ep.employee_id,
      ep.position_id,
      ep.is_primary,
      pos.title          AS position_title,
      pos.subarea_id,
      pos.area_id        AS position_area_id,
      sa.name            AS subarea_name,
      sa.area_id         AS subarea_parent_area_id,
      COALESCE(pos.area_id, sa.area_id) AS resolved_area_id
    FROM public.employee_positions ep
    JOIN public.employees e   ON e.id  = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas sa ON sa.id = pos.subarea_id
    WHERE e.user_id = v_uid
      AND e.tenant_id = v_tenant_id
  ) x;

  -- 3. Último post com visibility_type = 'specific' e target subarea
  SELECT to_jsonb(p) INTO v_ultimo_post
  FROM public.feed_posts p
  WHERE p.tenant_id = v_tenant_id
    AND p.visibility_type = 'specific'
    AND p.visibility_targets::text LIKE '%subarea%'
  ORDER BY p.created_at DESC
  LIMIT 1;

  -- 4. Resultado da função de visibilidade para esse post
  IF v_ultimo_post IS NOT NULL THEN
    SELECT public.user_can_read_feed_post((v_ultimo_post->>'id')::uuid)
    INTO v_can_read;
  END IF;

  RETURN jsonb_build_object(
    'uid',            v_uid,
    'tenant_id',      v_tenant_id,
    'employee',       v_employee,
    'positions',      COALESCE(v_positions, '[]'::jsonb),
    'ultimo_post_subarea', v_ultimo_post,
    'user_can_read',  v_can_read
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnostico_feed_visibilidade() TO authenticated;

-- === MIGRATION: 20260414090000_diagnostico_feed_posts_raw.sql ===
-- Diagnóstico v2: mostra os últimos posts brutos do tenant, sem filtro de visibilidade
CREATE OR REPLACE FUNCTION public.diagnostico_feed_posts_raw()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := public.get_user_tenant_id();
  v_posts     jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                  fp.id,
      'visibility_type',     fp.visibility_type,
      'visibility_targets',  fp.visibility_targets,
      'tenant_id',           fp.tenant_id,
      'created_at',          fp.created_at
    )
    ORDER BY fp.created_at DESC
  )
  INTO v_posts
  FROM public.feed_posts fp
  WHERE fp.tenant_id = v_tenant_id
  LIMIT 5;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'posts',     COALESCE(v_posts, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnostico_feed_posts_raw() TO authenticated;

-- === MIGRATION: 20260414100000_update_tenant_name_and_favicon.sql ===
-- Atualiza nome do tenant de "GT3" para "OMNX GT3"
-- e define favicon_url apontando para o logotipo05 em public/
UPDATE tenants
SET
  name        = 'OMNX GT3',
  favicon_url = '/logotipo05.png'
WHERE name = 'GT3';

-- === MIGRATION: 20260416000001_member_project_visibility_multi_assignee.sql ===
-- Fix: member vê projeto quando está adicionado na tarefa via multi-assignee
--
-- Regra desejada para member:
--   1. Continua vendo projeto quando tem tarefa atribuída via tasks.assignee_id
--   2. Passa a ver projeto também quando foi adicionado na tarefa via task_assignees

CREATE OR REPLACE FUNCTION public.user_has_project_assigned_task(p_project_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.employees e ON e.id = t.assignee_id
    WHERE t.project_id = p_project_id
      AND t.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND e.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.task_assignees ta ON ta.task_id = t.id
    JOIN public.employees e ON e.id = ta.employee_id
    WHERE t.project_id = p_project_id
      AND t.tenant_id = public.get_user_tenant_id()
      AND ta.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND e.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR (
        public.has_role(auth.uid(), 'manager')
        AND public.user_can_read_project(id)
      )
      OR (
        public.has_role(auth.uid(), 'member')
        AND public.user_has_project_assigned_task(id)
      )
    )
  );

-- === MIGRATION: 20260416000002_member_project_visibility_direct_membership.sql ===
-- Fix: member vê projeto quando é membro direto em employee_projects
--
-- Regra final para member em projetos:
--   1. Vê projeto quando possui tarefa atribuída no projeto
--      (tasks.assignee_id ou task_assignees)
--   2. Vê projeto quando foi adicionado como membro direto em employee_projects

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR (
        public.has_role(auth.uid(), 'manager')
        AND public.user_can_read_project(id)
      )
      OR (
        public.has_role(auth.uid(), 'member')
        AND (
          public.user_has_project_assigned_task(id)
          OR EXISTS (
            SELECT 1
            FROM public.employee_projects ep
            JOIN public.employees e ON e.id = ep.employee_id
            WHERE ep.project_id = projects.id
              AND ep.tenant_id = public.get_user_tenant_id()
              AND e.tenant_id = public.get_user_tenant_id()
              AND e.user_id = auth.uid()
          )
        )
      )
    )
  );

-- === MIGRATION: 20260416000003_member_process_visibility_by_area_or_subarea.sql ===
-- Fix: member vê processo quando sua área ou subárea está vinculada ao processo
--
-- Regra final:
--   1. Continua vendo processos vinculados ao seu cargo
--   2. Passa a considerar subárea explicitamente
--   3. Continua considerando área quando o processo ou o usuário não têm subárea específica

CREATE OR REPLACE FUNCTION public.user_process_matches_position_or_area(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  WITH current_positions AS (
    SELECT
      ep.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, current_sa.area_id) AS area_id
    FROM public.employee_positions ep
    JOIN public.employees e ON e.id = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
    WHERE e.user_id = auth.uid()
      AND e.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
  ),
  process_position_scope AS (
    SELECT
      pp.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_pos_sa.area_id) AS area_id
    FROM public.process_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    LEFT JOIN public.subareas process_pos_sa ON process_pos_sa.id = pos.subarea_id
    WHERE pp.process_id = p_process_id
      AND pos.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      p.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_primary_sa.area_id) AS area_id
    FROM public.processes p
    JOIN public.positions pos ON pos.id = p.position_id
    LEFT JOIN public.subareas process_primary_sa ON process_primary_sa.id = pos.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
      AND p.position_id IS NOT NULL
  ),
  process_area_scope AS (
    SELECT
      p.subarea_id,
      COALESCE(p.area_id, process_direct_sa.area_id) AS area_id
    FROM public.processes p
    LEFT JOIN public.subareas process_direct_sa ON process_direct_sa.id = p.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      pa.subarea_id,
      COALESCE(pa.area_id, process_area_sa.area_id) AS area_id
    FROM public.process_areas pa
    LEFT JOIN public.subareas process_area_sa ON process_area_sa.id = pa.subarea_id
    JOIN public.processes p ON p.id = pa.process_id
    WHERE pa.process_id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_position_scope process_pos
        ON process_pos.position_id = current_pos.position_id
        OR (
          process_pos.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_pos.subarea_id = current_pos.subarea_id
        )
        OR (
          process_pos.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_pos.area_id = current_pos.area_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_area_scope process_area
        ON (
          process_area.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_area.subarea_id = current_pos.subarea_id
        )
        OR (
          process_area.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_area.area_id = current_pos.area_id
        )
    );
$$;

-- === MIGRATION: 20260416000004_fix_process_visibility_current_position_resolution.sql ===
-- Fix: visibilidade de processos usa a mesma resolução de posição/área do organograma
--
-- Problema:
--   Alguns members não resolvem posição/área apenas por employee_positions,
--   embora o organograma já exponha primary_position_id/area_id/subarea_id.
--
-- Correção:
--   current_positions passa a considerar employees_hierarchy_view como fonte
--   de verdade para posição primária, área e subárea do usuário.

CREATE OR REPLACE FUNCTION public.user_process_matches_position_or_area(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  WITH current_positions AS (
    SELECT DISTINCT
      current_pos.position_id,
      current_pos.subarea_id,
      current_pos.area_id
    FROM (
      SELECT
        ep.position_id,
        pos.subarea_id,
        COALESCE(pos.area_id, current_sa.area_id) AS area_id
      FROM public.employee_positions ep
      JOIN public.employees e ON e.id = ep.employee_id
      JOIN public.positions pos ON pos.id = ep.position_id
      LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
      WHERE e.user_id = auth.uid()
        AND e.tenant_id = public.get_user_tenant_id()
        AND pos.tenant_id = public.get_user_tenant_id()

      UNION

      SELECT
        ehv.primary_position_id AS position_id,
        ehv.subarea_id,
        ehv.area_id
      FROM public.employees_hierarchy_view ehv
      WHERE ehv.user_id = auth.uid()
        AND ehv.tenant_id = public.get_user_tenant_id()
        AND ehv.primary_position_id IS NOT NULL
    ) AS current_pos
  ),
  process_position_scope AS (
    SELECT
      pp.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_pos_sa.area_id) AS area_id
    FROM public.process_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    LEFT JOIN public.subareas process_pos_sa ON process_pos_sa.id = pos.subarea_id
    WHERE pp.process_id = p_process_id
      AND pos.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      p.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_primary_sa.area_id) AS area_id
    FROM public.processes p
    JOIN public.positions pos ON pos.id = p.position_id
    LEFT JOIN public.subareas process_primary_sa ON process_primary_sa.id = pos.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
      AND p.position_id IS NOT NULL
  ),
  process_area_scope AS (
    SELECT
      p.subarea_id,
      COALESCE(p.area_id, process_direct_sa.area_id) AS area_id
    FROM public.processes p
    LEFT JOIN public.subareas process_direct_sa ON process_direct_sa.id = p.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      pa.subarea_id,
      COALESCE(pa.area_id, process_area_sa.area_id) AS area_id
    FROM public.process_areas pa
    LEFT JOIN public.subareas process_area_sa ON process_area_sa.id = pa.subarea_id
    JOIN public.processes p ON p.id = pa.process_id
    WHERE pa.process_id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_position_scope process_pos
        ON process_pos.position_id = current_pos.position_id
        OR (
          process_pos.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_pos.subarea_id = current_pos.subarea_id
        )
        OR (
          process_pos.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_pos.area_id = current_pos.area_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_area_scope process_area
        ON (
          process_area.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_area.subarea_id = current_pos.subarea_id
        )
        OR (
          process_area.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_area.area_id = current_pos.area_id
        )
    );
$$;

-- === MIGRATION: 20260416000005_fix_process_visibility_organograma_fallback.sql ===
-- Fix: visibilidade de processos com fallback via organograma_view
--
-- Alguns usuários podem estar resolvidos no organograma mesmo quando
-- employees_hierarchy_view não retorna a combinação esperada para a policy.
-- Este fallback usa o mesmo conjunto de dados exibido pela UI.

CREATE OR REPLACE FUNCTION public.user_process_matches_position_or_area(p_process_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  WITH current_positions AS (
    SELECT DISTINCT
      current_pos.position_id,
      current_pos.subarea_id,
      current_pos.area_id
    FROM (
      SELECT
        ep.position_id,
        pos.subarea_id,
        COALESCE(pos.area_id, current_sa.area_id) AS area_id
      FROM public.employee_positions ep
      JOIN public.employees e ON e.id = ep.employee_id
      JOIN public.positions pos ON pos.id = ep.position_id
      LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
      WHERE e.user_id = auth.uid()
        AND e.tenant_id = public.get_user_tenant_id()
        AND pos.tenant_id = public.get_user_tenant_id()

      UNION

      SELECT
        ehv.primary_position_id AS position_id,
        ehv.subarea_id,
        ehv.area_id
      FROM public.employees_hierarchy_view ehv
      WHERE ehv.user_id = auth.uid()
        AND ehv.tenant_id = public.get_user_tenant_id()
        AND ehv.primary_position_id IS NOT NULL

      UNION

      SELECT
        ov.primary_position_id AS position_id,
        ov.subarea_id,
        ov.area_id
      FROM public.organograma_view ov
      WHERE ov.user_id = auth.uid()
        AND ov.tenant_id = public.get_user_tenant_id()
        AND ov.primary_position_id IS NOT NULL
    ) AS current_pos
  ),
  process_position_scope AS (
    SELECT
      pp.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_pos_sa.area_id) AS area_id
    FROM public.process_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    LEFT JOIN public.subareas process_pos_sa ON process_pos_sa.id = pos.subarea_id
    WHERE pp.process_id = p_process_id
      AND pos.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      p.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_primary_sa.area_id) AS area_id
    FROM public.processes p
    JOIN public.positions pos ON pos.id = p.position_id
    LEFT JOIN public.subareas process_primary_sa ON process_primary_sa.id = pos.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
      AND p.position_id IS NOT NULL
  ),
  process_area_scope AS (
    SELECT
      p.subarea_id,
      COALESCE(p.area_id, process_direct_sa.area_id) AS area_id
    FROM public.processes p
    LEFT JOIN public.subareas process_direct_sa ON process_direct_sa.id = p.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      pa.subarea_id,
      COALESCE(pa.area_id, process_area_sa.area_id) AS area_id
    FROM public.process_areas pa
    LEFT JOIN public.subareas process_area_sa ON process_area_sa.id = pa.subarea_id
    JOIN public.processes p ON p.id = pa.process_id
    WHERE pa.process_id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_position_scope process_pos
        ON process_pos.position_id = current_pos.position_id
        OR (
          process_pos.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_pos.subarea_id = current_pos.subarea_id
        )
        OR (
          process_pos.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_pos.area_id = current_pos.area_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_area_scope process_area
        ON (
          process_area.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_area.subarea_id = current_pos.subarea_id
        )
        OR (
          process_area.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_area.area_id = current_pos.area_id
        )
    );
$$;

-- === MIGRATION: 20260417000001_fix_position_hierarchy_corruption.sql ===
-- ============================================================
-- Migration: Fix corrupted position hierarchy
-- Problem:   Many positions had reports_to_id pointing to
--            "Vendedor (Closer)" across different subareas,
--            and subarea-level positions reported directly to CEO.
-- ============================================================

-- Step 1: Clear cross-subarea wrong parent links
-- (positions whose parent has a different subarea_id — invalid unless parent is area/org level)
UPDATE public.positions AS p
SET reports_to_id = NULL
FROM public.positions AS parent
WHERE p.reports_to_id = parent.id
  AND parent.subarea_id IS NOT NULL
  AND p.subarea_id IS NOT NULL
  AND p.subarea_id != parent.subarea_id;

-- Step 2: Fix subarea positions reporting directly to CEO
-- Route them through the Director of their area instead
UPDATE public.positions AS p
SET reports_to_id = dir.id
FROM public.subareas AS sub
JOIN public.positions AS dir
  ON dir.area_id = sub.area_id
 AND dir.subarea_id IS NULL
 AND dir.level = 1
WHERE p.subarea_id = sub.id
  AND p.reports_to_id IN (
    SELECT id FROM public.positions WHERE level = 0
  )
  AND p.level != 1  -- don't move managers/directors
  AND p.tenant_id = dir.tenant_id;

-- Step 3: Fix positions with no parent that are in subareas
-- (orphans after step 1 — route through area Director via same logic)
UPDATE public.positions AS p
SET reports_to_id = dir.id
FROM public.subareas AS sub
JOIN public.positions AS dir
  ON dir.area_id = sub.area_id
 AND dir.subarea_id IS NULL
 AND dir.level = 1
WHERE p.subarea_id = sub.id
  AND p.reports_to_id IS NULL
  AND p.level != 1
  AND p.tenant_id = dir.tenant_id;

-- === MIGRATION: 20260417000002_fix_gerente_vendas_parent.sql ===
-- Fix: positions with subarea_id set that still report directly to CEO
-- (e.g. "Gerente de vendas" level=1 was excluded from previous migration)
UPDATE public.positions AS p
SET reports_to_id = dir.id
FROM public.subareas AS sub,
     public.positions AS dir
WHERE p.subarea_id = sub.id
  AND dir.area_id = sub.area_id
  AND dir.subarea_id IS NULL
  AND dir.level = 1
  AND dir.id != p.id
  AND p.reports_to_id IN (SELECT id FROM public.positions WHERE level = 0)
  AND p.tenant_id = dir.tenant_id;

-- === MIGRATION: 20260417000003_fix_aquisicao_chain.sql ===
-- Fix Aquisição hierarchy chain:
-- Líder de pré-vendas → Vendedor (Closer) → SDR

-- Step 1: Vendedor (Closer) reports to Líder de pré-vendas
UPDATE public.positions AS vendedor
SET reports_to_id = lider.id
FROM public.positions AS lider
WHERE vendedor.title = 'Vendedor (Closer)'
  AND lider.title = 'Líder de pré-vendas'
  AND vendedor.tenant_id = lider.tenant_id;

-- Step 2: SDR reports to Vendedor (Closer)
UPDATE public.positions AS sdr
SET reports_to_id = vendedor.id
FROM public.positions AS vendedor
WHERE sdr.title = 'SDR'
  AND vendedor.title = 'Vendedor (Closer)'
  AND sdr.tenant_id = vendedor.tenant_id;

-- Step 3: Gerente de vendas reports to Diretor of its area (via subarea lookup)
UPDATE public.positions AS p
SET reports_to_id = dir.id
FROM public.subareas AS sub,
     public.positions AS dir
WHERE p.title = 'Gerente de vendas'
  AND p.subarea_id = sub.id
  AND dir.area_id = sub.area_id
  AND dir.subarea_id IS NULL
  AND dir.level = 1
  AND dir.id != p.id
  AND p.tenant_id = dir.tenant_id;

-- === MIGRATION: 20260417000004_fix_same_subarea_hierarchy.sql ===
-- Fix same-subarea hierarchy where alphabetical sort produced wrong parent.
-- Rule: within a subarea, "Gerente de X" is parent of other positions at the same level.

-- Gerente de atendimento → Agente de atendimento
UPDATE public.positions AS p
SET reports_to_id = gerente.id
FROM public.positions AS gerente
WHERE p.title = 'Agente de atendimento'
  AND gerente.title = 'Gerente de atendimento'
  AND p.subarea_id = gerente.subarea_id
  AND p.tenant_id = gerente.tenant_id;

-- Gerente de tecnologia → Assistente de tecnologia
UPDATE public.positions AS p
SET reports_to_id = gerente.id
FROM public.positions AS gerente
WHERE p.title = 'Assistente de tecnologia'
  AND gerente.title = 'Gerente de tecnologia'
  AND p.subarea_id = gerente.subarea_id
  AND p.tenant_id = gerente.tenant_id;

-- Gerente de marketing → Gestor de tráfego
UPDATE public.positions AS p
SET reports_to_id = gerente.id
FROM public.positions AS gerente
WHERE p.title = 'Gestor de tráfego'
  AND gerente.title = 'Gerente de marketing'
  AND p.subarea_id = gerente.subarea_id
  AND p.tenant_id = gerente.tenant_id;

-- === MIGRATION: 20260417000005_fix_organograma_view_manager_duplicates.sql ===
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

-- === MIGRATION: 20260420000001_feed_posts_attachments.sql ===
-- Adiciona coluna de anexos à tabela feed_posts
ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Bucket para armazenar mídia do Feed
INSERT INTO storage.buckets (id, name, public)
VALUES ('feed-attachments', 'feed-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Política: usuários autenticados podem fazer upload no próprio tenant
CREATE POLICY "feed_attachments_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'feed-attachments');

-- Política: leitura pública (bucket público)
CREATE POLICY "feed_attachments_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'feed-attachments');

-- Política: dono pode deletar
CREATE POLICY "feed_attachments_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'feed-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- === MIGRATION: 20260420000002_feed_posts_content_optional.sql ===
-- Permite posts sem texto (somente com anexos)
ALTER TABLE public.feed_posts
  DROP CONSTRAINT IF EXISTS feed_posts_content_check;

ALTER TABLE public.feed_posts
  ADD CONSTRAINT feed_posts_content_check CHECK (char_length(content) <= 2000);

-- === MIGRATION: 20260420000010_chat_tables.sql ===
-- ══════════════════════════════════════════════════════════════
-- Chat interno GT3 — Fase 1
-- ══════════════════════════════════════════════════════════════

-- ── Conversas ─────────────────────────────────────────────────
CREATE TABLE public.chat_conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('direct','group','area','project')),
  name          TEXT,
  description   TEXT,
  avatar_url    TEXT,
  area_id       UUID,
  project_id    UUID,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Índices
CREATE INDEX chat_conversations_tenant_idx ON public.chat_conversations(tenant_id);
CREATE INDEX chat_conversations_type_idx   ON public.chat_conversations(type, tenant_id);

-- ── Participantes ──────────────────────────────────────────────
CREATE TABLE public.chat_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at    TIMESTAMPTZ,
  UNIQUE(conversation_id, employee_id)
);

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

CREATE INDEX chat_participants_conv_idx ON public.chat_participants(conversation_id);
CREATE INDEX chat_participants_emp_idx  ON public.chat_participants(employee_id);

-- ── Mensagens ─────────────────────────────────────────────────
CREATE TABLE public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL,
  content         TEXT,
  type            TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','video','audio','file','system')),
  attachments     JSONB NOT NULL DEFAULT '[]',
  reply_to_id     UUID REFERENCES public.chat_messages(id),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_has_content CHECK (
    (content IS NOT NULL AND char_length(content) > 0)
    OR jsonb_array_length(attachments) > 0
  )
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX chat_messages_conv_idx  ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX chat_messages_emp_idx   ON public.chat_messages(employee_id);

-- ── Reações ───────────────────────────────────────────────────
CREATE TABLE public.chat_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  reaction    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, employee_id, reaction)
);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX chat_reactions_msg_idx ON public.chat_reactions(message_id);

-- ══════════════════════════════════════════════════════════════
-- Helper: retorna o employee_id do usuário autenticado
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.chat_my_employee_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Helper: verifica se o usuário é participante da conversa
CREATE OR REPLACE FUNCTION public.chat_is_participant(p_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE conversation_id = p_conversation_id
      AND employee_id = public.chat_my_employee_id()
  );
$$;

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_conversations
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_conv_select" ON public.chat_conversations
  FOR SELECT USING (public.chat_is_participant(id));

CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "chat_conv_update" ON public.chat_conversations
  FOR UPDATE USING (public.chat_is_participant(id));

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_participants
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_part_select" ON public.chat_participants
  FOR SELECT USING (public.chat_is_participant(conversation_id));

CREATE POLICY "chat_part_insert" ON public.chat_participants
  FOR INSERT WITH CHECK (public.chat_is_participant(conversation_id));

CREATE POLICY "chat_part_update" ON public.chat_participants
  FOR UPDATE USING (employee_id = public.chat_my_employee_id());

CREATE POLICY "chat_part_delete" ON public.chat_participants
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_messages
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_msg_select" ON public.chat_messages
  FOR SELECT USING (public.chat_is_participant(conversation_id));

CREATE POLICY "chat_msg_insert" ON public.chat_messages
  FOR INSERT WITH CHECK (
    public.chat_is_participant(conversation_id)
    AND employee_id = public.chat_my_employee_id()
  );

CREATE POLICY "chat_msg_update" ON public.chat_messages
  FOR UPDATE USING (employee_id = public.chat_my_employee_id());

CREATE POLICY "chat_msg_delete" ON public.chat_messages
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_reactions
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_react_select" ON public.chat_reactions
  FOR SELECT USING (
    public.chat_is_participant(
      (SELECT conversation_id FROM public.chat_messages WHERE id = message_id)
    )
  );

CREATE POLICY "chat_react_insert" ON public.chat_reactions
  FOR INSERT WITH CHECK (
    employee_id = public.chat_my_employee_id()
    AND public.chat_is_participant(
      (SELECT conversation_id FROM public.chat_messages WHERE id = message_id)
    )
  );

CREATE POLICY "chat_react_delete" ON public.chat_reactions
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- Trigger: atualiza updated_at nas conversas quando nova mensagem
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.chat_touch_conversation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_messages_touch_conv
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_touch_conversation();

-- === MIGRATION: 20260420000011_chat_push_and_storage.sql ===
-- ══════════════════════════════════════════════════════════════
-- Push subscriptions + bucket de anexos do chat
-- ══════════════════════════════════════════════════════════════

-- ── Push subscriptions (Web Push API) ─────────────────────────
CREATE TABLE public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  tenant_id   UUID NOT NULL,
  endpoint    TEXT NOT NULL,
  keys        JSONB NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX push_subs_employee_idx ON public.push_subscriptions(employee_id);
CREATE INDEX push_subs_tenant_idx   ON public.push_subscriptions(tenant_id);

CREATE POLICY "push_subs_own_select" ON public.push_subscriptions
  FOR SELECT USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "push_subs_own_insert" ON public.push_subscriptions
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "push_subs_own_delete" ON public.push_subscriptions
  FOR DELETE USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- ── Bucket para anexos do chat ────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "chat_attach_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attach_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attach_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- === MIGRATION: 20260420000012_chat_rls_fix.sql ===
-- ══════════════════════════════════════════════════════════════
-- Fix: RLS recursão + chicken-and-egg na criação de conversa
-- ══════════════════════════════════════════════════════════════

-- ── Remove políticas problemáticas ────────────────────────────
DROP POLICY IF EXISTS "chat_conv_select"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conv_insert"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conv_update"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_part_select"  ON public.chat_participants;
DROP POLICY IF EXISTS "chat_part_insert"  ON public.chat_participants;
DROP POLICY IF EXISTS "chat_part_update"  ON public.chat_participants;
DROP POLICY IF EXISTS "chat_part_delete"  ON public.chat_participants;
DROP POLICY IF EXISTS "chat_msg_select"   ON public.chat_messages;
DROP POLICY IF EXISTS "chat_msg_insert"   ON public.chat_messages;
DROP POLICY IF EXISTS "chat_msg_update"   ON public.chat_messages;
DROP POLICY IF EXISTS "chat_msg_delete"   ON public.chat_messages;
DROP POLICY IF EXISTS "chat_react_select" ON public.chat_reactions;
DROP POLICY IF EXISTS "chat_react_insert" ON public.chat_reactions;
DROP POLICY IF EXISTS "chat_react_delete" ON public.chat_reactions;

DROP FUNCTION IF EXISTS public.chat_is_participant(UUID);
DROP FUNCTION IF EXISTS public.chat_my_employee_id();

-- ── Funções SECURITY DEFINER (bypassam RLS internamente) ──────

-- Retorna o employee_id do usuário autenticado
CREATE OR REPLACE FUNCTION public.chat_my_employee_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Retorna todos os conversation_ids em que o usuário participa
-- SECURITY DEFINER evita recursão infinita quando consultada dentro de RLS
CREATE OR REPLACE FUNCTION public.chat_my_conversation_ids()
RETURNS TABLE(conversation_id UUID) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cp.conversation_id
  FROM public.chat_participants cp
  WHERE cp.employee_id = public.chat_my_employee_id();
$$;

-- ── GRANTS ────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_participants   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_reactions      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions  TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_conversations
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_conv_select" ON public.chat_conversations
  FOR SELECT USING (
    id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "chat_conv_update" ON public.chat_conversations
  FOR UPDATE USING (
    id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_participants
-- Usa chat_my_conversation_ids() para evitar recursão
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_part_select" ON public.chat_participants
  FOR SELECT USING (
    conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

-- Permite inserir participantes se o usuário criou a conversa OU já é participante
CREATE POLICY "chat_part_insert" ON public.chat_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id
        AND (
          c.created_by = public.chat_my_employee_id()
          OR conversation_id IN (SELECT ci.conversation_id FROM public.chat_my_conversation_ids() ci)
        )
    )
  );

CREATE POLICY "chat_part_update" ON public.chat_participants
  FOR UPDATE USING (employee_id = public.chat_my_employee_id());

CREATE POLICY "chat_part_delete" ON public.chat_participants
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_messages
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_msg_select" ON public.chat_messages
  FOR SELECT USING (
    conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

CREATE POLICY "chat_msg_insert" ON public.chat_messages
  FOR INSERT WITH CHECK (
    conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
    AND employee_id = public.chat_my_employee_id()
  );

CREATE POLICY "chat_msg_update" ON public.chat_messages
  FOR UPDATE USING (employee_id = public.chat_my_employee_id());

CREATE POLICY "chat_msg_delete" ON public.chat_messages
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_reactions
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_react_select" ON public.chat_reactions
  FOR SELECT USING (
    message_id IN (
      SELECT m.id FROM public.chat_messages m
      WHERE m.conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
    )
  );

CREATE POLICY "chat_react_insert" ON public.chat_reactions
  FOR INSERT WITH CHECK (
    employee_id = public.chat_my_employee_id()
    AND message_id IN (
      SELECT m.id FROM public.chat_messages m
      WHERE m.conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
    )
  );

CREATE POLICY "chat_react_delete" ON public.chat_reactions
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- === MIGRATION: 20260420000013_chat_rls_fix2.sql ===
-- ══════════════════════════════════════════════════════════════
-- Fix 2: subqueries em políticas RLS não podem acessar tabelas
-- com RLS próprio diretamente — precisam de SECURITY DEFINER
-- ══════════════════════════════════════════════════════════════

-- Retorna o tenant_id do usuário autenticado (SECURITY DEFINER bypassa RLS de employees)
CREATE OR REPLACE FUNCTION public.chat_my_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Verifica se o usuário criou a conversa (SECURITY DEFINER bypassa RLS de chat_conversations)
CREATE OR REPLACE FUNCTION public.chat_user_created_conversation(p_conv_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = p_conv_id
      AND created_by = public.chat_my_employee_id()
  );
$$;

-- ── Recria políticas com funções SECURITY DEFINER ─────────────

DROP POLICY IF EXISTS "chat_conv_insert"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_part_insert"  ON public.chat_participants;

-- Conversa: qualquer employee autenticado pode criar
CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (
    tenant_id = public.chat_my_tenant_id()
  );

-- Participante: criador da conversa OU participante existente pode adicionar
CREATE POLICY "chat_part_insert" ON public.chat_participants
  FOR INSERT WITH CHECK (
    public.chat_user_created_conversation(conversation_id)
    OR conversation_id IN (
      SELECT ci.conversation_id FROM public.chat_my_conversation_ids() ci
    )
  );

-- === MIGRATION: 20260420000014_chat_rls_fix3.sql ===
-- ══════════════════════════════════════════════════════════════
-- Fix 3: simplificar INSERT policies — apenas verificar que o
-- usuário é um employee autenticado válido
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "chat_conv_insert"  ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_part_insert"  ON public.chat_participants;

-- Qualquer employee autenticado pode criar uma conversa
-- (tenant_id é enviado pelo cliente e isolado pelo SELECT policy)
CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (
    public.chat_my_employee_id() IS NOT NULL
  );

-- Criador ou participante existente pode adicionar participantes
CREATE POLICY "chat_part_insert" ON public.chat_participants
  FOR INSERT WITH CHECK (
    public.chat_my_employee_id() IS NOT NULL
    AND (
      public.chat_user_created_conversation(conversation_id)
      OR conversation_id IN (
        SELECT ci.conversation_id FROM public.chat_my_conversation_ids() ci
      )
    )
  );

-- === MIGRATION: 20260420000015_chat_rls_fix4.sql ===
-- ══════════════════════════════════════════════════════════════
-- Fix 4:
-- 1. push_subscriptions: adiciona política UPDATE (faltava para upsert)
-- 2. chat_conv_insert: simplifica para auth.uid() IS NOT NULL
--    (diagnostica se o problema é chat_my_employee_id() retornando NULL)
-- ══════════════════════════════════════════════════════════════

-- ── push_subscriptions: UPDATE policy ─────────────────────────
DROP POLICY IF EXISTS "push_subs_own_update" ON public.push_subscriptions;

CREATE POLICY "push_subs_own_update" ON public.push_subscriptions
  FOR UPDATE USING (
    employee_id = public.chat_my_employee_id()
  ) WITH CHECK (
    employee_id = public.chat_my_employee_id()
  );

-- ── chat_conversations INSERT: máxima permissividade ──────────
DROP POLICY IF EXISTS "chat_conv_insert" ON public.chat_conversations;

CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── EXECUTE grants explícitos nas funções helper ──────────────
GRANT EXECUTE ON FUNCTION public.chat_my_employee_id()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_my_conversation_ids()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_my_tenant_id()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_user_created_conversation(UUID) TO authenticated;

-- === MIGRATION: 20260420000016_area_channels.sql ===
-- ══════════════════════════════════════════════════════════════
-- Canais de área: cada company_area ganha um canal de chat
-- automático com seus colaboradores como participantes
-- ══════════════════════════════════════════════════════════════

-- ── Retorna IDs de colaboradores ativos de uma área ───────────
CREATE OR REPLACE FUNCTION public.area_employee_ids(p_area_id UUID)
RETURNS TABLE(emp_id UUID) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT e.id
  FROM public.employees e
  JOIN public.employee_positions ep ON ep.employee_id = e.id
  JOIN public.positions p            ON p.id = ep.position_id
  LEFT JOIN public.subareas sa       ON sa.id = p.subarea_id
  WHERE e.status = 'active'
    AND (p.area_id = p_area_id OR sa.area_id = p_area_id);
$$;

-- ── Garante que um canal existe para a área ───────────────────
CREATE OR REPLACE FUNCTION public.ensure_area_channel(
  p_area_id UUID, p_tenant_id UUID, p_area_name TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT id INTO v_conv_id
  FROM public.chat_conversations
  WHERE area_id = p_area_id AND type = 'area'
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

  INSERT INTO public.chat_conversations (tenant_id, type, name, area_id)
  VALUES (p_tenant_id, 'area', p_area_name, p_area_id)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.chat_participants (conversation_id, employee_id, role)
  SELECT v_conv_id, ae.emp_id, 'member'
  FROM public.area_employee_ids(p_area_id) ae
  ON CONFLICT (conversation_id, employee_id) DO NOTHING;

  RETURN v_conv_id;
END;
$$;

-- ── Cria canais para todas as áreas existentes ────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, tenant_id, name FROM public.company_areas LOOP
    PERFORM public.ensure_area_channel(r.id, r.tenant_id, r.name);
  END LOOP;
END $$;

-- ── Trigger: nova área → criar canal automaticamente ──────────
CREATE OR REPLACE FUNCTION public.trg_area_channel_create()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.ensure_area_channel(NEW.id, NEW.tenant_id, NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS area_channel_create ON public.company_areas;
CREATE TRIGGER area_channel_create
  AFTER INSERT ON public.company_areas
  FOR EACH ROW EXECUTE FUNCTION public.trg_area_channel_create();

-- ── Trigger: área renomeada → sincroniza nome do canal ────────
CREATE OR REPLACE FUNCTION public.trg_area_channel_rename()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.name <> OLD.name THEN
    UPDATE public.chat_conversations
    SET name = NEW.name
    WHERE area_id = NEW.id AND type = 'area';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS area_channel_rename ON public.company_areas;
CREATE TRIGGER area_channel_rename
  AFTER UPDATE ON public.company_areas
  FOR EACH ROW EXECUTE FUNCTION public.trg_area_channel_rename();

-- ── Trigger: colaborador recebe posição → entra no canal da área
CREATE OR REPLACE FUNCTION public.trg_sync_employee_area_channel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_area_id UUID;
  v_conv_id UUID;
BEGIN
  -- Resolve area_id via posição direta ou subárea
  SELECT COALESCE(p.area_id, sa.area_id) INTO v_area_id
  FROM public.positions p
  LEFT JOIN public.subareas sa ON sa.id = p.subarea_id
  WHERE p.id = NEW.position_id;

  IF v_area_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_conv_id
  FROM public.chat_conversations
  WHERE area_id = v_area_id AND type = 'area'
  LIMIT 1;

  IF v_conv_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.chat_participants (conversation_id, employee_id, role)
  VALUES (v_conv_id, NEW.employee_id, 'member')
  ON CONFLICT (conversation_id, employee_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_employee_area_channel ON public.employee_positions;
CREATE TRIGGER sync_employee_area_channel
  AFTER INSERT ON public.employee_positions
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_employee_area_channel();

-- === MIGRATION: 20260420000017_chat_attachments_bucket.sql ===
-- ══════════════════════════════════════════════════════════════
-- Garante que o bucket chat-attachments existe e é público
-- URLs públicas são necessárias para <audio>/<video>/<img> no browser
-- ══════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  52428800,  -- 50 MB
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'video/mp4','video/webm','video/ogg',
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv',
    'application/zip','application/x-rar-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Permite upload para qualquer usuário autenticado
DROP POLICY IF EXISTS "chat_attach_upload" ON storage.objects;
CREATE POLICY "chat_attach_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

-- Leitura pública (necessária para URLs em <audio>/<video>/<img>)
DROP POLICY IF EXISTS "chat_attach_read" ON storage.objects;
CREATE POLICY "chat_attach_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments');

-- Deleção apenas pelo dono (tenant_id é a primeira pasta)
DROP POLICY IF EXISTS "chat_attach_delete" ON storage.objects;
CREATE POLICY "chat_attach_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-attachments');

-- === MIGRATION: 20260420000018_chat_reactions.sql ===
-- ══════════════════════════════════════════════════════════════
-- Reações a mensagens do chat
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chat_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  emoji       TEXT NOT NULL CHECK (char_length(emoji) <= 8),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, employee_id, emoji)
);

CREATE INDEX IF NOT EXISTS chat_reactions_message_idx ON public.chat_reactions(message_id);
CREATE INDEX IF NOT EXISTS chat_reactions_employee_idx ON public.chat_reactions(employee_id);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select" ON public.chat_reactions;
CREATE POLICY "reactions_select" ON public.chat_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages cm
      JOIN public.chat_participants cp ON cp.conversation_id = cm.conversation_id
      WHERE cm.id = chat_reactions.message_id
        AND cp.employee_id IN (
          SELECT id FROM public.employees WHERE user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "reactions_insert" ON public.chat_reactions;
CREATE POLICY "reactions_insert" ON public.chat_reactions
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "reactions_delete" ON public.chat_reactions;
CREATE POLICY "reactions_delete" ON public.chat_reactions
  FOR DELETE USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- === MIGRATION: 20260420000019_fix_duplicate_task_notifications.sql ===
-- ══════════════════════════════════════════════════════════════
-- Corrige notificações duplicadas de tarefa
-- Raiz: 3 triggers disparam para o mesmo assignee na mesma operação:
--   1. tasks INSERT  → notify_task_assignee_direct
--   2. task_assignees INSERT → notify_task_assigned
--   3. tasks UPDATE  → notify_task_assignee_direct (via syncAssignees)
-- Solução: adicionar source_id + índice único para deduplicar
-- ══════════════════════════════════════════════════════════════

-- Adiciona coluna source_id (id da entidade que gerou a notificação)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- Índice único: um usuário só recebe 1 notificação por (tipo, entidade)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_no_dup
  ON public.notifications (user_id, type, source_id)
  WHERE source_id IS NOT NULL;

-- ── Atualiza notify_task_assignee_direct ──────────────────────
CREATE OR REPLACE FUNCTION public.notify_task_assignee_direct()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.assignee_id IS NULL THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.assignee_id = NEW.assignee_id THEN RETURN NEW; END IF;

  SELECT e.user_id INTO v_user_id
  FROM employees e WHERE e.id = NEW.assignee_id;

  IF v_user_id IS NULL OR v_user_id = auth.uid() THEN RETURN NEW; END IF;

  INSERT INTO notifications (tenant_id, user_id, type, title, body, link, source_id)
  VALUES (
    NEW.tenant_id, v_user_id, 'task_assigned',
    'Nova tarefa atribuída', NEW.title,
    CASE WHEN NEW.project_id IS NOT NULL THEN '/projetos/' || NEW.project_id::text ELSE '/tarefas' END,
    NEW.id
  )
  ON CONFLICT (user_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── Atualiza notify_task_assigned (task_assignees INSERT) ─────
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id  uuid;
  v_task_title text;
  v_project_id uuid;
  v_tenant_id  uuid;
BEGIN
  SELECT e.user_id INTO v_user_id
  FROM employees e WHERE e.id = NEW.employee_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT t.title, t.project_id, t.tenant_id
  INTO v_task_title, v_project_id, v_tenant_id
  FROM tasks t WHERE t.id = NEW.task_id;

  IF v_task_title IS NULL THEN RETURN NEW; END IF;
  IF v_user_id = auth.uid() THEN RETURN NEW; END IF;

  INSERT INTO notifications (tenant_id, user_id, type, title, body, link, source_id)
  VALUES (
    COALESCE(v_tenant_id, NEW.tenant_id), v_user_id, 'task_assigned',
    'Nova tarefa atribuída', v_task_title,
    CASE WHEN v_project_id IS NOT NULL THEN '/projetos/' || v_project_id::text ELSE '/tarefas' END,
    NEW.task_id
  )
  ON CONFLICT (user_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

-- === MIGRATION: 20260420000020_fix_reactions_rls.sql ===
-- Simplifica as policies de chat_reactions para evitar falhas silenciosas.
-- A policy de SELECT anterior usava um JOIN complexo que podia bloquear
-- a query de verificação de reação existente.

DROP POLICY IF EXISTS "reactions_select" ON public.chat_reactions;
DROP POLICY IF EXISTS "chat_react_select" ON public.chat_reactions;
DROP POLICY IF EXISTS "reactions_insert" ON public.chat_reactions;
DROP POLICY IF EXISTS "reactions_delete" ON public.chat_reactions;

-- SELECT: qualquer usuário autenticado pode ver reações
-- (as mensagens já são filtradas por RLS; quem vê a mensagem, pode ver a reação)
CREATE POLICY "reactions_select" ON public.chat_reactions
  FOR SELECT TO authenticated USING (true);

-- INSERT: apenas o próprio colaborador
CREATE POLICY "reactions_insert" ON public.chat_reactions
  FOR INSERT TO authenticated WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- DELETE: apenas o próprio colaborador
CREATE POLICY "reactions_delete" ON public.chat_reactions
  FOR DELETE TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- === MIGRATION: 20260420000021_deduplicate_notifications.sql ===
-- Remove notificações duplicadas existentes (mantém a mais antiga de cada grupo)
-- e marca as duplicatas que foram lidas como lidas em todo o grupo

-- 1. Para cada grupo de duplicatas onde ao menos uma foi lida, marca todas como lidas
UPDATE public.notifications n
SET is_read = true
WHERE is_read = false
  AND EXISTS (
    SELECT 1 FROM public.notifications n2
    WHERE n2.user_id  = n.user_id
      AND n2.type     = n.type
      AND n2.link     = n.link
      AND n2.is_read  = true
  );

-- 2. Remove duplicatas, mantendo apenas a mais recente de cada grupo
DELETE FROM public.notifications
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, type, link, tenant_id) id
  FROM public.notifications
  ORDER BY user_id, type, link, tenant_id, created_at DESC
);

-- === MIGRATION: 20260420000022_rename_reaction_to_emoji.sql ===
-- Renomeia coluna 'reaction' para 'emoji' em chat_reactions
-- A tabela foi criada originalmente com 'reaction' (migration 000010),
-- mas o código e a migration 000018 (IF NOT EXISTS ignorada) usam 'emoji'.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_reactions'
      AND column_name  = 'reaction'
  ) THEN
    ALTER TABLE public.chat_reactions RENAME COLUMN reaction TO emoji;
  END IF;
END $$;

-- === MIGRATION: 20260420100000_fix_hierarchy_views_security_invoker.sql ===
-- Fix: views de hierarquia sinalizadas pelo Supabase com security_definer
--
-- Problema:
--   As views employees_hierarchy_view, processes_hierarchy_view e
--   projects_hierarchy_view foram criadas no Supabase Dashboard sem
--   security_invoker. Em Postgres, views são SECURITY DEFINER por padrão,
--   o que significa que rodam com as permissões do owner (postgres) e
--   bypassam RLS nas tabelas subjacentes quando acessadas diretamente.
--
-- Risco:
--   Qualquer usuário autenticado que chame essas views via API REST poderia
--   ler dados de outros tenants, pois as policies RLS das tabelas base não
--   são aplicadas dentro da view.
--
-- Correção:
--   Aplicar security_invoker = true faz a view rodar com as permissões do
--   usuário chamador, respeitando RLS nas tabelas subjacentes.
--
-- Nota:
--   Quando essas views são chamadas de dentro de funções SECURITY DEFINER
--   (ex: user_process_matches_position_or_area), o comportamento não muda
--   — a função continua rodando como postgres. O risco corrigido é o acesso
--   direto via PostgREST API.

ALTER VIEW public.employees_hierarchy_view SET (security_invoker = true);
ALTER VIEW public.processes_hierarchy_view SET (security_invoker = true);
ALTER VIEW public.projects_hierarchy_view SET (security_invoker = true);

-- === MIGRATION: 20260421124205_ef7814c7-4850-4dec-baba-425417b3e1f9.sql ===

CREATE TABLE IF NOT EXISTS public.feed_audio_transcriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  attachment_url text NOT NULL,
  transcription text NOT NULL,
  language text,
  model text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, attachment_url)
);

CREATE INDEX IF NOT EXISTS idx_feed_audio_transcriptions_tenant
  ON public.feed_audio_transcriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feed_audio_transcriptions_url
  ON public.feed_audio_transcriptions(attachment_url);

ALTER TABLE public.feed_audio_transcriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read transcriptions"
  ON public.feed_audio_transcriptions
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "tenant members can insert transcriptions"
  ON public.feed_audio_transcriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "admins can update transcriptions"
  ON public.feed_audio_transcriptions
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

CREATE POLICY "admins can delete transcriptions"
  ON public.feed_audio_transcriptions
  FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- === MIGRATION: 20260421130700_e7a6d8cd-4c35-485f-8862-1ac0b8d8427c.sql ===
ALTER TABLE public.feed_comments ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
-- === MIGRATION: 20260421180406_a26afcad-ddf4-461c-b621-169ad3489dcb.sql ===
-- =========================================================================
-- Fase 1 do Chat Corporativo (v8.2.0)
-- Realtime + Threads + Presença + Mensagens Salvas
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. chat_messages.thread_root_id  (Threads estilo Slack)
-- -------------------------------------------------------------------------
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS thread_root_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_root
  ON public.chat_messages(thread_root_id)
  WHERE thread_root_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created
  ON public.chat_messages(conversation_id, created_at DESC);

-- -------------------------------------------------------------------------
-- 2. chat_presence  (Online/Offline + Status + DND)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE,
  tenant_id uuid NOT NULL,
  is_online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  dnd_until timestamptz,
  status_text text,
  status_emoji text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_presence_tenant
  ON public.chat_presence(tenant_id);

ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;

-- Helper: my employee id for presence (security definer to bypass RLS recursion)
CREATE OR REPLACE FUNCTION public.chat_presence_my_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;

DROP POLICY IF EXISTS chat_presence_select ON public.chat_presence;
CREATE POLICY chat_presence_select
  ON public.chat_presence
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS chat_presence_insert ON public.chat_presence;
CREATE POLICY chat_presence_insert
  ON public.chat_presence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND employee_id = public.chat_presence_my_employee_id()
  );

DROP POLICY IF EXISTS chat_presence_update ON public.chat_presence;
CREATE POLICY chat_presence_update
  ON public.chat_presence
  FOR UPDATE
  TO authenticated
  USING (employee_id = public.chat_presence_my_employee_id())
  WITH CHECK (employee_id = public.chat_presence_my_employee_id());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_chat_presence_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_presence_updated_at ON public.chat_presence;
CREATE TRIGGER trg_chat_presence_updated_at
  BEFORE UPDATE ON public.chat_presence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chat_presence_updated_at();

-- -------------------------------------------------------------------------
-- 3. chat_starred_messages  (Mensagens salvas/favoritadas)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_starred_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_starred_employee
  ON public.chat_starred_messages(employee_id, tenant_id, created_at DESC);

ALTER TABLE public.chat_starred_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_starred_select ON public.chat_starred_messages;
CREATE POLICY chat_starred_select
  ON public.chat_starred_messages
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND employee_id = public.chat_presence_my_employee_id()
  );

DROP POLICY IF EXISTS chat_starred_insert ON public.chat_starred_messages;
CREATE POLICY chat_starred_insert
  ON public.chat_starred_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND employee_id = public.chat_presence_my_employee_id()
  );

DROP POLICY IF EXISTS chat_starred_delete ON public.chat_starred_messages;
CREATE POLICY chat_starred_delete
  ON public.chat_starred_messages
  FOR DELETE
  TO authenticated
  USING (employee_id = public.chat_presence_my_employee_id());

-- -------------------------------------------------------------------------
-- 4. Realtime publication
-- -------------------------------------------------------------------------
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.chat_presence REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_presence;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
-- === MIGRATION: 20260421183726_6b8988bc-3695-4ca1-9f61-f3fc69899d78.sql ===
-- ============================================================
-- v8.3.0 — Fase 2: Pinned messages, mentions, channel topic
-- ============================================================

-- 1) chat_messages: pinned + deleted_for (apagar para mim)
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_for uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned
  ON public.chat_messages (conversation_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

-- 2) chat_conversations: topic + description (description já existe; topic é novo)
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS topic text;

-- 3) chat_mentions
CREATE TABLE IF NOT EXISTS public.chat_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  mentioned_employee_id uuid NOT NULL,
  mention_type text NOT NULL DEFAULT 'user', -- 'user' | 'here' | 'channel'
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_mentioned_unread
  ON public.chat_mentions (mentioned_employee_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_mentions_message
  ON public.chat_mentions (message_id);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_tenant
  ON public.chat_mentions (tenant_id);

ALTER TABLE public.chat_mentions ENABLE ROW LEVEL SECURITY;

-- SELECT: mencionado vê suas menções; autor da mensagem vê quem mencionou
DROP POLICY IF EXISTS chat_mentions_select ON public.chat_mentions;
CREATE POLICY chat_mentions_select
  ON public.chat_mentions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      mentioned_employee_id = public.chat_my_employee_id()
      OR EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.id = chat_mentions.message_id
          AND m.employee_id = public.chat_my_employee_id()
      )
    )
  );

-- INSERT: somente o autor da mensagem pode criar menções (e dentro do seu tenant)
DROP POLICY IF EXISTS chat_mentions_insert ON public.chat_mentions;
CREATE POLICY chat_mentions_insert
  ON public.chat_mentions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_mentions.message_id
        AND m.employee_id = public.chat_my_employee_id()
    )
  );

-- UPDATE: mencionado pode marcar como lida
DROP POLICY IF EXISTS chat_mentions_update ON public.chat_mentions;
CREATE POLICY chat_mentions_update
  ON public.chat_mentions
  FOR UPDATE
  TO authenticated
  USING (mentioned_employee_id = public.chat_my_employee_id())
  WITH CHECK (mentioned_employee_id = public.chat_my_employee_id());

-- 4) Realtime
ALTER TABLE public.chat_mentions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_mentions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mentions';
  END IF;
END $$;

-- === MIGRATION: 20260421191501_375c00cd-79b4-4bec-9e79-fa524640abb9.sql ===
-- Labels de conversas
CREATE TABLE public.chat_conversation_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366F1',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE public.chat_conversation_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_labels_select ON public.chat_conversation_labels
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY chat_labels_insert ON public.chat_conversation_labels
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY chat_labels_update ON public.chat_conversation_labels
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY chat_labels_delete ON public.chat_conversation_labels
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

-- Atribuição de labels
CREATE TABLE public.chat_conversation_label_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  label_id uuid NOT NULL REFERENCES public.chat_conversation_labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, label_id)
);

ALTER TABLE public.chat_conversation_label_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_label_assign_select ON public.chat_conversation_label_assignments
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY chat_label_assign_insert ON public.chat_conversation_label_assignments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY chat_label_assign_delete ON public.chat_conversation_label_assignments
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Colunas em chat_participants
ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS muted_until timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS unread_override boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chat_participants_pinned ON public.chat_participants(employee_id, pinned_at) WHERE pinned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_participants_archived ON public.chat_participants(employee_id, archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_label_assign_conv ON public.chat_conversation_label_assignments(conversation_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversation_labels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversation_label_assignments;
-- === MIGRATION: 20260421193152_9f3e823c-aabe-4f1f-8885-6466bde5d21b.sql ===
-- Lembretes
CREATE TABLE public.chat_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid,
  remind_at timestamptz NOT NULL,
  text text,
  fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_reminders_due ON public.chat_reminders(remind_at) WHERE fired_at IS NULL;
CREATE INDEX idx_chat_reminders_emp ON public.chat_reminders(employee_id);

ALTER TABLE public.chat_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_reminders_select ON public.chat_reminders
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id() AND employee_id = chat_presence_my_employee_id());

CREATE POLICY chat_reminders_insert ON public.chat_reminders
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND employee_id = chat_presence_my_employee_id());

CREATE POLICY chat_reminders_update ON public.chat_reminders
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND employee_id = chat_presence_my_employee_id());

CREATE POLICY chat_reminders_delete ON public.chat_reminders
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND employee_id = chat_presence_my_employee_id());

-- Polls
CREATE TABLE public.chat_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  question text NOT NULL,
  multi boolean NOT NULL DEFAULT false,
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.chat_polls(id) ON DELETE CASCADE,
  text text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.chat_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.chat_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.chat_poll_options(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, option_id, employee_id)
);

CREATE INDEX idx_poll_options_poll ON public.chat_poll_options(poll_id);
CREATE INDEX idx_poll_votes_poll ON public.chat_poll_votes(poll_id);

ALTER TABLE public.chat_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_polls_select ON public.chat_polls
  FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids()));

CREATE POLICY chat_polls_insert ON public.chat_polls
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids())
  );

CREATE POLICY chat_polls_update ON public.chat_polls
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR is_admin() OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY chat_polls_delete ON public.chat_polls
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR is_admin() OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY chat_poll_options_select ON public.chat_poll_options
  FOR SELECT TO authenticated
  USING (poll_id IN (SELECT id FROM chat_polls WHERE conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids())));

CREATE POLICY chat_poll_options_insert ON public.chat_poll_options
  FOR INSERT TO authenticated
  WITH CHECK (poll_id IN (SELECT id FROM chat_polls WHERE created_by = auth.uid()));

CREATE POLICY chat_poll_options_delete ON public.chat_poll_options
  FOR DELETE TO authenticated
  USING (poll_id IN (SELECT id FROM chat_polls WHERE created_by = auth.uid()));

CREATE POLICY chat_poll_votes_select ON public.chat_poll_votes
  FOR SELECT TO authenticated
  USING (poll_id IN (SELECT id FROM chat_polls WHERE conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids())));

CREATE POLICY chat_poll_votes_insert ON public.chat_poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = chat_presence_my_employee_id()
    AND poll_id IN (SELECT id FROM chat_polls WHERE conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids()))
  );

CREATE POLICY chat_poll_votes_delete ON public.chat_poll_votes
  FOR DELETE TO authenticated
  USING (employee_id = chat_presence_my_employee_id());

-- Bookmarks do canal
CREATE TABLE public.chat_channel_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_bookmarks_conv ON public.chat_channel_bookmarks(conversation_id, sort_order);

ALTER TABLE public.chat_channel_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_bookmarks_select ON public.chat_channel_bookmarks
  FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT conversation_id FROM chat_my_conversation_ids()));

CREATE POLICY chat_bookmarks_insert ON public.chat_channel_bookmarks
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role))
  );

CREATE POLICY chat_bookmarks_update ON public.chat_channel_bookmarks
  FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY chat_bookmarks_delete ON public.chat_channel_bookmarks
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager'::app_role)));

-- Canvas/notas do canal
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS canvas_doc_id uuid;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_poll_options;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_bookmarks;
-- === MIGRATION: 20260421215317_a74da412-6eb3-4156-8262-a1155f3ce180.sql ===
-- ============================================================================
-- v8.6.0 — Videoconferência LiveKit
-- ============================================================================

-- 1) Colunas em meetings
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_mode TEXT NOT NULL DEFAULT 'livekit'
    CHECK (meeting_mode IN ('in_person','external_link','livekit')),
  ADD COLUMN IF NOT EXISTS livekit_room_name TEXT,
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS recording_status TEXT
    CHECK (recording_status IN ('pending','recording','completed','failed')),
  ADD COLUMN IF NOT EXISTS egress_id TEXT,
  ADD COLUMN IF NOT EXISTS live_participants JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS meetings_livekit_room_name_key
  ON public.meetings(livekit_room_name)
  WHERE livekit_room_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS meetings_recording_status_idx
  ON public.meetings(recording_status)
  WHERE recording_status IS NOT NULL;

-- 2) Tabela chat_huddles
CREATE TABLE IF NOT EXISTS public.chat_huddles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  livekit_room_name TEXT NOT NULL UNIQUE,
  started_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_huddles_conv_idx
  ON public.chat_huddles(conversation_id, status);
CREATE INDEX IF NOT EXISTS chat_huddles_tenant_idx
  ON public.chat_huddles(tenant_id);

ALTER TABLE public.chat_huddles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_huddles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "huddles_select_participant" ON public.chat_huddles;
CREATE POLICY "huddles_select_participant" ON public.chat_huddles
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.chat_my_tenant_id()
    AND conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

DROP POLICY IF EXISTS "huddles_insert_participant" ON public.chat_huddles;
CREATE POLICY "huddles_insert_participant" ON public.chat_huddles
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.chat_my_tenant_id()
    AND started_by = public.chat_my_employee_id()
    AND conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

DROP POLICY IF EXISTS "huddles_update_participant" ON public.chat_huddles;
CREATE POLICY "huddles_update_participant" ON public.chat_huddles
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.chat_my_tenant_id()
    AND conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  )
  WITH CHECK (
    tenant_id = public.chat_my_tenant_id()
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS chat_huddles_updated_at ON public.chat_huddles;
CREATE TRIGGER chat_huddles_updated_at
  BEFORE UPDATE ON public.chat_huddles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Realtime
ALTER TABLE public.chat_huddles REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_huddles';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_huddles';
  END IF;
END $$;

-- 3) Tabela meeting_recording_events (auditoria)
CREATE TABLE IF NOT EXISTS public.meeting_recording_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
  huddle_id UUID REFERENCES public.chat_huddles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'participant_joined','participant_left',
    'egress_started','egress_updated','egress_ended',
    'room_started','room_finished','recording_failed'
  )),
  participant_identity TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rec_events_meeting_idx
  ON public.meeting_recording_events(meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rec_events_huddle_idx
  ON public.meeting_recording_events(huddle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rec_events_tenant_idx
  ON public.meeting_recording_events(tenant_id);

ALTER TABLE public.meeting_recording_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recording_events FORCE ROW LEVEL SECURITY;

-- Apenas leitura: tenant + (acesso à meeting OU acesso ao huddle)
DROP POLICY IF EXISTS "rec_events_select_tenant" ON public.meeting_recording_events;
CREATE POLICY "rec_events_select_tenant" ON public.meeting_recording_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
  );

-- Insert: apenas service_role (webhook). Nenhuma policy para authenticated => bloqueado.
-- === MIGRATION: 20260422013045_7b1c6e24-e744-42a5-a6cb-449b34a9321d.sql ===
-- Hotfix: destrava reuniões cujo recording_status ficou preso em "recording" sem URL
-- (egress_ended não chegou via webhook)
UPDATE meetings 
SET recording_status = 'pending', updated_at = now()
WHERE meeting_mode = 'livekit'
  AND status IN ('completed', 'cancelled')
  AND recording_status = 'recording'
  AND recording_url IS NULL;
-- === MIGRATION: 20260422013749_7dc41b51-19d0-4062-908c-fdeb527adfbb.sql ===
-- Tabela para pedidos de entrada de convidados externos em reuniões LiveKit
CREATE TABLE public.meeting_guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  livekit_room_name text NOT NULL,
  guest_name text NOT NULL,
  guest_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_guest_requests_room ON public.meeting_guest_requests(livekit_room_name, status);
CREATE INDEX idx_meeting_guest_requests_meeting ON public.meeting_guest_requests(meeting_id, status);
CREATE INDEX idx_meeting_guest_requests_token ON public.meeting_guest_requests(guest_token);

-- Trigger updated_at
CREATE TRIGGER trg_meeting_guest_requests_updated_at
BEFORE UPDATE ON public.meeting_guest_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS
ALTER TABLE public.meeting_guest_requests ENABLE ROW LEVEL SECURITY;

-- Helper: é o host (criador) da reunião?
CREATE OR REPLACE FUNCTION public.is_meeting_host(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = p_meeting_id
      AND m.created_by = auth.uid()
  );
$$;

-- Policies
-- Host (criador) consegue ver os pedidos da sua reunião
CREATE POLICY "Host can view guest requests"
ON public.meeting_guest_requests FOR SELECT
TO authenticated
USING (public.is_meeting_host(meeting_id) OR public.is_admin());

-- Host pode atualizar status (aprovar/recusar)
CREATE POLICY "Host can update guest requests"
ON public.meeting_guest_requests FOR UPDATE
TO authenticated
USING (public.is_meeting_host(meeting_id) OR public.is_admin())
WITH CHECK (public.is_meeting_host(meeting_id) OR public.is_admin());

-- Convidado consegue ler o próprio pedido (via edge function service role) — mas precisamos permitir SELECT público restrito por guest_token
-- Como RLS não suporta isso bem, vamos deixar o convidado ler via edge function (service role).
-- Para realtime no host, basta SELECT acima.

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_guest_requests;
ALTER TABLE public.meeting_guest_requests REPLICA IDENTITY FULL;
-- === MIGRATION: 20260422014426_b40b4e7c-7ae0-4a34-aebb-409ecfc4652c.sql ===
-- v8.7.1 — Hardening RLS de meeting_guest_requests + força realtime
-- Garante: anon pode inserir SOMENTE se a sala estiver ativa; ninguém pode deletar.

-- 1. INSERT público (anon + authenticated) — validação da sala ativa via subquery
DROP POLICY IF EXISTS "Public can insert guest request for active rooms" ON public.meeting_guest_requests;
CREATE POLICY "Public can insert guest request for active rooms"
  ON public.meeting_guest_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Status sempre começa como pending; sem decisão preexistente
    status = 'pending'
    AND decided_at IS NULL
    AND decided_by IS NULL
    -- Sala precisa existir e estar ativa
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.tenant_id = meeting_guest_requests.tenant_id
        AND (
          m.status IN ('scheduled', 'recording')
          OR m.recording_status = 'recording'
        )
    )
  );

-- 2. Bloqueia DELETE para qualquer role autenticada/anon (registro auditável)
DROP POLICY IF EXISTS "No one can delete guest requests" ON public.meeting_guest_requests;
CREATE POLICY "No one can delete guest requests"
  ON public.meeting_guest_requests
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- 3. Garante que SELECT público (anon) NÃO existe — convidado lê via edge function (service_role)
-- (a policy "Host can view guest requests" já restringe ao host/admin via TO authenticated)

-- 4. Garante que a tabela está em REPLICA IDENTITY FULL para realtime
ALTER TABLE public.meeting_guest_requests REPLICA IDENTITY FULL;

-- 5. Garante que a tabela está publicada no realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meeting_guest_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_guest_requests;
  END IF;
END $$;
-- === MIGRATION: 20260422100000_fix_chat_polls_rls.sql ===
-- Fix chat_polls_update RLS: managers could update any poll in tenant
-- regardless of whether they participate in the conversation.
-- Restrict to polls in conversations where the manager is a participant.

DROP POLICY IF EXISTS chat_polls_update ON public.chat_polls;

CREATE POLICY chat_polls_update ON public.chat_polls
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      (is_admin() OR has_role(auth.uid(), 'manager'::app_role))
      AND conversation_id IN (
        SELECT conversation_id FROM public.chat_my_conversation_ids()
      )
    )
  );

-- === MIGRATION: 20260422110000_meetings_project_member_visibility.sql ===
-- Visibilidade de reuniões por membro de projeto (v8.11.0)
-- Além do criador e dos participantes listados, membros do projeto vinculado
-- à reunião também podem visualizá-la.

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;

CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR meetings.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.meeting_attendees ma
        JOIN public.employees e ON e.id = ma.employee_id
        WHERE ma.meeting_id = meetings.id AND e.user_id = auth.uid()
      )
      OR (
        meetings.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.employee_projects ep
          JOIN public.employees e ON e.id = ep.employee_id
          WHERE ep.project_id = meetings.project_id AND e.user_id = auth.uid()
        )
      )
    )
  );

-- === MIGRATION: 20260427183226_7f8b1d1b-8862-4d2f-82ff-ed8afbd3b4b8.sql ===
UPDATE public.meetings SET status = 'completed', updated_at = now() WHERE id = '00533560-ec62-4754-abf3-536672c9cc0e' AND status = 'processing';
-- === MIGRATION: 20260427202936_7e27e0a9-2292-47b9-ace8-c82599247840.sql ===
-- v8.10.5: Sistema robusto de processamento de IA para reuniões grandes
-- Cria tabela de jobs com fase, progresso, heartbeat e RLS por tenant.
-- Também destrava reuniões antigas presas em status 'processing'.

CREATE TABLE IF NOT EXISTS public.meeting_ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid,
  status text NOT NULL DEFAULT 'queued',     -- queued | processing | completed | failed | cancelled
  phase text NOT NULL DEFAULT 'queued',      -- queued | chunking | extracting | reducing | consolidating | saving | done
  progress integer NOT NULL DEFAULT 0,       -- 0..100
  total_chunks integer NOT NULL DEFAULT 0,
  processed_chunks integer NOT NULL DEFAULT 0,
  failed_chunks integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_ai_jobs_meeting_idx
  ON public.meeting_ai_jobs(meeting_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meeting_ai_jobs_tenant_status_idx
  ON public.meeting_ai_jobs(tenant_id, status);

ALTER TABLE public.meeting_ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_ai_jobs_select" ON public.meeting_ai_jobs;
CREATE POLICY "meeting_ai_jobs_select" ON public.meeting_ai_jobs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- Inserts/updates/deletes sao feitos pelo edge function via service_role,
-- bypassa RLS automaticamente; mas mantemos politicas restritivas como defesa.
DROP POLICY IF EXISTS "meeting_ai_jobs_insert_admin" ON public.meeting_ai_jobs;
CREATE POLICY "meeting_ai_jobs_insert_admin" ON public.meeting_ai_jobs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

DROP POLICY IF EXISTS "meeting_ai_jobs_update_admin" ON public.meeting_ai_jobs;
CREATE POLICY "meeting_ai_jobs_update_admin" ON public.meeting_ai_jobs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

DROP POLICY IF EXISTS "meeting_ai_jobs_delete_admin" ON public.meeting_ai_jobs;
CREATE POLICY "meeting_ai_jobs_delete_admin" ON public.meeting_ai_jobs
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- Trigger updated_at
CREATE TRIGGER meeting_ai_jobs_updated_at
  BEFORE UPDATE ON public.meeting_ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Habilitar realtime para o frontend acompanhar progresso
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_ai_jobs;

-- Recuperacao: marca jobs sem heartbeat ha mais de 4 minutos como failed.
UPDATE public.meeting_ai_jobs
SET status = 'failed',
    error_message = COALESCE(error_message, 'Stale job (no heartbeat)'),
    finished_at = COALESCE(finished_at, now())
WHERE status IN ('queued', 'processing')
  AND COALESCE(heartbeat_at, started_at, created_at) < now() - interval '4 minutes';

-- Recuperacao: destrava reunioes presas em 'processing' ha mais de 10 minutos.
UPDATE public.meetings
SET status = 'completed',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'ai_error', 'Auto-recovered: processing exceeded timeout',
      'auto_recovered_at', now()
    ),
    updated_at = now()
WHERE status = 'processing'
  AND updated_at < now() - interval '10 minutes';
-- === MIGRATION: 20260428103500_meetings_recurrence_and_system_bot.sql ===
-- ============================================================
-- Migração: reuniões recorrentes + bot de sistema (notificações)
-- Fatia 2 + Fatia 3 do roadmap GT3 v8.12.0
-- ============================================================

-- ── Fatia 2: Recorrência em meetings ────────────────────────────
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_pattern jsonb,
    -- {freq: 'daily'|'weekly', byday: ['MO','TU','WE','TH','FR','SA','SU'],
    --  time: 'HH:MM', tz: 'America/Sao_Paulo', end_date: 'YYYY-MM-DD'|null}
  ADD COLUMN IF NOT EXISTS reminder_minutes_before integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_occurrence_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS meetings_next_occurrence_idx
  ON public.meetings (next_occurrence_at)
  WHERE is_recurring = true;

-- Calcula próximo horário a partir de um padrão de recorrência
CREATE OR REPLACE FUNCTION public.compute_next_meeting_occurrence(
  p_pattern jsonb,
  p_after timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_freq text;
  v_byday text[];
  v_time text;
  v_tz text;
  v_end_date date;
  v_candidate timestamptz;
  v_local_date date;
  v_dow text;
  v_dows text[] := ARRAY['SU','MO','TU','WE','TH','FR','SA'];
BEGIN
  IF p_pattern IS NULL THEN
    RETURN NULL;
  END IF;

  v_freq := COALESCE(p_pattern->>'freq', 'weekly');
  v_byday := CASE
    WHEN p_pattern->'byday' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_pattern->'byday'))
    ELSE ARRAY['MO','TU','WE','TH','FR']
  END;
  v_time := COALESCE(p_pattern->>'time', '09:00');
  v_tz := COALESCE(p_pattern->>'tz', 'America/Sao_Paulo');
  v_end_date := NULLIF(p_pattern->>'end_date','')::date;

  -- Busca a próxima ocorrência até 60 dias adiante
  FOR i IN 0..60 LOOP
    v_local_date := (timezone(v_tz, p_after))::date + i;
    IF v_end_date IS NOT NULL AND v_local_date > v_end_date THEN
      RETURN NULL;
    END IF;

    v_dow := v_dows[EXTRACT(DOW FROM v_local_date)::int + 1];
    IF v_freq = 'daily' OR v_dow = ANY(v_byday) THEN
      v_candidate := timezone(
        v_tz,
        (v_local_date::text || ' ' || v_time)::timestamp
      );
      IF v_candidate > p_after THEN
        RETURN v_candidate;
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- Trigger: recalcula next_occurrence_at quando padrão/horário muda;
-- também reseta last_reminder_sent_at para que o cron renotifique adiamentos.
CREATE OR REPLACE FUNCTION public.meetings_recurrence_recompute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_recurring THEN
    NEW.next_occurrence_at := public.compute_next_meeting_occurrence(
      NEW.recurrence_pattern, now()
    );
  ELSE
    -- Para reuniões pontuais, next_occurrence_at espelha scheduled_date+time
    IF NEW.scheduled_date IS NOT NULL THEN
      NEW.next_occurrence_at := (NEW.scheduled_date::text || ' ' ||
        COALESCE(NEW.scheduled_time::text, '09:00')
      )::timestamp AT TIME ZONE 'America/Sao_Paulo';
    END IF;
  END IF;

  -- Renotifica se horário/recorrência mudou
  IF TG_OP = 'UPDATE' AND (
    OLD.next_occurrence_at IS DISTINCT FROM NEW.next_occurrence_at
    OR OLD.recurrence_pattern IS DISTINCT FROM NEW.recurrence_pattern
    OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
    OR OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time
  ) THEN
    NEW.last_reminder_sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meetings_recurrence_recompute_trg ON public.meetings;
CREATE TRIGGER meetings_recurrence_recompute_trg
  BEFORE INSERT OR UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.meetings_recurrence_recompute();

-- RLS adicional: apenas admins podem criar/editar reuniões recorrentes.
-- Reuniões pontuais continuam acessíveis a admin/manager (policies originais).
DROP POLICY IF EXISTS meetings_recurring_admin_only ON public.meetings;
CREATE POLICY meetings_recurring_admin_only ON public.meetings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (NOT is_recurring OR public.is_admin())
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (NOT is_recurring OR public.is_admin())
  );

-- ── Fatia 3: Bot de sistema para notificações ──────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_system_bot boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_system_bot_idx
  ON public.profiles (tenant_id) WHERE is_system_bot = true;

-- Helper: garante que cada tenant tem um bot próprio.
-- O bot precisa de um auth.users companheiro — usamos um id determinístico
-- por tenant para facilitar idempotência.
CREATE OR REPLACE FUNCTION public.ensure_system_bot(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bot_user_id uuid;
BEGIN
  SELECT user_id INTO v_bot_user_id
    FROM public.profiles
   WHERE tenant_id = p_tenant_id AND is_system_bot = true
   LIMIT 1;

  IF v_bot_user_id IS NOT NULL THEN
    RETURN v_bot_user_id;
  END IF;

  -- Cria auth.users + profile do bot. Email único por tenant.
  v_bot_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, confirmed_at)
  VALUES (
    v_bot_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bot+' || p_tenant_id::text || '@empire.system',
    jsonb_build_object('full_name', 'Empire Bot', 'is_bot', true),
    jsonb_build_object('provider', 'system', 'providers', ARRAY['system']),
    now(), now(), now()
  );

  INSERT INTO public.profiles (user_id, tenant_id, full_name, is_system_bot)
  VALUES (v_bot_user_id, p_tenant_id, 'Empire Bot', true);

  -- Garante employees row para o bot poder participar de chat_conversations
  INSERT INTO public.employees (tenant_id, user_id, status, work_email)
  VALUES (p_tenant_id, v_bot_user_id, 'active', 'bot+' || p_tenant_id::text || '@empire.system')
  ON CONFLICT DO NOTHING;

  RETURN v_bot_user_id;
END;
$$;

-- Garante uma conversa direct (DM) entre dois employees, criando se não
-- existir. Retorna o id da conversa. Idempotente.
CREATE OR REPLACE FUNCTION public.ensure_dm_conversation(
  p_tenant_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_a uuid;
  v_emp_b uuid;
  v_conv_id uuid;
BEGIN
  SELECT id INTO v_emp_a FROM public.employees
    WHERE user_id = p_user_a AND tenant_id = p_tenant_id LIMIT 1;
  SELECT id INTO v_emp_b FROM public.employees
    WHERE user_id = p_user_b AND tenant_id = p_tenant_id LIMIT 1;

  IF v_emp_a IS NULL OR v_emp_b IS NULL THEN
    RETURN NULL;
  END IF;

  -- Procura DM existente onde ambos employees participam
  SELECT c.id INTO v_conv_id
    FROM public.chat_conversations c
    WHERE c.tenant_id = p_tenant_id
      AND c.type = 'direct'
      AND EXISTS (
        SELECT 1 FROM public.chat_participants p
        WHERE p.conversation_id = c.id AND p.employee_id = v_emp_a
      )
      AND EXISTS (
        SELECT 1 FROM public.chat_participants p
        WHERE p.conversation_id = c.id AND p.employee_id = v_emp_b
      )
    LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Cria nova conversa
  INSERT INTO public.chat_conversations (tenant_id, type, created_by)
  VALUES (p_tenant_id, 'direct', p_user_a)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.chat_participants (conversation_id, employee_id)
  VALUES (v_conv_id, v_emp_a), (v_conv_id, v_emp_b);

  RETURN v_conv_id;
END;
$$;

-- Backfill: cria bot para todos os tenants existentes
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.ensure_system_bot(t.id);
  END LOOP;
END$$;

-- Tabela de notificações já existe (assumido). Se não existir, comentar bloco abaixo.
-- Garante coluna metadata para roteamento de tipos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    EXECUTE 'ALTER TABLE public.notifications
             ADD COLUMN IF NOT EXISTS source text DEFAULT ''system''';
  END IF;
END$$;

-- ── pg_cron: dispatcher de reminders (Fatia 3) ──────────────────
-- Roda a cada minuto e chama a edge function system-bot-notify para
-- cada meeting que está dentro da janela reminder_minutes_before.
-- Requer GUCs configuradas no projeto:
--   ALTER DATABASE postgres SET app.functions_url = 'https://<ref>.supabase.co/functions/v1';
--   ALTER DATABASE postgres SET app.service_role_key = '<service-role-jwt>';
DO $$
DECLARE
  v_has_cron boolean;
  v_has_net  boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') INTO v_has_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net')  INTO v_has_net;

  IF v_has_cron AND v_has_net THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='meeting_reminder_dispatch') THEN
      PERFORM cron.unschedule('meeting_reminder_dispatch');
    END IF;

    PERFORM cron.schedule(
      'meeting_reminder_dispatch',
      '* * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.functions_url', true) || '/system-bot-notify',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := jsonb_build_object('type','meeting_reminder')
      );
      $cron$
    );
  END IF;
END$$;

COMMENT ON COLUMN public.meetings.recurrence_pattern IS
  'JSON: {freq: daily|weekly, byday: [MO,TU,...], time: HH:MM, tz, end_date}';
COMMENT ON COLUMN public.meetings.reminder_minutes_before IS
  'Minutos antes de next_occurrence_at em que o bot envia lembrete';
COMMENT ON COLUMN public.profiles.is_system_bot IS
  'Marca o usuário como bot de sistema (não aparece em listas humanas)';

-- === MIGRATION: 20260429120000_fix_task_asset_urls.sql ===
-- Fix: cover_url e attachments[].url de tarefas foram corrompidos por
-- normalizeSupabaseAssetUrl ser aplicado no estado do TaskDetailModal e
-- persistido pelo auto-save. URLs viraram same-origin (ex.: gt3.omnx.pro)
-- e quebravam quando lidas em outros hosts/proxies.
-- Esta migration reverte URLs same-origin para o domínio canônico do projeto.

DO $$
DECLARE
  canonical_origin text := 'https://opbdoulspzlabxzevffc.supabase.co';
  bad_hosts text[] := ARRAY[
    'https://gt3.omnx.pro',
    'https://gt3.empirebusiness.com.br',
    'https://t3.empirebusiness.com.br'
  ];
  h text;
BEGIN
  FOREACH h IN ARRAY bad_hosts LOOP
    -- cover_url
    UPDATE public.tasks
    SET cover_url = REPLACE(cover_url, h, canonical_origin)
    WHERE cover_url LIKE h || '/storage/v1/%';

    -- attachments JSONB array: reescreve url de cada item
    UPDATE public.tasks t
    SET attachments = (
      SELECT jsonb_agg(
        CASE
          WHEN (item->>'url') LIKE h || '/storage/v1/%'
            THEN jsonb_set(item, '{url}', to_jsonb(REPLACE(item->>'url', h, canonical_origin)))
          ELSE item
        END
      )
      FROM jsonb_array_elements(t.attachments) AS item
    )
    WHERE t.attachments IS NOT NULL
      AND jsonb_typeof(t.attachments) = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(t.attachments) AS item
        WHERE (item->>'url') LIKE h || '/storage/v1/%'
      );
  END LOOP;
END $$;

-- === MIGRATION: 20260429180000_security_hardening.sql ===
-- Security hardening — corrige vulnerabilidades de RLS e isolamento multi-tenant
-- 1) task_assignees: policies usavam task_assignees.id = auth.uid() (id é PK, não user_id)
-- 2) chat_reactions: SELECT com USING true vazava entre tenants
-- 3) chat-attachments: DELETE sem checagem de ownership/tenant
-- 4) platform thumbnails: políticas só checavam authenticated, não admin
-- 5) kb_docs_select: join com self-reference em vez de knowledge_base_documents
-- 6) realtime.messages: sem RLS — qualquer user assinava qualquer canal

-- ================================================================
-- 1) task_assignees — fix predicate
-- ================================================================
DROP POLICY IF EXISTS "task_assignees_select" ON public.task_assignees;
DROP POLICY IF EXISTS "task_assignees_insert" ON public.task_assignees;
DROP POLICY IF EXISTS "task_assignees_delete" ON public.task_assignees;
DROP POLICY IF EXISTS "task_assignees_update" ON public.task_assignees;

CREATE POLICY "task_assignees_select" ON public.task_assignees
  FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "task_assignees_insert" ON public.task_assignees
  FOR INSERT TO authenticated WITH CHECK (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "task_assignees_delete" ON public.task_assignees
  FOR DELETE TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "task_assignees_update" ON public.task_assignees
  FOR UPDATE TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- ================================================================
-- 2) chat_reactions — SELECT scoped por conversation membership
-- ================================================================
DROP POLICY IF EXISTS "reactions_select" ON public.chat_reactions;
DROP POLICY IF EXISTS "chat_react_select" ON public.chat_reactions;

CREATE POLICY "chat_react_select" ON public.chat_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_reactions.message_id
        AND m.conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
    )
  );

-- ================================================================
-- 3) chat-attachments storage — DELETE por path do uploader
-- (path convencional: "<user_id>/<conversation_id>/<filename>")
-- ================================================================
DROP POLICY IF EXISTS "chat_attach_delete" ON storage.objects;
CREATE POLICY "chat_attach_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (
      -- Owner do arquivo (path começa com user_id)
      (auth.uid())::text = (storage.foldername(name))[1]
      OR
      -- Ou admin do tenant
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
      )
    )
  );

-- ================================================================
-- 4) platform thumbnails — admin scoping
-- ================================================================
DROP POLICY IF EXISTS "admins can upload platform thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "admins can delete platform thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload platform thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete platform thumbnails" ON storage.objects;

CREATE POLICY "admins can upload platform thumbnails"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE POLICY "admins can delete platform thumbnails"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- ================================================================
-- 5) knowledge_base_documents (kb_docs_select) — fix self-reference join
-- A condition original usava knowledge_base_shares.document_id = knowledge_base_shares.id
-- (sempre falsa). Corrige para document_id = knowledge_base_documents.id.
-- Mantém: docs de empresa (não pessoais), docs próprios, e docs compartilhados.
-- ================================================================
DROP POLICY IF EXISTS "kb_docs_select" ON public.knowledge_base_documents;

CREATE POLICY "kb_docs_select" ON public.knowledge_base_documents
  FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND (
      -- Docs da empresa (não pessoais) — todos do tenant veem
      is_personal = false
      OR
      -- Doc próprio
      owner_id = auth.uid()
      OR
      -- Doc compartilhado comigo
      EXISTS (
        SELECT 1 FROM public.knowledge_base_shares s
        WHERE s.document_id = knowledge_base_documents.id
          AND s.shared_with = auth.uid()
      )
    )
  );

-- ================================================================
-- 6) realtime.messages — RLS por tenant + conversation
-- Sem políticas, qualquer usuário autenticado assinava qualquer canal,
-- recebendo broadcasts de outros tenants (chat, presence, meetings…).
-- ================================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_messages_select" ON realtime.messages;
CREATE POLICY "realtime_messages_select" ON realtime.messages
  FOR SELECT TO authenticated USING (
    -- Topic deve mencionar tenant_id do usuário OU conversation que ele participa
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (
          realtime.messages.topic LIKE 'tenant:' || p.tenant_id::text || ':%'
          OR realtime.messages.topic = 'tenant:' || p.tenant_id::text
        )
    )
    OR
    -- Canais de chat: topic no formato "chat:<conversation_id>"
    (
      realtime.messages.topic LIKE 'chat:%'
      AND substring(realtime.messages.topic from 6) IN (
        SELECT conversation_id::text FROM public.chat_my_conversation_ids()
      )
    )
  );

DROP POLICY IF EXISTS "realtime_messages_insert" ON realtime.messages;
CREATE POLICY "realtime_messages_insert" ON realtime.messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND realtime.messages.topic LIKE 'tenant:' || p.tenant_id::text || '%'
    )
  );

-- === MIGRATION: 20260429190000_security_hardening_round2.sql ===
-- Security hardening — round 2
-- Endereça warnings de linter:
-- 0011: function search_path mutable (todas as funções em public)
-- 0028: SECURITY DEFINER functions executáveis sem login (anon)
-- 0029: SECURITY DEFINER functions executáveis por usuários autenticados
-- 0025: public buckets com SELECT amplo (storage.objects)

-- ================================================================
-- 1) Pin search_path em todas as funções de public
-- Evita ataque de search_path injection contra SECURITY DEFINER.
-- ================================================================
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS fn_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'  -- só functions, não aggregates/window
      -- Pula funções que já têm search_path setado
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.schema_name, fn.fn_name, fn.args
    );
  END LOOP;
END $$;

-- ================================================================
-- 2) Revogar EXECUTE de funções SECURITY DEFINER para anon
-- Funções SECURITY DEFINER rodam como owner — não devem ser
-- chamáveis por usuários sem login, exceto whitelist explícita.
-- ================================================================
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS fn_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true   -- SECURITY DEFINER
      AND p.prokind = 'f'
  LOOP
    -- Revoga de PUBLIC e anon, mantém para authenticated/service_role
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      fn.schema_name, fn.fn_name, fn.args
    );
  END LOOP;
END $$;

-- ================================================================
-- 3) Public buckets — restringir SELECT
-- Buckets "branding", "attachments", "feed-attachments" são "public"
-- mas a policy "Brand assets are publicly accessible"/etc usava
-- USING (bucket_id = 'X') sem nenhum filtro — qualquer um podia
-- LISTAR todos os arquivos do bucket.
-- Mantemos leitura pública (URLs assinadas/public funcionam) mas
-- impedimos listagem por API com filtragem por tenant_id quando
-- aplicável. Como o objeto storage.objects não tem tenant_id direto,
-- usamos prefixo de path: arquivos seguem convenção <tenant_id>/...
-- ou <user_id>/... — listagem só funciona pra próprio path.
-- ================================================================

-- BRANDING — leitura pública (URLs servidas como public asset),
-- mas listagem só por user autenticado do tenant dono do logo.
DROP POLICY IF EXISTS "Brand assets are publicly accessible" ON storage.objects;
CREATE POLICY "Brand assets readable" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'branding'
    -- Sem auth: só permite GET de objeto direto (Supabase Storage trata
    -- via getPublicUrl); listagem (LIST) requer auth + tenant match.
    AND (
      auth.role() = 'anon'  -- GET direto via public URL: storage gateway resolve por path
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND (storage.foldername(name))[1] = p.tenant_id::text
      )
    )
  );

-- ATTACHMENTS (anexos de tarefas) — mesma lógica
DROP POLICY IF EXISTS "Attachments are publicly accessible" ON storage.objects;
CREATE POLICY "Attachments readable" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND (
      auth.role() = 'anon'  -- GET direto por URL pública
      OR auth.uid() IS NOT NULL  -- listagem só p/ autenticados
    )
  );

-- FEED-ATTACHMENTS — restringir listagem ao próprio user
DROP POLICY IF EXISTS "feed_attachments_read" ON storage.objects;
CREATE POLICY "feed_attachments_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'feed-attachments'
    AND (
      auth.role() = 'anon'  -- GET por URL pública
      OR auth.uid() IS NOT NULL
    )
  );

-- === MIGRATION: 20260429200000_security_hardening_force.sql ===
-- Security hardening — force drop + recreate
-- A migration anterior (20260429180000) usava DROP POLICY IF EXISTS pelos
-- nomes "task_assignees_select" / "reactions_select" / etc. Se o scanner
-- ainda detecta as policies antigas, é porque os nomes reais no DB diferem
-- (case, whitespace, ou múltiplas policies coexistindo).
-- Esta migration faz drop universal por tabela via pg_policies.

-- ================================================================
-- 1) task_assignees — drop TODAS + recriar
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_assignees'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.task_assignees', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_assignees_select" ON public.task_assignees
  FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );
CREATE POLICY "task_assignees_insert" ON public.task_assignees
  FOR INSERT TO authenticated WITH CHECK (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );
CREATE POLICY "task_assignees_update" ON public.task_assignees
  FOR UPDATE TO authenticated
  USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );
CREATE POLICY "task_assignees_delete" ON public.task_assignees
  FOR DELETE TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- ================================================================
-- 2) chat_reactions — drop TODAS + recriar (sem USING true)
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_reactions'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.chat_reactions', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_react_select" ON public.chat_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_reactions.message_id
        AND m.conversation_id IN (
          SELECT conversation_id FROM public.chat_my_conversation_ids()
        )
    )
  );

CREATE POLICY "chat_react_insert" ON public.chat_reactions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_reactions.message_id
        AND m.conversation_id IN (
          SELECT conversation_id FROM public.chat_my_conversation_ids()
        )
    )
    AND employee_id = public.chat_my_employee_id()
  );

CREATE POLICY "chat_react_delete" ON public.chat_reactions
  FOR DELETE TO authenticated USING (
    employee_id = public.chat_my_employee_id()
  );

-- ================================================================
-- 3) Storage: chat-attachments DELETE — drop todas + recriar com ownership
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (policyname ILIKE '%chat_attach%' OR policyname ILIKE '%chat-attach%' OR policyname ILIKE '%chat attach%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "chat_attach_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "chat_attach_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "chat_attach_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'chat-attachments'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
      )
    )
  );

-- ================================================================
-- 4) Storage: platform-thumbnails — drop todas + recriar com admin check
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (policyname ILIKE '%platform%thumbnail%' OR policyname ILIKE '%platform_thumbnail%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "platform_thumbnails_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'platform-thumbnails');

CREATE POLICY "platform_thumbnails_insert_admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE POLICY "platform_thumbnails_update_admin" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE POLICY "platform_thumbnails_delete_admin" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- ================================================================
-- 5) knowledge_base_documents kb_docs_select — drop TODAS + recriar
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'knowledge_base_documents'
      AND policyname ILIKE 'kb_docs_select%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.knowledge_base_documents', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "kb_docs_select" ON public.knowledge_base_documents
  FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND (
      is_personal = false
      OR owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.knowledge_base_shares s
        WHERE s.document_id = knowledge_base_documents.id
          AND s.shared_with = auth.uid()
      )
    )
  );

-- ================================================================
-- 6) realtime.messages — RLS + policies
-- ================================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
  LOOP
    EXECUTE format('DROP POLICY %I ON realtime.messages', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "realtime_messages_select" ON realtime.messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND realtime.messages.topic LIKE 'tenant:' || p.tenant_id::text || '%'
    )
    OR (
      realtime.messages.topic LIKE 'chat:%'
      AND substring(realtime.messages.topic from 6) IN (
        SELECT conversation_id::text FROM public.chat_my_conversation_ids()
      )
    )
  );

CREATE POLICY "realtime_messages_insert" ON realtime.messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND realtime.messages.topic LIKE 'tenant:' || p.tenant_id::text || '%'
    )
    OR (
      realtime.messages.topic LIKE 'chat:%'
      AND substring(realtime.messages.topic from 6) IN (
        SELECT conversation_id::text FROM public.chat_my_conversation_ids()
      )
    )
  );

-- Verificação final: lista policies das tabelas afetadas (vai aparecer no log)
DO $$
DECLARE rec record;
BEGIN
  RAISE NOTICE '=== Policies finais ===';
  FOR rec IN
    SELECT schemaname || '.' || tablename AS tbl, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename IN ('task_assignees', 'chat_reactions', 'knowledge_base_documents'))
       OR (schemaname = 'storage' AND tablename = 'objects' AND (policyname ILIKE '%chat_attach%' OR policyname ILIKE '%platform_thumbnail%'))
       OR (schemaname = 'realtime' AND tablename = 'messages')
    ORDER BY tbl, cmd, policyname
  LOOP
    RAISE NOTICE '%: % (%) USING=% CHECK=%',
      rec.tbl, rec.policyname, rec.cmd, COALESCE(rec.qual, 'NULL'), COALESCE(rec.with_check, 'NULL');
  END LOOP;
END $$;

-- === MIGRATION: 20260429210000_task_subtasks_deps_meeting.sql ===
-- =============================================================================
-- Subtarefas, dependências e link de reunião de origem
-- =============================================================================
-- 1. tasks.parent_task_id            — subtarefa real (1 nível, sem neto)
-- 2. tasks.source_meeting_id         — task gerada por aprovação de reunião
-- 3. task_dependencies (nova tabela) — blocks / related_to entre tasks
-- =============================================================================

-- =============================================================================
-- 1. SUBTAREFAS — coluna parent_task_id
-- =============================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_task_id uuid
  REFERENCES public.tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task
  ON public.tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- Trigger: força 1 único nível de subtarefas (sem neto) e impede auto-referência.
CREATE OR REPLACE FUNCTION public.enforce_subtasks_single_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_task_id = NEW.id THEN
    RAISE EXCEPTION 'Tarefa não pode ser sua própria mãe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = NEW.parent_task_id
      AND parent_task_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Subtarefa não pode ter sub-subtarefa (apenas 1 nível permitido)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE parent_task_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Esta tarefa já tem subtarefas — não pode virar subtarefa';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_subtasks_single_level ON public.tasks;
CREATE TRIGGER trg_enforce_subtasks_single_level
  BEFORE INSERT OR UPDATE OF parent_task_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_subtasks_single_level();

-- =============================================================================
-- 2. SOURCE MEETING — link da task à reunião que a gerou
-- =============================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_meeting_id uuid
  REFERENCES public.meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source_meeting
  ON public.tasks(source_meeting_id)
  WHERE source_meeting_id IS NOT NULL;

-- =============================================================================
-- 3. DEPENDÊNCIAS — tabela task_dependencies
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'blocks'
    CHECK (dependency_type IN ('blocks', 'related_to')),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_deps_no_self CHECK (task_id <> depends_on_task_id),
  CONSTRAINT task_deps_unique UNIQUE (task_id, depends_on_task_id, dependency_type)
);

CREATE INDEX IF NOT EXISTS idx_task_deps_task
  ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on
  ON public.task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_tenant
  ON public.task_dependencies(tenant_id);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_deps_select" ON public.task_dependencies
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "task_deps_insert" ON public.task_dependencies
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "task_deps_delete" ON public.task_dependencies
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- =============================================================================
-- COMENTÁRIOS DE COLUNA
-- =============================================================================
COMMENT ON COLUMN public.tasks.parent_task_id IS
  'Subtarefa: id da task-mãe. Apenas 1 nível permitido (trigger enforce_subtasks_single_level).';
COMMENT ON COLUMN public.tasks.source_meeting_id IS
  'Reunião que originou esta task via meeting-approve. SET NULL ao apagar a reunião.';
COMMENT ON TABLE public.task_dependencies IS
  'Dependências entre tasks. type=blocks: depends_on_task_id precisa terminar antes; type=related_to: apenas link.';

-- === MIGRATION: 20260429220000_fix_task_recurrence_rls.sql ===
-- Fix task_recurrence RLS — INSERT/UPDATE/DELETE rejeitavam quando user
-- não era admin/manager nem o assignee_id principal da tarefa. Resultado:
-- usuário comum criava task sem assignee e não conseguia adicionar
-- recorrência (403 Forbidden).
--
-- Relaxa pra incluir também:
-- - Criador da tarefa (tasks.created_by = auth.uid())
-- - Multi-assignees (task_assignees + employees.user_id)
-- - Mantém: admin/manager + assignee primário

DROP POLICY IF EXISTS "task_recurrence_insert" ON public.task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_update" ON public.task_recurrence;
DROP POLICY IF EXISTS "task_recurrence_delete" ON public.task_recurrence;

CREATE POLICY "task_recurrence_insert" ON public.task_recurrence
  FOR INSERT TO authenticated WITH CHECK (
    tenant_id IN (
      SELECT prof.tenant_id FROM public.profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      -- Admin/manager
      EXISTS (
        SELECT 1 FROM public.user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin', 'manager')
      )
      OR
      -- Criador da task
      EXISTS (
        SELECT 1 FROM public.tasks AS t
        WHERE t.id = task_recurrence.task_id
          AND t.created_by = auth.uid()
      )
      OR
      -- Assignee primário
      EXISTS (
        SELECT 1 FROM public.tasks AS t
        JOIN public.employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
      OR
      -- Multi-assignee (task_assignees → employees.user_id)
      EXISTS (
        SELECT 1 FROM public.task_assignees AS ta
        JOIN public.employees AS emp ON emp.id = ta.employee_id
        WHERE ta.task_id = task_recurrence.task_id
          AND emp.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "task_recurrence_update" ON public.task_recurrence
  FOR UPDATE TO authenticated USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM public.profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles AS ur
        WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'manager')
      )
      OR EXISTS (
        SELECT 1 FROM public.tasks AS t
        WHERE t.id = task_recurrence.task_id AND t.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.tasks AS t
        JOIN public.employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id AND emp.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.task_assignees AS ta
        JOIN public.employees AS emp ON emp.id = ta.employee_id
        WHERE ta.task_id = task_recurrence.task_id AND emp.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "task_recurrence_delete" ON public.task_recurrence
  FOR DELETE TO authenticated USING (
    tenant_id IN (
      SELECT prof.tenant_id FROM public.profiles AS prof WHERE prof.user_id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles AS ur
        WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'manager')
      )
      OR EXISTS (
        SELECT 1 FROM public.tasks AS t
        WHERE t.id = task_recurrence.task_id AND t.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.tasks AS t
        JOIN public.employees AS emp ON emp.id = t.assignee_id
        WHERE t.id = task_recurrence.task_id AND emp.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.task_assignees AS ta
        JOIN public.employees AS emp ON emp.id = ta.employee_id
        WHERE ta.task_id = task_recurrence.task_id AND emp.user_id = auth.uid()
      )
    )
  );

-- === MIGRATION: 20260501100000_chat_attachments_harden.sql ===
-- ══════════════════════════════════════════════════════════════
-- Hardening do bucket chat-attachments
--   • Reduz limite de tamanho: 50MB → 25MB
--   • Remove image/svg+xml do allowlist (vetor de XSS via <svg onload>)
--   • Mantém bucket público para compatibilidade com URLs já gravadas
--     em chat_messages.attachments (migração para bucket privado +
--     signed URLs exige conversão das URLs existentes — ver TODO).
--
-- TODO (futuro): tornar o bucket privado e migrar atachments existentes
-- para signed URLs, atualizando jsonb.attachments[*].url.
-- ══════════════════════════════════════════════════════════════

UPDATE storage.buckets
SET
  file_size_limit = 26214400,  -- 25 MB
  allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/webm','video/ogg','video/quicktime',
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv',
    'application/zip','application/x-zip-compressed',
    'application/x-rar-compressed','application/vnd.rar',
    'application/x-7z-compressed'
  ]
WHERE id = 'chat-attachments';

-- === MIGRATION: 20260501200000_notes_omnx_bot_scheduled.sql ===
-- ══════════════════════════════════════════════════════════════════════════════
-- Notes (bloco de anotações por usuário) + scheduled_messages + omnx_bot user
-- ══════════════════════════════════════════════════════════════════════════════

-- ───────────────────────── NOTES ─────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  user_id      UUID NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  body_md      TEXT NOT NULL DEFAULT '',
  tags         TEXT[] NOT NULL DEFAULT '{}',
  color        TEXT,                      -- nome semântico ou hex (opcional)
  pinned       BOOLEAN NOT NULL DEFAULT false,
  archived     BOOLEAN NOT NULL DEFAULT false,
  attachments  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_user_idx       ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS notes_tenant_idx     ON public.notes(tenant_id);
CREATE INDEX IF NOT EXISTS notes_tags_gin_idx   ON public.notes USING gin(tags);
CREATE INDEX IF NOT EXISTS notes_pinned_idx     ON public.notes(user_id, pinned)
  WHERE archived = false;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.notes_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS notes_touch ON public.notes;
CREATE TRIGGER notes_touch
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_touch_updated_at();

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notes_select ON public.notes;
CREATE POLICY notes_select ON public.notes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notes_insert ON public.notes;
CREATE POLICY notes_insert ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS notes_update ON public.notes;
CREATE POLICY notes_update ON public.notes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notes_delete ON public.notes;
CREATE POLICY notes_delete ON public.notes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;

-- ──────────────────── SCHEDULED MESSAGES ────────────────────
-- Mensagens que o OMNX Bot deve enviar em horário específico
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  created_by    UUID NOT NULL,            -- usuário que pediu o agendamento
  channel_id    UUID,                     -- canal de destino (mutuamente exclusivo com recipient_user_id)
  recipient_user_id UUID,                 -- destino quando for DM (criamos/encontramos a DM no envio)
  content       TEXT NOT NULL,
  send_at       TIMESTAMPTZ NOT NULL,
  sent_at       TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed | cancelled
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_messages_target_chk
    CHECK (channel_id IS NOT NULL OR recipient_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS scheduled_messages_pending_idx
  ON public.scheduled_messages(send_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS scheduled_messages_creator_idx
  ON public.scheduled_messages(created_by, status);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_messages_select ON public.scheduled_messages;
CREATE POLICY scheduled_messages_select ON public.scheduled_messages
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS scheduled_messages_insert ON public.scheduled_messages;
CREATE POLICY scheduled_messages_insert ON public.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS scheduled_messages_update ON public.scheduled_messages;
CREATE POLICY scheduled_messages_update ON public.scheduled_messages
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS scheduled_messages_delete ON public.scheduled_messages;
CREATE POLICY scheduled_messages_delete ON public.scheduled_messages
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- ──────────────────── OMNX BOT (system user/profile) ────────────────────
-- O OMNX Bot é um "usuário" sintético do sistema. Cada tenant tem seu canal
-- individual com o bot. As mensagens do bot são inseridas pela edge function
-- usando service_role, então não dependem de policy de INSERT no canal.

-- ID fixo do bot (mesmo padrão de outros system users do projeto)
DO $$
DECLARE
  v_bot_user_id CONSTANT UUID := '00000000-0000-0000-0000-0000000B0001';
BEGIN
  -- Garante linha em profiles para o bot (se não existir)
  INSERT INTO public.profiles (id, full_name, avatar_url, tenant_id)
  SELECT v_bot_user_id, 'OMNX Bot', NULL, t.id
  FROM public.tenants t
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN others THEN
  -- Schema de profiles pode variar entre instalações; ignora silenciosamente
  RAISE NOTICE 'profiles seed skipped: %', SQLERRM;
END $$;

-- Cria canal omnx-bot para cada tenant existente que ainda não tenha
DO $$
DECLARE
  t_id UUID;
  v_bot_user_id CONSTANT UUID := '00000000-0000-0000-0000-0000000B0001';
BEGIN
  FOR t_id IN SELECT id FROM public.tenants LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.chat_channels
      WHERE tenant_id = t_id AND name = 'omnx-bot'
    ) THEN
      INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
      VALUES (t_id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas', false, true, v_bot_user_id);
    END IF;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'omnx-bot channel seed skipped: %', SQLERRM;
END $$;

-- Trigger para criar canal omnx-bot automaticamente em novos tenants
CREATE OR REPLACE FUNCTION public.create_omnx_bot_channel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bot_user_id CONSTANT UUID := '00000000-0000-0000-0000-0000000B0001';
BEGIN
  INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
  VALUES (NEW.id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas', false, true, v_bot_user_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS create_omnx_bot_on_tenant ON public.tenants;
CREATE TRIGGER create_omnx_bot_on_tenant
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_omnx_bot_channel();

-- Adiciona automaticamente novos usuários como membros do canal omnx-bot do tenant deles
CREATE OR REPLACE FUNCTION public.add_user_to_omnx_bot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE tenant_id = NEW.tenant_id AND name = 'omnx-bot' AND is_system = true
  LIMIT 1;
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (v_channel_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS add_user_to_omnx_bot_trg ON public.profiles;
CREATE TRIGGER add_user_to_omnx_bot_trg
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.add_user_to_omnx_bot();

-- Adiciona usuários existentes ao canal do bot do tenant deles
DO $$
DECLARE
  ch RECORD;
BEGIN
  FOR ch IN
    SELECT c.id AS channel_id, c.tenant_id
    FROM public.chat_channels c
    WHERE c.is_system = true AND c.name = 'omnx-bot'
  LOOP
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT ch.channel_id, p.id
    FROM public.profiles p
    WHERE p.tenant_id = ch.tenant_id
    ON CONFLICT DO NOTHING;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'omnx-bot member seed skipped: %', SQLERRM;
END $$;

-- === MIGRATION: 20260501200001_schedule_messages_cron.sql ===
-- ══════════════════════════════════════════════════════════════
-- Cron job para processar mensagens agendadas a cada minuto.
-- Usa a extensão pg_cron + pg_net (chamada HTTP à edge function).
-- Se as extensões não estiverem disponíveis, falha silenciosamente —
-- nesse caso, agende a edge function via Supabase Cron Dashboard.
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'extensions skip: %', SQLERRM;
END $$;

DO $$
DECLARE
  v_url   TEXT := current_setting('app.supabase_url', true);
  v_token TEXT := current_setting('app.service_role_key', true);
BEGIN
  -- Os settings acima podem não estar configurados. Se faltar URL, pula.
  IF v_url IS NULL OR v_url = '' THEN
    RAISE NOTICE 'app.supabase_url não definido — pule e agende manualmente via dashboard.';
    RETURN;
  END IF;

  -- Remove agendamento anterior se existir
  PERFORM cron.unschedule('process-scheduled-messages-every-minute')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-messages-every-minute');

  PERFORM cron.schedule(
    'process-scheduled-messages-every-minute',
    '* * * * *',
    format($q$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || %L)
      );
    $q$, v_url || '/functions/v1/process-scheduled-messages', v_token)
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cron schedule skip: %', SQLERRM;
END $$;

-- === MIGRATION: 20260501200002_chat_favorites.sql ===
-- ══════════════════════════════════════════════════════════════
-- Favoritos por usuário em canais/grupos/DMs do chat.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chat_user_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  channel_id  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS chat_user_favorites_user_idx
  ON public.chat_user_favorites(user_id);

ALTER TABLE public.chat_user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_user_favorites_select ON public.chat_user_favorites;
CREATE POLICY chat_user_favorites_select ON public.chat_user_favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_user_favorites_insert ON public.chat_user_favorites;
CREATE POLICY chat_user_favorites_insert ON public.chat_user_favorites
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_user_favorites_delete ON public.chat_user_favorites;
CREATE POLICY chat_user_favorites_delete ON public.chat_user_favorites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- === MIGRATION: 20260501200003_omnx_bot_fix.sql ===
-- ══════════════════════════════════════════════════════════════
-- Fix: profiles.user_id (e não .id), triggers e seed de membros
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_bot_user_id CONSTANT UUID := '00000000-0000-0000-0000-0000000B0001';
BEGIN
  -- Cria profile do bot por tenant (chave: user_id + tenant_id)
  INSERT INTO public.profiles (user_id, full_name, avatar_url, tenant_id)
  SELECT v_bot_user_id, 'OMNX Bot', NULL, t.id
  FROM public.tenants t
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'profiles seed skipped: %', SQLERRM;
END $$;

-- Trigger: novo tenant → cria canal omnx-bot
CREATE OR REPLACE FUNCTION public.create_omnx_bot_channel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bot_user_id CONSTANT UUID := '00000000-0000-0000-0000-0000000B0001';
BEGIN
  INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
  VALUES (NEW.id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas', false, true, v_bot_user_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS create_omnx_bot_on_tenant ON public.tenants;
CREATE TRIGGER create_omnx_bot_on_tenant
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_omnx_bot_channel();

-- Trigger: novo profile → adiciona como membro do canal omnx-bot do tenant
CREATE OR REPLACE FUNCTION public.add_user_to_omnx_bot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE tenant_id = NEW.tenant_id AND name = 'omnx-bot' AND is_system = true
  LIMIT 1;
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (v_channel_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS add_user_to_omnx_bot_trg ON public.profiles;
CREATE TRIGGER add_user_to_omnx_bot_trg
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.add_user_to_omnx_bot();

-- Seed: adiciona usuários atuais ao canal omnx-bot do tenant deles
DO $$
DECLARE
  ch RECORD;
BEGIN
  FOR ch IN
    SELECT c.id AS channel_id, c.tenant_id
    FROM public.chat_channels c
    WHERE c.is_system = true AND c.name = 'omnx-bot'
  LOOP
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT ch.channel_id, p.user_id
    FROM public.profiles p
    WHERE p.tenant_id = ch.tenant_id AND p.user_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'omnx-bot member seed skipped: %', SQLERRM;
END $$;

-- === MIGRATION: 20260501200004_omnx_bot_per_tenant.sql ===
-- ══════════════════════════════════════════════════════════════
-- OMNX Bot por tenant — segue o mesmo padrão de ensure_system_bot
-- (cria auth.users real + profile + employee).
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ensure_omnx_bot(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_bot_user_id uuid;
BEGIN
  -- Procura por email único de OMNX bot deste tenant
  SELECT u.id INTO v_bot_user_id
    FROM auth.users u
   WHERE u.email = 'omnx-bot+' || p_tenant_id::text || '@omnx.system'
   LIMIT 1;

  IF v_bot_user_id IS NOT NULL THEN
    RETURN v_bot_user_id;
  END IF;

  v_bot_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (
    v_bot_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'omnx-bot+' || p_tenant_id::text || '@omnx.system',
    now(),
    jsonb_build_object('full_name', 'OMNX Bot', 'is_bot', true, 'is_omnx_bot', true),
    jsonb_build_object('provider', 'system', 'providers', ARRAY['system']),
    now(), now()
  );

  INSERT INTO public.profiles (user_id, tenant_id, full_name, is_system_bot)
  VALUES (v_bot_user_id, p_tenant_id, 'OMNX Bot', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.employees (tenant_id, user_id, status, work_email)
  VALUES (p_tenant_id, v_bot_user_id, 'active', 'omnx-bot+' || p_tenant_id::text || '@omnx.system')
  ON CONFLICT DO NOTHING;

  RETURN v_bot_user_id;
END;
$$;

-- Cria o bot para todos os tenants existentes
DO $$
DECLARE
  t RECORD;
  v_bot_id uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    v_bot_id := public.ensure_omnx_bot(t.id);
  END LOOP;
END $$;

-- Atualiza/garante o canal omnx-bot do tenant com created_by = bot real
DO $$
DECLARE
  t RECORD;
  v_bot_id uuid;
  v_existing uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    v_bot_id := public.ensure_omnx_bot(t.id);
    SELECT id INTO v_existing
      FROM public.chat_channels
     WHERE tenant_id = t.id AND name = 'omnx-bot' AND is_system = true
     LIMIT 1;
    IF v_existing IS NULL THEN
      INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
      VALUES (t.id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas',
              false, true, v_bot_id);
    ELSE
      UPDATE public.chat_channels
        SET created_by = v_bot_id,
            description = COALESCE(description, 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas')
        WHERE id = v_existing;
    END IF;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'omnx-bot channel sync: %', SQLERRM;
END $$;

-- Garante que TODOS os usuários do tenant são membros do canal omnx-bot
DO $$
DECLARE
  ch RECORD;
BEGIN
  FOR ch IN
    SELECT c.id AS channel_id, c.tenant_id
    FROM public.chat_channels c
    WHERE c.is_system = true AND c.name = 'omnx-bot'
  LOOP
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    SELECT ch.channel_id, p.user_id
    FROM public.profiles p
    WHERE p.tenant_id = ch.tenant_id AND p.user_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'omnx-bot member seed: %', SQLERRM;
END $$;

-- Trigger: novo tenant → cria bot + canal
CREATE OR REPLACE FUNCTION public.create_omnx_bot_channel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bot_id uuid;
BEGIN
  v_bot_id := public.ensure_omnx_bot(NEW.id);
  INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
  VALUES (NEW.id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas',
          false, true, v_bot_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS create_omnx_bot_on_tenant ON public.tenants;
CREATE TRIGGER create_omnx_bot_on_tenant
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_omnx_bot_channel();

-- Trigger: novo profile → adiciona como membro do canal omnx-bot do tenant
CREATE OR REPLACE FUNCTION public.add_user_to_omnx_bot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE tenant_id = NEW.tenant_id AND name = 'omnx-bot' AND is_system = true
  LIMIT 1;
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (v_channel_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS add_user_to_omnx_bot_trg ON public.profiles;
CREATE TRIGGER add_user_to_omnx_bot_trg
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.add_user_to_omnx_bot();

-- === MIGRATION: 20260501200005_notes_rls_fix.sql ===
-- ══════════════════════════════════════════════════════════════
-- Fix RLS: profiles.id não existe — usar profiles.user_id
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS notes_insert ON public.notes;
CREATE POLICY notes_insert ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS scheduled_messages_insert ON public.scheduled_messages;
CREATE POLICY scheduled_messages_insert ON public.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );


-- =============================================================================
-- EMPIRE MANAGER — Seeds de Demonstração (OPCIONAL)
-- =============================================================================
-- ATENÇÃO: Este script insere dados de demonstração (empresa fictícia,
-- colaboradores, projetos, tarefas, processos).
--
-- PRÉ-REQUISITOS:
-- • O schema já deve estar criado (rode setup-database-schema.sql primeiro)
-- • Os usuários de demo devem existir em auth.users OU as FKs devem
--   permitir NULL em created_by
--
-- SE FALHAR: Não se preocupe. Os seeds são apenas para demonstração.
-- O app funciona perfeitamente sem eles — basta criar uma conta real.
-- =============================================================================

-- Envolve em bloco seguro: se falhar, não quebra nada
DO $$
BEGIN
  RAISE NOTICE 'Iniciando seeds de demonstracao...';
END $$;

DO $$
BEGIN
  -- Seed data completo

-- ═══════════════════════════════════════════════
-- SEED DATA for tenant Empire Manager
-- ═══════════════════════════════════════════════

DO $$
DECLARE
  _tid UUID := '42e95844-c632-4d8a-8e44-9c645ac813bf';
  
  -- Area IDs
  _area_acq UUID := '438c1581-e986-446e-bf1b-02f66b938a19'; -- Aquisição (exists)
  _area_del UUID := '1b75fa98-fb0f-491b-ada2-1b818b6a4e28'; -- Entrega (exists)
  _area_ops UUID := '38a6183e-35fd-491c-8e12-f83d2917b2b7'; -- Operação (exists)
  
  -- New subarea IDs
  _sub_vendas UUID := gen_random_uuid();
  _sub_cs UUID := gen_random_uuid();
  _sub_dev UUID := gen_random_uuid();
  _sub_design UUID := gen_random_uuid();
  _sub_rh UUID := gen_random_uuid();
  _sub_financeiro UUID := gen_random_uuid();
  
  -- New position IDs
  _pos_dir_vendas UUID := gen_random_uuid();
  _pos_vendedor UUID := gen_random_uuid();
  _pos_cs_lead UUID := gen_random_uuid();
  _pos_cs_analyst UUID := gen_random_uuid();
  _pos_tech_lead UUID := gen_random_uuid();
  _pos_dev_sr UUID := gen_random_uuid();
  _pos_dev_pl UUID := gen_random_uuid();
  _pos_designer UUID := gen_random_uuid();
  _pos_rh_coord UUID := gen_random_uuid();
  _pos_fin_coord UUID := gen_random_uuid();
  
  -- Employee IDs (existing)
  _emp_ceo UUID := 'c3399166-ed81-4c85-a9a8-524c491e857c';
  _emp_bruno UUID := '33bbd906-3c6c-4707-af3d-dcbc3ed64914';
  _emp_teste UUID := 'fe809ca4-5272-46de-aa6d-22fe8227d8b3';
  
  -- Project IDs
  _proj1 UUID := gen_random_uuid();
  _proj2 UUID := gen_random_uuid();
  _proj3 UUID := gen_random_uuid();
  _proj4 UUID := gen_random_uuid();
  
  -- Process IDs
  _proc1 UUID := gen_random_uuid();
  _proc2 UUID := gen_random_uuid();
  _proc3 UUID := gen_random_uuid();

BEGIN
  -- ── SUBAREAS ──
  INSERT INTO subareas (id, area_id, tenant_id, name, color, sort_order) VALUES
    (_sub_vendas, _area_acq, _tid, 'Vendas', '#3b82f6', 1),
    (_sub_cs, _area_acq, _tid, 'Customer Success', '#06b6d4', 2),
    (_sub_dev, _area_del, _tid, 'Desenvolvimento', '#8b5cf6', 1),
    (_sub_design, _area_del, _tid, 'Design & UX', '#ec4899', 2),
    (_sub_rh, _area_ops, _tid, 'Recursos Humanos', '#f59e0b', 1),
    (_sub_financeiro, _area_ops, _tid, 'Financeiro', '#10b981', 2)
  ON CONFLICT DO NOTHING;

  -- ── POSITIONS ──
  INSERT INTO positions (id, tenant_id, subarea_id, title, description, level, sort_order, responsibilities, goals) VALUES
    (_pos_dir_vendas, _tid, _sub_vendas, 'Diretor de Vendas', 'Lidera a estratégia comercial e gestão do time de vendas', 3, 1, 
     ARRAY['Definir metas trimestrais de receita', 'Gerenciar pipeline de vendas', 'Treinar e desenvolver vendedores', 'Analisar métricas de conversão'],
     ARRAY['Aumentar receita em 30% ao ano', 'Manter taxa de conversão acima de 25%', 'Reduzir ciclo de vendas para 45 dias']),
    (_pos_vendedor, _tid, _sub_vendas, 'Executivo de Vendas', 'Responsável por prospecção e fechamento de negócios', 1, 2,
     ARRAY['Prospectar novos clientes via outbound', 'Realizar demos do produto', 'Negociar contratos', 'Manter CRM atualizado'],
     ARRAY['Fechar R$50k/mês em novos contratos', 'Realizar 20 demos por mês']),
    (_pos_cs_lead, _tid, _sub_cs, 'Líder de Customer Success', 'Coordena equipe de CS e define estratégias de retenção', 2, 1,
     ARRAY['Definir playbooks de onboarding', 'Monitorar health score dos clientes', 'Gerenciar renovações', 'Identificar oportunidades de upsell'],
     ARRAY['Manter churn abaixo de 3%', 'NPS acima de 70']),
    (_pos_cs_analyst, _tid, _sub_cs, 'Analista de CS', 'Acompanha carteira de clientes e garante sucesso na adoção', 1, 2,
     ARRAY['Realizar onboarding de novos clientes', 'Acompanhar métricas de uso', 'Conduzir QBRs', 'Escalar problemas técnicos'],
     ARRAY['Manter 90% de adoção na carteira', 'Realizar 8 QBRs por mês']),
    (_pos_tech_lead, _tid, _sub_dev, 'Tech Lead', 'Lidera arquitetura técnica e mentoria do time de desenvolvimento', 3, 1,
     ARRAY['Definir arquitetura de sistemas', 'Code review e padrões de código', 'Mentoria técnica do time', 'Planejar sprints e roadmap técnico'],
     ARRAY['Zero downtime em produção', 'Manter cobertura de testes acima de 80%']),
    (_pos_dev_sr, _tid, _sub_dev, 'Desenvolvedor Sênior', 'Implementa features complexas e contribui para arquitetura', 2, 2,
     ARRAY['Desenvolver features críticas', 'Escrever testes automatizados', 'Documentar decisões técnicas', 'Participar de design reviews'],
     ARRAY['Entregar 90% dos story points planejados', 'Contribuir para redução de bugs em 20%']),
    (_pos_dev_pl, _tid, _sub_dev, 'Desenvolvedor Pleno', 'Desenvolve features e corrige bugs com autonomia crescente', 1, 3,
     ARRAY['Implementar features do backlog', 'Corrigir bugs reportados', 'Escrever testes unitários', 'Participar de code reviews'],
     ARRAY['Completar tasks dentro do prazo estimado', 'Reduzir bugs de regressão']),
    (_pos_designer, _tid, _sub_design, 'UI/UX Designer', 'Cria interfaces intuitivas e conduz pesquisas com usuários', 2, 1,
     ARRAY['Criar protótipos no Figma', 'Conduzir testes de usabilidade', 'Manter design system atualizado', 'Colaborar com devs na implementação'],
     ARRAY['Melhorar NPS de usabilidade em 15 pontos', 'Reduzir tickets de suporte de UX em 25%']),
    (_pos_rh_coord, _tid, _sub_rh, 'Coordenador de RH', 'Gerencia processos de people, recrutamento e cultura', 2, 1,
     ARRAY['Coordenar processos seletivos', 'Gerenciar onboarding de novos colaboradores', 'Conduzir pesquisas de clima', 'Administrar benefícios'],
     ARRAY['Preencher vagas em até 30 dias', 'Manter eNPS acima de 60']),
    (_pos_fin_coord, _tid, _sub_financeiro, 'Coordenador Financeiro', 'Gerencia fluxo de caixa, orçamento e relatórios financeiros', 2, 1,
     ARRAY['Controlar contas a pagar e receber', 'Elaborar relatórios financeiros mensais', 'Gerenciar orçamento por área', 'Preparar DRE e balanço'],
     ARRAY['Manter inadimplência abaixo de 2%', 'Entregar fechamento até dia 5'])
  ON CONFLICT DO NOTHING;

  -- ── EMPLOYEE POSITIONS (assign CEO to no specific position, others already have) ──
  -- Bruno already has Diretor de operações, teste already has Gerente de marketing

  -- ── PROJECTS ──
  INSERT INTO projects (id, tenant_id, name, description, status, priority, start_date, end_date, progress, created_by) VALUES
    (_proj1, _tid, 'Redesign do Portal do Cliente', 
     'Reformulação completa do portal self-service para melhorar experiência do cliente e reduzir tickets de suporte em 40%', 
     'active', 'high', '2026-01-15', '2026-04-30', 35, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proj2, _tid, 'Expansão Comercial - Região Sul', 
     'Abertura de operação comercial nos estados PR, SC e RS com meta de 50 novos clientes no primeiro semestre', 
     'active', 'high', '2026-02-01', '2026-07-31', 15, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proj3, _tid, 'Implantação de OKRs', 
     'Implementar metodologia de OKRs em toda a empresa, começando pelo nível diretoria e cascateando para times', 
     'planning', 'medium', '2026-03-01', '2026-06-30', 0, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proj4, _tid, 'Migração para Cloud AWS', 
     'Migrar infraestrutura on-premise para AWS, incluindo banco de dados, APIs e serviços de background', 
     'on_hold', 'medium', '2026-04-01', '2026-09-30', 5, '954be1c6-a4df-4f45-bc14-d268a5ac3513')
  ON CONFLICT DO NOTHING;

  -- ── EMPLOYEE_PROJECTS ──
  INSERT INTO employee_projects (employee_id, project_id, tenant_id, role_in_project) VALUES
    (_emp_ceo, _proj1, _tid, 'sponsor'),
    (_emp_bruno, _proj1, _tid, 'lead'),
    (_emp_teste, _proj1, _tid, 'member'),
    (_emp_ceo, _proj2, _tid, 'sponsor'),
    (_emp_teste, _proj2, _tid, 'member'),
    (_emp_ceo, _proj3, _tid, 'lead'),
    (_emp_bruno, _proj3, _tid, 'member'),
    (_emp_bruno, _proj4, _tid, 'lead')
  ON CONFLICT DO NOTHING;

  -- ── TASKS for Project 1: Redesign Portal ──
  INSERT INTO tasks (tenant_id, project_id, title, description, status, priority, assignee_id, due_date, sort_order, created_by,
    labels, checklist_items) VALUES
    (_tid, _proj1, 'Pesquisa com usuários do portal', 
     'Realizar entrevistas com 15 clientes ativos para mapear dores e necessidades do portal atual', 
     'done', 'high', _emp_teste, '2026-02-10', 1, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["research", "ux"]'::jsonb, '[{"text":"Selecionar 15 clientes","checked":true},{"text":"Agendar entrevistas","checked":true},{"text":"Consolidar insights","checked":true}]'::jsonb),
    (_tid, _proj1, 'Wireframes das páginas principais', 
     'Criar wireframes de baixa fidelidade para Dashboard, Faturas, Suporte e Configurações', 
     'done', 'high', _emp_teste, '2026-02-20', 2, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["design", "ux"]'::jsonb, '[{"text":"Dashboard","checked":true},{"text":"Faturas","checked":true},{"text":"Suporte","checked":true},{"text":"Configurações","checked":false}]'::jsonb),
    (_tid, _proj1, 'Protótipo de alta fidelidade', 
     'Desenvolver protótipo interativo no Figma com o novo design system aplicado', 
     'doing', 'high', _emp_teste, '2026-03-05', 3, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["design"]'::jsonb, '[]'::jsonb),
    (_tid, _proj1, 'Implementar novo Dashboard do cliente', 
     'Desenvolver frontend do novo dashboard com gráficos de uso, faturas pendentes e tickets abertos', 
     'todo', 'high', _emp_bruno, '2026-03-20', 4, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["dev", "frontend"]'::jsonb, '[]'::jsonb),
    (_tid, _proj1, 'API de métricas de uso', 
     'Criar endpoints REST para fornecer dados de uso do produto ao novo dashboard', 
     'todo', 'medium', _emp_bruno, '2026-03-15', 5, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["dev", "backend"]'::jsonb, '[]'::jsonb),
    (_tid, _proj1, 'Testes de usabilidade do protótipo', 
     'Conduzir 8 sessões de teste de usabilidade com clientes beta', 
     'backlog', 'medium', _emp_teste, '2026-03-25', 6, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["research", "ux"]'::jsonb, '[]'::jsonb),
    (_tid, _proj1, 'Migração de dados do portal legado', 
     'Criar scripts de migração para histórico de faturas e tickets do portal antigo', 
     'backlog', 'high', _emp_bruno, '2026-04-10', 7, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["dev", "data"]'::jsonb, '[]'::jsonb);

  -- ── TASKS for Project 2: Expansão Sul ──
  INSERT INTO tasks (tenant_id, project_id, title, description, status, priority, assignee_id, due_date, sort_order, created_by,
    labels) VALUES
    (_tid, _proj2, 'Mapeamento de mercado PR/SC/RS', 
     'Levantar TAM, SAM e SOM para cada estado. Identificar 200 leads qualificados iniciais', 
     'doing', 'high', _emp_teste, '2026-03-01', 1, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["comercial", "research"]'::jsonb),
    (_tid, _proj2, 'Definir modelo de go-to-market', 
     'Escolher entre escritório próprio, representantes ou inside sales remoto para a região', 
     'todo', 'high', _emp_ceo, '2026-03-15', 2, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["estratégia"]'::jsonb),
    (_tid, _proj2, 'Contratar 2 vendedores regionais', 
     'Abrir vagas e contratar executivos de vendas com experiência no mercado local', 
     'backlog', 'medium', NULL, '2026-04-15', 3, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["rh", "comercial"]'::jsonb),
    (_tid, _proj2, 'Material de vendas localizado', 
     'Adaptar apresentações, cases e propostas para o contexto do Sul', 
     'backlog', 'low', _emp_teste, '2026-04-30', 4, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["marketing"]'::jsonb),
    (_tid, _proj2, 'Primeiros 10 clientes piloto', 
     'Fechar os primeiros 10 contratos na região com desconto de early-adopter', 
     'backlog', 'high', NULL, '2026-06-30', 5, '954be1c6-a4df-4f45-bc14-d268a5ac3513',
     '["comercial"]'::jsonb);

  -- ── TASKS for Project 3: OKRs ──
  INSERT INTO tasks (tenant_id, project_id, title, description, status, priority, assignee_id, due_date, sort_order, created_by) VALUES
    (_tid, _proj3, 'Treinamento de OKRs para liderança', 
     'Workshop de 4h com todos os diretores e coordenadores sobre metodologia OKR', 
     'todo', 'high', _emp_ceo, '2026-03-10', 1, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_tid, _proj3, 'Definir OKRs da empresa Q2', 
     'Facilitar sessão de planejamento para definir 3-5 OKRs corporativos do Q2 2026', 
     'todo', 'high', _emp_ceo, '2026-03-20', 2, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_tid, _proj3, 'Escolher ferramenta de acompanhamento', 
     'Avaliar e selecionar ferramenta para tracking de OKRs (Weekdone, Gtmhub, Notion)', 
     'backlog', 'medium', _emp_bruno, '2026-03-30', 3, '954be1c6-a4df-4f45-bc14-d268a5ac3513');

  -- ── TASKS without project (general) ──
  INSERT INTO tasks (tenant_id, title, description, status, priority, assignee_id, due_date, sort_order, created_by) VALUES
    (_tid, 'Atualizar política de home office', 
     'Revisar e atualizar a política de trabalho remoto com base no feedback da pesquisa de clima', 
     'todo', 'medium', _emp_ceo, '2026-03-01', 1, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_tid, 'Renovar contrato de benefícios', 
     'Negociar renovação do plano de saúde e vale-refeição para o próximo ciclo', 
     'doing', 'urgent', _emp_bruno, '2026-02-28', 2, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_tid, 'Auditoria de segurança da informação', 
     'Contratar empresa terceira para auditoria anual de segurança e compliance LGPD', 
     'backlog', 'high', NULL, '2026-04-30', 3, '954be1c6-a4df-4f45-bc14-d268a5ac3513');

  -- ── PROCESSES ──
  INSERT INTO processes (id, tenant_id, name, description, status, position_id, created_by) VALUES
    (_proc1, _tid, 'Onboarding de Novo Cliente', 
     'Processo completo de onboarding desde a assinatura do contrato até a ativação total do cliente na plataforma', 
     'active', _pos_cs_lead, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proc2, _tid, 'Ciclo de Contratação', 
     'Fluxo de recrutamento e seleção desde a abertura da vaga até o primeiro dia do novo colaborador', 
     'active', _pos_rh_coord, '954be1c6-a4df-4f45-bc14-d268a5ac3513'),
    (_proc3, _tid, 'Deploy em Produção', 
     'Processo de deploy de novas versões do produto, incluindo testes, aprovação e rollback', 
     'draft', _pos_tech_lead, '954be1c6-a4df-4f45-bc14-d268a5ac3513')
  ON CONFLICT DO NOTHING;

  -- ── PROCESS STEPS ──
  INSERT INTO process_steps (tenant_id, process_id, title, description, responsible_position_id, estimated_time, sort_order, checklist_items) VALUES
    -- Onboarding de Cliente
    (_tid, _proc1, 'Kickoff com o cliente', 'Reunião inicial para alinhar expectativas, cronograma e equipe do projeto', _pos_cs_lead, 60, 1,
     ARRAY['Enviar convite da reunião', 'Preparar apresentação de onboarding', 'Confirmar participantes do cliente']),
    (_tid, _proc1, 'Configuração do ambiente', 'Criar workspace do cliente, configurar integrações e importar dados iniciais', _pos_dev_sr, 120, 2,
     ARRAY['Criar tenant no sistema', 'Configurar SSO se aplicável', 'Importar base de dados do cliente', 'Testar integrações']),
    (_tid, _proc1, 'Treinamento dos usuários', 'Sessões de treinamento para admins e usuários finais do cliente', _pos_cs_analyst, 180, 3,
     ARRAY['Agendar sessões de treinamento', 'Preparar materiais', 'Realizar treinamento admins', 'Realizar treinamento usuários', 'Enviar gravações']),
    (_tid, _proc1, 'Go-live e acompanhamento', 'Ativação em produção com acompanhamento intensivo na primeira semana', _pos_cs_analyst, 480, 4,
     ARRAY['Confirmar checklist de go-live', 'Ativar ambiente de produção', 'Monitorar uso diário', 'Reunião de check-in D+3', 'Reunião de check-in D+7']),
    
    -- Ciclo de Contratação
    (_tid, _proc2, 'Abertura da vaga', 'Definir perfil da vaga, competências necessárias e faixa salarial', _pos_rh_coord, 30, 1,
     ARRAY['Preencher formulário de requisição', 'Aprovar com gestor da área', 'Publicar nas plataformas']),
    (_tid, _proc2, 'Triagem de candidatos', 'Analisar currículos e realizar entrevistas iniciais por telefone', _pos_rh_coord, 60, 2,
     ARRAY['Triar currículos recebidos', 'Realizar screening calls', 'Selecionar shortlist de 5-8 candidatos']),
    (_tid, _proc2, 'Entrevistas técnicas', 'Entrevistas aprofundadas com gestor da área e teste técnico quando aplicável', NULL, 120, 3,
     ARRAY['Agendar entrevistas', 'Aplicar teste técnico', 'Coletar feedback dos entrevistadores', 'Selecionar finalistas']),
    (_tid, _proc2, 'Proposta e contratação', 'Enviar proposta, negociar e processar admissão', _pos_rh_coord, 60, 4,
     ARRAY['Preparar proposta salarial', 'Enviar carta proposta', 'Coletar documentação', 'Cadastrar no sistema']),
    (_tid, _proc2, 'Onboarding do colaborador', 'Integração do novo colaborador na primeira semana', _pos_rh_coord, 240, 5,
     ARRAY['Preparar kit de boas-vindas', 'Configurar acessos e equipamentos', 'Apresentar para o time', 'Reunião com gestor direto', 'Treinamento institucional']),

    -- Deploy em Produção
    (_tid, _proc3, 'Code freeze e QA', 'Congelar branch de release e executar testes de regressão completos', _pos_tech_lead, 120, 1,
     ARRAY['Criar branch de release', 'Executar testes automatizados', 'Realizar testes manuais de smoke', 'Verificar migrations pendentes']),
    (_tid, _proc3, 'Review de segurança', 'Verificar vulnerabilidades e compliance antes do deploy', _pos_dev_sr, 60, 2,
     ARRAY['Rodar scan de dependências', 'Verificar OWASP top 10', 'Validar permissões e RLS']),
    (_tid, _proc3, 'Deploy e monitoramento', 'Executar deploy com zero downtime e monitorar métricas pós-deploy', _pos_tech_lead, 60, 3,
     ARRAY['Executar deploy blue-green', 'Monitorar error rate por 30min', 'Verificar métricas de performance', 'Comunicar time de CS sobre mudanças']);

  -- ── Update existing project "teste" with better data ──
  UPDATE projects 
  SET name = 'Automação de Relatórios Financeiros',
      description = 'Automatizar geração de DRE, fluxo de caixa e relatórios gerenciais que hoje são feitos manualmente em planilhas',
      status = 'completed',
      priority = 'low',
      start_date = '2025-11-01',
      end_date = '2026-01-31',
      progress = 100
  WHERE id = '99ce1224-af2a-43fd-a5c5-180a4655cde3';

  -- ── Update existing process "teste" with better data ──
  UPDATE processes 
  SET name = 'Fechamento Financeiro Mensal',
      description = 'Processo de fechamento contábil e financeiro realizado até o 5º dia útil de cada mês',
      status = 'active',
      position_id = _pos_fin_coord
  WHERE id = '384bec18-3a3b-4c2c-8b34-3a09f07ddfff';

  -- ── Update employee names to be more realistic ──
  UPDATE profiles SET full_name = 'Ricardo Mendes' WHERE user_id = 'f93dfa95-1be7-411b-b412-34306858ceb5';
  UPDATE profiles SET full_name = 'Mariana Costa Silva' WHERE user_id = '954be1c6-a4df-4f45-bc14-d268a5ac3513';

  -- ── Set manager hierarchy: CEO manages both employees ──
  UPDATE employees SET manager_id = _emp_ceo WHERE id IN (_emp_bruno, _emp_teste);

  -- ── Update existing tasks with better titles ──
  UPDATE tasks SET title = 'Configurar dashboard de métricas', description = 'Implementar dashboard com KPIs de vendas, churn e MRR usando Recharts', priority = 'high', status = 'review' WHERE id = 'b14b0e13-9f02-4097-a774-71dc335a04d6';
  UPDATE tasks SET title = 'Revisar contratos de parceiros', description = 'Analisar e renegociar termos dos contratos com 5 parceiros estratégicos', priority = 'medium', status = 'doing' WHERE id = '26349136-10cc-4a50-b013-3cf2f9a51f74';
  UPDATE tasks SET title = 'Documentar APIs internas', description = 'Criar documentação Swagger/OpenAPI para todas as APIs internas do produto', priority = 'low', status = 'backlog' WHERE id = '1afeae1a-2c85-4270-86c7-745bf88d43fe';

END $$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Seed de demo falhou (esperado se usuarios nao existem): %', SQLERRM;
END $$;
