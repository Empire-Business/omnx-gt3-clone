-- ══════════════════════════════════════════════════════════════
-- Fase 4 — Espelha posts do Feed como mensagem em canal de chat.
--
-- Regra (decidida com o usuário):
--  • visibility_type = 'all'      → espelha no CANAL GERAL do tenant.
--  • visibility_type = 'specific' → para cada alvo do tipo 'area'
--    (ou 'subarea', resolvendo a área-pai) espelha no canal da área.
--
-- A mensagem entra em nome de quem publicou, com selo "📢 [do Feed]".
--
-- IMPORTANTE: os canais padrão (geral / aquisicao / entrega / operacao / ...)
-- já existem em cada tenant, porém sem area_id e sem a flag is_general.
-- Esta migration RECONCILIA esses canais existentes (em vez de criar novos),
-- evitando duplicatas. As funções ensure_*_channel passam a encontrá-los.
--
-- Observação: o espelhamento gera badge de não-lido no chat, mas NÃO dispara
-- Web Push — push de feed é tratado na Fase 3.
-- ══════════════════════════════════════════════════════════════

create extension if not exists unaccent;

-- ── 1. Flag de canal geral ────────────────────────────────────
alter table public.chat_channels
  add column if not exists is_general boolean not null default false;

-- Backfill: marca o canal "geral" já existente de cada tenant (o mais antigo).
with grls as (
  select distinct on (tenant_id) id
  from public.chat_channels
  where is_dm = false and lower(unaccent(name)) = 'geral'
  order by tenant_id, created_at asc
)
update public.chat_channels c
set is_general = true
from grls
where c.id = grls.id and c.is_general = false;

create unique index if not exists chat_channels_one_general_per_tenant
  on public.chat_channels (tenant_id) where is_general;

-- ── 2. Vincula canais de área existentes às company_areas (por nome) ──
update public.chat_channels c
set area_id = a.id
from public.company_areas a
where c.tenant_id = a.tenant_id
  and c.area_id is null
  and c.is_dm = false
  and lower(unaccent(c.name)) = lower(unaccent(a.name));

-- ── 3. Canal geral sob demanda (cria se não existir + sincroniza membros) ──
create or replace function public.ensure_general_channel(p_tenant_id uuid)
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_channel_id uuid;
begin
  select id into v_channel_id
  from public.chat_channels
  where tenant_id = p_tenant_id and is_general = true
  limit 1;

  if v_channel_id is null then
    insert into public.chat_channels (tenant_id, name, is_dm, is_general)
    values (p_tenant_id, 'geral', false, true)
    returning id into v_channel_id;
  end if;

  insert into public.chat_channel_members (channel_id, user_id, role)
  select v_channel_id, e.user_id, 'member'
  from public.employees e
  where e.tenant_id = p_tenant_id
    and e.status = 'active'
    and e.user_id is not null
  on conflict (channel_id, user_id) do nothing;

  return v_channel_id;
end;
$$;

-- ── 4. Rastreio de espelhamentos (dedupe + vínculo post↔canal) ──
create table if not exists public.feed_post_channel_broadcasts (
  feed_post_id uuid not null references public.feed_posts(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  tenant_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (feed_post_id, channel_id)
);

alter table public.feed_post_channel_broadcasts enable row level security;

create policy "feed_broadcasts_select_member" on public.feed_post_channel_broadcasts
  for select using (
    exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = feed_post_channel_broadcasts.channel_id
        and m.user_id = auth.uid()
    )
  );
-- Escrita só pela trigger (SECURITY DEFINER) — sem policy de insert para o cliente.

-- ── 5. Trigger de espelhamento ────────────────────────────────
create or replace function public.trg_feed_post_broadcast_to_channels()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_target jsonb;
  v_area_id uuid;
  v_area_name text;
  v_channel_id uuid;
  v_author_user_id uuid;
  v_content text;
begin
  -- author_id das mensagens é o user_id; resolve a partir do employee autor do post.
  select user_id into v_author_user_id from public.employees where id = NEW.employee_id;
  if v_author_user_id is null then return NEW; end if;

  v_content := '📢 [do Feed] ' || coalesce(NEW.content, '');

  -- Caso 'all' → canal geral.
  if NEW.visibility_type is not distinct from 'all' then
    v_channel_id := public.ensure_general_channel(NEW.tenant_id);
    if v_channel_id is not null then
      insert into public.feed_post_channel_broadcasts (feed_post_id, channel_id, tenant_id)
      values (NEW.id, v_channel_id, NEW.tenant_id)
      on conflict (feed_post_id, channel_id) do nothing;
      if found then
        insert into public.chat_messages (channel_id, tenant_id, author_id, content)
        values (v_channel_id, NEW.tenant_id, v_author_user_id, v_content);
      end if;
    end if;
    return NEW;
  end if;

  -- Caso 'specific' → canais de área de cada alvo (area / subarea).
  for v_target in
    select * from jsonb_array_elements(coalesce(NEW.visibility_targets, '[]'::jsonb))
  loop
    v_area_id := null;

    if v_target->>'type' = 'area' then
      v_area_id := (v_target->>'id')::uuid;
    elsif v_target->>'type' = 'subarea' then
      select area_id into v_area_id from public.subareas where id = (v_target->>'id')::uuid;
    end if;

    if v_area_id is null then
      continue;
    end if;

    select name into v_area_name from public.company_areas where id = v_area_id;
    v_channel_id := public.ensure_area_channel(v_area_id, NEW.tenant_id, coalesce(v_area_name, 'Área'));
    if v_channel_id is null then
      continue;
    end if;

    insert into public.feed_post_channel_broadcasts (feed_post_id, channel_id, tenant_id)
    values (NEW.id, v_channel_id, NEW.tenant_id)
    on conflict (feed_post_id, channel_id) do nothing;

    if found then
      insert into public.chat_messages (channel_id, tenant_id, author_id, content)
      values (v_channel_id, NEW.tenant_id, v_author_user_id, v_content);
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trg_feed_post_broadcast on public.feed_posts;
create trigger trg_feed_post_broadcast
  after insert on public.feed_posts
  for each row execute function public.trg_feed_post_broadcast_to_channels();
