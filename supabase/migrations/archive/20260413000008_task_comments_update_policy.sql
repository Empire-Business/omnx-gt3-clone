-- Permite que o autor edite o conteúdo do próprio comentário
CREATE POLICY "task_comments_update_own"
  ON public.task_comments
  FOR UPDATE
  USING (
    tenant_id = get_user_tenant_id()
    AND author_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND author_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );
