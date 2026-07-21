-- ══════════════════════════════════════════════════════════════
-- Fase 3 — Web Push em eventos do banco:
--   • tarefa atribuída (notifications.type='task_assigned')
--   • novo post no feed (membros do canal espelhado)
--
-- Disparo via pg_net → edge function send-push, autenticado pelo segredo
-- interno do Vault (internal_push_secret) no header x-internal-secret.
-- A edge function valida contra env INTERNAL_PUSH_SECRET.
-- ══════════════════════════════════════════════════════════════

-- Helper: dispara push para uma lista de employees (assíncrono, não bloqueia o INSERT).
create or replace function public.app_dispatch_push(
  p_employee_ids uuid[], p_title text, p_body text, p_url text, p_tag text
) returns void language plpgsql security definer
set search_path = public as $$
declare
  v_secret text;
begin
  if p_employee_ids is null or array_length(p_employee_ids, 1) is null then
    return;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'internal_push_secret';
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://opbdoulspzlabxzevffc.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := jsonb_build_object(
      'employee_ids', to_jsonb(p_employee_ids),
      'title', p_title,
      'body', p_body,
      'url', p_url,
      'tag', p_tag
    )
  );
end;
$$;

-- ── Push de tarefa atribuída ──────────────────────────────────
create or replace function public.trg_push_task_assigned()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_emp_ids uuid[];
begin
  if NEW.type <> 'task_assigned' then
    return NEW;
  end if;
  select array_agg(id) into v_emp_ids
  from public.employees
  where user_id = NEW.user_id and tenant_id = NEW.tenant_id;

  perform public.app_dispatch_push(
    v_emp_ids,
    coalesce(NEW.title, 'Nova tarefa'),
    coalesce(NEW.body, 'Você foi atribuído a uma tarefa.'),
    coalesce(NEW.link, '/tarefas'),
    'task-assigned'
  );
  return NEW;
end;
$$;

drop trigger if exists trg_push_task_assigned on public.notifications;
create trigger trg_push_task_assigned
  after insert on public.notifications
  for each row execute function public.trg_push_task_assigned();

-- ── Push de novo post no feed (reescreve o trigger de espelhamento) ──
-- Mantém o espelhamento da Fase 4 e adiciona push aos membros do canal (≠ autor).
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
  v_attach jsonb;
  v_excerpt text;
  v_emp_ids uuid[];
begin
  select user_id into v_author_user_id from public.employees where id = NEW.employee_id;
  if v_author_user_id is null then return NEW; end if;

  v_excerpt := left(regexp_replace(coalesce(NEW.content, ''), '\s+', ' ', 'g'), 400);
  v_content := '📢 **Novo no Feed**' || E'\n\n' || v_excerpt;
  v_attach := jsonb_build_array(jsonb_build_object(
    'type', 'feed_post',
    'post_id', NEW.id,
    'name', 'Ver publicação no Feed',
    'url', '/feed?post=' || NEW.id::text
  ));

  if NEW.visibility_type is not distinct from 'all' then
    v_channel_id := public.ensure_general_channel(NEW.tenant_id);
    if v_channel_id is not null then
      insert into public.feed_post_channel_broadcasts (feed_post_id, channel_id, tenant_id)
      values (NEW.id, v_channel_id, NEW.tenant_id)
      on conflict (feed_post_id, channel_id) do nothing;
      if found then
        insert into public.chat_messages (channel_id, tenant_id, author_id, content, attachments)
        values (v_channel_id, NEW.tenant_id, v_author_user_id, v_content, v_attach);

        select array_agg(e.id) into v_emp_ids
        from public.chat_channel_members ccm
        join public.employees e on e.user_id = ccm.user_id and e.tenant_id = NEW.tenant_id
        where ccm.channel_id = v_channel_id and ccm.user_id <> v_author_user_id;

        perform public.app_dispatch_push(
          v_emp_ids, '📢 Novo no Feed', v_excerpt,
          '/feed?post=' || NEW.id::text, 'feed-' || NEW.id::text
        );
      end if;
    end if;
    return NEW;
  end if;

  for v_target in
    select * from jsonb_array_elements(coalesce(NEW.visibility_targets, '[]'::jsonb))
  loop
    v_area_id := null;
    if v_target->>'type' = 'area' then
      v_area_id := (v_target->>'id')::uuid;
    elsif v_target->>'type' = 'subarea' then
      select area_id into v_area_id from public.subareas where id = (v_target->>'id')::uuid;
    end if;
    if v_area_id is null then continue; end if;

    select name into v_area_name from public.company_areas where id = v_area_id;
    v_channel_id := public.ensure_area_channel(v_area_id, NEW.tenant_id, coalesce(v_area_name, 'Área'));
    if v_channel_id is null then continue; end if;

    insert into public.feed_post_channel_broadcasts (feed_post_id, channel_id, tenant_id)
    values (NEW.id, v_channel_id, NEW.tenant_id)
    on conflict (feed_post_id, channel_id) do nothing;

    if found then
      insert into public.chat_messages (channel_id, tenant_id, author_id, content, attachments)
      values (v_channel_id, NEW.tenant_id, v_author_user_id, v_content, v_attach);

      select array_agg(e.id) into v_emp_ids
      from public.chat_channel_members ccm
      join public.employees e on e.user_id = ccm.user_id and e.tenant_id = NEW.tenant_id
      where ccm.channel_id = v_channel_id and ccm.user_id <> v_author_user_id;

      perform public.app_dispatch_push(
        v_emp_ids, '📢 Novo no Feed', v_excerpt,
        '/feed?post=' || NEW.id::text, 'feed-' || NEW.id::text
      );
    end if;
  end loop;

  return NEW;
end;
$$;
