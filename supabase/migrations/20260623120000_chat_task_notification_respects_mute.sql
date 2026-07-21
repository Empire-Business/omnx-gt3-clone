-- ══════════════════════════════════════════════════════════════
-- Notificação de tarefa atribuída pelo chat respeita o silenciamento
-- do DESTINATÁRIO (não do criador).
--
-- Antes: o cliente (Chat.tsx) inseria direto em `notifications`. Para
-- checar o mute do responsável era preciso ler `chat_channel_mutes`
-- de outro usuário — bloqueado por RLS — então a checagem client-side
-- era best-effort (no-op quando o RLS bloqueava).
--
-- Agora: RPC SECURITY DEFINER que valida o canal/tenant, confirma que
-- o responsável é membro do canal e só insere a notificação se ele NÃO
-- silenciou o canal. A leitura do mute alheio é segura aqui porque a
-- função roda como owner (bypassa RLS), com escopo restrito.
-- ══════════════════════════════════════════════════════════════

create or replace function public.create_chat_task_notification(
  p_channel_id uuid,
  p_assignee_user_id uuid,
  p_title text,
  p_body text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_is_muted boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- O chamador precisa ser membro do canal; o tenant é derivado do canal
  select c.tenant_id into v_tenant
  from public.chat_channels c
  join public.chat_channel_members m
    on m.channel_id = c.id and m.user_id = auth.uid()
  where c.id = p_channel_id;

  if v_tenant is null then
    raise exception 'canal inacessível';
  end if;

  -- Não notifica a si mesmo
  if p_assignee_user_id is null or p_assignee_user_id = auth.uid() then
    return;
  end if;

  -- O responsável precisa ser membro do canal (evita notificar usuários arbitrários)
  if not exists (
    select 1 from public.chat_channel_members
    where channel_id = p_channel_id and user_id = p_assignee_user_id
  ) then
    return;
  end if;

  -- Respeita o silenciamento do destinatário
  select exists (
    select 1 from public.chat_channel_mutes
    where channel_id = p_channel_id
      and user_id = p_assignee_user_id
      and (expires_at is null or expires_at > now())
  ) into v_is_muted;

  if v_is_muted then
    return;
  end if;

  insert into public.notifications (tenant_id, user_id, type, title, body, link)
  values (
    v_tenant,
    p_assignee_user_id,
    'task_assigned_chat',
    p_title,
    p_body,
    '/chat/' || p_channel_id::text
  );
end;
$$;

revoke all on function public.create_chat_task_notification(uuid, uuid, text, text) from public;
grant execute on function public.create_chat_task_notification(uuid, uuid, text, text) to authenticated;
