-- =============================================================================
-- EMPIRE MANAGER — Baseline de Schema (Migration Inicial)
-- =============================================================================
-- GERADO: 2026-05-06T20:49:11Z
-- FONTE: pg_dump --schema-only do projeto Supabase EmpireManager
-- TABELAS: ~112 (schemas public, auth, storage, extensions, etc.)
-- =============================================================================
-- INSTRUCOES:
-- 1. Este e o schema COMPLETO e atualizado do banco.
-- 2. As migrations antigas (134 arquivos) foram arquivadas em migrations/archive/.
-- 3. Para novos projetos, use este arquivo via SQL Editor ou supabase db reset.
-- =============================================================================
-- AVISOS:
-- • Extensões pg_cron e pg_net requerem plano Pro+ do Supabase.
--   No plano Free, funcionalidades de recorrência automática não funcionam.
-- • Schemas do sistema (auth, storage, etc.) foram removidos do dump
--   pois já existem em qualquer projeto Supabase novo.
-- =============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: supabase_admin
--




--
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;


--
-- Name: EXTENSION pg_cron; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: postgres
--




--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: supabase_admin
--




--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: supabase_admin
--




--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_net; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_net IS 'Async HTTP';


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: pgbouncer
--




--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'Schema com RLS habilitado. Anon key tem acesso read-only via políticas específicas.';


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: supabase_admin
--




--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: supabase_admin
--




--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: postgres
--




--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: supabase_admin
--




--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'manager',
    'member'
);



--
-- Name: employee_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.employee_status AS ENUM (
    'active',
    'inactive',
    'on_leave'
);



--
-- Name: process_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.process_status AS ENUM (
    'draft',
    'active',
    'archived'
);



--
-- Name: project_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.project_status AS ENUM (
    'planning',
    'active',
    'on_hold',
    'completed',
    'cancelled'
);



--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);



--
-- Name: task_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.task_status AS ENUM (
    'backlog',
    'todo',
    'doing',
    'review',
    'ajustes',
    'done',
    'arquivado'
);



--
-- Name: add_user_to_omnx_bot(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.add_user_to_omnx_bot() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE tenant_id = NEW.tenant_id AND name = 'omnx-bot' AND is_system = true
  LIMIT 1;
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (v_channel_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;



--
-- Name: area_employee_ids(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.area_employee_ids(p_area_id uuid) RETURNS TABLE(emp_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT DISTINCT e.id
  FROM public.employees e
  JOIN public.employee_positions ep ON ep.employee_id = e.id
  JOIN public.positions p            ON p.id = ep.position_id
  LEFT JOIN public.subareas sa       ON sa.id = p.subarea_id
  WHERE e.status = 'active'
    AND (p.area_id = p_area_id OR sa.area_id = p_area_id);
$$;



--
-- Name: chat_my_conversation_ids(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_my_conversation_ids() RETURNS TABLE(conversation_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT cp.conversation_id
  FROM public.chat_participants cp
  WHERE cp.employee_id = public.chat_my_employee_id();
$$;



--
-- Name: chat_my_employee_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_my_employee_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT id FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;



--
-- Name: chat_my_tenant_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_my_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT tenant_id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;



--
-- Name: chat_presence_my_employee_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_presence_my_employee_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;



--
-- Name: chat_touch_conversation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_touch_conversation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;



--
-- Name: chat_user_created_conversation(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chat_user_created_conversation(p_conv_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = p_conv_id
      AND created_by = public.chat_my_employee_id()
  );
$$;



--
-- Name: check_employee_hierarchy(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_employee_hierarchy() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'Um funcionário não pode ser seu próprio gestor';
  END IF;
  RETURN NEW;
END;
$$;



--
-- Name: check_position_cycle(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_position_cycle() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ DECLARE     visited_ids UUID[];     current_id UUID; BEGIN     IF NEW.reports_to_id IS NULL THEN         RETURN NEW;     END IF;     IF NEW.reports_to_id = NEW.id THEN         RAISE EXCEPTION 'Um cargo nao pode reportar para si mesmo';     END IF;     visited_ids := ARRAY[NEW.id];     current_id := NEW.reports_to_id;     WHILE current_id IS NOT NULL LOOP         IF current_id = ANY(visited_ids) THEN             RAISE EXCEPTION 'Ciclo detectado na hierarquia de cargos';         END IF;         visited_ids := array_append(visited_ids, current_id);         SELECT reports_to_id INTO current_id         FROM public.positions         WHERE id = current_id;     END LOOP;     RETURN NEW; END; $$;



--
-- Name: compute_next_meeting_occurrence(jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.compute_next_meeting_occurrence(p_pattern jsonb, p_after timestamp with time zone DEFAULT now()) RETURNS timestamp with time zone
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_freq text;
  v_byday text[];
  v_time text;
  v_tz text;
  v_end_date date;
  v_candidate timestamptz;
  v_local_date date;
  v_dow text;
  v_dows text[] := ARRAY['SU','MO','TU','WE','TH','FR','SA'];
BEGIN
  IF p_pattern IS NULL THEN RETURN NULL; END IF;
  v_freq := COALESCE(p_pattern->>'freq', 'weekly');
  v_byday := CASE
    WHEN p_pattern->'byday' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_pattern->'byday'))
    ELSE ARRAY['MO','TU','WE','TH','FR']
  END;
  v_time := COALESCE(p_pattern->>'time', '09:00');
  v_tz := COALESCE(p_pattern->>'tz', 'America/Sao_Paulo');
  v_end_date := NULLIF(p_pattern->>'end_date','')::date;
  FOR i IN 0..60 LOOP
    v_local_date := (timezone(v_tz, p_after))::date + i;
    IF v_end_date IS NOT NULL AND v_local_date > v_end_date THEN RETURN NULL; END IF;
    v_dow := v_dows[EXTRACT(DOW FROM v_local_date)::int + 1];
    IF v_freq = 'daily' OR v_dow = ANY(v_byday) THEN
      v_candidate := timezone(v_tz, (v_local_date::text || ' ' || v_time)::timestamp);
      IF v_candidate > p_after THEN RETURN v_candidate; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;



--
-- Name: create_director_position(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_director_position() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Only insert if a director position doesn't already exist for this area
  INSERT INTO positions (title, area_id, subarea_id, tenant_id, level, sort_order, created_at, updated_at)
  SELECT 'Diretor', NEW.id, NULL, NEW.tenant_id, 1, 0, NOW(), NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM positions 
    WHERE area_id = NEW.id 
    AND title = 'Diretor' 
    AND subarea_id IS NULL
  );
  RETURN NEW;
END;
$$;



--
-- Name: create_omnx_bot_channel(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_omnx_bot_channel() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_bot_id uuid;
BEGIN
  v_bot_id := public.ensure_omnx_bot(NEW.id);
  INSERT INTO public.chat_channels (tenant_id, name, description, is_dm, is_system, created_by)
  VALUES (NEW.id, 'omnx-bot', 'Assistente OMNX — peça para criar tarefas, reuniões, mensagens agendadas',
          false, true, v_bot_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;



--
-- Name: diagnostico_feed_posts_raw(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.diagnostico_feed_posts_raw() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid := public.get_user_tenant_id();
  v_posts     jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                  fp.id,
      'visibility_type',     fp.visibility_type,
      'visibility_targets',  fp.visibility_targets,
      'tenant_id',           fp.tenant_id,
      'created_at',          fp.created_at
    )
    ORDER BY fp.created_at DESC
  )
  INTO v_posts
  FROM public.feed_posts fp
  WHERE fp.tenant_id = v_tenant_id
  LIMIT 5;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'posts',     COALESCE(v_posts, '[]'::jsonb)
  );
END;
$$;



--
-- Name: diagnostico_feed_visibilidade(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.diagnostico_feed_visibilidade() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid         uuid  := auth.uid();
  v_tenant_id   uuid  := public.get_user_tenant_id();
  v_employee    jsonb;
  v_positions   jsonb;
  v_ultimo_post jsonb;
  v_can_read    boolean;
BEGIN
  -- 1. Employee do usuário atual
  SELECT to_jsonb(e) INTO v_employee
  FROM public.employees e
  WHERE e.user_id = v_uid
    AND e.tenant_id = v_tenant_id
  LIMIT 1;

  -- 2. Posições via employee_positions com subarea/area resolvidos
  SELECT jsonb_agg(row_to_json(x)) INTO v_positions
  FROM (
    SELECT
      ep.employee_id,
      ep.position_id,
      ep.is_primary,
      pos.title          AS position_title,
      pos.subarea_id,
      pos.area_id        AS position_area_id,
      sa.name            AS subarea_name,
      sa.area_id         AS subarea_parent_area_id,
      COALESCE(pos.area_id, sa.area_id) AS resolved_area_id
    FROM public.employee_positions ep
    JOIN public.employees e   ON e.id  = ep.employee_id
    JOIN public.positions pos ON pos.id = ep.position_id
    LEFT JOIN public.subareas sa ON sa.id = pos.subarea_id
    WHERE e.user_id = v_uid
      AND e.tenant_id = v_tenant_id
  ) x;

  -- 3. Último post com visibility_type = 'specific' e target subarea
  SELECT to_jsonb(p) INTO v_ultimo_post
  FROM public.feed_posts p
  WHERE p.tenant_id = v_tenant_id
    AND p.visibility_type = 'specific'
    AND p.visibility_targets::text LIKE '%subarea%'
  ORDER BY p.created_at DESC
  LIMIT 1;

  -- 4. Resultado da função de visibilidade para esse post
  IF v_ultimo_post IS NOT NULL THEN
    SELECT public.user_can_read_feed_post((v_ultimo_post->>'id')::uuid)
    INTO v_can_read;
  END IF;

  RETURN jsonb_build_object(
    'uid',            v_uid,
    'tenant_id',      v_tenant_id,
    'employee',       v_employee,
    'positions',      COALESCE(v_positions, '[]'::jsonb),
    'ultimo_post_subarea', v_ultimo_post,
    'user_can_read',  v_can_read
  );
END;
$$;



--
-- Name: employees_by_area(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.employees_by_area(p_area_id uuid) RETURNS TABLE(employee_id uuid, user_id uuid, full_name text, work_email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT
    e.id AS employee_id,
    e.user_id,
    p.full_name,
    e.work_email
  FROM public.employees e
  JOIN public.profiles p ON p.user_id = e.user_id
  JOIN public.employee_positions ep ON ep.employee_id = e.id
  JOIN public.positions pos ON pos.id = ep.position_id
  JOIN public.subareas sa ON sa.id = pos.subarea_id
  WHERE sa.area_id = p_area_id
    AND e.status = 'active'
    AND e.user_id IS NOT NULL;
$$;



--
-- Name: enforce_subtasks_single_level(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_subtasks_single_level() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.parent_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_task_id = NEW.id THEN
    RAISE EXCEPTION 'Tarefa não pode ser sua própria mãe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = NEW.parent_task_id
      AND parent_task_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Subtarefa não pode ter sub-subtarefa (apenas 1 nível permitido)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE parent_task_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Esta tarefa já tem subtarefas — não pode virar subtarefa';
  END IF;

  RETURN NEW;
END;
$$;



--
-- Name: ensure_area_channel(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_area_channel(p_area_id uuid, p_tenant_id uuid, p_area_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT id INTO v_conv_id
  FROM public.chat_conversations
  WHERE area_id = p_area_id AND type = 'area'
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

  INSERT INTO public.chat_conversations (tenant_id, type, name, area_id)
  VALUES (p_tenant_id, 'area', p_area_name, p_area_id)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.chat_participants (conversation_id, employee_id, role)
  SELECT v_conv_id, ae.emp_id, 'member'
  FROM public.area_employee_ids(p_area_id) ae
  ON CONFLICT (conversation_id, employee_id) DO NOTHING;

  RETURN v_conv_id;
END;
$$;



--
-- Name: ensure_dm_conversation(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_dm_conversation(p_tenant_id uuid, p_user_a uuid, p_user_b uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_emp_a uuid;
  v_emp_b uuid;
  v_conv_id uuid;
BEGIN
  SELECT id INTO v_emp_a FROM public.employees
    WHERE user_id = p_user_a AND tenant_id = p_tenant_id LIMIT 1;
  SELECT id INTO v_emp_b FROM public.employees
    WHERE user_id = p_user_b AND tenant_id = p_tenant_id LIMIT 1;

  IF v_emp_a IS NULL OR v_emp_b IS NULL THEN RETURN NULL; END IF;

  SELECT c.id INTO v_conv_id
    FROM public.chat_conversations c
    WHERE c.tenant_id = p_tenant_id
      AND c.type = 'direct'
      AND EXISTS (SELECT 1 FROM public.chat_participants p WHERE p.conversation_id = c.id AND p.employee_id = v_emp_a)
      AND EXISTS (SELECT 1 FROM public.chat_participants p WHERE p.conversation_id = c.id AND p.employee_id = v_emp_b)
    LIMIT 1;

  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

  INSERT INTO public.chat_conversations (tenant_id, type, created_by)
  VALUES (p_tenant_id, 'direct', p_user_a)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.chat_participants (conversation_id, employee_id)
  VALUES (v_conv_id, v_emp_a), (v_conv_id, v_emp_b);

  RETURN v_conv_id;
END;
$$;



--
-- Name: ensure_omnx_bot(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_omnx_bot(p_tenant_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_bot_user_id uuid;
BEGIN
  -- Procura por email único de OMNX bot deste tenant
  SELECT u.id INTO v_bot_user_id
    FROM auth.users u
   WHERE u.email = 'omnx-bot+' || p_tenant_id::text || '@omnx.system'
   LIMIT 1;

  IF v_bot_user_id IS NOT NULL THEN
    RETURN v_bot_user_id;
  END IF;

  v_bot_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (
    v_bot_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'omnx-bot+' || p_tenant_id::text || '@omnx.system',
    now(),
    jsonb_build_object('full_name', 'OMNX Bot', 'is_bot', true, 'is_omnx_bot', true),
    jsonb_build_object('provider', 'system', 'providers', ARRAY['system']),
    now(), now()
  );

  INSERT INTO public.profiles (user_id, tenant_id, full_name, is_system_bot)
  VALUES (v_bot_user_id, p_tenant_id, 'OMNX Bot', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.employees (tenant_id, user_id, status, work_email)
  VALUES (p_tenant_id, v_bot_user_id, 'active', 'omnx-bot+' || p_tenant_id::text || '@omnx.system')
  ON CONFLICT DO NOTHING;

  RETURN v_bot_user_id;
END;
$$;



--
-- Name: ensure_system_bot(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_system_bot(p_tenant_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_bot_user_id uuid;
BEGIN
  SELECT user_id INTO v_bot_user_id
    FROM public.profiles
   WHERE tenant_id = p_tenant_id AND is_system_bot = true
   LIMIT 1;

  IF v_bot_user_id IS NOT NULL THEN RETURN v_bot_user_id; END IF;

  v_bot_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  VALUES (
    v_bot_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bot+' || p_tenant_id::text || '@empire.system',
    jsonb_build_object('full_name', 'Empire Bot', 'is_bot', true),
    jsonb_build_object('provider', 'system', 'providers', ARRAY['system']),
    now(), now(), now()
  );

  -- UPSERT: trigger handle_new_user pode já ter criado o profile
  INSERT INTO public.profiles (user_id, tenant_id, full_name, is_system_bot)
  VALUES (v_bot_user_id, p_tenant_id, 'Empire Bot', true)
  ON CONFLICT (user_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id,
        full_name = EXCLUDED.full_name,
        is_system_bot = true;

  INSERT INTO public.employees (tenant_id, user_id, status, work_email)
  VALUES (p_tenant_id, v_bot_user_id, 'active', 'bot+' || p_tenant_id::text || '@empire.system')
  ON CONFLICT DO NOTHING;

  RETURN v_bot_user_id;
END;
$$;



--
-- Name: get_chat_conversations_overview(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_chat_conversations_overview() RETURNS TABLE(id uuid, tenant_id uuid, type text, name text, description text, avatar_url text, area_id uuid, project_id uuid, topic text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, participant_ids uuid[], my_role text, my_last_read_at timestamp with time zone, pinned_at timestamp with time zone, muted_until timestamp with time zone, archived_at timestamp with time zone, last_message_id uuid, last_message_content text, last_message_type text, last_message_at timestamp with time zone, last_message_employee_id uuid, unread_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH me AS (SELECT public.chat_my_employee_id() AS emp_id),
  my_convs AS (
    SELECT cp.conversation_id, cp.role AS my_role, cp.last_read_at AS my_last_read_at,
           cp.pinned_at, cp.muted_until, cp.archived_at
    FROM public.chat_participants cp, me WHERE cp.employee_id = me.emp_id
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id, m.id AS last_message_id, m.content AS last_message_content,
      m.type AS last_message_type, m.created_at AS last_message_at,
      m.employee_id AS last_message_employee_id
    FROM public.chat_messages m
    JOIN my_convs mc ON mc.conversation_id = m.conversation_id
    WHERE m.deleted_at IS NULL AND m.thread_root_id IS NULL
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  unread AS (
    SELECT m.conversation_id, COUNT(*)::bigint AS unread_count
    FROM public.chat_messages m
    JOIN my_convs mc ON mc.conversation_id = m.conversation_id
    JOIN me ON true
    WHERE m.deleted_at IS NULL AND m.employee_id <> me.emp_id
      AND (mc.my_last_read_at IS NULL OR m.created_at > mc.my_last_read_at)
    GROUP BY m.conversation_id
  ),
  parts AS (
    SELECT cp.conversation_id, ARRAY_AGG(cp.employee_id ORDER BY cp.joined_at) AS participant_ids
    FROM public.chat_participants cp
    JOIN my_convs mc ON mc.conversation_id = cp.conversation_id
    GROUP BY cp.conversation_id
  )
  SELECT
    c.id, c.tenant_id, c.type, c.name, c.description, c.avatar_url,
    c.area_id, c.project_id, c.topic, c.created_by, c.created_at, c.updated_at,
    COALESCE(p.participant_ids, ARRAY[]::uuid[]),
    mc.my_role, mc.my_last_read_at, mc.pinned_at, mc.muted_until, mc.archived_at,
    lm.last_message_id, lm.last_message_content, lm.last_message_type,
    lm.last_message_at, lm.last_message_employee_id,
    COALESCE(u.unread_count, 0)
  FROM public.chat_conversations c
  JOIN my_convs mc ON mc.conversation_id = c.id
  LEFT JOIN last_msgs lm ON lm.conversation_id = c.id
  LEFT JOIN unread u ON u.conversation_id = c.id
  LEFT JOIN parts p ON p.conversation_id = c.id
  ORDER BY
    CASE WHEN mc.pinned_at IS NOT NULL THEN 0 ELSE 1 END,
    mc.pinned_at DESC NULLS LAST,
    COALESCE(lm.last_message_at, c.updated_at) DESC;
$$;



--
-- Name: get_meeting_created_by(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_meeting_created_by(p_meeting_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT created_by FROM public.meetings WHERE id = p_meeting_id;
$$;



--
-- Name: get_project_created_by(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_project_created_by(p_project_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT created_by FROM public.projects WHERE id = p_project_id;
$$;



--
-- Name: get_user_tenant_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_user_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()
$$;



--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _tenant_id UUID;
  _invited_tenant_id UUID;
  _role app_role;
BEGIN
  -- Check if user was invited to an existing tenant
  _invited_tenant_id := (NEW.raw_user_meta_data->>'invited_tenant_id')::UUID;
  
  IF _invited_tenant_id IS NOT NULL THEN
    -- Invited user: join existing tenant as member
    _tenant_id := _invited_tenant_id;
    _role := 'member';
  ELSE
    -- Self-registered user: create new tenant, become admin
    INSERT INTO public.tenants (name, slug)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Minha Empresa'),
      NEW.id::text
    )
    RETURNING id INTO _tenant_id;
    _role := 'admin';
  END IF;

  -- Create profile
  INSERT INTO public.profiles (user_id, tenant_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    _tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Assign role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;



--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;



--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;



--
-- Name: is_chat_channel_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_chat_channel_member(_channel_id uuid, _user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members
    WHERE channel_id = _channel_id AND user_id = _user_id
  );
$$;



--
-- Name: is_meeting_host(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_meeting_host(p_meeting_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = p_meeting_id
      AND m.created_by = auth.uid()
  );
$$;



--
-- Name: kb_user_has_access(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.kb_user_has_access(p_resource_type text, p_resource_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_user_role text;
BEGIN
  -- Get user tenant
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE user_id = p_user_id;
  IF v_tenant_id IS NULL THEN RETURN false; END IF;

  -- Check if admin/manager (they see everything)
  SELECT role INTO v_user_role FROM user_roles WHERE user_id = p_user_id AND tenant_id = v_tenant_id LIMIT 1;
  IF v_user_role IN ('admin', 'manager') THEN RETURN true; END IF;

  -- Check 'all' grant
  IF EXISTS (
    SELECT 1 FROM knowledge_base_access
    WHERE resource_type = p_resource_type AND resource_id = p_resource_id
      AND grant_type = 'all' AND tenant_id = v_tenant_id
  ) THEN RETURN true; END IF;

  -- Check user-specific grant
  IF EXISTS (
    SELECT 1 FROM knowledge_base_access
    WHERE resource_type = p_resource_type AND resource_id = p_resource_id
      AND grant_type = 'user' AND target_id = p_user_id::text AND tenant_id = v_tenant_id
  ) THEN RETURN true; END IF;

  -- Check role-based grant
  IF EXISTS (
    SELECT 1 FROM knowledge_base_access kba
    JOIN user_roles ur ON ur.role = kba.target_id AND ur.tenant_id = kba.tenant_id AND ur.user_id = p_user_id
    WHERE kba.resource_type = p_resource_type AND kba.resource_id = p_resource_id
      AND kba.grant_type = 'role' AND kba.tenant_id = v_tenant_id
  ) THEN RETURN true; END IF;

  -- Check parent folder access (inherit)
  IF p_resource_type = 'document' THEN
    DECLARE v_folder_id uuid;
    BEGIN
      SELECT folder_id INTO v_folder_id FROM knowledge_base_documents WHERE id = p_resource_id;
      IF v_folder_id IS NOT NULL THEN
        RETURN kb_user_has_access('folder', v_folder_id, p_user_id);
      END IF;
    END;
  END IF;

  -- No access grants found = check if resource has NO access rules (open to all by default)
  IF NOT EXISTS (
    SELECT 1 FROM knowledge_base_access
    WHERE resource_type = p_resource_type AND resource_id = p_resource_id AND tenant_id = v_tenant_id
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$$;



--
-- Name: log_task_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_task_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'created', NULL, NEW.title, auth.uid());
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'status', OLD.status::text, NEW.status::text, auth.uid());
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'priority', OLD.priority, NEW.priority, auth.uid());
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'assignee', OLD.assignee_id::text, NEW.assignee_id::text, auth.uid());
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'due_date', OLD.due_date::text, NEW.due_date::text, auth.uid());
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.task_history (tenant_id, task_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'title', OLD.title, NEW.title, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;



--
-- Name: meetings_recurrence_recompute(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.meetings_recurrence_recompute() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.is_recurring THEN
    NEW.next_occurrence_at := public.compute_next_meeting_occurrence(NEW.recurrence_pattern, now());
  ELSE
    IF NEW.scheduled_date IS NOT NULL THEN
      NEW.next_occurrence_at := (NEW.scheduled_date::text || ' ' ||
        COALESCE(NEW.scheduled_time::text, '09:00')
      )::timestamp AT TIME ZONE 'America/Sao_Paulo';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD.next_occurrence_at IS DISTINCT FROM NEW.next_occurrence_at
    OR OLD.recurrence_pattern IS DISTINCT FROM NEW.recurrence_pattern
    OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
    OR OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time
  ) THEN
    NEW.last_reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;



--
-- Name: migrate_manager_to_position_hierarchy(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.migrate_manager_to_position_hierarchy() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ DECLARE     emp RECORD;     manager_position_id UUID;     employee_primary_position_id UUID; BEGIN     FOR emp IN         SELECT e.id as employee_id, e.manager_id, e.tenant_id         FROM public.employees e         WHERE e.manager_id IS NOT NULL     LOOP         SELECT ep.position_id INTO manager_position_id         FROM public.employee_positions ep         WHERE ep.employee_id = emp.manager_id AND ep.is_primary = TRUE LIMIT 1;         SELECT ep.position_id INTO employee_primary_position_id         FROM public.employee_positions ep         WHERE ep.employee_id = emp.employee_id AND ep.is_primary = TRUE LIMIT 1;         IF manager_position_id IS NOT NULL AND employee_primary_position_id IS NOT NULL THEN             UPDATE public.positions SET reports_to_id = manager_position_id WHERE id = employee_primary_position_id AND reports_to_id IS NULL;         END IF;     END LOOP; END; $$;



--
-- Name: notes_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notes_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;



--
-- Name: notify_task_assigned(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_task_assigned() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id  uuid;
  v_task_title text;
  v_project_id uuid;
  v_tenant_id  uuid;
BEGIN
  SELECT e.user_id INTO v_user_id
  FROM employees e WHERE e.id = NEW.employee_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT t.title, t.project_id, t.tenant_id
  INTO v_task_title, v_project_id, v_tenant_id
  FROM tasks t WHERE t.id = NEW.task_id;

  IF v_task_title IS NULL THEN RETURN NEW; END IF;
  IF v_user_id = auth.uid() THEN RETURN NEW; END IF;

  INSERT INTO notifications (tenant_id, user_id, type, title, body, link, source_id)
  VALUES (
    COALESCE(v_tenant_id, NEW.tenant_id), v_user_id, 'task_assigned',
    'Nova tarefa atribuída', v_task_title,
    CASE WHEN v_project_id IS NOT NULL THEN '/projetos/' || v_project_id::text ELSE '/tarefas' END,
    NEW.task_id
  )
  ON CONFLICT (user_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;



--
-- Name: notify_task_assignee_direct(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_task_assignee_direct() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.assignee_id IS NULL THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.assignee_id = NEW.assignee_id THEN RETURN NEW; END IF;

  SELECT e.user_id INTO v_user_id
  FROM employees e WHERE e.id = NEW.assignee_id;

  IF v_user_id IS NULL OR v_user_id = auth.uid() THEN RETURN NEW; END IF;

  INSERT INTO notifications (tenant_id, user_id, type, title, body, link, source_id)
  VALUES (
    NEW.tenant_id, v_user_id, 'task_assigned',
    'Nova tarefa atribuída', NEW.title,
    CASE WHEN NEW.project_id IS NOT NULL THEN '/projetos/' || NEW.project_id::text ELSE '/tarefas' END,
    NEW.id
  )
  ON CONFLICT (user_id, type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;



--
-- Name: notify_task_comment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_task_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_task_title text;
  v_project_id uuid;
  v_assignee_employee_id uuid;
  v_assignee_user_id uuid;
  v_author_name text;
  v_created_by uuid;
BEGIN
  -- Get task info
  SELECT t.title, t.project_id, t.assignee_id, t.created_by
  INTO v_task_title, v_project_id, v_assignee_employee_id, v_created_by
  FROM tasks t WHERE t.id = NEW.task_id;

  -- Get author name
  SELECT e.full_name INTO v_author_name FROM employees e WHERE e.id = NEW.author_id;

  -- Notify task assignee (if not the commenter)
  IF v_assignee_employee_id IS NOT NULL THEN
    SELECT e.user_id INTO v_assignee_user_id FROM employees e WHERE e.id = v_assignee_employee_id;
    IF v_assignee_user_id IS NOT NULL AND v_assignee_user_id != auth.uid() THEN
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
      VALUES (
        NEW.tenant_id, v_assignee_user_id, 'task_comment',
        'Novo comentário na tarefa',
        COALESCE(v_author_name, 'Alguém') || ': ' || LEFT(NEW.content, 100),
        CASE WHEN v_project_id IS NOT NULL THEN '/projetos/' || v_project_id::text ELSE '/tarefas' END
      );
    END IF;
  END IF;

  -- Notify task creator (if different from assignee and commenter)
  IF v_created_by IS NOT NULL AND v_created_by != auth.uid() AND v_created_by != COALESCE(v_assignee_user_id, '00000000-0000-0000-0000-000000000000') THEN
    INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
    VALUES (
      NEW.tenant_id, v_created_by, 'task_comment',
      'Novo comentário na tarefa',
      COALESCE(v_author_name, 'Alguém') || ': ' || LEFT(NEW.content, 100),
      CASE WHEN v_project_id IS NOT NULL THEN '/projetos/' || v_project_id::text ELSE '/tarefas' END
    );
  END IF;

  RETURN NEW;
END;
$$;



--
-- Name: notify_task_completed(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_task_completed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_creator_id uuid;
BEGIN
  -- Only fire when status changes to 'done'
  IF NEW.status != 'done' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'done' THEN
    RETURN NEW;
  END IF;

  v_creator_id := NEW.created_by;
  
  IF v_creator_id IS NULL OR v_creator_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
  VALUES (
    NEW.tenant_id,
    v_creator_id,
    'task_completed',
    'Tarefa concluída',
    NEW.title,
    CASE 
      WHEN NEW.project_id IS NOT NULL THEN '/projetos/' || NEW.project_id::text
      ELSE '/tarefas'
    END
  );

  RETURN NEW;
END;
$$;



--
-- Name: process_auto_link_structure(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.process_auto_link_structure() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.position_id IS NOT NULL THEN
    SELECT s.id, s.area_id 
    INTO NEW.subarea_id, NEW.area_id
    FROM public.positions p
    JOIN public.subareas s ON s.id = p.subarea_id
    WHERE p.id = NEW.position_id;
  END IF;
  RETURN NEW;
END;
$$;



--
-- Name: process_task_recurrences(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.process_task_recurrences() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  rec RECORD;
  new_task_id UUID;
  tasks_created INT := 0;
  recurrences_deactivated INT := 0;
  next_date DATE;
BEGIN
  FOR rec IN
    SELECT
      tr.*,
      t.title,
      t.description,
      t.project_id,
      t.assignee_id,
      t.created_by,
      t.priority,
      t.checklist_items,
      t.labels
    FROM task_recurrence tr
    JOIN tasks t ON t.id = tr.task_id
    WHERE tr.is_active = true
      AND tr.next_occurrence <= CURRENT_DATE
  LOOP
    -- Criar nova tarefa copiando da original
    INSERT INTO tasks (
      tenant_id, project_id, assignee_id, created_by,
      title, description, status, priority,
      due_date, checklist_items, labels
    ) VALUES (
      rec.tenant_id,
      rec.project_id,
      rec.assignee_id,
      rec.created_by,
      rec.title,
      rec.description,
      'todo',
      rec.priority,
      rec.next_occurrence::timestamptz,
      CASE
        WHEN rec.checklist_items IS NOT NULL AND jsonb_array_length(rec.checklist_items) > 0
        THEN (
          SELECT jsonb_agg(
            jsonb_set(item, '{checked}', 'false'::jsonb)
          )
          FROM jsonb_array_elements(rec.checklist_items) AS item
        )
        ELSE '[]'::jsonb
      END,
      rec.labels
    )
    RETURNING id INTO new_task_id;

    tasks_created := tasks_created + 1;

    -- Calcular próxima ocorrência de acordo com a frequência
    next_date := CASE rec.frequency
      WHEN 'daily' THEN
        rec.next_occurrence + INTERVAL '1 day'

      WHEN 'weekly' THEN
        rec.next_occurrence + INTERVAL '7 days'

      WHEN 'biweekly' THEN
        rec.next_occurrence + INTERVAL '14 days'

      WHEN 'monthly' THEN
        rec.next_occurrence + INTERVAL '1 month'

      WHEN 'custom' THEN
        rec.next_occurrence + (COALESCE(rec.interval_days, 7) || ' days')::INTERVAL

      -- Apenas dias úteis (seg-sex): avança para o próximo dia que não seja sábado ou domingo
      WHEN 'weekdays' THEN (
        SELECT d::DATE
        FROM generate_series(
          rec.next_occurrence + INTERVAL '1 day',
          rec.next_occurrence + INTERVAL '8 days',
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
        ORDER BY d
        LIMIT 1
      )

      -- Dias específicos: avança para o próximo dia da semana que esteja em days_of_week[]
      -- EXTRACT(DOW): 0=Dom, 1=Seg, ..., 6=Sáb
      WHEN 'specific_days' THEN (
        SELECT d::DATE
        FROM generate_series(
          rec.next_occurrence + INTERVAL '1 day',
          rec.next_occurrence + INTERVAL '8 days',
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(DOW FROM d)::INT = ANY(COALESCE(rec.days_of_week, ARRAY[1,2,3,4,5]))
        ORDER BY d
        LIMIT 1
      )

      ELSE rec.next_occurrence + INTERVAL '7 days'
    END;

    -- Desativar se passou da data limite, senão avançar
    IF rec.end_date IS NOT NULL AND next_date > rec.end_date THEN
      UPDATE task_recurrence SET is_active = false WHERE id = rec.id;
      recurrences_deactivated := recurrences_deactivated + 1;
    ELSE
      UPDATE task_recurrence SET next_occurrence = next_date WHERE id = rec.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tasks_created', tasks_created,
    'recurrences_deactivated', recurrences_deactivated,
    'processed_at', now()
  );
END;
$$;



--
-- Name: set_announcements_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_announcements_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;



--
-- Name: set_meeting_attendee_tenant(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_meeting_attendee_tenant() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM meetings
    WHERE id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END;
$$;



--
-- Name: set_process_comments_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_process_comments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;



--
-- Name: trg_area_channel_create(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trg_area_channel_create() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public.ensure_area_channel(NEW.id, NEW.tenant_id, NEW.name);
  RETURN NEW;
END;
$$;



--
-- Name: trg_area_channel_rename(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trg_area_channel_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.name <> OLD.name THEN
    UPDATE public.chat_conversations
    SET name = NEW.name
    WHERE area_id = NEW.id AND type = 'area';
  END IF;
  RETURN NEW;
END;
$$;



--
-- Name: trg_sync_employee_area_channel(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trg_sync_employee_area_channel() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_area_id UUID;
  v_conv_id UUID;
BEGIN
  -- Resolve area_id via posição direta ou subárea
  SELECT COALESCE(p.area_id, sa.area_id) INTO v_area_id
  FROM public.positions p
  LEFT JOIN public.subareas sa ON sa.id = p.subarea_id
  WHERE p.id = NEW.position_id;

  IF v_area_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_conv_id
  FROM public.chat_conversations
  WHERE area_id = v_area_id AND type = 'area'
  LIMIT 1;

  IF v_conv_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.chat_participants (conversation_id, employee_id, role)
  VALUES (v_conv_id, NEW.employee_id, 'member')
  ON CONFLICT (conversation_id, employee_id) DO NOTHING;

  RETURN NEW;
END;
$$;



--
-- Name: update_chat_presence_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_chat_presence_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;



--
-- Name: update_meeting_attendee_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_meeting_attendee_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;



--
-- Name: update_task_time_duration(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_task_time_duration() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds := GREATEST(0, EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::integer);
  ELSE
    NEW.duration_seconds := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;



--
-- Name: update_tenant_platforms_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_tenant_platforms_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;



--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;



--
-- Name: user_can_read_feed_post(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_can_read_feed_post(p_post_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feed_posts fp
    WHERE fp.id = p_post_id
      AND fp.tenant_id = public.get_user_tenant_id()
      AND (
        -- Visível para todos
        fp.visibility_type = 'all'

        -- Admin sempre vê tudo
        OR public.is_admin()

        -- Autor sempre vê o próprio post
        OR EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = fp.employee_id
            AND e.user_id = auth.uid()
        )

        -- Visibilidade específica
        OR (
          fp.visibility_type = 'specific'
          AND (
            -- Por employee direto
            EXISTS (
              SELECT 1 FROM public.employees e
              WHERE e.user_id = auth.uid()
                AND e.tenant_id = public.get_user_tenant_id()
                AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(fp.visibility_targets) AS t
                  WHERE t->>'type' = 'employee'
                    AND t->>'id' = e.id::text
                )
            )

            -- Por cargo / área / subárea
            OR EXISTS (
              -- Resolve todas as posições do usuário com area_id e subarea_id
              WITH current_positions AS (
                SELECT
                  pos.id        AS position_id,
                  pos.subarea_id,
                  COALESCE(pos.area_id, sa.area_id) AS area_id
                FROM public.employee_positions ep
                JOIN public.employees e   ON e.id  = ep.employee_id
                JOIN public.positions pos ON pos.id = ep.position_id
                LEFT JOIN public.subareas sa ON sa.id = pos.subarea_id
                WHERE e.user_id = auth.uid()
                  AND e.tenant_id = public.get_user_tenant_id()
                  AND pos.tenant_id = public.get_user_tenant_id()
              )
              SELECT 1
              FROM current_positions cp
              WHERE EXISTS (
                SELECT 1 FROM jsonb_array_elements(fp.visibility_targets) AS t
                WHERE
                  -- Cargo exato
                  (t->>'type' = 'position' AND t->>'id' = cp.position_id::text)
                  -- Área: area_id do cargo (direto ou via subárea)
                  OR (
                    t->>'type' = 'area'
                    AND cp.area_id IS NOT NULL
                    AND t->>'id' = cp.area_id::text
                  )
                  -- Subárea: subarea_id direto do cargo
                  OR (
                    t->>'type' = 'subarea'
                    AND cp.subarea_id IS NOT NULL
                    AND t->>'id' = cp.subarea_id::text
                  )
              )
            )
          )
        )
      )
  );
$$;



--
-- Name: user_can_read_process(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_can_read_process(p_process_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.processes p
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        public.is_admin()
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_process_matches_position_or_area(p.id)
          )
        )
        OR (
          public.has_role(auth.uid(), 'member')
          AND public.user_process_matches_position_or_area(p.id)
        )
      )
  );
$$;



--
-- Name: user_can_read_project(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_can_read_project(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND (
        -- Admin legacy (sem row em user_roles) vê tudo
        NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
        -- Admin com role vê tudo
        OR public.is_admin()
        -- Manager: criou, tem tarefa atribuída, ou está na subárea/posição
        OR (
          public.has_role(auth.uid(), 'manager')
          AND (
            p.created_by = auth.uid()
            OR public.user_has_project_assigned_task(p.id)
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
        -- Member: criou, é membro direto, tem tarefa atribuída, ou coincide área
        OR (
          public.has_role(auth.uid(), 'member')
          AND (
            -- 1. Criou o projeto
            p.created_by = auth.uid()
            -- 2. Adicionado como membro direto
            OR EXISTS (
              SELECT 1
              FROM public.employee_projects ep
              JOIN public.employees e ON e.id = ep.employee_id
              WHERE ep.project_id = p.id
                AND e.user_id = auth.uid()
                AND ep.tenant_id = public.get_user_tenant_id()
            )
            -- 3a. Tem tarefa atribuída via assignee_id (legado)
            OR public.user_has_project_assigned_task(p.id)
            -- 3b. Tem tarefa atribuída via task_assignees (múltiplos assignees)
            OR EXISTS (
              SELECT 1
              FROM public.tasks t
              JOIN public.task_assignees ta ON ta.task_id = t.id
              JOIN public.employees e ON e.id = ta.employee_id
              WHERE t.project_id = p.id
                AND t.tenant_id = public.get_user_tenant_id()
                AND e.user_id = auth.uid()
                AND ta.tenant_id = public.get_user_tenant_id()
            )
            -- 4. Coincide posição/subárea com membros do projeto
            OR public.user_project_matches_position_or_area(p.id)
          )
        )
      )
  );
$$;



--
-- Name: user_has_process_access(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_has_process_access(p_process_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.user_process_matches_position_or_area(p_process_id);
$$;



--
-- Name: user_has_project_assigned_task(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_has_project_assigned_task(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.employees e ON e.id = t.assignee_id
    WHERE t.project_id = p_project_id
      AND t.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND e.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.task_assignees ta ON ta.task_id = t.id
    JOIN public.employees e ON e.id = ta.employee_id
    WHERE t.project_id = p_project_id
      AND t.tenant_id = public.get_user_tenant_id()
      AND ta.tenant_id = public.get_user_tenant_id()
      AND e.tenant_id = public.get_user_tenant_id()
      AND e.user_id = auth.uid()
  );
$$;



--
-- Name: user_owns_or_member_of_project(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_owns_or_member_of_project(p_project_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employee_projects ep
    JOIN public.employees e ON e.id = ep.employee_id
    WHERE ep.project_id = p_project_id AND e.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.employees proj_owner ON proj_owner.id = p.owner_id
    JOIN public.employee_positions ep_proj ON ep_proj.employee_id = proj_owner.id
    JOIN public.positions pos_proj ON pos_proj.id = ep_proj.position_id
    JOIN public.subareas sa_proj ON sa_proj.id = pos_proj.subarea_id
    JOIN public.employees member ON member.user_id = auth.uid()
    JOIN public.employee_positions ep_mem ON ep_mem.employee_id = member.id
    JOIN public.positions pos_mem ON pos_mem.id = ep_mem.position_id
    JOIN public.subareas sa_mem ON sa_mem.id = pos_mem.subarea_id
    WHERE p.id = p_project_id AND sa_proj.area_id = sa_mem.area_id
  ) THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.employees proj_owner ON proj_owner.id = p.owner_id
    JOIN public.employees member ON member.manager_id = proj_owner.id
    WHERE p.id = p_project_id AND member.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;



--
-- Name: user_process_matches_position_or_area(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_process_matches_position_or_area(p_process_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH current_positions AS (
    SELECT DISTINCT
      current_pos.position_id,
      current_pos.subarea_id,
      current_pos.area_id
    FROM (
      SELECT
        ep.position_id,
        pos.subarea_id,
        COALESCE(pos.area_id, current_sa.area_id) AS area_id
      FROM public.employee_positions ep
      JOIN public.employees e ON e.id = ep.employee_id
      JOIN public.positions pos ON pos.id = ep.position_id
      LEFT JOIN public.subareas current_sa ON current_sa.id = pos.subarea_id
      WHERE e.user_id = auth.uid()
        AND e.tenant_id = public.get_user_tenant_id()
        AND pos.tenant_id = public.get_user_tenant_id()

      UNION

      SELECT
        ehv.primary_position_id AS position_id,
        ehv.subarea_id,
        ehv.area_id
      FROM public.employees_hierarchy_view ehv
      WHERE ehv.user_id = auth.uid()
        AND ehv.tenant_id = public.get_user_tenant_id()
        AND ehv.primary_position_id IS NOT NULL

      UNION

      SELECT
        ov.primary_position_id AS position_id,
        ov.subarea_id,
        ov.area_id
      FROM public.organograma_view ov
      WHERE ov.user_id = auth.uid()
        AND ov.tenant_id = public.get_user_tenant_id()
        AND ov.primary_position_id IS NOT NULL
    ) AS current_pos
  ),
  process_position_scope AS (
    SELECT
      pp.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_pos_sa.area_id) AS area_id
    FROM public.process_positions pp
    JOIN public.positions pos ON pos.id = pp.position_id
    LEFT JOIN public.subareas process_pos_sa ON process_pos_sa.id = pos.subarea_id
    WHERE pp.process_id = p_process_id
      AND pos.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      p.position_id,
      pos.subarea_id,
      COALESCE(pos.area_id, process_primary_sa.area_id) AS area_id
    FROM public.processes p
    JOIN public.positions pos ON pos.id = p.position_id
    LEFT JOIN public.subareas process_primary_sa ON process_primary_sa.id = pos.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
      AND pos.tenant_id = public.get_user_tenant_id()
      AND p.position_id IS NOT NULL
  ),
  process_area_scope AS (
    SELECT
      p.subarea_id,
      COALESCE(p.area_id, process_direct_sa.area_id) AS area_id
    FROM public.processes p
    LEFT JOIN public.subareas process_direct_sa ON process_direct_sa.id = p.subarea_id
    WHERE p.id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()

    UNION

    SELECT
      pa.subarea_id,
      COALESCE(pa.area_id, process_area_sa.area_id) AS area_id
    FROM public.process_areas pa
    LEFT JOIN public.subareas process_area_sa ON process_area_sa.id = pa.subarea_id
    JOIN public.processes p ON p.id = pa.process_id
    WHERE pa.process_id = p_process_id
      AND p.tenant_id = public.get_user_tenant_id()
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_position_scope process_pos
        ON process_pos.position_id = current_pos.position_id
        OR (
          process_pos.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_pos.subarea_id = current_pos.subarea_id
        )
        OR (
          process_pos.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_pos.area_id = current_pos.area_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM current_positions current_pos
      JOIN process_area_scope process_area
        ON (
          process_area.subarea_id IS NOT NULL
          AND current_pos.subarea_id IS NOT NULL
          AND process_area.subarea_id = current_pos.subarea_id
        )
        OR (
          process_area.area_id IS NOT NULL
          AND current_pos.area_id IS NOT NULL
          AND process_area.area_id = current_pos.area_id
        )
    );
$$;



--
-- Name: user_project_matches_area(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_project_matches_area(p_project_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Admin vê tudo
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RETURN true;
  END IF;
  -- Member: é membro direto do projeto
  IF EXISTS (
    SELECT 1 FROM public.employee_projects ep
    JOIN public.employees e ON e.id = ep.employee_id
    WHERE ep.project_id = p_project_id AND e.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;
  -- Member: owner do projeto é da mesma área
  IF EXISTS (
    WITH member_areas AS (
      SELECT DISTINCT sa.area_id
      FROM public.employees e
      JOIN public.employee_positions ep ON ep.employee_id = e.id
      JOIN public.positions pos ON pos.id = ep.position_id
      JOIN public.subareas sa ON sa.id = pos.subarea_id
      WHERE e.user_id = auth.uid()
    ),
    owner_areas AS (
      SELECT DISTINCT sa.area_id
      FROM public.employees e
      JOIN public.employee_positions ep ON ep.employee_id = e.id
      JOIN public.positions pos ON pos.id = ep.position_id
      JOIN public.subareas sa ON sa.id = pos.subarea_id
      WHERE e.id = (SELECT owner_id FROM public.projects WHERE id = p_project_id)
    )
    SELECT 1 FROM member_areas m
    INTERSECT
    SELECT 1 FROM owner_areas o
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;



--
-- Name: user_project_matches_position_or_area(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_project_matches_position_or_area(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    WITH current_positions AS (
      SELECT
        ep.position_id,
        pos.subarea_id
      FROM public.employee_positions ep
      JOIN public.employees e ON e.id = ep.employee_id
      JOIN public.positions pos ON pos.id = ep.position_id
      WHERE e.user_id = auth.uid()
        AND e.tenant_id = public.get_user_tenant_id()
        AND pos.tenant_id = public.get_user_tenant_id()
    ),
    project_positions AS (
      SELECT
        ep.position_id,
        pos.subarea_id
      FROM public.employee_projects epr
      JOIN public.employees e ON e.id = epr.employee_id
      JOIN public.employee_positions ep ON ep.employee_id = e.id
      JOIN public.positions pos ON pos.id = ep.position_id
      WHERE epr.project_id = p_project_id
        AND epr.tenant_id = public.get_user_tenant_id()
        AND e.tenant_id = public.get_user_tenant_id()
        AND pos.tenant_id = public.get_user_tenant_id()
    )
    SELECT EXISTS (
      SELECT 1
      FROM current_positions cur
      JOIN project_positions proj
        ON proj.position_id = cur.position_id
        OR (
          proj.subarea_id IS NOT NULL
          AND cur.subarea_id IS NOT NULL
          AND proj.subarea_id = cur.subarea_id
        )
    );
  $$;



--
-- Name: announcement_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcement_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    author_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT announcement_comments_content_check CHECK ((length(TRIM(BOTH FROM content)) > 0))
);



--
-- Name: announcement_reactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcement_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    reaction text DEFAULT 'like'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: announcement_visibility; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcement_visibility (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    CONSTRAINT announcement_visibility_target_type_check CHECK ((target_type = ANY (ARRAY['all'::text, 'position'::text, 'employee'::text, 'area'::text, 'subarea'::text])))
);



--
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    author_id uuid NOT NULL,
    title text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    type text DEFAULT 'post'::text NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    cover_url text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    CONSTRAINT announcements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT announcements_title_check CHECK ((char_length(title) > 0)),
    CONSTRAINT announcements_type_check CHECK ((type = ANY (ARRAY['announcement'::text, 'post'::text])))
);



--
-- Name: chat_channel_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_channel_members (
    channel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    last_read_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'member'::text NOT NULL,
    CONSTRAINT chat_channel_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);



--
-- Name: chat_channel_mutes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_channel_mutes (
    channel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    muted_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);



--
-- Name: chat_channels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_dm boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_system boolean DEFAULT false NOT NULL,
    avatar_url text,
    area_id uuid
);



--
-- Name: chat_huddles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_huddles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    room_name text NOT NULL,
    started_by uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone
);



--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb,
    parent_id uuid,
    edited_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: chat_pinned_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_pinned_messages (
    message_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    pinned_by uuid NOT NULL,
    pinned_at timestamp with time zone DEFAULT now()
);



--
-- Name: chat_poll_votes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_poll_votes (
    poll_id uuid NOT NULL,
    user_id uuid NOT NULL,
    option_idx integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: chat_polls; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_polls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    question text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    multi boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: chat_presence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_presence (
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now()
);



--
-- Name: chat_reactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_reactions (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: chat_starred_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_starred_messages (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    starred_at timestamp with time zone DEFAULT now()
);



--
-- Name: chat_user_favorites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_user_favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: company_areas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    "position" text NOT NULL,
    color text DEFAULT '#7c3bed'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT company_areas_position_check CHECK (("position" = ANY (ARRAY['left'::text, 'right'::text, 'bottom'::text]))),
    CONSTRAINT company_areas_type_check CHECK ((type = ANY (ARRAY['acquisition'::text, 'delivery'::text, 'operation'::text])))
);



--
-- Name: employee_positions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    position_id uuid NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: TABLE employee_positions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.employee_positions IS 'Allows employees to hold multiple positions';


--
-- Name: employee_projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_projects (
    employee_id uuid NOT NULL,
    project_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role_in_project text DEFAULT 'member'::text,
    joined_at timestamp with time zone DEFAULT now()
);



--
-- Name: employee_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    old_status public.employee_status,
    new_status public.employee_status NOT NULL,
    reason text,
    changed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid,
    manager_id uuid,
    status public.employee_status DEFAULT 'active'::public.employee_status,
    admission_date date,
    phone text,
    work_email text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_ceo boolean DEFAULT false,
    termination_date date,
    status_reason text,
    is_test boolean DEFAULT false NOT NULL
);



--
-- Name: COLUMN employees.is_ceo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.employees.is_ceo IS 'Flag indicating this employee is the CEO of the organization';


--
-- Name: positions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    subarea_id uuid,
    title text NOT NULL,
    description text,
    responsibilities text[],
    goals text[],
    level integer DEFAULT 1,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    area_id uuid,
    reports_to_id uuid,
    CONSTRAINT positions_area_or_subarea_check CHECK (((level = 0) OR (area_id IS NOT NULL) OR (subarea_id IS NOT NULL))),
    CONSTRAINT positions_no_self_reference CHECK (((reports_to_id IS NULL) OR (reports_to_id <> id)))
);



--
-- Name: COLUMN positions.area_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.positions.area_id IS 'Direct reference to area for area-level positions (e.g., Directors). Either area_id or subarea_id must be set.';


--
-- Name: COLUMN positions.reports_to_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.positions.reports_to_id IS 'The position this role reports to (position-based hierarchy)';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_system_bot boolean DEFAULT false NOT NULL,
    dnd_until timestamp with time zone
);



--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status public.project_status DEFAULT 'planning'::public.project_status,
    priority text,
    start_date date,
    end_date date,
    progress integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    owner_id uuid,
    potential_revenue numeric(14,2),
    potential_savings numeric(14,2),
    CONSTRAINT projects_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT projects_progress_check CHECK (((progress >= 0) AND (progress <= 100)))
);



--
-- Name: COLUMN projects.potential_revenue; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.projects.potential_revenue IS 'Potencial de geração de receita estimada do projeto (BRL).';


--
-- Name: COLUMN projects.potential_savings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.projects.potential_savings IS 'Potencial de economia estimada do projeto (BRL).';


--
-- Name: subareas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subareas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    area_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);



--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid,
    assignee_id uuid,
    created_by uuid,
    title text NOT NULL,
    description text,
    status public.task_status DEFAULT 'backlog'::public.task_status,
    priority public.task_priority DEFAULT 'medium'::public.task_priority,
    due_date timestamp with time zone,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    checklist_items jsonb DEFAULT '[]'::jsonb,
    labels jsonb DEFAULT '[]'::jsonb,
    attachments jsonb DEFAULT '[]'::jsonb,
    cover_url text,
    parent_task_id uuid,
    source_meeting_id uuid
);



--
-- Name: COLUMN tasks.checklist_items; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.checklist_items IS 'Array of {text: string, checked: boolean} items for task checklists';


--
-- Name: COLUMN tasks.labels; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.labels IS 'Colored labels array [{text, color}]';


--
-- Name: COLUMN tasks.attachments; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.attachments IS 'File attachments [{name, url, type, size, uploaded_at}]';


--
-- Name: COLUMN tasks.cover_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.cover_url IS 'Cover image URL displayed on card';


--
-- Name: COLUMN tasks.parent_task_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.parent_task_id IS 'Subtarefa: id da task-mãe. Apenas 1 nível permitido (trigger enforce_subtasks_single_level).';


--
-- Name: COLUMN tasks.source_meeting_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.source_meeting_id IS 'Reunião que originou esta task via meeting-approve. SET NULL ao apagar a reunião.';


--
-- Name: employees_hierarchy_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.employees_hierarchy_view WITH (security_invoker='true') AS
 SELECT e.id AS employee_id,
    e.user_id,
    p.full_name,
    p.avatar_url,
    e.status,
    e.admission_date,
    e.is_ceo,
    ep.position_id AS primary_position_id,
    pos.title AS position_title,
    pos.level AS position_level,
    COALESCE(sa.id, pos.subarea_id) AS subarea_id,
    sa.name AS subarea_name,
    COALESCE(ca.id, sa.area_id, pos.area_id) AS area_id,
    COALESCE(ca.name, ca_direct.name) AS area_name,
    COALESCE(ca.type, ca_direct.type) AS area_type,
    COALESCE(ca.color, ca_direct.color) AS area_color,
    ( SELECT count(*) AS count
           FROM public.tasks t
          WHERE ((t.assignee_id = e.id) AND (t.status <> 'done'::public.task_status))) AS pending_tasks,
    ( SELECT count(*) AS count
           FROM (public.employee_projects epj
             JOIN public.projects pr ON ((pr.id = epj.project_id)))
          WHERE ((epj.employee_id = e.id) AND (pr.status = 'active'::public.project_status))) AS active_projects,
    ( SELECT count(*) AS count
           FROM public.tasks t
          WHERE ((t.assignee_id = e.id) AND (t.status = 'done'::public.task_status) AND (t.updated_at > (now() - '7 days'::interval)))) AS tasks_completed_this_week,
    e.tenant_id
   FROM ((((((public.employees e
     JOIN public.profiles p ON ((p.user_id = e.user_id)))
     LEFT JOIN LATERAL ( SELECT employee_positions.position_id
           FROM public.employee_positions
          WHERE ((employee_positions.employee_id = e.id) AND (employee_positions.is_primary = true))
         LIMIT 1) ep ON (true))
     LEFT JOIN public.positions pos ON ((pos.id = ep.position_id)))
     LEFT JOIN public.subareas sa ON ((sa.id = pos.subarea_id)))
     LEFT JOIN public.company_areas ca ON ((ca.id = sa.area_id)))
     LEFT JOIN public.company_areas ca_direct ON ((ca_direct.id = pos.area_id)))
  WHERE ((e.status = 'active'::public.employee_status) AND (e.is_test IS NOT TRUE));



--
-- Name: VIEW employees_hierarchy_view; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.employees_hierarchy_view IS 'Colaboradores com métricas e vínculos estruturais';


--
-- Name: feed_audio_transcriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feed_audio_transcriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    attachment_url text NOT NULL,
    transcription text NOT NULL,
    language text,
    model text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: feed_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feed_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    feed_post_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT feed_comments_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 1000)))
);



--
-- Name: feed_posts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feed_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    visibility_type text DEFAULT 'all'::text NOT NULL,
    visibility_targets jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT feed_posts_content_check CHECK ((char_length(content) <= 2000)),
    CONSTRAINT feed_posts_visibility_type_check CHECK ((visibility_type = ANY (ARRAY['all'::text, 'specific'::text])))
);



--
-- Name: feed_reactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feed_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    feed_post_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    reaction text DEFAULT 'like'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: knowledge_base_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knowledge_base_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    grant_type text NOT NULL,
    target_id text,
    permission text DEFAULT 'read'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_base_access_grant_type_check CHECK ((grant_type = ANY (ARRAY['user'::text, 'role'::text, 'all'::text]))),
    CONSTRAINT knowledge_base_access_permission_check CHECK ((permission = ANY (ARRAY['read'::text, 'write'::text]))),
    CONSTRAINT knowledge_base_access_resource_type_check CHECK ((resource_type = ANY (ARRAY['folder'::text, 'document'::text])))
);



--
-- Name: knowledge_base_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knowledge_base_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    folder_id uuid,
    title text NOT NULL,
    content text,
    type text DEFAULT 'document'::text NOT NULL,
    link_url text,
    is_personal boolean DEFAULT false NOT NULL,
    owner_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: knowledge_base_folders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knowledge_base_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: knowledge_base_shares; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knowledge_base_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    document_id uuid NOT NULL,
    shared_by uuid NOT NULL,
    shared_with uuid NOT NULL,
    permission text DEFAULT 'read'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_base_shares_permission_check CHECK ((permission = ANY (ARRAY['read'::text, 'write'::text])))
);



--
-- Name: meeting_ai_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meeting_ai_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_by uuid,
    status text DEFAULT 'queued'::text NOT NULL,
    phase text DEFAULT 'queued'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    total_chunks integer DEFAULT 0 NOT NULL,
    processed_chunks integer DEFAULT 0 NOT NULL,
    failed_chunks integer DEFAULT 0 NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: meeting_approved_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meeting_approved_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    item_type text NOT NULL,
    item_id uuid,
    original_suggestion jsonb,
    approved_at timestamp with time zone DEFAULT now()
);



--
-- Name: meeting_attendees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meeting_attendees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    employee_id uuid,
    name text NOT NULL,
    email text,
    role text DEFAULT 'required'::text,
    attendance_status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid,
    CONSTRAINT meeting_attendees_attendance_status_check CHECK ((attendance_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'attended'::text]))),
    CONSTRAINT meeting_attendees_role_check CHECK ((role = ANY (ARRAY['organizer'::text, 'required'::text, 'optional'::text])))
);



--
-- Name: meeting_guest_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meeting_guest_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    livekit_room_name text NOT NULL,
    guest_name text NOT NULL,
    guest_token uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meeting_guest_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.meeting_guest_requests REPLICA IDENTITY FULL;



--
-- Name: meeting_recording_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meeting_recording_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    meeting_id uuid,
    huddle_id uuid,
    event_type text NOT NULL,
    participant_identity text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meeting_recording_events_event_type_check CHECK ((event_type = ANY (ARRAY['participant_joined'::text, 'participant_left'::text, 'egress_started'::text, 'egress_updated'::text, 'egress_ended'::text, 'room_started'::text, 'room_finished'::text, 'recording_failed'::text])))
);

ALTER TABLE ONLY public.meeting_recording_events FORCE ROW LEVEL SECURITY;



--
-- Name: meetings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_seconds integer,
    created_by uuid,
    transcript_raw text,
    transcript_final text,
    summary_markdown text,
    action_items jsonb DEFAULT '[]'::jsonb,
    key_points jsonb DEFAULT '[]'::jsonb,
    attention_points jsonb DEFAULT '[]'::jsonb,
    participants jsonb DEFAULT '[]'::jsonb,
    approval_status text DEFAULT 'pending'::text,
    approved_by uuid,
    approved_at timestamp with time zone,
    generated_projects jsonb DEFAULT '[]'::jsonb,
    generated_tasks jsonb DEFAULT '[]'::jsonb,
    soniox_session_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    scheduled_date date,
    scheduled_time time without time zone,
    project_id uuid,
    location text,
    meeting_mode text DEFAULT 'livekit'::text NOT NULL,
    livekit_room_name text,
    recording_url text,
    recording_status text,
    egress_id text,
    live_participants jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_recurring boolean DEFAULT false NOT NULL,
    recurrence_pattern jsonb,
    reminder_minutes_before integer DEFAULT 5 NOT NULL,
    next_occurrence_at timestamp with time zone,
    last_reminder_sent_at timestamp with time zone,
    area_id uuid,
    estimated_duration_minutes integer,
    CONSTRAINT meetings_meeting_mode_check CHECK ((meeting_mode = ANY (ARRAY['in_person'::text, 'external_link'::text, 'livekit'::text]))),
    CONSTRAINT meetings_recording_status_check CHECK ((recording_status = ANY (ARRAY['pending'::text, 'recording'::text, 'completed'::text, 'failed'::text])))
);



--
-- Name: notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body_md text DEFAULT ''::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    color text,
    pinned boolean DEFAULT false NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    source_id uuid,
    source text DEFAULT 'system'::text
);



--
-- Name: organograma_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.organograma_view WITH (security_invoker='true') AS
 SELECT e.id AS employee_id,
    e.tenant_id,
    e.user_id,
    p.full_name,
    p.avatar_url,
    pos.title AS position_title,
    pos.level,
    pos.reports_to_id AS position_reports_to_id,
    parent_pos.title AS manager_position_title,
    sa.id AS subarea_id,
    sa.name AS subarea_name,
    sa.color AS subarea_color,
    ca.id AS area_id,
    ca.name AS area_name,
    ca.type AS area_type,
    ca.color AS area_color,
    e.manager_id,
    e.status,
    e.is_ceo,
    ep.position_id AS primary_position_id,
    manager_emp.id AS manager_employee_id,
    manager_profile.full_name AS manager_name,
    ( SELECT count(*) AS count
           FROM public.tasks t
          WHERE ((t.assignee_id = e.id) AND (t.status <> 'done'::public.task_status))) AS pending_tasks,
    ( SELECT count(*) AS count
           FROM (public.employee_projects ep2
             JOIN public.projects pr ON ((pr.id = ep2.project_id)))
          WHERE ((ep2.employee_id = e.id) AND (pr.status = 'active'::public.project_status))) AS active_projects,
    ( SELECT count(*) AS count
           FROM public.tasks t
          WHERE ((t.assignee_id = e.id) AND (t.status = 'done'::public.task_status) AND (t.updated_at >= date_trunc('week'::text, (CURRENT_DATE)::timestamp with time zone)))) AS tasks_completed_this_week
   FROM (((((((((public.employees e
     LEFT JOIN public.profiles p ON ((p.user_id = e.user_id)))
     LEFT JOIN LATERAL ( SELECT employee_positions.position_id
           FROM public.employee_positions
          WHERE ((employee_positions.employee_id = e.id) AND (employee_positions.is_primary = true))
         LIMIT 1) ep ON (true))
     LEFT JOIN public.positions pos ON ((pos.id = ep.position_id)))
     LEFT JOIN public.subareas sa ON ((sa.id = pos.subarea_id)))
     LEFT JOIN public.company_areas ca ON ((ca.id = COALESCE(pos.area_id, sa.area_id))))
     LEFT JOIN public.positions parent_pos ON ((parent_pos.id = pos.reports_to_id)))
     LEFT JOIN LATERAL ( SELECT employee_positions.employee_id
           FROM public.employee_positions
          WHERE ((employee_positions.position_id = pos.reports_to_id) AND (employee_positions.is_primary = true))
         LIMIT 1) manager_ep ON ((pos.reports_to_id IS NOT NULL)))
     LEFT JOIN public.employees manager_emp ON ((manager_emp.id = manager_ep.employee_id)))
     LEFT JOIN public.profiles manager_profile ON ((manager_profile.user_id = manager_emp.user_id)))
  WHERE (e.status = 'active'::public.employee_status);



--
-- Name: position_hierarchy_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.position_hierarchy_view WITH (security_invoker='true') AS
 SELECT pos.id AS position_id,
    pos.tenant_id,
    pos.title AS position_title,
    pos.description,
    pos.level,
    pos.reports_to_id,
    parent_pos.title AS reports_to_title,
    pos.subarea_id,
    sa.name AS subarea_name,
    sa.color AS subarea_color,
    pos.area_id,
    ca.name AS area_name,
    ca.type AS area_type,
    ca.color AS area_color,
    pos.sort_order,
    emp.id AS employee_id,
    p.full_name AS employee_name,
    p.avatar_url AS employee_avatar_url,
    e.is_ceo AS is_employee_ceo,
    e.status AS employee_status,
    ( SELECT count(*) AS count
           FROM public.employee_positions ep2
          WHERE (ep2.position_id = pos.id)) AS employee_count
   FROM (((((((public.positions pos
     LEFT JOIN public.subareas sa ON ((sa.id = pos.subarea_id)))
     LEFT JOIN public.company_areas ca ON ((ca.id = COALESCE(pos.area_id, sa.area_id))))
     LEFT JOIN public.positions parent_pos ON ((parent_pos.id = pos.reports_to_id)))
     LEFT JOIN LATERAL ( SELECT employee_positions.employee_id
           FROM public.employee_positions
          WHERE ((employee_positions.position_id = pos.id) AND (employee_positions.is_primary = true))
         LIMIT 1) primary_ep ON (true))
     LEFT JOIN public.employees emp ON ((emp.id = primary_ep.employee_id)))
     LEFT JOIN public.profiles p ON ((p.user_id = emp.user_id)))
     LEFT JOIN public.employees e ON ((e.id = emp.id)));



--
-- Name: process_areas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.process_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    area_id uuid NOT NULL,
    subarea_id uuid,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: process_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.process_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);



--
-- Name: process_doc_folders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.process_doc_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    public_token text,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: process_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.process_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    folder_id uuid,
    title text NOT NULL,
    content text,
    type text DEFAULT 'document'::text NOT NULL,
    file_path text,
    file_size bigint,
    file_type text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    public_token text,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT process_documents_type_check CHECK ((type = ANY (ARRAY['document'::text, 'file'::text])))
);



--
-- Name: process_folders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.process_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    sort_order integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: process_positions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.process_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    position_id uuid NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: TABLE process_positions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.process_positions IS 'Vínculo entre processos e cargos (muitos-para-muitos)';


--
-- Name: process_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.process_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    process_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    estimated_time integer,
    responsible_position_id uuid,
    checklist_items text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);



--
-- Name: process_tag_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.process_tag_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: process_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.process_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: processes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.processes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    position_id uuid,
    name text NOT NULL,
    description text,
    status public.process_status DEFAULT 'draft'::public.process_status,
    bpmn_data jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    process_markdown text,
    flow_data jsonb,
    original_prompt text,
    subarea_id uuid,
    area_id uuid,
    folder_id uuid
);



--
-- Name: COLUMN processes.subarea_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.processes.subarea_id IS 'Subárea derivada do cargo principal';


--
-- Name: COLUMN processes.area_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.processes.area_id IS 'Área derivada do cargo principal';


--
-- Name: processes_hierarchy_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.processes_hierarchy_view WITH (security_invoker='true') AS
 SELECT proc.id AS process_id,
    proc.tenant_id,
    proc.name,
    proc.status,
    proc.process_markdown,
    proc.flow_data,
    proc.original_prompt,
    proc.created_at,
    proc.created_by,
    proc.area_id,
    proc.subarea_id,
    ca.name AS area_name,
    ca.type AS area_type,
    ca.color AS area_color,
    sa.name AS subarea_name,
    proc.position_id AS primary_position_id,
    pos.title AS primary_position_title,
    ( SELECT count(*) AS count
           FROM public.process_positions pp
          WHERE (pp.process_id = proc.id)) AS linked_positions_count
   FROM (((public.processes proc
     LEFT JOIN public.company_areas ca ON ((ca.id = proc.area_id)))
     LEFT JOIN public.subareas sa ON ((sa.id = proc.subarea_id)))
     LEFT JOIN public.positions pos ON ((pos.id = proc.position_id)));



--
-- Name: VIEW processes_hierarchy_view; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.processes_hierarchy_view IS 'Processos com vínculos a áreas, subáreas e cargos';


--
-- Name: project_doc_folders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_doc_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    public_token text,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: project_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    folder_id uuid,
    title text NOT NULL,
    content text,
    type text DEFAULT 'document'::text NOT NULL,
    file_path text,
    file_size bigint,
    file_type text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    public_token text,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: projects_hierarchy_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.projects_hierarchy_view WITH (security_invoker='true') AS
 SELECT id AS project_id,
    tenant_id,
    name,
    description,
    status,
    priority,
    progress,
    start_date,
    end_date,
    created_at,
    created_by,
    ( SELECT count(*) AS count
           FROM public.employee_projects ep
          WHERE (ep.project_id = pr.id)) AS members_count,
    ( SELECT count(*) AS count
           FROM public.tasks t
          WHERE (t.project_id = pr.id)) AS tasks_count,
    ( SELECT count(*) AS count
           FROM public.tasks t
          WHERE ((t.project_id = pr.id) AND (t.status = 'done'::public.task_status))) AS completed_tasks_count
   FROM public.projects pr;



--
-- Name: VIEW projects_hierarchy_view; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.projects_hierarchy_view IS 'Projetos com métricas de membros e tarefas';


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    endpoint text NOT NULL,
    keys jsonb NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: scheduled_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scheduled_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    created_by uuid NOT NULL,
    channel_id uuid,
    recipient_user_id uuid,
    content text NOT NULL,
    send_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scheduled_messages_target_chk CHECK (((channel_id IS NOT NULL) OR (recipient_user_id IS NOT NULL)))
);



--
-- Name: task_assignees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_assignees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now()
);



--
-- Name: task_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);



--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    depends_on_task_id uuid NOT NULL,
    dependency_type text DEFAULT 'blocks'::text NOT NULL,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_dependencies_dependency_type_check CHECK ((dependency_type = ANY (ARRAY['blocks'::text, 'related_to'::text]))),
    CONSTRAINT task_deps_no_self CHECK ((task_id <> depends_on_task_id))
);



--
-- Name: TABLE task_dependencies; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.task_dependencies IS 'Dependências entre tasks. type=blocks: depends_on_task_id precisa terminar antes; type=related_to: apenas link.';


--
-- Name: task_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    field text NOT NULL,
    old_value text,
    new_value text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: task_recurrence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_recurrence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    frequency text NOT NULL,
    interval_days integer,
    days_of_week integer[],
    day_of_month integer,
    end_date date,
    next_occurrence date NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT task_recurrence_frequency_check CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text, 'custom'::text, 'weekdays'::text, 'specific_days'::text])))
);



--
-- Name: task_recurrence_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_recurrence_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recurrence_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: task_recurrence_completions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_recurrence_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recurrence_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    completed_by uuid NOT NULL,
    completion_date date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: task_time_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    duration_seconds integer,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: tenant_platforms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenant_platforms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    href text NOT NULL,
    color text DEFAULT 'from-blue-500 to-indigo-600'::text NOT NULL,
    initial text DEFAULT '?'::text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    thumbnail_url text
);



--
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    primary_color text DEFAULT '#7C3AED'::text,
    secondary_color text,
    favicon_url text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    primary_color_dark text,
    secondary_color_dark text,
    logo_dark_url text
);



--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);



--
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    event text NOT NULL,
    payload jsonb,
    response_status integer,
    response_body text,
    success boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);



--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    secret text,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);



--
-- Name: announcement_comments announcement_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_comments
    ADD CONSTRAINT announcement_comments_pkey PRIMARY KEY (id);


--
-- Name: announcement_reactions announcement_reactions_announcement_id_employee_id_reaction_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_reactions
    ADD CONSTRAINT announcement_reactions_announcement_id_employee_id_reaction_key UNIQUE (announcement_id, employee_id, reaction);


--
-- Name: announcement_reactions announcement_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_reactions
    ADD CONSTRAINT announcement_reactions_pkey PRIMARY KEY (id);


--
-- Name: announcement_visibility announcement_visibility_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_visibility
    ADD CONSTRAINT announcement_visibility_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: chat_channel_members chat_channel_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_channel_members
    ADD CONSTRAINT chat_channel_members_pkey PRIMARY KEY (channel_id, user_id);


--
-- Name: chat_channel_mutes chat_channel_mutes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_channel_mutes
    ADD CONSTRAINT chat_channel_mutes_pkey PRIMARY KEY (channel_id, user_id);


--
-- Name: chat_channels chat_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_channels
    ADD CONSTRAINT chat_channels_pkey PRIMARY KEY (id);


--
-- Name: chat_huddles chat_huddles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_huddles
    ADD CONSTRAINT chat_huddles_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_pinned_messages chat_pinned_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_pinned_messages
    ADD CONSTRAINT chat_pinned_messages_pkey PRIMARY KEY (message_id);


--
-- Name: chat_poll_votes chat_poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_poll_votes
    ADD CONSTRAINT chat_poll_votes_pkey PRIMARY KEY (poll_id, user_id, option_idx);


--
-- Name: chat_polls chat_polls_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_polls
    ADD CONSTRAINT chat_polls_pkey PRIMARY KEY (id);


--
-- Name: chat_presence chat_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_presence
    ADD CONSTRAINT chat_presence_pkey PRIMARY KEY (user_id);


--
-- Name: chat_reactions chat_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT chat_reactions_pkey PRIMARY KEY (message_id, user_id, emoji);


--
-- Name: chat_starred_messages chat_starred_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_starred_messages
    ADD CONSTRAINT chat_starred_messages_pkey PRIMARY KEY (message_id, user_id);


--
-- Name: chat_user_favorites chat_user_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_user_favorites
    ADD CONSTRAINT chat_user_favorites_pkey PRIMARY KEY (id);


--
-- Name: chat_user_favorites chat_user_favorites_user_id_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_user_favorites
    ADD CONSTRAINT chat_user_favorites_user_id_channel_id_key UNIQUE (user_id, channel_id);


--
-- Name: company_areas company_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_areas
    ADD CONSTRAINT company_areas_pkey PRIMARY KEY (id);


--
-- Name: company_areas company_areas_tenant_id_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_areas
    ADD CONSTRAINT company_areas_tenant_id_type_key UNIQUE (tenant_id, type);


--
-- Name: employee_positions employee_positions_employee_id_position_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_positions
    ADD CONSTRAINT employee_positions_employee_id_position_id_key UNIQUE (employee_id, position_id);


--
-- Name: employee_positions employee_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_positions
    ADD CONSTRAINT employee_positions_pkey PRIMARY KEY (id);


--
-- Name: employee_projects employee_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_projects
    ADD CONSTRAINT employee_projects_pkey PRIMARY KEY (employee_id, project_id);


--
-- Name: employee_status_history employee_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_status_history
    ADD CONSTRAINT employee_status_history_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: feed_audio_transcriptions feed_audio_transcriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_audio_transcriptions
    ADD CONSTRAINT feed_audio_transcriptions_pkey PRIMARY KEY (id);


--
-- Name: feed_audio_transcriptions feed_audio_transcriptions_tenant_id_attachment_url_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_audio_transcriptions
    ADD CONSTRAINT feed_audio_transcriptions_tenant_id_attachment_url_key UNIQUE (tenant_id, attachment_url);


--
-- Name: feed_comments feed_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_comments
    ADD CONSTRAINT feed_comments_pkey PRIMARY KEY (id);


--
-- Name: feed_posts feed_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_posts
    ADD CONSTRAINT feed_posts_pkey PRIMARY KEY (id);


--
-- Name: feed_reactions feed_reactions_feed_post_id_employee_id_reaction_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_reactions
    ADD CONSTRAINT feed_reactions_feed_post_id_employee_id_reaction_key UNIQUE (feed_post_id, employee_id, reaction);


--
-- Name: feed_reactions feed_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_reactions
    ADD CONSTRAINT feed_reactions_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_access knowledge_base_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_access
    ADD CONSTRAINT knowledge_base_access_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_access knowledge_base_access_resource_type_resource_id_grant_type__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_access
    ADD CONSTRAINT knowledge_base_access_resource_type_resource_id_grant_type__key UNIQUE (resource_type, resource_id, grant_type, target_id);


--
-- Name: knowledge_base_documents knowledge_base_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_documents
    ADD CONSTRAINT knowledge_base_documents_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_folders knowledge_base_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_folders
    ADD CONSTRAINT knowledge_base_folders_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_shares knowledge_base_shares_document_id_shared_with_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_shares
    ADD CONSTRAINT knowledge_base_shares_document_id_shared_with_key UNIQUE (document_id, shared_with);


--
-- Name: knowledge_base_shares knowledge_base_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_shares
    ADD CONSTRAINT knowledge_base_shares_pkey PRIMARY KEY (id);


--
-- Name: meeting_ai_jobs meeting_ai_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_ai_jobs
    ADD CONSTRAINT meeting_ai_jobs_pkey PRIMARY KEY (id);


--
-- Name: meeting_approved_items meeting_approved_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_approved_items
    ADD CONSTRAINT meeting_approved_items_pkey PRIMARY KEY (id);


--
-- Name: meeting_attendees meeting_attendees_meeting_employee_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_meeting_employee_unique UNIQUE (meeting_id, employee_id);


--
-- Name: meeting_attendees meeting_attendees_meeting_id_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_meeting_id_email_key UNIQUE (meeting_id, email);


--
-- Name: meeting_attendees meeting_attendees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_pkey PRIMARY KEY (id);


--
-- Name: meeting_guest_requests meeting_guest_requests_guest_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_guest_requests
    ADD CONSTRAINT meeting_guest_requests_guest_token_key UNIQUE (guest_token);


--
-- Name: meeting_guest_requests meeting_guest_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_guest_requests
    ADD CONSTRAINT meeting_guest_requests_pkey PRIMARY KEY (id);


--
-- Name: meeting_recording_events meeting_recording_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_recording_events
    ADD CONSTRAINT meeting_recording_events_pkey PRIMARY KEY (id);


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);


--
-- Name: process_areas process_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_areas
    ADD CONSTRAINT process_areas_pkey PRIMARY KEY (id);


--
-- Name: process_areas process_areas_process_id_area_id_subarea_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_areas
    ADD CONSTRAINT process_areas_process_id_area_id_subarea_id_key UNIQUE (process_id, area_id, subarea_id);


--
-- Name: process_comments process_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_comments
    ADD CONSTRAINT process_comments_pkey PRIMARY KEY (id);


--
-- Name: process_doc_folders process_doc_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_doc_folders
    ADD CONSTRAINT process_doc_folders_pkey PRIMARY KEY (id);


--
-- Name: process_documents process_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_documents
    ADD CONSTRAINT process_documents_pkey PRIMARY KEY (id);


--
-- Name: process_folders process_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_folders
    ADD CONSTRAINT process_folders_pkey PRIMARY KEY (id);


--
-- Name: process_positions process_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_positions
    ADD CONSTRAINT process_positions_pkey PRIMARY KEY (id);


--
-- Name: process_positions process_positions_process_id_position_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_positions
    ADD CONSTRAINT process_positions_process_id_position_id_key UNIQUE (process_id, position_id);


--
-- Name: process_steps process_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_steps
    ADD CONSTRAINT process_steps_pkey PRIMARY KEY (id);


--
-- Name: process_tag_assignments process_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_tag_assignments
    ADD CONSTRAINT process_tag_assignments_pkey PRIMARY KEY (id);


--
-- Name: process_tag_assignments process_tag_assignments_process_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_tag_assignments
    ADD CONSTRAINT process_tag_assignments_process_id_tag_id_key UNIQUE (process_id, tag_id);


--
-- Name: process_tags process_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_tags
    ADD CONSTRAINT process_tags_pkey PRIMARY KEY (id);


--
-- Name: processes processes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);


--
-- Name: project_doc_folders project_doc_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_doc_folders
    ADD CONSTRAINT project_doc_folders_pkey PRIMARY KEY (id);


--
-- Name: project_documents project_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_employee_id_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_employee_id_endpoint_key UNIQUE (employee_id, endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: scheduled_messages scheduled_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_pkey PRIMARY KEY (id);


--
-- Name: subareas subareas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subareas
    ADD CONSTRAINT subareas_pkey PRIMARY KEY (id);


--
-- Name: task_assignees task_assignees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT task_assignees_pkey PRIMARY KEY (id);


--
-- Name: task_assignees task_assignees_task_id_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT task_assignees_task_id_employee_id_key UNIQUE (task_id, employee_id);


--
-- Name: task_comments task_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);


--
-- Name: task_dependencies task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (id);


--
-- Name: task_dependencies task_deps_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_deps_unique UNIQUE (task_id, depends_on_task_id, dependency_type);


--
-- Name: task_history task_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_history
    ADD CONSTRAINT task_history_pkey PRIMARY KEY (id);


--
-- Name: task_recurrence_comments task_recurrence_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence_comments
    ADD CONSTRAINT task_recurrence_comments_pkey PRIMARY KEY (id);


--
-- Name: task_recurrence_completions task_recurrence_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence_completions
    ADD CONSTRAINT task_recurrence_completions_pkey PRIMARY KEY (id);


--
-- Name: task_recurrence_completions task_recurrence_completions_recurrence_id_completion_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence_completions
    ADD CONSTRAINT task_recurrence_completions_recurrence_id_completion_date_key UNIQUE (recurrence_id, completion_date);


--
-- Name: task_recurrence task_recurrence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence
    ADD CONSTRAINT task_recurrence_pkey PRIMARY KEY (id);


--
-- Name: task_time_entries task_time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_time_entries
    ADD CONSTRAINT task_time_entries_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: tenant_platforms tenant_platforms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenant_platforms
    ADD CONSTRAINT tenant_platforms_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);


--
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: announcement_visibility_ann_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX announcement_visibility_ann_idx ON public.announcement_visibility USING btree (announcement_id);


--
-- Name: announcement_visibility_tid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX announcement_visibility_tid_idx ON public.announcement_visibility USING btree (tenant_id);


--
-- Name: announcements_author_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX announcements_author_id_idx ON public.announcements USING btree (author_id);


--
-- Name: announcements_published_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX announcements_published_at_idx ON public.announcements USING btree (published_at DESC);


--
-- Name: announcements_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX announcements_status_idx ON public.announcements USING btree (status);


--
-- Name: announcements_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX announcements_tenant_id_idx ON public.announcements USING btree (tenant_id);


--
-- Name: chat_user_favorites_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chat_user_favorites_user_idx ON public.chat_user_favorites USING btree (user_id);


--
-- Name: idx_ann_comments_ann; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ann_comments_ann ON public.announcement_comments USING btree (announcement_id);


--
-- Name: idx_ann_comments_author; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ann_comments_author ON public.announcement_comments USING btree (author_id);


--
-- Name: idx_ann_comments_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ann_comments_tenant ON public.announcement_comments USING btree (tenant_id);


--
-- Name: idx_ann_reactions_ann; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ann_reactions_ann ON public.announcement_reactions USING btree (announcement_id);


--
-- Name: idx_ann_reactions_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ann_reactions_tenant ON public.announcement_reactions USING btree (tenant_id);


--
-- Name: idx_chat_channel_members_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_channel_members_user ON public.chat_channel_members USING btree (user_id);


--
-- Name: idx_chat_channel_mutes_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_channel_mutes_expires ON public.chat_channel_mutes USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_chat_channels_area_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_channels_area_id ON public.chat_channels USING btree (area_id);


--
-- Name: idx_chat_channels_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_channels_tenant ON public.chat_channels USING btree (tenant_id);


--
-- Name: idx_chat_huddles_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_huddles_active ON public.chat_huddles USING btree (channel_id) WHERE (ended_at IS NULL);


--
-- Name: idx_chat_messages_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_messages_channel ON public.chat_messages USING btree (channel_id, created_at DESC);


--
-- Name: idx_chat_messages_content_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_messages_content_trgm ON public.chat_messages USING gin (content public.gin_trgm_ops);


--
-- Name: idx_chat_messages_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_messages_tenant ON public.chat_messages USING btree (tenant_id);


--
-- Name: idx_chat_pinned_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_pinned_channel ON public.chat_pinned_messages USING btree (channel_id);


--
-- Name: idx_chat_polls_message; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_polls_message ON public.chat_polls USING btree (message_id);


--
-- Name: idx_chat_reactions_msg; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chat_reactions_msg ON public.chat_reactions USING btree (message_id);


--
-- Name: idx_company_areas_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_company_areas_tenant ON public.company_areas USING btree (tenant_id);


--
-- Name: idx_employee_positions_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_positions_employee ON public.employee_positions USING btree (employee_id);


--
-- Name: idx_employee_status_history_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_status_history_employee ON public.employee_status_history USING btree (employee_id);


--
-- Name: idx_employee_status_history_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_status_history_tenant ON public.employee_status_history USING btree (tenant_id);


--
-- Name: idx_employees_manager; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employees_manager ON public.employees USING btree (manager_id);


--
-- Name: idx_employees_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employees_status ON public.employees USING btree (status);


--
-- Name: idx_employees_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employees_tenant ON public.employees USING btree (tenant_id);


--
-- Name: idx_feed_audio_transcriptions_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_feed_audio_transcriptions_tenant ON public.feed_audio_transcriptions USING btree (tenant_id);


--
-- Name: idx_feed_audio_transcriptions_url; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_feed_audio_transcriptions_url ON public.feed_audio_transcriptions USING btree (attachment_url);


--
-- Name: idx_kb_access_resource; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_access_resource ON public.knowledge_base_access USING btree (resource_type, resource_id);


--
-- Name: idx_kb_access_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_access_tenant ON public.knowledge_base_access USING btree (tenant_id);


--
-- Name: idx_kb_docs_folder; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_docs_folder ON public.knowledge_base_documents USING btree (folder_id);


--
-- Name: idx_kb_docs_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_docs_owner ON public.knowledge_base_documents USING btree (owner_id);


--
-- Name: idx_kb_docs_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_docs_tenant ON public.knowledge_base_documents USING btree (tenant_id);


--
-- Name: idx_kb_folders_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_folders_parent ON public.knowledge_base_folders USING btree (parent_id);


--
-- Name: idx_kb_folders_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_folders_tenant ON public.knowledge_base_folders USING btree (tenant_id);


--
-- Name: idx_kb_shares_doc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_shares_doc ON public.knowledge_base_shares USING btree (document_id);


--
-- Name: idx_kb_shares_with; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_shares_with ON public.knowledge_base_shares USING btree (shared_with);


--
-- Name: idx_meeting_attendees_employee_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meeting_attendees_employee_id ON public.meeting_attendees USING btree (employee_id);


--
-- Name: idx_meeting_attendees_meeting_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meeting_attendees_meeting_id ON public.meeting_attendees USING btree (meeting_id);


--
-- Name: idx_meeting_attendees_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meeting_attendees_tenant_id ON public.meeting_attendees USING btree (tenant_id);


--
-- Name: idx_meeting_guest_requests_meeting; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meeting_guest_requests_meeting ON public.meeting_guest_requests USING btree (meeting_id, status);


--
-- Name: idx_meeting_guest_requests_room; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meeting_guest_requests_room ON public.meeting_guest_requests USING btree (livekit_room_name, status);


--
-- Name: idx_meeting_guest_requests_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meeting_guest_requests_token ON public.meeting_guest_requests USING btree (guest_token);


--
-- Name: idx_meetings_area_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meetings_area_id ON public.meetings USING btree (area_id);


--
-- Name: idx_meetings_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meetings_project_id ON public.meetings USING btree (project_id);


--
-- Name: idx_meetings_scheduled_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meetings_scheduled_date ON public.meetings USING btree (scheduled_date);


--
-- Name: idx_notifications_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_tenant ON public.notifications USING btree (tenant_id);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_positions_area_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_positions_area_id ON public.positions USING btree (area_id);


--
-- Name: idx_positions_reports_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_positions_reports_to ON public.positions USING btree (reports_to_id);


--
-- Name: idx_positions_subarea; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_positions_subarea ON public.positions USING btree (subarea_id);


--
-- Name: idx_process_comments_process; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_comments_process ON public.process_comments USING btree (process_id, created_at DESC);


--
-- Name: idx_process_comments_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_comments_tenant ON public.process_comments USING btree (tenant_id);


--
-- Name: idx_process_doc_folders_process; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_doc_folders_process ON public.process_doc_folders USING btree (process_id);


--
-- Name: idx_process_doc_folders_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_doc_folders_tenant ON public.process_doc_folders USING btree (tenant_id);


--
-- Name: idx_process_documents_folder; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_documents_folder ON public.process_documents USING btree (folder_id);


--
-- Name: idx_process_documents_process; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_documents_process ON public.process_documents USING btree (process_id);


--
-- Name: idx_process_documents_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_documents_tenant ON public.process_documents USING btree (tenant_id);


--
-- Name: idx_process_documents_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_documents_token ON public.process_documents USING btree (public_token) WHERE (public_token IS NOT NULL);


--
-- Name: idx_process_positions_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_positions_position ON public.process_positions USING btree (position_id);


--
-- Name: idx_process_positions_process; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_positions_process ON public.process_positions USING btree (process_id);


--
-- Name: idx_process_steps_process; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_process_steps_process ON public.process_steps USING btree (process_id);


--
-- Name: idx_processes_area; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_processes_area ON public.processes USING btree (area_id);


--
-- Name: idx_processes_subarea; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_processes_subarea ON public.processes USING btree (subarea_id);


--
-- Name: idx_profiles_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_tenant ON public.profiles USING btree (tenant_id);


--
-- Name: idx_project_doc_folders_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_doc_folders_parent ON public.project_doc_folders USING btree (parent_id);


--
-- Name: idx_project_doc_folders_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_doc_folders_project ON public.project_doc_folders USING btree (project_id);


--
-- Name: idx_project_doc_folders_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_doc_folders_tenant ON public.project_doc_folders USING btree (tenant_id);


--
-- Name: idx_project_doc_folders_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_doc_folders_token ON public.project_doc_folders USING btree (public_token) WHERE (public_token IS NOT NULL);


--
-- Name: idx_project_documents_folder; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_documents_folder ON public.project_documents USING btree (folder_id);


--
-- Name: idx_project_documents_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_documents_project ON public.project_documents USING btree (project_id);


--
-- Name: idx_project_documents_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_documents_tenant ON public.project_documents USING btree (tenant_id);


--
-- Name: idx_project_documents_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_documents_token ON public.project_documents USING btree (public_token) WHERE (public_token IS NOT NULL);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_projects_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_tenant ON public.projects USING btree (tenant_id);


--
-- Name: idx_rec_comments_recurrence; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rec_comments_recurrence ON public.task_recurrence_comments USING btree (recurrence_id);


--
-- Name: idx_rec_comments_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rec_comments_tenant ON public.task_recurrence_comments USING btree (tenant_id);


--
-- Name: idx_rec_completions_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rec_completions_date ON public.task_recurrence_completions USING btree (completion_date);


--
-- Name: idx_rec_completions_recurrence; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rec_completions_recurrence ON public.task_recurrence_completions USING btree (recurrence_id);


--
-- Name: idx_subareas_area; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_subareas_area ON public.subareas USING btree (area_id);


--
-- Name: idx_task_assignees_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_assignees_employee ON public.task_assignees USING btree (employee_id);


--
-- Name: idx_task_assignees_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_assignees_task ON public.task_assignees USING btree (task_id);


--
-- Name: idx_task_assignees_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_assignees_tenant ON public.task_assignees USING btree (tenant_id);


--
-- Name: idx_task_comments_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_comments_task_id ON public.task_comments USING btree (task_id);


--
-- Name: idx_task_comments_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_comments_tenant_id ON public.task_comments USING btree (tenant_id);


--
-- Name: idx_task_deps_depends_on; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_deps_depends_on ON public.task_dependencies USING btree (depends_on_task_id);


--
-- Name: idx_task_deps_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_deps_task ON public.task_dependencies USING btree (task_id);


--
-- Name: idx_task_deps_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_deps_tenant ON public.task_dependencies USING btree (tenant_id);


--
-- Name: idx_task_history_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_history_task ON public.task_history USING btree (task_id, changed_at DESC);


--
-- Name: idx_task_history_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_history_tenant ON public.task_history USING btree (tenant_id, changed_at DESC);


--
-- Name: idx_task_recurrence_next; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_recurrence_next ON public.task_recurrence USING btree (next_occurrence) WHERE (is_active = true);


--
-- Name: idx_task_recurrence_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_recurrence_task ON public.task_recurrence USING btree (task_id);


--
-- Name: idx_task_recurrence_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_recurrence_tenant ON public.task_recurrence USING btree (tenant_id);


--
-- Name: idx_tasks_assignee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_assignee ON public.tasks USING btree (assignee_id);


--
-- Name: idx_tasks_parent_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_parent_task ON public.tasks USING btree (parent_task_id) WHERE (parent_task_id IS NOT NULL);


--
-- Name: idx_tasks_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);


--
-- Name: idx_tasks_sort; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_sort ON public.tasks USING btree (status, sort_order);


--
-- Name: idx_tasks_source_meeting; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_source_meeting ON public.tasks USING btree (source_meeting_id) WHERE (source_meeting_id IS NOT NULL);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_tasks_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_tenant ON public.tasks USING btree (tenant_id);


--
-- Name: idx_tte_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tte_employee ON public.task_time_entries USING btree (employee_id, started_at DESC);


--
-- Name: idx_tte_open; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tte_open ON public.task_time_entries USING btree (tenant_id, employee_id) WHERE (ended_at IS NULL);


--
-- Name: idx_tte_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tte_task ON public.task_time_entries USING btree (task_id, started_at DESC);


--
-- Name: idx_webhook_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs USING btree (created_at DESC);


--
-- Name: idx_webhook_logs_webhook_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhook_logs_webhook_id ON public.webhook_logs USING btree (webhook_id);


--
-- Name: idx_webhooks_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhooks_tenant_id ON public.webhooks USING btree (tenant_id);


--
-- Name: meeting_ai_jobs_meeting_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX meeting_ai_jobs_meeting_idx ON public.meeting_ai_jobs USING btree (meeting_id, created_at DESC);


--
-- Name: meeting_ai_jobs_tenant_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX meeting_ai_jobs_tenant_status_idx ON public.meeting_ai_jobs USING btree (tenant_id, status);


--
-- Name: meetings_livekit_room_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX meetings_livekit_room_name_key ON public.meetings USING btree (livekit_room_name) WHERE (livekit_room_name IS NOT NULL);


--
-- Name: meetings_next_occurrence_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX meetings_next_occurrence_idx ON public.meetings USING btree (next_occurrence_at) WHERE (is_recurring = true);


--
-- Name: meetings_recording_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX meetings_recording_status_idx ON public.meetings USING btree (recording_status) WHERE (recording_status IS NOT NULL);


--
-- Name: notes_pinned_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notes_pinned_idx ON public.notes USING btree (user_id, pinned) WHERE (archived = false);


--
-- Name: notes_tags_gin_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notes_tags_gin_idx ON public.notes USING gin (tags);


--
-- Name: notes_tenant_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notes_tenant_idx ON public.notes USING btree (tenant_id);


--
-- Name: notes_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notes_user_idx ON public.notes USING btree (user_id);


--
-- Name: notifications_no_dup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX notifications_no_dup ON public.notifications USING btree (user_id, type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: profiles_system_bot_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX profiles_system_bot_idx ON public.profiles USING btree (tenant_id) WHERE (is_system_bot = true);


--
-- Name: push_subs_employee_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX push_subs_employee_idx ON public.push_subscriptions USING btree (employee_id);


--
-- Name: push_subs_tenant_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX push_subs_tenant_idx ON public.push_subscriptions USING btree (tenant_id);


--
-- Name: rec_events_huddle_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rec_events_huddle_idx ON public.meeting_recording_events USING btree (huddle_id, created_at DESC);


--
-- Name: rec_events_meeting_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rec_events_meeting_idx ON public.meeting_recording_events USING btree (meeting_id, created_at DESC);


--
-- Name: rec_events_tenant_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rec_events_tenant_idx ON public.meeting_recording_events USING btree (tenant_id);


--
-- Name: scheduled_messages_creator_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scheduled_messages_creator_idx ON public.scheduled_messages USING btree (created_by, status);


--
-- Name: scheduled_messages_pending_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scheduled_messages_pending_idx ON public.scheduled_messages USING btree (send_at) WHERE (status = 'pending'::text);


--
-- Name: task_comments_task_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX task_comments_task_id_idx ON public.task_comments USING btree (task_id);


--
-- Name: task_comments_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX task_comments_tenant_id_idx ON public.task_comments USING btree (tenant_id);


--
-- Name: profiles add_user_to_omnx_bot_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER add_user_to_omnx_bot_trg AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.add_user_to_omnx_bot();


--
-- Name: company_areas area_channel_create; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER area_channel_create AFTER INSERT ON public.company_areas FOR EACH ROW EXECUTE FUNCTION public.trg_area_channel_create();


--
-- Name: company_areas area_channel_rename; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER area_channel_rename AFTER UPDATE ON public.company_areas FOR EACH ROW EXECUTE FUNCTION public.trg_area_channel_rename();


--
-- Name: tenants create_omnx_bot_on_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER create_omnx_bot_on_tenant AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.create_omnx_bot_channel();


--
-- Name: meeting_ai_jobs meeting_ai_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER meeting_ai_jobs_updated_at BEFORE UPDATE ON public.meeting_ai_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: meetings meetings_recurrence_recompute_trg; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER meetings_recurrence_recompute_trg BEFORE INSERT OR UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.meetings_recurrence_recompute();


--
-- Name: meetings meetings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: notes notes_touch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.notes_touch_updated_at();


--
-- Name: employees prevent_self_management; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER prevent_self_management BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.check_employee_hierarchy();


--
-- Name: processes process_auto_link; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER process_auto_link BEFORE INSERT OR UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.process_auto_link_structure();


--
-- Name: employee_positions sync_employee_area_channel; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER sync_employee_area_channel AFTER INSERT ON public.employee_positions FOR EACH ROW EXECUTE FUNCTION public.trg_sync_employee_area_channel();


--
-- Name: tenant_platforms tenant_platforms_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tenant_platforms_updated_at BEFORE UPDATE ON public.tenant_platforms FOR EACH ROW EXECUTE FUNCTION public.update_tenant_platforms_updated_at();


--
-- Name: tasks trg_enforce_subtasks_single_level; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_enforce_subtasks_single_level BEFORE INSERT OR UPDATE OF parent_task_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.enforce_subtasks_single_level();


--
-- Name: tasks trg_log_task_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_log_task_change AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.log_task_change();


--
-- Name: meeting_guest_requests trg_meeting_guest_requests_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_meeting_guest_requests_updated_at BEFORE UPDATE ON public.meeting_guest_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: task_assignees trg_notify_task_assigned; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_task_assigned AFTER INSERT ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();


--
-- Name: tasks trg_notify_task_assignee_direct; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_task_assignee_direct AFTER INSERT OR UPDATE OF assignee_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignee_direct();


--
-- Name: tasks trg_notify_task_completed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_task_completed AFTER UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.notify_task_completed();


--
-- Name: process_comments trg_process_comments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_process_comments_updated_at BEFORE UPDATE ON public.process_comments FOR EACH ROW EXECUTE FUNCTION public.set_process_comments_updated_at();


--
-- Name: meeting_attendees trg_set_meeting_attendee_tenant; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_set_meeting_attendee_tenant BEFORE INSERT ON public.meeting_attendees FOR EACH ROW EXECUTE FUNCTION public.set_meeting_attendee_tenant();


--
-- Name: task_time_entries trg_tte_duration; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_tte_duration BEFORE INSERT OR UPDATE ON public.task_time_entries FOR EACH ROW EXECUTE FUNCTION public.update_task_time_duration();


--
-- Name: meeting_attendees trg_update_meeting_attendee_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_update_meeting_attendee_timestamp BEFORE UPDATE ON public.meeting_attendees FOR EACH ROW EXECUTE FUNCTION public.update_meeting_attendee_timestamp();


--
-- Name: announcements trigger_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.set_announcements_updated_at();


--
-- Name: positions trigger_check_position_cycle; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_check_position_cycle BEFORE INSERT OR UPDATE OF reports_to_id ON public.positions FOR EACH ROW EXECUTE FUNCTION public.check_position_cycle();


--
-- Name: company_areas trigger_create_director; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_create_director AFTER INSERT ON public.company_areas FOR EACH ROW EXECUTE FUNCTION public.create_director_position();


--
-- Name: company_areas update_company_areas_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_company_areas_updated_at BEFORE UPDATE ON public.company_areas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: employees update_employees_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: positions update_positions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: process_positions update_process_positions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_process_positions_updated_at BEFORE UPDATE ON public.process_positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: process_steps update_process_steps_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_process_steps_updated_at BEFORE UPDATE ON public.process_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: processes update_processes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_processes_updated_at BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: project_doc_folders update_project_doc_folders_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_project_doc_folders_updated_at BEFORE UPDATE ON public.project_doc_folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: project_documents update_project_documents_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_project_documents_updated_at BEFORE UPDATE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: subareas update_subareas_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_subareas_updated_at BEFORE UPDATE ON public.subareas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tenants update_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: announcement_comments announcement_comments_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_comments
    ADD CONSTRAINT announcement_comments_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: announcement_comments announcement_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_comments
    ADD CONSTRAINT announcement_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: announcement_comments announcement_comments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_comments
    ADD CONSTRAINT announcement_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: announcement_reactions announcement_reactions_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_reactions
    ADD CONSTRAINT announcement_reactions_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: announcement_reactions announcement_reactions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_reactions
    ADD CONSTRAINT announcement_reactions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: announcement_reactions announcement_reactions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_reactions
    ADD CONSTRAINT announcement_reactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: announcement_visibility announcement_visibility_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_visibility
    ADD CONSTRAINT announcement_visibility_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: announcement_visibility announcement_visibility_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_visibility
    ADD CONSTRAINT announcement_visibility_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: announcements announcements_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: announcements announcements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: chat_channel_members chat_channel_members_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_channel_members
    ADD CONSTRAINT chat_channel_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_channel_mutes chat_channel_mutes_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_channel_mutes
    ADD CONSTRAINT chat_channel_mutes_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_channels chat_channels_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_channels
    ADD CONSTRAINT chat_channels_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.company_areas(id) ON DELETE SET NULL;


--
-- Name: chat_channels chat_channels_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_channels
    ADD CONSTRAINT chat_channels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: chat_huddles chat_huddles_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_huddles
    ADD CONSTRAINT chat_huddles_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_huddles chat_huddles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_huddles
    ADD CONSTRAINT chat_huddles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: chat_pinned_messages chat_pinned_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_pinned_messages
    ADD CONSTRAINT chat_pinned_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_pinned_messages chat_pinned_messages_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_pinned_messages
    ADD CONSTRAINT chat_pinned_messages_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_poll_votes chat_poll_votes_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_poll_votes
    ADD CONSTRAINT chat_poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.chat_polls(id) ON DELETE CASCADE;


--
-- Name: chat_polls chat_polls_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_polls
    ADD CONSTRAINT chat_polls_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_polls chat_polls_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_polls
    ADD CONSTRAINT chat_polls_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_polls chat_polls_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_polls
    ADD CONSTRAINT chat_polls_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: chat_reactions chat_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT chat_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_starred_messages chat_starred_messages_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_starred_messages
    ADD CONSTRAINT chat_starred_messages_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: company_areas company_areas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_areas
    ADD CONSTRAINT company_areas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: employee_positions employee_positions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_positions
    ADD CONSTRAINT employee_positions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_positions employee_positions_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_positions
    ADD CONSTRAINT employee_positions_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id);


--
-- Name: employee_projects employee_projects_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_projects
    ADD CONSTRAINT employee_projects_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_projects employee_projects_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_projects
    ADD CONSTRAINT employee_projects_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: employee_projects employee_projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_projects
    ADD CONSTRAINT employee_projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: employee_status_history employee_status_history_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_status_history
    ADD CONSTRAINT employee_status_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_status_history employee_status_history_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_status_history
    ADD CONSTRAINT employee_status_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: employees employees_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.employees(id);


--
-- Name: employees employees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: employees employees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: feed_audio_transcriptions feed_audio_transcriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_audio_transcriptions
    ADD CONSTRAINT feed_audio_transcriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: feed_comments feed_comments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_comments
    ADD CONSTRAINT feed_comments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: feed_comments feed_comments_feed_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_comments
    ADD CONSTRAINT feed_comments_feed_post_id_fkey FOREIGN KEY (feed_post_id) REFERENCES public.feed_posts(id) ON DELETE CASCADE;


--
-- Name: feed_comments feed_comments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_comments
    ADD CONSTRAINT feed_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: feed_posts feed_posts_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_posts
    ADD CONSTRAINT feed_posts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: feed_posts feed_posts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_posts
    ADD CONSTRAINT feed_posts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: feed_reactions feed_reactions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_reactions
    ADD CONSTRAINT feed_reactions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: feed_reactions feed_reactions_feed_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_reactions
    ADD CONSTRAINT feed_reactions_feed_post_id_fkey FOREIGN KEY (feed_post_id) REFERENCES public.feed_posts(id) ON DELETE CASCADE;


--
-- Name: feed_reactions feed_reactions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feed_reactions
    ADD CONSTRAINT feed_reactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: knowledge_base_access knowledge_base_access_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_access
    ADD CONSTRAINT knowledge_base_access_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: knowledge_base_documents knowledge_base_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_documents
    ADD CONSTRAINT knowledge_base_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: knowledge_base_documents knowledge_base_documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_documents
    ADD CONSTRAINT knowledge_base_documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.knowledge_base_folders(id) ON DELETE SET NULL;


--
-- Name: knowledge_base_documents knowledge_base_documents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_documents
    ADD CONSTRAINT knowledge_base_documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);


--
-- Name: knowledge_base_documents knowledge_base_documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_documents
    ADD CONSTRAINT knowledge_base_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: knowledge_base_folders knowledge_base_folders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_folders
    ADD CONSTRAINT knowledge_base_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: knowledge_base_folders knowledge_base_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_folders
    ADD CONSTRAINT knowledge_base_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.knowledge_base_folders(id) ON DELETE CASCADE;


--
-- Name: knowledge_base_folders knowledge_base_folders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_folders
    ADD CONSTRAINT knowledge_base_folders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: knowledge_base_shares knowledge_base_shares_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_shares
    ADD CONSTRAINT knowledge_base_shares_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_base_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_base_shares knowledge_base_shares_shared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_shares
    ADD CONSTRAINT knowledge_base_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id);


--
-- Name: knowledge_base_shares knowledge_base_shares_shared_with_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_shares
    ADD CONSTRAINT knowledge_base_shares_shared_with_fkey FOREIGN KEY (shared_with) REFERENCES auth.users(id);


--
-- Name: knowledge_base_shares knowledge_base_shares_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_base_shares
    ADD CONSTRAINT knowledge_base_shares_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: meeting_ai_jobs meeting_ai_jobs_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_ai_jobs
    ADD CONSTRAINT meeting_ai_jobs_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_ai_jobs meeting_ai_jobs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_ai_jobs
    ADD CONSTRAINT meeting_ai_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: meeting_approved_items meeting_approved_items_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_approved_items
    ADD CONSTRAINT meeting_approved_items_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_approved_items meeting_approved_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_approved_items
    ADD CONSTRAINT meeting_approved_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: meeting_attendees meeting_attendees_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- Name: meeting_attendees meeting_attendees_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_attendees meeting_attendees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_attendees
    ADD CONSTRAINT meeting_attendees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: meeting_guest_requests meeting_guest_requests_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_guest_requests
    ADD CONSTRAINT meeting_guest_requests_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_recording_events meeting_recording_events_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meeting_recording_events
    ADD CONSTRAINT meeting_recording_events_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meetings meetings_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.company_areas(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: positions positions_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.company_areas(id);


--
-- Name: positions positions_reports_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_reports_to_id_fkey FOREIGN KEY (reports_to_id) REFERENCES public.positions(id) ON DELETE SET NULL;


--
-- Name: positions positions_subarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_subarea_id_fkey FOREIGN KEY (subarea_id) REFERENCES public.subareas(id) ON DELETE CASCADE;


--
-- Name: positions positions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: process_areas process_areas_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_areas
    ADD CONSTRAINT process_areas_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.company_areas(id) ON DELETE CASCADE;


--
-- Name: process_areas process_areas_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_areas
    ADD CONSTRAINT process_areas_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_areas process_areas_subarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_areas
    ADD CONSTRAINT process_areas_subarea_id_fkey FOREIGN KEY (subarea_id) REFERENCES public.subareas(id) ON DELETE SET NULL;


--
-- Name: process_comments process_comments_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_comments
    ADD CONSTRAINT process_comments_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_comments process_comments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_comments
    ADD CONSTRAINT process_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: process_doc_folders process_doc_folders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_doc_folders
    ADD CONSTRAINT process_doc_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id);


--
-- Name: process_doc_folders process_doc_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_doc_folders
    ADD CONSTRAINT process_doc_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.process_doc_folders(id) ON DELETE CASCADE;


--
-- Name: process_doc_folders process_doc_folders_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_doc_folders
    ADD CONSTRAINT process_doc_folders_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_doc_folders process_doc_folders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_doc_folders
    ADD CONSTRAINT process_doc_folders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: process_documents process_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_documents
    ADD CONSTRAINT process_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id);


--
-- Name: process_documents process_documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_documents
    ADD CONSTRAINT process_documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.process_doc_folders(id) ON DELETE SET NULL;


--
-- Name: process_documents process_documents_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_documents
    ADD CONSTRAINT process_documents_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_documents process_documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_documents
    ADD CONSTRAINT process_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: process_folders process_folders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_folders
    ADD CONSTRAINT process_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id);


--
-- Name: process_folders process_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_folders
    ADD CONSTRAINT process_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.process_folders(id) ON DELETE CASCADE;


--
-- Name: process_folders process_folders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_folders
    ADD CONSTRAINT process_folders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: process_positions process_positions_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_positions
    ADD CONSTRAINT process_positions_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: process_positions process_positions_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_positions
    ADD CONSTRAINT process_positions_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_steps process_steps_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_steps
    ADD CONSTRAINT process_steps_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_steps process_steps_responsible_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_steps
    ADD CONSTRAINT process_steps_responsible_position_id_fkey FOREIGN KEY (responsible_position_id) REFERENCES public.positions(id);


--
-- Name: process_steps process_steps_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_steps
    ADD CONSTRAINT process_steps_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: process_tag_assignments process_tag_assignments_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_tag_assignments
    ADD CONSTRAINT process_tag_assignments_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_tag_assignments process_tag_assignments_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_tag_assignments
    ADD CONSTRAINT process_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.process_tags(id) ON DELETE CASCADE;


--
-- Name: process_tags process_tags_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_tags
    ADD CONSTRAINT process_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id);


--
-- Name: process_tags process_tags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.process_tags
    ADD CONSTRAINT process_tags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: processes processes_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.company_areas(id);


--
-- Name: processes processes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: processes processes_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.process_folders(id) ON DELETE SET NULL;


--
-- Name: processes processes_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id);


--
-- Name: processes processes_subarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_subarea_id_fkey FOREIGN KEY (subarea_id) REFERENCES public.subareas(id);


--
-- Name: processes processes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: profiles profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_doc_folders project_doc_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_doc_folders
    ADD CONSTRAINT project_doc_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.project_doc_folders(id) ON DELETE CASCADE;


--
-- Name: project_doc_folders project_doc_folders_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_doc_folders
    ADD CONSTRAINT project_doc_folders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_doc_folders project_doc_folders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_doc_folders
    ADD CONSTRAINT project_doc_folders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: project_documents project_documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.project_doc_folders(id) ON DELETE CASCADE;


--
-- Name: project_documents project_documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_documents project_documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_documents
    ADD CONSTRAINT project_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: projects projects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- Name: projects projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: subareas subareas_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subareas
    ADD CONSTRAINT subareas_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.company_areas(id) ON DELETE CASCADE;


--
-- Name: subareas subareas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subareas
    ADD CONSTRAINT subareas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: task_assignees task_assignees_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT task_assignees_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: task_assignees task_assignees_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT task_assignees_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_assignees task_assignees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT task_assignees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: task_comments task_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: task_dependencies task_dependencies_depends_on_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: task_history task_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_history
    ADD CONSTRAINT task_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- Name: task_history task_history_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_history
    ADD CONSTRAINT task_history_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_history task_history_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_history
    ADD CONSTRAINT task_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: task_recurrence_comments task_recurrence_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence_comments
    ADD CONSTRAINT task_recurrence_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id);


--
-- Name: task_recurrence_comments task_recurrence_comments_recurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence_comments
    ADD CONSTRAINT task_recurrence_comments_recurrence_id_fkey FOREIGN KEY (recurrence_id) REFERENCES public.task_recurrence(id) ON DELETE CASCADE;


--
-- Name: task_recurrence_comments task_recurrence_comments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence_comments
    ADD CONSTRAINT task_recurrence_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: task_recurrence_completions task_recurrence_completions_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence_completions
    ADD CONSTRAINT task_recurrence_completions_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.employees(id);


--
-- Name: task_recurrence_completions task_recurrence_completions_recurrence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence_completions
    ADD CONSTRAINT task_recurrence_completions_recurrence_id_fkey FOREIGN KEY (recurrence_id) REFERENCES public.task_recurrence(id) ON DELETE CASCADE;


--
-- Name: task_recurrence_completions task_recurrence_completions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence_completions
    ADD CONSTRAINT task_recurrence_completions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: task_recurrence task_recurrence_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence
    ADD CONSTRAINT task_recurrence_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_recurrence task_recurrence_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_recurrence
    ADD CONSTRAINT task_recurrence_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: task_time_entries task_time_entries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_time_entries
    ADD CONSTRAINT task_time_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: task_time_entries task_time_entries_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_time_entries
    ADD CONSTRAINT task_time_entries_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.employees(id);


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: tasks tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_source_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_source_meeting_id_fkey FOREIGN KEY (source_meeting_id) REFERENCES public.meetings(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tenant_platforms tenant_platforms_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenant_platforms
    ADD CONSTRAINT tenant_platforms_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webhook_logs webhook_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: webhook_logs webhook_logs_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id) ON DELETE CASCADE;


--
-- Name: webhooks webhooks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: employee_positions Admins can manage positions in their tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage positions in their tenant" ON public.employee_positions USING ((employee_id IN ( SELECT e.id
   FROM ((public.employees e
     JOIN public.profiles p ON ((p.user_id = auth.uid())))
     JOIN public.user_roles ur ON ((ur.user_id = auth.uid())))
  WHERE ((e.tenant_id = p.tenant_id) AND (ur.role = 'admin'::public.app_role)))));


