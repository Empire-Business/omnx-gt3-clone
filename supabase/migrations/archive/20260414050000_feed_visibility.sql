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
