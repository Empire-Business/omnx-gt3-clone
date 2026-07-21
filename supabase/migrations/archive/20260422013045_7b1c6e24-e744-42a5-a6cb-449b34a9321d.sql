-- Hotfix: destrava reuniões cujo recording_status ficou preso em "recording" sem URL
-- (egress_ended não chegou via webhook)
UPDATE meetings 
SET recording_status = 'pending', updated_at = now()
WHERE meeting_mode = 'livekit'
  AND status IN ('completed', 'cancelled')
  AND recording_status = 'recording'
  AND recording_url IS NULL;