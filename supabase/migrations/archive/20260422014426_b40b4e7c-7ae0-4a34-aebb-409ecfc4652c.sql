-- v8.7.1 — Hardening RLS de meeting_guest_requests + força realtime
-- Garante: anon pode inserir SOMENTE se a sala estiver ativa; ninguém pode deletar.

-- 1. INSERT público (anon + authenticated) — validação da sala ativa via subquery
DROP POLICY IF EXISTS "Public can insert guest request for active rooms" ON public.meeting_guest_requests;
CREATE POLICY "Public can insert guest request for active rooms"
  ON public.meeting_guest_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Status sempre começa como pending; sem decisão preexistente
    status = 'pending'
    AND decided_at IS NULL
    AND decided_by IS NULL
    -- Sala precisa existir e estar ativa
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.tenant_id = meeting_guest_requests.tenant_id
        AND (
          m.status IN ('scheduled', 'recording')
          OR m.recording_status = 'recording'
        )
    )
  );

-- 2. Bloqueia DELETE para qualquer role autenticada/anon (registro auditável)
DROP POLICY IF EXISTS "No one can delete guest requests" ON public.meeting_guest_requests;
CREATE POLICY "No one can delete guest requests"
  ON public.meeting_guest_requests
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- 3. Garante que SELECT público (anon) NÃO existe — convidado lê via edge function (service_role)
-- (a policy "Host can view guest requests" já restringe ao host/admin via TO authenticated)

-- 4. Garante que a tabela está em REPLICA IDENTITY FULL para realtime
ALTER TABLE public.meeting_guest_requests REPLICA IDENTITY FULL;

-- 5. Garante que a tabela está publicada no realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meeting_guest_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_guest_requests;
  END IF;
END $$;