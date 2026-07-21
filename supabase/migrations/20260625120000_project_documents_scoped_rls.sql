-- Segurança: restringe leitura de project_documents aos projetos de que a
-- pessoa participa (antes era tenant-wide — qualquer usuário do tenant lia
-- qualquer documento de qualquer projeto). Reusa user_can_read_project, que
-- já espelha o RLS de projects (admin/legacy veem tudo; manager/member só os
-- seus). Os links públicos por token (policies pd_public_select e
-- pd_folder_public_select, role anon) permanecem intactos.
-- Aplicado em produção (opbdoulspzlabxzevffc) em 2026-06-25 via Management API.

drop policy if exists pd_select on public.project_documents;
create policy pd_select on public.project_documents
  for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id()
    and public.user_can_read_project(project_id)
  );
