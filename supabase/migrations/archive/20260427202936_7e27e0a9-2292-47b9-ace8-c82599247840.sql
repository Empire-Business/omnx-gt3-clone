-- v8.10.5: Sistema robusto de processamento de IA para reuniões grandes
-- Cria tabela de jobs com fase, progresso, heartbeat e RLS por tenant.
-- Também destrava reuniões antigas presas em status 'processing'.

CREATE TABLE IF NOT EXISTS public.meeting_ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid,
  status text NOT NULL DEFAULT 'queued',     -- queued | processing | completed | failed | cancelled
  phase text NOT NULL DEFAULT 'queued',      -- queued | chunking | extracting | reducing | consolidating | saving | done
  progress integer NOT NULL DEFAULT 0,       -- 0..100
  total_chunks integer NOT NULL DEFAULT 0,
  processed_chunks integer NOT NULL DEFAULT 0,
  failed_chunks integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_ai_jobs_meeting_idx
  ON public.meeting_ai_jobs(meeting_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meeting_ai_jobs_tenant_status_idx
  ON public.meeting_ai_jobs(tenant_id, status);

ALTER TABLE public.meeting_ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_ai_jobs_select" ON public.meeting_ai_jobs;
CREATE POLICY "meeting_ai_jobs_select" ON public.meeting_ai_jobs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- Inserts/updates/deletes sao feitos pelo edge function via service_role,
-- bypassa RLS automaticamente; mas mantemos politicas restritivas como defesa.
DROP POLICY IF EXISTS "meeting_ai_jobs_insert_admin" ON public.meeting_ai_jobs;
CREATE POLICY "meeting_ai_jobs_insert_admin" ON public.meeting_ai_jobs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());

DROP POLICY IF EXISTS "meeting_ai_jobs_update_admin" ON public.meeting_ai_jobs;
CREATE POLICY "meeting_ai_jobs_update_admin" ON public.meeting_ai_jobs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

DROP POLICY IF EXISTS "meeting_ai_jobs_delete_admin" ON public.meeting_ai_jobs;
CREATE POLICY "meeting_ai_jobs_delete_admin" ON public.meeting_ai_jobs
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());

-- Trigger updated_at
CREATE TRIGGER meeting_ai_jobs_updated_at
  BEFORE UPDATE ON public.meeting_ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Habilitar realtime para o frontend acompanhar progresso
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_ai_jobs;

-- Recuperacao: marca jobs sem heartbeat ha mais de 4 minutos como failed.
UPDATE public.meeting_ai_jobs
SET status = 'failed',
    error_message = COALESCE(error_message, 'Stale job (no heartbeat)'),
    finished_at = COALESCE(finished_at, now())
WHERE status IN ('queued', 'processing')
  AND COALESCE(heartbeat_at, started_at, created_at) < now() - interval '4 minutes';

-- Recuperacao: destrava reunioes presas em 'processing' ha mais de 10 minutos.
UPDATE public.meetings
SET status = 'completed',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'ai_error', 'Auto-recovered: processing exceeded timeout',
      'auto_recovered_at', now()
    ),
    updated_at = now()
WHERE status = 'processing'
  AND updated_at < now() - interval '10 minutes';