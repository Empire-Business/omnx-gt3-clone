-- ══════════════════════════════════════════════════════════════
-- Corrige notificações duplicadas de tarefa
-- Raiz: 3 triggers disparam para o mesmo assignee na mesma operação:
--   1. tasks INSERT  → notify_task_assignee_direct
--   2. task_assignees INSERT → notify_task_assigned
--   3. tasks UPDATE  → notify_task_assignee_direct (via syncAssignees)
-- Solução: adicionar source_id + índice único para deduplicar
-- ══════════════════════════════════════════════════════════════

-- Adiciona coluna source_id (id da entidade que gerou a notificação)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- Índice único: um usuário só recebe 1 notificação por (tipo, entidade)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_no_dup
  ON public.notifications (user_id, type, source_id)
  WHERE source_id IS NOT NULL;

-- ── Atualiza notify_task_assignee_direct ──────────────────────
CREATE OR REPLACE FUNCTION public.notify_task_assignee_direct()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- ── Atualiza notify_task_assigned (task_assignees INSERT) ─────
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
