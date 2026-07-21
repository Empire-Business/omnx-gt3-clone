-- Visibilidade de reuniões por membro de projeto (v8.11.0)
-- Além do criador e dos participantes listados, membros do projeto vinculado
-- à reunião também podem visualizá-la.

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;

CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR meetings.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.meeting_attendees ma
        JOIN public.employees e ON e.id = ma.employee_id
        WHERE ma.meeting_id = meetings.id AND e.user_id = auth.uid()
      )
      OR (
        meetings.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.employee_projects ep
          JOIN public.employees e ON e.id = ep.employee_id
          WHERE ep.project_id = meetings.project_id AND e.user_id = auth.uid()
        )
      )
    )
  );