--
-- Name: meeting_guest_requests Host can update guest requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Host can update guest requests" ON public.meeting_guest_requests FOR UPDATE TO authenticated USING ((public.is_meeting_host(meeting_id) OR public.is_admin())) WITH CHECK ((public.is_meeting_host(meeting_id) OR public.is_admin()));


--
-- Name: meeting_guest_requests Host can view guest requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Host can view guest requests" ON public.meeting_guest_requests FOR SELECT TO authenticated USING ((public.is_meeting_host(meeting_id) OR public.is_admin()));


--
-- Name: meeting_guest_requests No one can delete guest requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "No one can delete guest requests" ON public.meeting_guest_requests FOR DELETE TO authenticated, anon USING (false);


--
-- Name: meeting_guest_requests Public can insert guest request for active rooms; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can insert guest request for active rooms" ON public.meeting_guest_requests FOR INSERT TO authenticated, anon WITH CHECK (((status = 'pending'::text) AND (decided_at IS NULL) AND (decided_by IS NULL) AND (EXISTS ( SELECT 1
   FROM public.meetings m
  WHERE ((m.id = meeting_guest_requests.meeting_id) AND (m.tenant_id = meeting_guest_requests.tenant_id) AND ((m.status = ANY (ARRAY['scheduled'::text, 'recording'::text])) OR (m.recording_status = 'recording'::text)))))));


