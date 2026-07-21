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
