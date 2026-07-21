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
