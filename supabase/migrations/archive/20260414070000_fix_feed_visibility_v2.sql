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
