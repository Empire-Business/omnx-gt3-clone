-- Tabela de pastas para documentos de processos
CREATE TABLE IF NOT EXISTS process_doc_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id  UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES process_doc_folders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT,
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  created_by  UUID REFERENCES profiles(user_id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de documentos/arquivos de processos
CREATE TABLE IF NOT EXISTS process_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id  UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  folder_id   UUID REFERENCES process_doc_folders(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  content     TEXT,
  type        TEXT NOT NULL DEFAULT 'document' CHECK (type IN ('document','file')),
  file_path   TEXT,
  file_size   BIGINT,
  file_type   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT,
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  created_by  UUID REFERENCES profiles(user_id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_process_doc_folders_process ON process_doc_folders(process_id);
CREATE INDEX IF NOT EXISTS idx_process_doc_folders_tenant ON process_doc_folders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_process ON process_documents(process_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_folder ON process_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_tenant ON process_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_documents_token ON process_documents(public_token) WHERE public_token IS NOT NULL;

-- RLS
ALTER TABLE process_doc_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_documents ENABLE ROW LEVEL SECURITY;

-- Pastas: leitura por tenant (autenticado)
CREATE POLICY "pf_proc_select" ON process_doc_folders FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Pastas: escrita por admin/manager
CREATE POLICY "pf_proc_write" ON process_doc_folders FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- Documentos: leitura por tenant (autenticado)
CREATE POLICY "pd_proc_select" ON process_documents FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Documentos: escrita por admin/manager
CREATE POLICY "pd_proc_write" ON process_documents FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')))
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

-- Acesso público anônimo (tokens)
CREATE POLICY "pf_proc_public" ON process_doc_folders FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);

CREATE POLICY "pd_proc_public" ON process_documents FOR SELECT TO anon
  USING (is_public = true AND public_token IS NOT NULL);
