-- ============================================================
-- Comentários e Reações em Comunicados (Feed social)
-- ============================================================

-- TABELA: announcement_comments
CREATE TABLE IF NOT EXISTS public.announcement_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
  content     TEXT NOT NULL CHECK (length(trim(content)) > 0),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ann_comments_ann    ON public.announcement_comments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_ann_comments_tenant ON public.announcement_comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ann_comments_author ON public.announcement_comments(author_id);

ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_comments_select" ON public.announcement_comments
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ann_comments_insert" ON public.announcement_comments
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ann_comments_update" ON public.announcement_comments
  FOR UPDATE USING (
    tenant_id = public.get_user_tenant_id() AND (
      author_id IN (
        SELECT id FROM public.employees
        WHERE user_id = auth.uid() AND tenant_id = public.get_user_tenant_id()
      )
      OR public.is_admin()
    )
  );

CREATE POLICY "ann_comments_delete" ON public.announcement_comments
  FOR DELETE USING (
    tenant_id = public.get_user_tenant_id() AND (
      author_id IN (
        SELECT id FROM public.employees
        WHERE user_id = auth.uid() AND tenant_id = public.get_user_tenant_id()
      )
      OR public.is_admin()
      OR public.has_role(auth.uid(), 'manager')
    )
  );

-- ============================================================

-- TABELA: announcement_reactions
CREATE TABLE IF NOT EXISTS public.announcement_reactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),
  reaction        TEXT NOT NULL DEFAULT 'like',
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(announcement_id, employee_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_ann_reactions_ann    ON public.announcement_reactions(announcement_id);
CREATE INDEX IF NOT EXISTS idx_ann_reactions_tenant ON public.announcement_reactions(tenant_id);

ALTER TABLE public.announcement_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_reactions_select" ON public.announcement_reactions
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "ann_reactions_insert" ON public.announcement_reactions
  FOR INSERT WITH CHECK (
    tenant_id = public.get_user_tenant_id() AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE user_id = auth.uid() AND tenant_id = public.get_user_tenant_id()
    )
  );

CREATE POLICY "ann_reactions_delete" ON public.announcement_reactions
  FOR DELETE USING (
    tenant_id = public.get_user_tenant_id() AND
    employee_id IN (
      SELECT id FROM public.employees
      WHERE user_id = auth.uid() AND tenant_id = public.get_user_tenant_id()
    )
  );
