-- Migration: Restrict visibility of tasks, projects, meetings by assignment (v7.5.0)
-- Tasks: assignee OR project owner (created_by) OR admin
-- Projects: creator OR has assigned task here OR admin
-- Meetings: creator OR listed attendee OR admin
-- meeting_attendees: this row is me OR I created the meeting OR admin

-- ============================================================
-- tasks: admin OR assignee OR project owner
-- ============================================================
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = tasks.assignee_id AND e.user_id = auth.uid()
      )
      OR (
        tasks.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = tasks.project_id AND p.created_by = auth.uid()
        )
      )
    )
  );

-- ============================================================
-- projects: admin OR creator OR has assigned task here
-- ============================================================
DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR projects.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.tasks t
        JOIN public.employees e ON e.id = t.assignee_id
        WHERE t.project_id = projects.id AND e.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- meetings: admin OR creator OR listed attendee
-- ============================================================
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
    )
  );

-- ============================================================
-- meeting_attendees SELECT: admin OR this row is me OR I created the meeting
-- ============================================================
DROP POLICY IF EXISTS "Users can view attendees from their tenant meetings" ON public.meeting_attendees;

CREATE POLICY "meeting_attendees_select" ON public.meeting_attendees
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = meeting_attendees.employee_id AND e.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE m.id = meeting_attendees.meeting_id AND m.created_by = auth.uid()
      )
    )
  );