--
-- Name: meeting_attendees Users can delete attendees from their tenant meetings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete attendees from their tenant meetings" ON public.meeting_attendees FOR DELETE USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: meeting_attendees Users can insert attendees in their tenant meetings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert attendees in their tenant meetings" ON public.meeting_attendees FOR INSERT WITH CHECK ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: meeting_attendees Users can update attendees in their tenant meetings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update attendees in their tenant meetings" ON public.meeting_attendees FOR UPDATE USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: meetings Users can update meetings in their tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update meetings in their tenant" ON public.meetings FOR UPDATE USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: employee_positions Users can view positions in their tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view positions in their tenant" ON public.employee_positions FOR SELECT USING ((employee_id IN ( SELECT e.id
   FROM (public.employees e
     JOIN public.profiles p ON ((p.user_id = auth.uid())))
  WHERE (e.tenant_id = p.tenant_id))));


--
-- Name: process_areas admin_manage_process_areas; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_manage_process_areas ON public.process_areas USING (((EXISTS ( SELECT 1
   FROM public.processes p
  WHERE ((p.id = process_areas.process_id) AND (p.tenant_id = public.get_user_tenant_id())))) AND public.is_admin()));


--
-- Name: process_positions admin_manage_process_positions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_manage_process_positions ON public.process_positions TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = public.get_user_tenant_id())))) AND public.is_admin()));


