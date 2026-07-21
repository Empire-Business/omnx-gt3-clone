-- feed_reads: estado de leitura do Feed por usuário (badge de não-lidos da sidebar).
-- Substitui o antigo controle por localStorage, passando a persistir entre dispositivos
-- (celular + desktop). `last_read_at` = última vez que o usuário visualizou o feed;
-- posts mais novos que esse instante contam como não-lidos.

create table if not exists public.feed_reads (
  user_id uuid not null,
  tenant_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

alter table public.feed_reads enable row level security;

-- Cada usuário só enxerga/escreve o próprio registro de leitura.
create policy "feed_reads_select_own" on public.feed_reads
  for select using (user_id = auth.uid());

create policy "feed_reads_insert_own" on public.feed_reads
  for insert with check (user_id = auth.uid());

create policy "feed_reads_update_own" on public.feed_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
