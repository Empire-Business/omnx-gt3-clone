-- Tabela para pedidos de entrada de convidados externos em reuniões LiveKit
CREATE TABLE public.meeting_guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  livekit_room_name text NOT NULL,
  guest_name text NOT NULL,
  guest_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_guest_requests_room ON public.meeting_guest_requests(livekit_room_name, status);
CREATE INDEX idx_meeting_guest_requests_meeting ON public.meeting_guest_requests(meeting_id, status);
CREATE INDEX idx_meeting_guest_requests_token ON public.meeting_guest_requests(guest_token);

-- Trigger updated_at
CREATE TRIGGER trg_meeting_guest_requests_updated_at
BEFORE UPDATE ON public.meeting_guest_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS
ALTER TABLE public.meeting_guest_requests ENABLE ROW LEVEL SECURITY;

-- Helper: é o host (criador) da reunião?
CREATE OR REPLACE FUNCTION public.is_meeting_host(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = p_meeting_id
      AND m.created_by = auth.uid()
  );
$$;

-- Policies
-- Host (criador) consegue ver os pedidos da sua reunião
CREATE POLICY "Host can view guest requests"
ON public.meeting_guest_requests FOR SELECT
TO authenticated
USING (public.is_meeting_host(meeting_id) OR public.is_admin());

-- Host pode atualizar status (aprovar/recusar)
CREATE POLICY "Host can update guest requests"
ON public.meeting_guest_requests FOR UPDATE
TO authenticated
USING (public.is_meeting_host(meeting_id) OR public.is_admin())
WITH CHECK (public.is_meeting_host(meeting_id) OR public.is_admin());

-- Convidado consegue ler o próprio pedido (via edge function service role) — mas precisamos permitir SELECT público restrito por guest_token
-- Como RLS não suporta isso bem, vamos deixar o convidado ler via edge function (service role).
-- Para realtime no host, basta SELECT acima.

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_guest_requests;
ALTER TABLE public.meeting_guest_requests REPLICA IDENTITY FULL;