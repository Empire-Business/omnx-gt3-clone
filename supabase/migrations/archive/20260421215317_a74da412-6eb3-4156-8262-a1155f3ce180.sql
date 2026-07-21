-- ============================================================================
-- v8.6.0 — Videoconferência LiveKit
-- ============================================================================

-- 1) Colunas em meetings
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_mode TEXT NOT NULL DEFAULT 'livekit'
    CHECK (meeting_mode IN ('in_person','external_link','livekit')),
  ADD COLUMN IF NOT EXISTS livekit_room_name TEXT,
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS recording_status TEXT
    CHECK (recording_status IN ('pending','recording','completed','failed')),
  ADD COLUMN IF NOT EXISTS egress_id TEXT,
  ADD COLUMN IF NOT EXISTS live_participants JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS meetings_livekit_room_name_key
  ON public.meetings(livekit_room_name)
  WHERE livekit_room_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS meetings_recording_status_idx
  ON public.meetings(recording_status)
  WHERE recording_status IS NOT NULL;

-- 2) Tabela chat_huddles
CREATE TABLE IF NOT EXISTS public.chat_huddles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  livekit_room_name TEXT NOT NULL UNIQUE,
  started_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_huddles_conv_idx
  ON public.chat_huddles(conversation_id, status);
CREATE INDEX IF NOT EXISTS chat_huddles_tenant_idx
  ON public.chat_huddles(tenant_id);

ALTER TABLE public.chat_huddles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_huddles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "huddles_select_participant" ON public.chat_huddles;
CREATE POLICY "huddles_select_participant" ON public.chat_huddles
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.chat_my_tenant_id()
    AND conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

DROP POLICY IF EXISTS "huddles_insert_participant" ON public.chat_huddles;
CREATE POLICY "huddles_insert_participant" ON public.chat_huddles
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.chat_my_tenant_id()
    AND started_by = public.chat_my_employee_id()
    AND conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  );

DROP POLICY IF EXISTS "huddles_update_participant" ON public.chat_huddles;
CREATE POLICY "huddles_update_participant" ON public.chat_huddles
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.chat_my_tenant_id()
    AND conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
  )
  WITH CHECK (
    tenant_id = public.chat_my_tenant_id()
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS chat_huddles_updated_at ON public.chat_huddles;
CREATE TRIGGER chat_huddles_updated_at
  BEFORE UPDATE ON public.chat_huddles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Realtime
ALTER TABLE public.chat_huddles REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_huddles';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_huddles';
  END IF;
END $$;

-- 3) Tabela meeting_recording_events (auditoria)
CREATE TABLE IF NOT EXISTS public.meeting_recording_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
  huddle_id UUID REFERENCES public.chat_huddles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'participant_joined','participant_left',
    'egress_started','egress_updated','egress_ended',
    'room_started','room_finished','recording_failed'
  )),
  participant_identity TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rec_events_meeting_idx
  ON public.meeting_recording_events(meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rec_events_huddle_idx
  ON public.meeting_recording_events(huddle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rec_events_tenant_idx
  ON public.meeting_recording_events(tenant_id);

ALTER TABLE public.meeting_recording_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recording_events FORCE ROW LEVEL SECURITY;

-- Apenas leitura: tenant + (acesso à meeting OU acesso ao huddle)
DROP POLICY IF EXISTS "rec_events_select_tenant" ON public.meeting_recording_events;
CREATE POLICY "rec_events_select_tenant" ON public.meeting_recording_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
  );

-- Insert: apenas service_role (webhook). Nenhuma policy para authenticated => bloqueado.