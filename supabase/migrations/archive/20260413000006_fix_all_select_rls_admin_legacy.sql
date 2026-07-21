-- Fix global: todas as políticas SELECT que usavam is_admin() puro
-- agora incluem fallback para admin sem row em user_roles.
--
-- Padrão aplicado em cada política SELECT:
--   NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid())  → admin legacy
--   OR is_admin()                                                       → admin com role
--   OR <condição original do role>                                      → manager/member

-- ──────────────────────────────────────────────
-- PROJECTS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR public.user_can_read_project(id)
    )
  );

-- ──────────────────────────────────────────────
-- TASKS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR (
        tasks.project_id IS NOT NULL
        AND public.user_can_read_project(tasks.project_id)
      )
      OR (
        public.has_role(auth.uid(), 'manager')
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = tasks.assignee_id
            AND e.tenant_id = public.get_user_tenant_id()
            AND e.user_id = auth.uid()
        )
      )
    )
  );

-- ──────────────────────────────────────────────
-- PROCESSES
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "processes_select" ON public.processes;
CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR public.user_can_read_process(id)
    )
  );

-- ──────────────────────────────────────────────
-- PROCESS STEPS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "steps_select" ON public.process_steps;
CREATE POLICY "steps_select" ON public.process_steps
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR public.user_can_read_process(process_id)
    )
  );

-- ──────────────────────────────────────────────
-- PROCESS POSITIONS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "process_positions_select" ON public.process_positions;
CREATE POLICY "process_positions_select" ON public.process_positions
  FOR SELECT TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
    OR public.is_admin()
    OR public.user_can_read_process(process_id)
  );

-- ──────────────────────────────────────────────
-- PROCESS AREAS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_select_process_areas" ON public.process_areas;
CREATE POLICY "tenant_select_process_areas" ON public.process_areas
  FOR SELECT TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
    OR public.is_admin()
    OR public.user_can_read_process(process_id)
  );

-- ──────────────────────────────────────────────
-- MEETINGS
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR meetings.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.meeting_attendees ma
        JOIN public.employees e ON e.id = ma.employee_id
        WHERE ma.meeting_id = meetings.id AND e.user_id = auth.uid()
      )
    )
  );

-- ──────────────────────────────────────────────
-- MEETING ATTENDEES
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "meeting_attendees_select" ON public.meeting_attendees;
CREATE POLICY "meeting_attendees_select" ON public.meeting_attendees
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = meeting_attendees.employee_id AND e.user_id = auth.uid()
      )
      OR public.get_meeting_created_by(meeting_attendees.meeting_id) = auth.uid()
    )
  );