--
-- Name: tenant_platforms admins can delete platforms; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can delete platforms" ON public.tenant_platforms FOR DELETE USING ((tenant_id IN ( SELECT tenant_platforms.tenant_id
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: feed_audio_transcriptions admins can delete transcriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can delete transcriptions" ON public.feed_audio_transcriptions FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: tenant_platforms admins can insert platforms; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can insert platforms" ON public.tenant_platforms FOR INSERT WITH CHECK ((tenant_id IN ( SELECT tenant_platforms.tenant_id
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: tenant_platforms admins can update platforms; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can update platforms" ON public.tenant_platforms FOR UPDATE USING ((tenant_id IN ( SELECT tenant_platforms.tenant_id
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::public.app_role)))));


--
-- Name: feed_audio_transcriptions admins can update transcriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can update transcriptions" ON public.feed_audio_transcriptions FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin())) WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: announcement_comments ann_comments_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ann_comments_delete ON public.announcement_comments FOR DELETE USING (((tenant_id = public.get_user_tenant_id()) AND ((author_id IN ( SELECT employees.id
   FROM public.employees
  WHERE ((employees.user_id = auth.uid()) AND (employees.tenant_id = public.get_user_tenant_id())))) OR public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: announcement_comments ann_comments_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ann_comments_insert ON public.announcement_comments FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id()));


