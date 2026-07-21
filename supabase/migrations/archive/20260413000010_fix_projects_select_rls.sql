-- Fix: restaura projects_select para permitir todos os membros do tenant
-- O RLS anterior (user_can_read_project) bloqueava admin quando não há
-- row em user_roles, pois is_admin() retornava false.
-- Voltamos ao comportamento original: todos no tenant veem todos os projetos.

DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
