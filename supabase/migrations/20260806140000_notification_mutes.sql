-- ══════════════════════════════════════════════════════════════
-- Silenciamento de notificações por TIPO (tarefas, chat, feed ou tudo),
-- com duração opcional — o mesmo modelo já usado em chat_channel_mutes,
-- só que global (não por canal).
--
-- Motivação: só existia mute por conversa. Não havia como desligar as
-- notificações de TAREFA (toast in-app + push), pedido recorrente de quem
-- recebe muitas atribuições.
--
-- `kind = 'all'` cobre todos os tipos — por isso o helper checa
-- `kind IN ('all', p_kind)`.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_mutes (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('all', 'task', 'chat', 'feed')),
  -- NULL = silenciado até o usuário reativar
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

ALTER TABLE public.notification_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own notification mutes" ON public.notification_mutes;
CREATE POLICY "user reads own notification mutes"
  ON public.notification_mutes FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user inserts own notification mutes" ON public.notification_mutes;
CREATE POLICY "user inserts own notification mutes"
  ON public.notification_mutes FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Necessária para o upsert (trocar 1h por 24h re-silenciando o mesmo kind).
-- Foi exatamente a policy que faltava em chat_channel_mutes e quebrou o mute
-- de conversa a partir da 2ª tentativa.
DROP POLICY IF EXISTS "user updates own notification mutes" ON public.notification_mutes;
CREATE POLICY "user updates own notification mutes"
  ON public.notification_mutes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user deletes own notification mutes" ON public.notification_mutes;
CREATE POLICY "user deletes own notification mutes"
  ON public.notification_mutes FOR DELETE
  USING (user_id = auth.uid());

-- ── Helper: mute ativo (permanente ou não expirado) ────────────
-- Fonte única da regra, usada pelos triggers de push e disponível para
-- edge functions.
CREATE OR REPLACE FUNCTION public.is_notification_muted(
  p_user_id uuid,
  p_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.notification_mutes m
    WHERE m.user_id = p_user_id
      AND m.kind IN ('all', p_kind)
      AND (m.expires_at IS NULL OR m.expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_notification_muted(uuid, text) TO authenticated, service_role;

-- ── Push de tarefa atribuída passa a respeitar o mute ─────────
CREATE OR REPLACE FUNCTION public.trg_push_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
declare
  v_emp_ids uuid[];
begin
  if NEW.type <> 'task_assigned' then
    return NEW;
  end if;

  -- Destinatário silenciou notificações de tarefa (ou todas) → sem push.
  -- A notificação continua sendo gravada em `notifications` (o sininho
  -- mostra o histórico); o que some é o alerta ativo.
  if public.is_notification_muted(NEW.user_id, 'task') then
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

-- ── Push de novo post no feed passa a respeitar o mute ────────
-- Mesma função da migration 20260601170000, com o filtro
-- `NOT is_notification_muted(..., 'feed')` nos dois SELECTs de destinatários.
CREATE OR REPLACE FUNCTION public.trg_feed_post_broadcast_to_channels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
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
        where ccm.channel_id = v_channel_id
          and ccm.user_id <> v_author_user_id
          and not public.is_notification_muted(ccm.user_id, 'feed');

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
      where ccm.channel_id = v_channel_id
        and ccm.user_id <> v_author_user_id
        and not public.is_notification_muted(ccm.user_id, 'feed');

      perform public.app_dispatch_push(
        v_emp_ids, '📢 Novo no Feed', v_excerpt,
        '/feed?post=' || NEW.id::text, 'feed-' || NEW.id::text
      );
    end if;
  end loop;

  return NEW;
end;
$$;