--
-- Name: announcement_comments ann_comments_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ann_comments_select ON public.announcement_comments FOR SELECT USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: announcement_comments ann_comments_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ann_comments_update ON public.announcement_comments FOR UPDATE USING (((tenant_id = public.get_user_tenant_id()) AND ((author_id IN ( SELECT employees.id
   FROM public.employees
  WHERE ((employees.user_id = auth.uid()) AND (employees.tenant_id = public.get_user_tenant_id())))) OR public.is_admin())));


--
-- Name: announcement_reactions ann_reactions_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ann_reactions_delete ON public.announcement_reactions FOR DELETE USING (((tenant_id = public.get_user_tenant_id()) AND (employee_id IN ( SELECT employees.id
   FROM public.employees
  WHERE ((employees.user_id = auth.uid()) AND (employees.tenant_id = public.get_user_tenant_id()))))));


--
-- Name: announcement_reactions ann_reactions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ann_reactions_insert ON public.announcement_reactions FOR INSERT WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (employee_id IN ( SELECT employees.id
   FROM public.employees
  WHERE ((employees.user_id = auth.uid()) AND (employees.tenant_id = public.get_user_tenant_id()))))));


--
-- Name: announcement_reactions ann_reactions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ann_reactions_select ON public.announcement_reactions FOR SELECT USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: announcement_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: announcement_reactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.announcement_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: announcement_visibility; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.announcement_visibility ENABLE ROW LEVEL SECURITY;

--
-- Name: announcement_visibility announcement_visibility_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY announcement_visibility_delete ON public.announcement_visibility FOR DELETE USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: announcement_visibility announcement_visibility_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY announcement_visibility_insert ON public.announcement_visibility FOR INSERT WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: announcement_visibility announcement_visibility_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY announcement_visibility_select ON public.announcement_visibility FOR SELECT USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements announcements_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY announcements_delete ON public.announcements FOR DELETE USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR (author_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = auth.uid()))))));


--
-- Name: announcements announcements_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY announcements_insert ON public.announcements FOR INSERT WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: announcements announcements_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY announcements_select ON public.announcements FOR SELECT USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: announcements announcements_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY announcements_update ON public.announcements FOR UPDATE USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR (author_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = auth.uid()))))));


--
-- Name: company_areas areas_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY areas_delete_admin ON public.company_areas FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: company_areas areas_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY areas_insert_admin ON public.company_areas FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: company_areas areas_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY areas_select ON public.company_areas FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: company_areas areas_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY areas_update_admin ON public.company_areas FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: process_comments author can delete own process_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "author can delete own process_comments" ON public.process_comments FOR DELETE USING ((author_id = auth.uid()));


--
-- Name: process_comments author can update own process_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "author can update own process_comments" ON public.process_comments FOR UPDATE USING ((author_id = auth.uid()));


--
-- Name: chat_messages author deletes own message; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "author deletes own message" ON public.chat_messages FOR DELETE USING ((author_id = auth.uid()));


--
-- Name: chat_messages author edits own message; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "author edits own message" ON public.chat_messages FOR UPDATE USING ((author_id = auth.uid()));


--
-- Name: chat_channel_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_channel_mutes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_channel_mutes ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_channels; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_huddles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_huddles ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_pinned_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_pinned_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_poll_votes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_polls; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_polls ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_presence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_reactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_starred_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_starred_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_user_favorites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_user_favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_user_favorites chat_user_favorites_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY chat_user_favorites_delete ON public.chat_user_favorites FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: chat_user_favorites chat_user_favorites_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY chat_user_favorites_insert ON public.chat_user_favorites FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: chat_user_favorites chat_user_favorites_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY chat_user_favorites_select ON public.chat_user_favorites FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: company_areas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.company_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_channels creator can delete own channel; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "creator can delete own channel" ON public.chat_channels FOR DELETE USING ((created_by = auth.uid()));


