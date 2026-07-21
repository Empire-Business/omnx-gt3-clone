-- Fase 4 (refinamento) — melhora a apresentação da mensagem espelhada do Feed:
--  • título em negrito + trecho do conteúdo (o chat renderiza **negrito**);
--  • anexo estruturado { type:'feed_post', post_id, url } → o chat mostra um
--    card clicável que leva à publicação (/feed?post=<id>). No front que ainda
--    não conhece o tipo, cai num chip de link clicável (degradação suave).

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

  -- Caso 'all' → canal geral.
  if NEW.visibility_type is not distinct from 'all' then
    v_channel_id := public.ensure_general_channel(NEW.tenant_id);
    if v_channel_id is not null then
      insert into public.feed_post_channel_broadcasts (feed_post_id, channel_id, tenant_id)
      values (NEW.id, v_channel_id, NEW.tenant_id)
      on conflict (feed_post_id, channel_id) do nothing;
      if found then
        insert into public.chat_messages (channel_id, tenant_id, author_id, content, attachments)
        values (v_channel_id, NEW.tenant_id, v_author_user_id, v_content, v_attach);
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
      insert into public.chat_messages (channel_id, tenant_id, author_id, content, attachments)
      values (v_channel_id, NEW.tenant_id, v_author_user_id, v_content, v_attach);
    end if;
  end loop;

  return NEW;
end;
$$;
