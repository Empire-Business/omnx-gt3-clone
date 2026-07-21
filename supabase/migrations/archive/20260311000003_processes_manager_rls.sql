-- Migration: Allow managers to insert and update processes and process_steps
-- Previously restricted to admin only. Delete remains admin-only.

-- processes: INSERT
DROP POLICY IF EXISTS "processes_insert_admin" ON public.processes;
CREATE POLICY "processes_insert_admin" ON public.processes
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
  );

-- processes: UPDATE
DROP POLICY IF EXISTS "processes_update_admin" ON public.processes;
CREATE POLICY "processes_update_admin" ON public.processes
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
  );

-- process_steps: INSERT
DROP POLICY IF EXISTS "steps_insert_admin" ON public.process_steps;
CREATE POLICY "steps_insert_admin" ON public.process_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
  );

-- process_steps: UPDATE
DROP POLICY IF EXISTS "steps_update_admin" ON public.process_steps;
CREATE POLICY "steps_update_admin" ON public.process_steps
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
  );