--
-- Name: chat_channels creator can update own channel; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "creator can update own channel" ON public.chat_channels FOR UPDATE USING ((created_by = auth.uid()));


--
-- Name: employee_projects emp_projects_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY emp_projects_delete_admin ON public.employee_projects FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: employee_projects emp_projects_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY emp_projects_insert_admin ON public.employee_projects FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: employee_projects emp_projects_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY emp_projects_select ON public.employee_projects FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: employee_positions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.employee_positions ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.employee_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_status_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.employee_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY employees_delete_admin ON public.employees FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: employees employees_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY employees_insert_admin ON public.employees FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: employees employees_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: employees employees_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY employees_update_admin ON public.employees FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: feed_audio_transcriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.feed_audio_transcriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_comments feed_comments_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_comments_delete ON public.feed_comments FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = feed_comments.employee_id) AND (e.user_id = auth.uid())))))));


--
-- Name: feed_comments feed_comments_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_comments_insert ON public.feed_comments FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = feed_comments.employee_id) AND (e.user_id = auth.uid()))))));


--
-- Name: feed_comments feed_comments_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_comments_select ON public.feed_comments FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: feed_posts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_posts feed_posts_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_posts_delete ON public.feed_posts FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = feed_posts.employee_id) AND (e.user_id = auth.uid())))))));


--
-- Name: feed_posts feed_posts_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_posts_insert ON public.feed_posts FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = feed_posts.employee_id) AND (e.user_id = auth.uid()) AND (e.tenant_id = public.get_user_tenant_id()))))));


--
-- Name: feed_posts feed_posts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_posts_select ON public.feed_posts FOR SELECT TO authenticated USING (public.user_can_read_feed_post(id));


--
-- Name: feed_posts feed_posts_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_posts_update ON public.feed_posts FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = feed_posts.employee_id) AND (e.user_id = auth.uid()))))));


--
-- Name: feed_reactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_reactions feed_reactions_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_reactions_delete ON public.feed_reactions FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = feed_reactions.employee_id) AND (e.user_id = auth.uid()))))));


--
-- Name: feed_reactions feed_reactions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_reactions_insert ON public.feed_reactions FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = feed_reactions.employee_id) AND (e.user_id = auth.uid()))))));


--
-- Name: feed_reactions feed_reactions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feed_reactions_select ON public.feed_reactions FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: knowledge_base_access kb_access_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_access_select ON public.knowledge_base_access FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: knowledge_base_access kb_access_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_access_write ON public.knowledge_base_access TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: knowledge_base_documents kb_docs_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_docs_delete ON public.knowledge_base_documents FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (((is_personal = true) AND (owner_id = auth.uid())) OR ((is_personal = false) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: knowledge_base_documents kb_docs_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_docs_insert ON public.knowledge_base_documents FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (((is_personal = true) AND (owner_id = auth.uid())) OR ((is_personal = false) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: knowledge_base_documents kb_docs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_docs_select ON public.knowledge_base_documents FOR SELECT TO authenticated USING (((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))) AND ((is_personal = false) OR (owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.knowledge_base_shares s
  WHERE ((s.document_id = knowledge_base_documents.id) AND (s.shared_with = auth.uid())))))));


--
-- Name: knowledge_base_documents kb_docs_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_docs_update ON public.knowledge_base_documents FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (((is_personal = true) AND (owner_id = auth.uid())) OR ((is_personal = false) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: knowledge_base_folders kb_folders_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_folders_delete ON public.knowledge_base_folders FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: knowledge_base_folders kb_folders_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_folders_insert ON public.knowledge_base_folders FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: knowledge_base_folders kb_folders_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_folders_select ON public.knowledge_base_folders FOR SELECT TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.kb_user_has_access('folder'::text, id, auth.uid())));


--
-- Name: knowledge_base_folders kb_folders_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_folders_update ON public.knowledge_base_folders FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: knowledge_base_shares kb_shares_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_shares_delete ON public.knowledge_base_shares FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (shared_by = auth.uid())));


--
-- Name: knowledge_base_shares kb_shares_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_shares_insert ON public.knowledge_base_shares FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (shared_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.knowledge_base_documents
  WHERE ((knowledge_base_documents.id = knowledge_base_shares.document_id) AND (knowledge_base_documents.is_personal = true) AND (knowledge_base_documents.owner_id = auth.uid()))))));


--
-- Name: knowledge_base_shares kb_shares_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kb_shares_select ON public.knowledge_base_shares FOR SELECT TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND ((shared_by = auth.uid()) OR (shared_with = auth.uid()))));


--
-- Name: knowledge_base_access; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.knowledge_base_access ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_base_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.knowledge_base_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_base_folders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.knowledge_base_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_base_shares; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.knowledge_base_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_approved_items mai_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mai_delete ON public.meeting_approved_items FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: meeting_approved_items mai_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mai_insert ON public.meeting_approved_items FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: meeting_approved_items mai_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY mai_select ON public.meeting_approved_items FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: meeting_ai_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.meeting_ai_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_ai_jobs meeting_ai_jobs_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meeting_ai_jobs_delete_admin ON public.meeting_ai_jobs FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: meeting_ai_jobs meeting_ai_jobs_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meeting_ai_jobs_insert_admin ON public.meeting_ai_jobs FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: meeting_ai_jobs meeting_ai_jobs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meeting_ai_jobs_select ON public.meeting_ai_jobs FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: meeting_ai_jobs meeting_ai_jobs_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meeting_ai_jobs_update_admin ON public.meeting_ai_jobs FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: meeting_approved_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.meeting_approved_items ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_attendees; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_attendees meeting_attendees_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meeting_attendees_select ON public.meeting_attendees FOR SELECT TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = meeting_attendees.employee_id) AND (e.user_id = auth.uid())))) OR (public.get_meeting_created_by(meeting_id) = auth.uid()))));


--
-- Name: meeting_guest_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.meeting_guest_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_recording_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.meeting_recording_events ENABLE ROW LEVEL SECURITY;

--
-- Name: meetings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

--
-- Name: meetings meetings_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meetings_delete ON public.meetings FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: meetings meetings_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meetings_insert ON public.meetings FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (created_by = auth.uid())));


--
-- Name: meetings meetings_recurring_host_or_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meetings_recurring_host_or_admin ON public.meetings FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND ((NOT is_recurring) OR public.is_admin() OR (created_by = auth.uid())))) WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND ((NOT is_recurring) OR public.is_admin() OR (created_by = auth.uid()))));


--
-- Name: meetings meetings_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meetings_select ON public.meetings FOR SELECT USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.meeting_attendees ma
     JOIN public.employees e ON ((e.id = ma.employee_id)))
  WHERE ((ma.meeting_id = meetings.id) AND (e.user_id = auth.uid())))) OR ((project_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.employee_projects ep
     JOIN public.employees e ON ((e.id = ep.employee_id)))
  WHERE ((ep.project_id = meetings.project_id) AND (e.user_id = auth.uid()))))) OR ((area_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (((public.employees e
     JOIN public.employee_positions ep ON ((ep.employee_id = e.id)))
     JOIN public.positions pos ON ((pos.id = ep.position_id)))
     JOIN public.subareas sa ON ((sa.id = pos.subarea_id)))
  WHERE ((e.user_id = auth.uid()) AND (sa.area_id = meetings.area_id))))))));


--
-- Name: meetings meetings_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY meetings_update ON public.meetings FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role) OR (created_by = auth.uid()))));


--
-- Name: chat_reactions members add own reaction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members add own reaction" ON public.chat_reactions FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: chat_channel_members members can be added by self, creator or admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members can be added by self, creator or admin" ON public.chat_channel_members FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.chat_channels c
  WHERE ((c.id = chat_channel_members.channel_id) AND (c.created_by = auth.uid())))) OR public.is_admin()));


--
-- Name: chat_channel_members members can be removed by self, creator or admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members can be removed by self, creator or admin" ON public.chat_channel_members FOR DELETE USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.chat_channels c
  WHERE ((c.id = chat_channel_members.channel_id) AND (c.created_by = auth.uid())))) OR public.is_admin()));


--
-- Name: chat_pinned_messages members create pins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members create pins" ON public.chat_pinned_messages FOR INSERT WITH CHECK (((pinned_by = auth.uid()) AND public.is_chat_channel_member(channel_id, auth.uid())));


--
-- Name: chat_polls members create polls; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members create polls" ON public.chat_polls FOR INSERT WITH CHECK (((created_by = auth.uid()) AND public.is_chat_channel_member(channel_id, auth.uid())));


--
-- Name: chat_huddles members end huddle; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members end huddle" ON public.chat_huddles FOR UPDATE USING (public.is_chat_channel_member(channel_id, auth.uid()));


--
-- Name: chat_messages members read channel messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read channel messages" ON public.chat_messages FOR SELECT USING (public.is_chat_channel_member(channel_id, auth.uid()));


--
-- Name: chat_huddles members read huddles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read huddles" ON public.chat_huddles FOR SELECT USING (public.is_chat_channel_member(channel_id, auth.uid()));


--
-- Name: chat_pinned_messages members read pins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read pins" ON public.chat_pinned_messages FOR SELECT USING (public.is_chat_channel_member(channel_id, auth.uid()));


--
-- Name: chat_poll_votes members read poll votes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read poll votes" ON public.chat_poll_votes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.chat_polls p
  WHERE ((p.id = chat_poll_votes.poll_id) AND public.is_chat_channel_member(p.channel_id, auth.uid())))));


--
-- Name: chat_polls members read polls; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read polls" ON public.chat_polls FOR SELECT USING (public.is_chat_channel_member(channel_id, auth.uid()));


--
-- Name: chat_reactions members read reactions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read reactions" ON public.chat_reactions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.chat_messages m
  WHERE ((m.id = chat_reactions.message_id) AND public.is_chat_channel_member(m.channel_id, auth.uid())))));


--
-- Name: chat_reactions members remove own reaction; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members remove own reaction" ON public.chat_reactions FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: chat_pinned_messages members remove pins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members remove pins" ON public.chat_pinned_messages FOR DELETE USING (public.is_chat_channel_member(channel_id, auth.uid()));


--
-- Name: chat_messages members send messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members send messages" ON public.chat_messages FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.is_chat_channel_member(channel_id, auth.uid()) AND (tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())))));


--
-- Name: chat_huddles members start huddle; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members start huddle" ON public.chat_huddles FOR INSERT WITH CHECK (((started_by = auth.uid()) AND public.is_chat_channel_member(channel_id, auth.uid())));


--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--
-- Name: notes notes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notes_delete ON public.notes FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notes notes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notes_insert ON public.notes FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())))));


--
-- Name: notes notes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notes_select ON public.notes FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: notes notes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notes_update ON public.notes FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_delete ON public.notifications FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK ((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))));


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: project_documents pd_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pd_delete ON public.project_documents FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: project_documents pd_folder_public_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pd_folder_public_select ON public.project_documents FOR SELECT TO anon USING ((folder_id IN ( SELECT project_doc_folders.id
   FROM public.project_doc_folders
  WHERE ((project_doc_folders.is_public = true) AND (project_doc_folders.public_token IS NOT NULL)))));


--
-- Name: project_documents pd_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pd_insert ON public.project_documents FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: process_documents pd_proc_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pd_proc_public ON public.process_documents FOR SELECT TO anon USING (((is_public = true) AND (public_token IS NOT NULL)));


--
-- Name: process_documents pd_proc_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pd_proc_select ON public.process_documents FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: process_documents pd_proc_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pd_proc_write ON public.process_documents TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role)))) WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: project_documents pd_public_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pd_public_select ON public.project_documents FOR SELECT TO anon USING (((is_public = true) AND (public_token IS NOT NULL)));


--
-- Name: project_documents pd_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pd_select ON public.project_documents FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: project_documents pd_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pd_update ON public.project_documents FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: project_doc_folders pf_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pf_delete ON public.project_doc_folders FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: project_doc_folders pf_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pf_insert ON public.project_doc_folders FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: process_doc_folders pf_proc_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pf_proc_public ON public.process_doc_folders FOR SELECT TO anon USING (((is_public = true) AND (public_token IS NOT NULL)));


--
-- Name: process_doc_folders pf_proc_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pf_proc_select ON public.process_doc_folders FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: process_doc_folders pf_proc_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pf_proc_write ON public.process_doc_folders TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role)))) WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: project_doc_folders pf_public_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pf_public_select ON public.project_doc_folders FOR SELECT TO anon USING (((is_public = true) AND (public_token IS NOT NULL)));


--
-- Name: project_doc_folders pf_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pf_select ON public.project_doc_folders FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: project_doc_folders pf_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pf_update ON public.project_doc_folders FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: positions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

--
-- Name: positions positions_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY positions_delete_admin ON public.positions FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: positions positions_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY positions_insert_admin ON public.positions FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: positions positions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY positions_select ON public.positions FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: positions positions_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY positions_update_admin ON public.positions FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: process_areas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.process_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: process_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.process_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: process_doc_folders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.process_doc_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: process_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.process_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: process_folders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.process_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: process_folders process_folders_tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY process_folders_tenant_isolation ON public.process_folders USING ((tenant_id = ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: process_positions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.process_positions ENABLE ROW LEVEL SECURITY;

--
-- Name: process_positions process_positions_delete_admin_manager; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY process_positions_delete_admin_manager ON public.process_positions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: process_positions process_positions_insert_admin_manager; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY process_positions_insert_admin_manager ON public.process_positions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: process_positions process_positions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY process_positions_select ON public.process_positions FOR SELECT TO authenticated USING (((NOT (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR public.is_admin() OR public.user_can_read_process(process_id)));


--
-- Name: process_positions process_positions_update_admin_manager; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY process_positions_update_admin_manager ON public.process_positions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))))));


--
-- Name: process_steps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.process_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: process_tag_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.process_tag_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: process_tag_assignments process_tag_assignments_tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY process_tag_assignments_tenant_isolation ON public.process_tag_assignments USING ((EXISTS ( SELECT 1
   FROM public.processes p
  WHERE ((p.id = process_tag_assignments.process_id) AND (p.tenant_id = ( SELECT profiles.tenant_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid())))))));


--
-- Name: process_tags; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.process_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: process_tags process_tags_tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY process_tags_tenant_isolation ON public.process_tags USING ((tenant_id = ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))));


--
-- Name: processes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;

--
-- Name: processes processes_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY processes_delete_admin ON public.processes FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: processes processes_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY processes_insert_admin ON public.processes FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: processes processes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY processes_select ON public.processes FOR SELECT TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR public.is_admin() OR public.user_can_read_process(id))));


--
-- Name: processes processes_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY processes_update_admin ON public.processes FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: project_doc_folders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.project_doc_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: project_documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY projects_delete_admin ON public.projects FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: projects projects_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY projects_insert_admin ON public.projects FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: projects projects_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR public.is_admin() OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND public.user_can_read_project(id)) OR (public.has_role(auth.uid(), 'member'::public.app_role) AND (public.user_has_project_assigned_task(id) OR (EXISTS ( SELECT 1
   FROM (public.employee_projects ep
     JOIN public.employees e ON ((e.id = ep.employee_id)))
  WHERE ((ep.project_id = projects.id) AND (ep.tenant_id = public.get_user_tenant_id()) AND (e.tenant_id = public.get_user_tenant_id()) AND (e.user_id = auth.uid())))))))));


--
-- Name: projects projects_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY projects_update_admin ON public.projects FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: push_subscriptions push_subs_own_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_subs_own_delete ON public.push_subscriptions FOR DELETE USING ((employee_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = auth.uid()))));


--
-- Name: push_subscriptions push_subs_own_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_subs_own_insert ON public.push_subscriptions FOR INSERT WITH CHECK ((employee_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = auth.uid()))));


--
-- Name: push_subscriptions push_subs_own_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_subs_own_select ON public.push_subscriptions FOR SELECT USING ((employee_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = auth.uid()))));


--
-- Name: push_subscriptions push_subs_own_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_subs_own_update ON public.push_subscriptions FOR UPDATE USING ((employee_id = public.chat_my_employee_id())) WITH CHECK ((employee_id = public.chat_my_employee_id()));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: task_recurrence_comments rec_comments_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rec_comments_delete ON public.task_recurrence_comments FOR DELETE USING (((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))) AND (author_id IN ( SELECT emp.id
   FROM public.employees emp
  WHERE (emp.user_id = auth.uid())))));


--
-- Name: task_recurrence_comments rec_comments_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rec_comments_insert ON public.task_recurrence_comments FOR INSERT WITH CHECK ((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))));


--
-- Name: task_recurrence_comments rec_comments_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rec_comments_select ON public.task_recurrence_comments FOR SELECT USING ((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))));


--
-- Name: task_recurrence_completions rec_completions_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rec_completions_delete ON public.task_recurrence_completions FOR DELETE USING ((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))));


--
-- Name: task_recurrence_completions rec_completions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rec_completions_insert ON public.task_recurrence_completions FOR INSERT WITH CHECK ((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))));


--
-- Name: task_recurrence_completions rec_completions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rec_completions_select ON public.task_recurrence_completions FOR SELECT USING ((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))));


--
-- Name: meeting_recording_events rec_events_select_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rec_events_select_tenant ON public.meeting_recording_events FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: user_roles roles_admin_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY roles_admin_delete ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: user_roles roles_admin_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY roles_admin_insert ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: user_roles roles_admin_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY roles_admin_select ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_roles roles_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY roles_select_own ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: scheduled_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_messages scheduled_messages_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scheduled_messages_delete ON public.scheduled_messages FOR DELETE TO authenticated USING ((created_by = auth.uid()));


--
-- Name: scheduled_messages scheduled_messages_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scheduled_messages_insert ON public.scheduled_messages FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND (tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid())))));


--
-- Name: scheduled_messages scheduled_messages_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scheduled_messages_select ON public.scheduled_messages FOR SELECT TO authenticated USING ((created_by = auth.uid()));


--
-- Name: scheduled_messages scheduled_messages_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY scheduled_messages_update ON public.scheduled_messages FOR UPDATE TO authenticated USING ((created_by = auth.uid())) WITH CHECK ((created_by = auth.uid()));


--
-- Name: employee_status_history status_history_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY status_history_delete_admin ON public.employee_status_history FOR DELETE USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: employee_status_history status_history_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY status_history_insert_admin ON public.employee_status_history FOR INSERT WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: employee_status_history status_history_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY status_history_select ON public.employee_status_history FOR SELECT USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: process_steps steps_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY steps_delete_admin ON public.process_steps FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: process_steps steps_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY steps_insert_admin ON public.process_steps FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: process_steps steps_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY steps_select ON public.process_steps FOR SELECT TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR public.is_admin() OR public.user_can_read_process(process_id))));


--
-- Name: process_steps steps_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY steps_update_admin ON public.process_steps FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: subareas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.subareas ENABLE ROW LEVEL SECURITY;

--
-- Name: subareas subareas_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subareas_delete_admin ON public.subareas FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: subareas subareas_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subareas_insert_admin ON public.subareas FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: subareas subareas_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subareas_select ON public.subareas FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: subareas subareas_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subareas_update_admin ON public.subareas FOR UPDATE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: task_assignees; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

--
-- Name: task_assignees task_assignees_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_assignees_delete ON public.task_assignees FOR DELETE TO authenticated USING ((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))));


--
-- Name: task_assignees task_assignees_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_assignees_insert ON public.task_assignees FOR INSERT TO authenticated WITH CHECK ((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))));


--
-- Name: task_assignees task_assignees_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_assignees_select ON public.task_assignees FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))));


--
-- Name: task_assignees task_assignees_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_assignees_update ON public.task_assignees FOR UPDATE TO authenticated USING ((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())))) WITH CHECK ((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))));


--
-- Name: task_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_comments task_comments_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_comments_delete ON public.task_comments FOR DELETE USING (((tenant_id = public.get_user_tenant_id()) AND (author_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = auth.uid())))));


--
-- Name: task_comments task_comments_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_comments_insert ON public.task_comments FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id()));


--
-- Name: task_comments task_comments_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_comments_select ON public.task_comments FOR SELECT USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: task_comments task_comments_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_comments_update_own ON public.task_comments FOR UPDATE USING (((tenant_id = public.get_user_tenant_id()) AND (author_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = auth.uid()))))) WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (author_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = auth.uid())))));


--
-- Name: task_dependencies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: task_dependencies task_deps_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_deps_delete ON public.task_dependencies FOR DELETE TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: task_dependencies task_deps_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_deps_insert ON public.task_dependencies FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_user_tenant_id()));


--
-- Name: task_dependencies task_deps_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_deps_select ON public.task_dependencies FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: task_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

