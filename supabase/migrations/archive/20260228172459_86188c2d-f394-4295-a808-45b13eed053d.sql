
-- ==========================================
-- v6.0 — Sistema de Documentos de Processos
-- ==========================================

-- 1. Tabela de pastas
CREATE TABLE public.process_doc_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.process_doc_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de documentos
CREATE TABLE public.process_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID REFERENCES public.process_doc_folders(id) ON DELETE CASCADE,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'document' CHECK (type IN ('document', 'file')),
  file_path TEXT,
  file_size BIGINT,
  file_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX idx_doc_folders_process ON public.process_doc_folders(process_id);
CREATE INDEX idx_doc_folders_parent ON public.process_doc_folders(parent_id);
CREATE INDEX idx_doc_folders_tenant ON public.process_doc_folders(tenant_id);
CREATE INDEX idx_doc_folders_public_token ON public.process_doc_folders(public_token) WHERE public_token IS NOT NULL;

CREATE INDEX idx_documents_process ON public.process_documents(process_id);
CREATE INDEX idx_documents_folder ON public.process_documents(folder_id);
CREATE INDEX idx_documents_tenant ON public.process_documents(tenant_id);
CREATE INDEX idx_documents_public_token ON public.process_documents(public_token) WHERE public_token IS NOT NULL;

-- 4. updated_at triggers
CREATE TRIGGER set_updated_at_doc_folders
  BEFORE UPDATE ON public.process_doc_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_documents
  BEFORE UPDATE ON public.process_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. RLS
ALTER TABLE public.process_doc_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_documents ENABLE ROW LEVEL SECURITY;

-- Folders RLS: tenant select
CREATE POLICY "folders_select" ON public.process_doc_folders
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Folders RLS: public select via token (anon allowed)
CREATE POLICY "folders_public_select" ON public.process_doc_folders
  AS PERMISSIVE FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

-- Folders RLS: admin/manager manage
CREATE POLICY "folders_insert" ON public.process_doc_folders
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "folders_update" ON public.process_doc_folders
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "folders_delete" ON public.process_doc_folders
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- Documents RLS: tenant select
CREATE POLICY "documents_select" ON public.process_documents
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Documents RLS: public select via token (anon allowed)
CREATE POLICY "documents_public_select" ON public.process_documents
  AS PERMISSIVE FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

-- Documents RLS: also public if parent folder is public
CREATE POLICY "documents_folder_public_select" ON public.process_documents
  AS PERMISSIVE FOR SELECT TO anon
  USING (folder_id IN (SELECT id FROM public.process_doc_folders WHERE is_public = true AND public_token IS NOT NULL));

-- Documents RLS: admin/manager manage
CREATE POLICY "documents_insert" ON public.process_documents
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "documents_update" ON public.process_documents
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "documents_delete" ON public.process_documents
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- 6. Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('process-documents', 'process-documents', true);

-- Storage RLS: authenticated users in their tenant can upload
CREATE POLICY "process_docs_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'process-documents');

CREATE POLICY "process_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'process-documents');

CREATE POLICY "process_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'process-documents');

-- Storage: public read for anon (images in public docs)
CREATE POLICY "process_docs_public_read" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'process-documents');
