-- process_folders: suporte a pastas e sub-pastas para processos
create table process_folders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  parent_id uuid references process_folders(id) on delete cascade,
  sort_order integer default 0,
  created_by uuid references profiles(user_id),
  created_at timestamptz default now()
);
alter table process_folders enable row level security;
create policy "process_folders_tenant_isolation" on process_folders
  for all using (tenant_id = (select tenant_id from profiles where user_id = auth.uid()));

-- Adicionar folder_id em processes
alter table processes add column folder_id uuid references process_folders(id) on delete set null;

-- process_tags: tags com cor para categorização
create table process_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  created_by uuid references profiles(user_id),
  created_at timestamptz default now()
);
alter table process_tags enable row level security;
create policy "process_tags_tenant_isolation" on process_tags
  for all using (tenant_id = (select tenant_id from profiles where user_id = auth.uid()));

-- process_tag_assignments: junction table processo <-> tag
create table process_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references processes(id) on delete cascade,
  tag_id uuid not null references process_tags(id) on delete cascade,
  created_at timestamptz default now(),
  unique(process_id, tag_id)
);
alter table process_tag_assignments enable row level security;
create policy "process_tag_assignments_tenant_isolation" on process_tag_assignments
  for all using (
    exists (
      select 1 from processes p
      where p.id = process_tag_assignments.process_id
      and p.tenant_id = (select tenant_id from profiles where user_id = auth.uid())
    )
  );