--
-- Name: task_history task_history_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_history_select ON public.task_history FOR SELECT USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: task_recurrence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_recurrence ENABLE ROW LEVEL SECURITY;

--
-- Name: task_recurrence_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_recurrence_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_recurrence_completions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_recurrence_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: task_recurrence task_recurrence_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_recurrence_delete ON public.task_recurrence FOR DELETE TO authenticated USING (((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))) AND ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::public.app_role, 'manager'::public.app_role]))))) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_recurrence.task_id) AND (t.created_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.tasks t
     JOIN public.employees emp ON ((emp.id = t.assignee_id)))
  WHERE ((t.id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.task_assignees ta
     JOIN public.employees emp ON ((emp.id = ta.employee_id)))
  WHERE ((ta.task_id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))))));


--
-- Name: task_recurrence task_recurrence_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_recurrence_insert ON public.task_recurrence FOR INSERT TO authenticated WITH CHECK (((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))) AND ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::public.app_role, 'manager'::public.app_role]))))) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_recurrence.task_id) AND (t.created_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.tasks t
     JOIN public.employees emp ON ((emp.id = t.assignee_id)))
  WHERE ((t.id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.task_assignees ta
     JOIN public.employees emp ON ((emp.id = ta.employee_id)))
  WHERE ((ta.task_id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))))));


--
-- Name: task_recurrence task_recurrence_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_recurrence_select ON public.task_recurrence FOR SELECT USING ((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))));


--
-- Name: task_recurrence task_recurrence_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY task_recurrence_update ON public.task_recurrence FOR UPDATE TO authenticated USING (((tenant_id IN ( SELECT prof.tenant_id
   FROM public.profiles prof
  WHERE (prof.user_id = auth.uid()))) AND ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::public.app_role, 'manager'::public.app_role]))))) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_recurrence.task_id) AND (t.created_by = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.tasks t
     JOIN public.employees emp ON ((emp.id = t.assignee_id)))
  WHERE ((t.id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (public.task_assignees ta
     JOIN public.employees emp ON ((emp.id = ta.employee_id)))
  WHERE ((ta.task_id = task_recurrence.task_id) AND (emp.user_id = auth.uid())))))));


--
-- Name: task_time_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.task_time_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_delete_admin ON public.tasks FOR DELETE TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'::public.app_role))));


--
-- Name: tasks tasks_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_user_tenant_id()));


--
-- Name: tasks tasks_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated USING (((tenant_id = public.get_user_tenant_id()) AND ((NOT (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR public.is_admin() OR (public.has_role(auth.uid(), 'manager'::public.app_role) AND (((project_id IS NOT NULL) AND public.user_can_read_project(project_id)) OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = tasks.assignee_id) AND (e.user_id = auth.uid()) AND (e.tenant_id = public.get_user_tenant_id())))) OR (EXISTS ( SELECT 1
   FROM (public.task_assignees ta
     JOIN public.employees e ON ((e.id = ta.employee_id)))
  WHERE ((ta.task_id = tasks.id) AND (e.user_id = auth.uid()) AND (ta.tenant_id = public.get_user_tenant_id())))))) OR (public.has_role(auth.uid(), 'member'::public.app_role) AND ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = tasks.assignee_id) AND (e.user_id = auth.uid()) AND (e.tenant_id = public.get_user_tenant_id())))) OR (EXISTS ( SELECT 1
   FROM (public.task_assignees ta
     JOIN public.employees e ON ((e.id = ta.employee_id)))
  WHERE ((ta.task_id = tasks.id) AND (e.user_id = auth.uid()) AND (ta.tenant_id = public.get_user_tenant_id())))))))));


--
-- Name: tasks tasks_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: process_comments tenant members can insert own process_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant members can insert own process_comments" ON public.process_comments FOR INSERT WITH CHECK (((author_id = auth.uid()) AND (tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid())))));


--
-- Name: feed_audio_transcriptions tenant members can insert transcriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant members can insert transcriptions" ON public.feed_audio_transcriptions FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_user_tenant_id()));


--
-- Name: process_comments tenant members can read process_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant members can read process_comments" ON public.process_comments FOR SELECT USING ((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))));


--
-- Name: feed_audio_transcriptions tenant members can read transcriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant members can read transcriptions" ON public.feed_audio_transcriptions FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: tenant_platforms tenant members can view platforms; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant members can view platforms" ON public.tenant_platforms FOR SELECT USING ((tenant_id IN ( SELECT tenant_platforms.tenant_id
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid()))));


--
-- Name: chat_channels tenant members create channels; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant members create channels" ON public.chat_channels FOR INSERT WITH CHECK (((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))) AND (created_by = auth.uid())));


--
-- Name: chat_channels tenant members read channels; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant members read channels" ON public.chat_channels FOR SELECT USING ((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))));


--
-- Name: chat_presence tenant reads presence; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tenant reads presence" ON public.chat_presence FOR SELECT USING ((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.user_id = auth.uid()))));


--
-- Name: tenant_platforms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tenant_platforms ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants tenant_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_select ON public.tenants FOR SELECT TO authenticated USING ((id = public.get_user_tenant_id()));


--
-- Name: process_areas tenant_select_process_areas; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_select_process_areas ON public.process_areas FOR SELECT TO authenticated USING (((NOT (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE (user_roles.user_id = auth.uid())))) OR public.is_admin() OR public.user_can_read_process(process_id)));


--
-- Name: process_positions tenant_select_process_positions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_select_process_positions ON public.process_positions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.processes p
  WHERE ((p.id = process_positions.process_id) AND (p.tenant_id = public.get_user_tenant_id())))));


--
-- Name: tenants tenant_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_update_admin ON public.tenants FOR UPDATE TO authenticated USING (((id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: task_time_entries tte_delete_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tte_delete_self ON public.task_time_entries FOR DELETE USING (((tenant_id = public.get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = task_time_entries.employee_id) AND (e.user_id = auth.uid()))))));


--
-- Name: task_time_entries tte_insert_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tte_insert_self ON public.task_time_entries FOR INSERT WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = task_time_entries.employee_id) AND (e.user_id = auth.uid()))))));


--
-- Name: task_time_entries tte_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tte_select ON public.task_time_entries FOR SELECT USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: task_time_entries tte_update_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tte_update_self ON public.task_time_entries FOR UPDATE USING (((tenant_id = public.get_user_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = task_time_entries.employee_id) AND (e.user_id = auth.uid()))))));


--
-- Name: chat_channel_mutes user creates own mute; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user creates own mute" ON public.chat_channel_mutes FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: chat_starred_messages user creates own star; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user creates own star" ON public.chat_starred_messages FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: chat_channel_members user reads channel membership; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user reads channel membership" ON public.chat_channel_members FOR SELECT USING (((user_id = auth.uid()) OR public.is_chat_channel_member(channel_id, auth.uid())));


--
-- Name: chat_channel_mutes user reads own mutes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user reads own mutes" ON public.chat_channel_mutes FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: chat_starred_messages user reads own stars; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user reads own stars" ON public.chat_starred_messages FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: chat_channel_mutes user removes own mute; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user removes own mute" ON public.chat_channel_mutes FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: chat_starred_messages user removes own star; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user removes own star" ON public.chat_starred_messages FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: chat_poll_votes user removes own vote; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user removes own vote" ON public.chat_poll_votes FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: chat_channel_members user updates own membership; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user updates own membership" ON public.chat_channel_members FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: chat_presence user updates own presence; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user updates own presence" ON public.chat_presence FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: chat_presence user upserts own presence; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user upserts own presence" ON public.chat_presence FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: chat_poll_votes user votes own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user votes own" ON public.chat_poll_votes FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_logs webhook_logs_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhook_logs_insert ON public.webhook_logs FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id()));


--
-- Name: webhook_logs webhook_logs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhook_logs_select ON public.webhook_logs FOR SELECT USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: webhooks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

--
-- Name: webhooks webhooks_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhooks_delete_admin ON public.webhooks FOR DELETE USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: webhooks webhooks_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhooks_insert_admin ON public.webhooks FOR INSERT WITH CHECK (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: webhooks webhooks_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhooks_select ON public.webhooks FOR SELECT USING ((tenant_id = public.get_user_tenant_id()));


--
-- Name: webhooks webhooks_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY webhooks_update_admin ON public.webhooks FOR UPDATE USING (((tenant_id = public.get_user_tenant_id()) AND public.is_admin()));


--
-- Name: messages realtime_messages_insert; Type: POLICY; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE POLICY realtime_messages_insert ON realtime.messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (messages.topic ~~ (('tenant:'::text || (p.tenant_id)::text) || '%'::text))))) OR ((topic ~~ 'chat:%'::text) AND (SUBSTRING(topic FROM 6) IN ( SELECT (chat_my_conversation_ids.conversation_id)::text AS conversation_id
   FROM public.chat_my_conversation_ids() chat_my_conversation_ids(conversation_id))))));


--
-- Name: messages realtime_messages_select; Type: POLICY; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE POLICY realtime_messages_select ON realtime.messages FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (messages.topic ~~ (('tenant:'::text || (p.tenant_id)::text) || '%'::text))))) OR ((topic ~~ 'chat:%'::text) AND (SUBSTRING(topic FROM 6) IN ( SELECT (chat_my_conversation_ids.conversation_id)::text AS conversation_id
   FROM public.chat_my_conversation_ids() chat_my_conversation_ids(conversation_id))))));


--
-- Name: objects Admins can delete branding; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Admins can delete branding" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'branding'::text) AND (EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.profiles p ON ((p.user_id = ur.user_id)))
  WHERE ((p.tenant_id = ( SELECT profiles.tenant_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))) AND (ur.role = 'admin'::public.app_role))))));


--
-- Name: objects Admins can update branding; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Admins can update branding" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'branding'::text) AND (EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.profiles p ON ((p.user_id = ur.user_id)))
  WHERE ((p.tenant_id = ( SELECT profiles.tenant_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))) AND (ur.role = 'admin'::public.app_role))))));


--
-- Name: objects Admins can upload branding; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Admins can upload branding" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'branding'::text) AND (EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.profiles p ON ((p.user_id = ur.user_id)))
  WHERE ((p.tenant_id = ( SELECT profiles.tenant_id
           FROM public.profiles
          WHERE (profiles.user_id = auth.uid()))) AND (ur.role = 'admin'::public.app_role))))));


--
-- Name: objects Attachments readable; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Attachments readable" ON storage.objects FOR SELECT USING (((bucket_id = 'attachments'::text) AND ((auth.role() = 'anon'::text) OR (auth.uid() IS NOT NULL))));


--
-- Name: objects Authenticated users can delete attachments; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Authenticated users can delete attachments" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'attachments'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: objects Authenticated users can update attachments; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Authenticated users can update attachments" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'attachments'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: objects Authenticated users can upload attachments; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Authenticated users can upload attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'attachments'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: objects Avatar images are publicly accessible; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));


--
-- Name: objects Brand assets readable; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Brand assets readable" ON storage.objects FOR SELECT USING (((bucket_id = 'branding'::text) AND ((auth.role() = 'anon'::text) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND ((storage.foldername(objects.name))[1] = (p.tenant_id)::text)))))));


--
-- Name: objects Users can delete their own avatar; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- Name: objects Users can update their own avatar; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- Name: objects Users can upload their own avatar; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- Name: objects anyone read chat attachments; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "anyone read chat attachments" ON storage.objects FOR SELECT USING ((bucket_id = 'chat-attachments'::text));


--
-- Name: objects anyone read chat avatars; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "anyone read chat avatars" ON storage.objects FOR SELECT USING ((bucket_id = 'chat-avatars'::text));


--
-- Name: objects auth users delete chat attachments; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "auth users delete chat attachments" ON storage.objects FOR DELETE USING (((bucket_id = 'chat-attachments'::text) AND (auth.role() = 'authenticated'::text)));


--
-- Name: objects auth users delete chat avatars; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "auth users delete chat avatars" ON storage.objects FOR DELETE USING (((bucket_id = 'chat-avatars'::text) AND (auth.role() = 'authenticated'::text)));


--
-- Name: objects auth users update chat avatars; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "auth users update chat avatars" ON storage.objects FOR UPDATE USING (((bucket_id = 'chat-avatars'::text) AND (auth.role() = 'authenticated'::text)));


--
-- Name: objects auth users upload chat attachments; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "auth users upload chat attachments" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'chat-attachments'::text) AND (auth.role() = 'authenticated'::text)));


--
-- Name: objects auth users upload chat avatars; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "auth users upload chat avatars" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'chat-avatars'::text) AND (auth.role() = 'authenticated'::text)));


--
-- Name: objects chat_attach_delete; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY chat_attach_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'chat-attachments'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::public.app_role)))))));


--
-- Name: objects chat_attach_insert; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY chat_attach_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'chat-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- Name: objects chat_attach_select; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY chat_attach_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'chat-attachments'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: objects feed_attachments_delete; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY feed_attachments_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'feed-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- Name: objects feed_attachments_read; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY feed_attachments_read ON storage.objects FOR SELECT USING (((bucket_id = 'feed-attachments'::text) AND ((auth.role() = 'anon'::text) OR (auth.uid() IS NOT NULL))));


--
-- Name: objects feed_attachments_upload; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY feed_attachments_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'feed-attachments'::text));


--
-- Name: objects platform_thumbnails_delete_admin; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY platform_thumbnails_delete_admin ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'platform-thumbnails'::text) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::public.app_role))))));


--
-- Name: objects platform_thumbnails_insert_admin; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY platform_thumbnails_insert_admin ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'platform-thumbnails'::text) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::public.app_role))))));


--
-- Name: objects platform_thumbnails_select; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY platform_thumbnails_select ON storage.objects FOR SELECT USING ((bucket_id = 'platform-thumbnails'::text));


--
-- Name: objects platform_thumbnails_update_admin; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY platform_thumbnails_update_admin ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'platform-thumbnails'::text) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::public.app_role))))));


--
-- Name: objects process_docs_delete; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY process_docs_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'process-documents'::text));


--
-- Name: objects process_docs_public_read; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY process_docs_public_read ON storage.objects FOR SELECT TO anon USING ((bucket_id = 'process-documents'::text));


--
-- Name: objects process_docs_select; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY process_docs_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'process-documents'::text));


--
-- Name: objects process_docs_upload; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY process_docs_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'process-documents'::text));


--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
--




--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: supabase_admin
--




--
-- Name: supabase_realtime chat_channel_members; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_channel_members;


--
-- Name: supabase_realtime chat_channel_mutes; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_channel_mutes;


--
-- Name: supabase_realtime chat_huddles; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_huddles;


--
-- Name: supabase_realtime chat_messages; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_messages;


--
-- Name: supabase_realtime chat_pinned_messages; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_pinned_messages;


--
-- Name: supabase_realtime chat_poll_votes; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_poll_votes;


--
-- Name: supabase_realtime chat_polls; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_polls;


--
-- Name: supabase_realtime chat_presence; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_presence;


--
-- Name: supabase_realtime chat_reactions; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_reactions;


--
-- Name: supabase_realtime chat_starred_messages; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_starred_messages;


--
-- Name: supabase_realtime meeting_ai_jobs; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.meeting_ai_jobs;


--
-- Name: supabase_realtime meeting_guest_requests; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.meeting_guest_requests;


--
-- Name: supabase_realtime notes; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.notes;


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: supabase_admin
--



--
-- Name: SCHEMA cron; Type: ACL; Schema: -; Owner: supabase_admin
--



--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: postgres
--



--
-- Name: SCHEMA net; Type: ACL; Schema: -; Owner: supabase_admin
--



--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--



--
-- Name: SCHEMA realtime; Type: ACL; Schema: -; Owner: supabase_admin
--



--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: supabase_admin
--



--
-- Name: SCHEMA vault; Type: ACL; Schema: -; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_in(cstring); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_out(public.gtrgm); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION pg_reload_conf(); Type: ACL; Schema: pg_catalog; Owner: supabase_admin
--



--
-- Name: FUNCTION add_user_to_omnx_bot(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION area_employee_ids(p_area_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION chat_my_conversation_ids(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION chat_my_employee_id(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION chat_my_tenant_id(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION chat_presence_my_employee_id(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION chat_touch_conversation(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION chat_user_created_conversation(p_conv_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION check_employee_hierarchy(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION check_position_cycle(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION compute_next_meeting_occurrence(p_pattern jsonb, p_after timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION create_director_position(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION create_omnx_bot_channel(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION diagnostico_feed_posts_raw(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION diagnostico_feed_visibilidade(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION employees_by_area(p_area_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION enforce_subtasks_single_level(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION ensure_area_channel(p_area_id uuid, p_tenant_id uuid, p_area_name text); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION ensure_dm_conversation(p_tenant_id uuid, p_user_a uuid, p_user_b uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION ensure_omnx_bot(p_tenant_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION ensure_system_bot(p_tenant_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION get_chat_conversations_overview(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION get_meeting_created_by(p_meeting_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION get_project_created_by(p_project_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION get_user_tenant_id(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gin_extract_value_trgm(text, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_compress(internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_consistent(internal, text, smallint, oid, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_decompress(internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_distance(internal, text, smallint, oid, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_options(internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_penalty(internal, internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_picksplit(internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_same(public.gtrgm, public.gtrgm, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION gtrgm_union(internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION is_chat_channel_member(_channel_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION is_meeting_host(p_meeting_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION kb_user_has_access(p_resource_type text, p_resource_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION log_task_change(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION meetings_recurrence_recompute(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION migrate_manager_to_position_hierarchy(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION notes_touch_updated_at(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION notify_task_assigned(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION notify_task_assignee_direct(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION notify_task_comment(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION notify_task_completed(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION process_auto_link_structure(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION process_task_recurrences(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION set_announcements_updated_at(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION set_limit(real); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION set_meeting_attendee_tenant(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION set_process_comments_updated_at(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION show_limit(); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION show_trgm(text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION similarity(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION similarity_dist(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION similarity_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION strict_word_similarity(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION strict_word_similarity_commutator_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION strict_word_similarity_dist_commutator_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION strict_word_similarity_dist_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION strict_word_similarity_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION trg_area_channel_create(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION trg_area_channel_rename(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION trg_sync_employee_area_channel(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION update_chat_presence_updated_at(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION update_meeting_attendee_timestamp(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION update_task_time_duration(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION update_tenant_platforms_updated_at(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION user_can_read_feed_post(p_post_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION user_can_read_process(p_process_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION user_can_read_project(p_project_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION user_has_process_access(p_process_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION user_has_project_assigned_task(p_project_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION user_owns_or_member_of_project(p_project_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION user_process_matches_position_or_area(p_process_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION user_project_matches_area(p_project_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION user_project_matches_position_or_area(p_project_id uuid); Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: FUNCTION word_similarity(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION word_similarity_commutator_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION word_similarity_dist_commutator_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION word_similarity_dist_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: FUNCTION word_similarity_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: TABLE announcement_comments; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE announcement_reactions; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE announcement_visibility; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE announcements; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_channel_members; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_channel_mutes; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_channels; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_huddles; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_pinned_messages; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_poll_votes; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_polls; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_presence; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_reactions; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_starred_messages; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE chat_user_favorites; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE company_areas; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE employee_positions; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE employee_projects; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE employee_status_history; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE employees; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE positions; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE subareas; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE employees_hierarchy_view; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE feed_audio_transcriptions; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE feed_comments; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE feed_posts; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE feed_reactions; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE knowledge_base_access; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE knowledge_base_documents; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE knowledge_base_folders; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE knowledge_base_shares; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE meeting_ai_jobs; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE meeting_approved_items; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE meeting_attendees; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE meeting_guest_requests; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE meeting_recording_events; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE meetings; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE notes; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE organograma_view; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE position_hierarchy_view; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE process_areas; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE process_comments; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE process_doc_folders; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE process_documents; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE process_folders; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE process_positions; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE process_steps; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE process_tag_assignments; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE process_tags; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE processes; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE processes_hierarchy_view; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE project_doc_folders; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE project_documents; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE projects_hierarchy_view; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE scheduled_messages; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE task_assignees; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE task_comments; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE task_dependencies; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE task_history; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE task_recurrence; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE task_recurrence_comments; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE task_recurrence_completions; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE task_time_entries; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE tenant_platforms; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE tenants; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE webhook_logs; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: TABLE webhooks; Type: ACL; Schema: public; Owner: postgres
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--




--
-- PostgreSQL database dump complete
--


