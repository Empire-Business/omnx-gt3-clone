-- ══════════════════════════════════════════════════════════════
-- Corrige funções/triggers órfãos que ainda referenciam
-- chat_conversations / chat_participants (tabelas removidas
-- na migração que adotou chat_channels / chat_channel_members).
--
-- Sintoma: "relation public.chat_conversations does not exist"
-- ao criar colaborador (INSERT em employee_positions),
-- renomear ou criar uma area.
-- ══════════════════════════════════════════════════════════════

-- ── ensure_area_channel: cria/recupera o channel da area ──────
CREATE OR REPLACE FUNCTION public.ensure_area_channel(
  p_area_id UUID, p_tenant_id UUID, p_area_name TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE area_id = p_area_id
  LIMIT 1;

  IF v_channel_id IS NOT NULL THEN RETURN v_channel_id; END IF;

  INSERT INTO public.chat_channels (tenant_id, name, area_id, is_dm)
  VALUES (p_tenant_id, p_area_name, p_area_id, false)
  RETURNING id INTO v_channel_id;

  -- Adiciona todos os colaboradores ativos da area como membros
  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  SELECT v_channel_id, e.user_id, 'member'
  FROM public.employees e
  JOIN public.employee_positions ep ON ep.employee_id = e.id
  JOIN public.positions p            ON p.id = ep.position_id
  LEFT JOIN public.subareas sa       ON sa.id = p.subarea_id
  WHERE e.status = 'active'
    AND e.user_id IS NOT NULL
    AND (p.area_id = p_area_id OR sa.area_id = p_area_id)
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN v_channel_id;
END;
$$;

-- ── trg_area_channel_rename: sincroniza nome do channel ───────
CREATE OR REPLACE FUNCTION public.trg_area_channel_rename()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.name <> OLD.name THEN
    UPDATE public.chat_channels
    SET name = NEW.name
    WHERE area_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── trg_sync_employee_area_channel: vincula colaborador ao channel
CREATE OR REPLACE FUNCTION public.trg_sync_employee_area_channel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_area_id   UUID;
  v_channel_id UUID;
  v_user_id   UUID;
BEGIN
  SELECT COALESCE(p.area_id, sa.area_id) INTO v_area_id
  FROM public.positions p
  LEFT JOIN public.subareas sa ON sa.id = p.subarea_id
  WHERE p.id = NEW.position_id;

  IF v_area_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO v_user_id
  FROM public.employees
  WHERE id = NEW.employee_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE area_id = v_area_id
  LIMIT 1;

  IF v_channel_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.chat_channel_members (channel_id, user_id, role)
  VALUES (v_channel_id, v_user_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
