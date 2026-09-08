-- ══════════════════════════════════════════════════════════════
-- 1) Notificação quando alguém reage a uma mensagem sua
-- 2) Aviso no chat (#geral) quando um colaborador novo é adicionado
--
-- Ambos via trigger SECURITY DEFINER: a notificação/mensagem precisa ser
-- criada para OUTRO usuário, o que a RLS bloqueia no client. Mesmo padrão
-- já usado em create_chat_task_notification.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Reação → notificação para o autor da mensagem ──────────
create or replace function public.notify_chat_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id  uuid;
  v_channel_id uuid;
  v_tenant     uuid;
  v_reactor    text;
  v_preview    text;
  v_is_muted   boolean;
begin
  select m.author_id, m.channel_id, m.tenant_id, m.content
    into v_author_id, v_channel_id, v_tenant, v_preview
  from public.chat_messages m
  where m.id = new.message_id;

  -- Mensagem inexistente ou reação na própria mensagem: não notifica
  if v_author_id is null or v_author_id = new.user_id then
    return new;
  end if;

  -- Respeita o silenciamento do canal pelo destinatário
  select exists (
    select 1 from public.chat_channel_mutes
    where channel_id = v_channel_id
      and user_id = v_author_id
      and (expires_at is null or expires_at > now())
  ) into v_is_muted;

  if v_is_muted then
    return new;
  end if;

  select coalesce(p.full_name, 'Alguém') into v_reactor
  from public.profiles p
  where p.user_id = new.user_id;

  -- Prévia curta da mensagem reagida, para o card da notificação
  v_preview := nullif(trim(coalesce(v_preview, '')), '');
  if v_preview is not null and length(v_preview) > 60 then
    v_preview := left(v_preview, 60) || '…';
  end if;

  insert into public.notifications (tenant_id, user_id, type, title, body, link, source, source_id)
  values (
    v_tenant,
    v_author_id,
    'chat_reaction',
    coalesce(v_reactor, 'Alguém') || ' reagiu ' || new.emoji || ' à sua mensagem',
    coalesce(v_preview, 'Toque para ver a conversa'),
    '/chat/' || v_channel_id::text,
    'chat',
    new.message_id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_chat_reaction on public.chat_reactions;
create trigger trg_notify_chat_reaction
  after insert on public.chat_reactions
  for each row
  execute function public.notify_chat_reaction();

-- ── 2. Colaborador novo → aviso no canal #geral ───────────────
create or replace function public.announce_new_employee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot_id     uuid;
  v_channel_id uuid;
  v_name       text;
begin
  -- Bot do tenant (autor da mensagem de sistema)
  select p.user_id into v_bot_id
  from public.profiles p
  where p.tenant_id = new.tenant_id and p.is_system_bot = true
  limit 1;

  -- Canal geral do tenant
  select c.id into v_channel_id
  from public.chat_channels c
  where c.tenant_id = new.tenant_id and c.name = 'geral' and c.is_dm = false
  limit 1;

  -- Sem bot ou sem canal geral: não é erro, apenas não anuncia
  if v_bot_id is null or v_channel_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), new.work_email, 'Um novo colaborador')
    into v_name
  from public.profiles p
  where p.user_id = new.user_id;

  v_name := coalesce(v_name, new.work_email, 'Um novo colaborador');

  insert into public.chat_messages (channel_id, tenant_id, author_id, content)
  values (
    v_channel_id,
    new.tenant_id,
    v_bot_id,
    '👋 ' || v_name || ' acaba de entrar na equipe. Deem as boas-vindas!'
  );

  return new;
end;
$$;

drop trigger if exists trg_announce_new_employee on public.employees;
create trigger trg_announce_new_employee
  after insert on public.employees
  for each row
  execute function public.announce_new_employee();
