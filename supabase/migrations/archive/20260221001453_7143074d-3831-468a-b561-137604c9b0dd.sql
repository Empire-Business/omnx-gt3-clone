
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
