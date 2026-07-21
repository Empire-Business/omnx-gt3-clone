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
