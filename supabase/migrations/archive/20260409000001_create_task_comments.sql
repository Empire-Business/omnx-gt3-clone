-- Tabela de comentários de tarefas
CREATE TABLE IF NOT EXISTS public.task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS task_comments_task_id_idx   ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS task_comments_tenant_id_idx ON public.task_comments(tenant_id);

-- RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_insert" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_delete" ON public.task_comments;

-- SELECT: mesmos usuários que podem ver a tarefa (mesmo tenant)
CREATE POLICY "task_comments_select"
  ON public.task_comments FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- INSERT: apenas colaboradores do mesmo tenant
CREATE POLICY "task_comments_insert"
  ON public.task_comments FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- DELETE: apenas o autor pode deletar seu próprio comentário
CREATE POLICY "task_comments_delete"
  ON public.task_comments FOR DELETE
  USING (
    tenant_id = get_user_tenant_id()
    AND author_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );
