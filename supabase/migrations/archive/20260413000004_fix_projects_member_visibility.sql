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
