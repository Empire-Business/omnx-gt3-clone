-- =============================================================================
-- Subtarefas, dependências e link de reunião de origem
-- =============================================================================
-- 1. tasks.parent_task_id            — subtarefa real (1 nível, sem neto)
-- 2. tasks.source_meeting_id         — task gerada por aprovação de reunião
-- 3. task_dependencies (nova tabela) — blocks / related_to entre tasks
-- =============================================================================

-- =============================================================================
-- 1. SUBTAREFAS — coluna parent_task_id
-- =============================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_task_id uuid
  REFERENCES public.tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task
  ON public.tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- Trigger: força 1 único nível de subtarefas (sem neto) e impede auto-referência.
CREATE OR REPLACE FUNCTION public.enforce_subtasks_single_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_enforce_subtasks_single_level ON public.tasks;
CREATE TRIGGER trg_enforce_subtasks_single_level
  BEFORE INSERT OR UPDATE OF parent_task_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_subtasks_single_level();

-- =============================================================================
-- 2. SOURCE MEETING — link da task à reunião que a gerou
-- =============================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_meeting_id uuid
  REFERENCES public.meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source_meeting
  ON public.tasks(source_meeting_id)
  WHERE source_meeting_id IS NOT NULL;

-- =============================================================================
-- 3. DEPENDÊNCIAS — tabela task_dependencies
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'blocks'
    CHECK (dependency_type IN ('blocks', 'related_to')),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_deps_no_self CHECK (task_id <> depends_on_task_id),
  CONSTRAINT task_deps_unique UNIQUE (task_id, depends_on_task_id, dependency_type)
);

CREATE INDEX IF NOT EXISTS idx_task_deps_task
  ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on
  ON public.task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_tenant
  ON public.task_dependencies(tenant_id);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_deps_select" ON public.task_dependencies
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "task_deps_insert" ON public.task_dependencies
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "task_deps_delete" ON public.task_dependencies
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- =============================================================================
-- COMENTÁRIOS DE COLUNA
-- =============================================================================
COMMENT ON COLUMN public.tasks.parent_task_id IS
  'Subtarefa: id da task-mãe. Apenas 1 nível permitido (trigger enforce_subtasks_single_level).';
COMMENT ON COLUMN public.tasks.source_meeting_id IS
  'Reunião que originou esta task via meeting-approve. SET NULL ao apagar a reunião.';
COMMENT ON TABLE public.task_dependencies IS
  'Dependências entre tasks. type=blocks: depends_on_task_id precisa terminar antes; type=related_to: apenas link.';
