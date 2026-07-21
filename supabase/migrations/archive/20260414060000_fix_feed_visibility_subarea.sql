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
