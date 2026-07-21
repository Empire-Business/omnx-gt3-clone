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
