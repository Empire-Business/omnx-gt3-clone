-- Libera visualização de processos e seus dados para todos os usuários autenticados do tenant

-- Processos
DROP POLICY IF EXISTS processes_select ON public.processes;
CREATE POLICY processes_select ON public.processes
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- Etapas de processos
DROP POLICY IF EXISTS steps_select ON public.process_steps;
CREATE POLICY steps_select ON public.process_steps
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- Áreas de processos
DROP POLICY IF EXISTS tenant_select_process_areas ON public.process_areas;
CREATE POLICY tenant_select_process_areas ON public.process_areas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.processes p
      WHERE p.id = process_id
        AND p.tenant_id = public.get_user_tenant_id()
    )
  );

-- Posições de processos
DROP POLICY IF EXISTS process_positions_select ON public.process_positions;
DROP POLICY IF EXISTS tenant_select_process_positions ON public.process_positions;
CREATE POLICY process_positions_select ON public.process_positions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.processes p
      WHERE p.id = process_id
        AND p.tenant_id = public.get_user_tenant_id()
    )
  );
