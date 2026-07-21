
-- Project document folders
CREATE TABLE public.project_doc_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.project_doc_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project documents
CREATE TABLE public.project_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.project_doc_folders(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'document',
  file_path TEXT,
  file_size BIGINT,
  file_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_project_doc_folders_project ON public.project_doc_folders(project_id);
CREATE INDEX idx_project_doc_folders_parent ON public.project_doc_folders(parent_id);
CREATE INDEX idx_project_doc_folders_tenant ON public.project_doc_folders(tenant_id);
CREATE INDEX idx_project_doc_folders_token ON public.project_doc_folders(public_token) WHERE public_token IS NOT NULL;
CREATE INDEX idx_project_documents_project ON public.project_documents(project_id);
CREATE INDEX idx_project_documents_folder ON public.project_documents(folder_id);
CREATE INDEX idx_project_documents_tenant ON public.project_documents(tenant_id);
CREATE INDEX idx_project_documents_token ON public.project_documents(public_token) WHERE public_token IS NOT NULL;

-- Triggers
CREATE TRIGGER update_project_doc_folders_updated_at
  BEFORE UPDATE ON public.project_doc_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.project_doc_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- project_doc_folders policies
CREATE POLICY "pf_select" ON public.project_doc_folders FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "pf_public_select" ON public.project_doc_folders FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

CREATE POLICY "pf_insert" ON public.project_doc_folders FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "pf_update" ON public.project_doc_folders FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "pf_delete" ON public.project_doc_folders FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- project_documents policies
CREATE POLICY "pd_select" ON public.project_documents FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "pd_public_select" ON public.project_documents FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

CREATE POLICY "pd_folder_public_select" ON public.project_documents FOR SELECT TO anon
  USING (folder_id IN (SELECT id FROM public.project_doc_folders WHERE is_public = true AND public_token IS NOT NULL));

CREATE POLICY "pd_insert" ON public.project_documents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "pd_update" ON public.project_documents FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "pd_delete" ON public.project_documents FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));
