-- Módulo de Comunicados / Feed
-- Comunicados e postagens com controle de visibilidade por cargo, pessoa, área ou subárea

-- =====================================================================
-- 1. Tabela principal: announcements
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (char_length(title) > 0),
  content     TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'post' CHECK (type IN ('announcement', 'post')),
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  cover_url   TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  pinned      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS announcements_tenant_id_idx   ON public.announcements(tenant_id);
CREATE INDEX IF NOT EXISTS announcements_author_id_idx   ON public.announcements(author_id);
CREATE INDEX IF NOT EXISTS announcements_status_idx      ON public.announcements(status);
CREATE INDEX IF NOT EXISTS announcements_published_at_idx ON public.announcements(published_at DESC);

-- =====================================================================
-- 2. Tabela de visibilidade: quem pode ver cada comunicado
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.announcement_visibility (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL CHECK (target_type IN ('all', 'position', 'employee', 'area', 'subarea')),
  target_id       UUID  -- NULL when target_type = 'all'
);

CREATE INDEX IF NOT EXISTS announcement_visibility_ann_idx ON public.announcement_visibility(announcement_id);
CREATE INDEX IF NOT EXISTS announcement_visibility_tid_idx ON public.announcement_visibility(tenant_id);

-- =====================================================================
-- 3. RLS — announcements
-- =====================================================================

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer colaborador do tenant pode ver comunicados publicados
-- (filtragem de visibilidade feita na aplicação)
CREATE POLICY "announcements_select"
  ON public.announcements FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Criação: admin ou manager
CREATE POLICY "announcements_insert"
  ON public.announcements FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND (is_admin() OR has_role(auth.uid(), 'manager'))
  );

-- Atualização: apenas o autor ou admin
CREATE POLICY "announcements_update"
  ON public.announcements FOR UPDATE
  USING (
    tenant_id = get_user_tenant_id()
    AND (
      is_admin()
      OR author_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  );

-- Exclusão: apenas o autor ou admin
CREATE POLICY "announcements_delete"
  ON public.announcements FOR DELETE
  USING (
    tenant_id = get_user_tenant_id()
    AND (
      is_admin()
      OR author_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  );

-- =====================================================================
-- 4. RLS — announcement_visibility
-- =====================================================================

ALTER TABLE public.announcement_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcement_visibility_select"
  ON public.announcement_visibility FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "announcement_visibility_insert"
  ON public.announcement_visibility FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "announcement_visibility_delete"
  ON public.announcement_visibility FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- =====================================================================
-- 5. Trigger: updated_at
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_announcements_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_announcements_updated_at();
