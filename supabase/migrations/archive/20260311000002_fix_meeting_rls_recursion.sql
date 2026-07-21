-- Fix: infinite recursion between meetings_select and meeting_attendees_select
--
-- The cycle:
--   meetings_select         → queries meeting_attendees (to check attendee)
--   meeting_attendees_select → queries meetings         (to check creator)
--
-- Fix: replace the direct meetings lookup in meeting_attendees_select with a
-- SECURITY DEFINER function that bypasses RLS, breaking the cycle.

-- Helper: returns the created_by of a meeting without going through RLS
CREATE OR REPLACE FUNCTION public.get_meeting_created_by(p_meeting_id uuid)
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT created_by FROM public.meetings WHERE id = p_meeting_id;
$$;

-- Recreate meeting_attendees_select using the helper instead of a direct subquery
DROP POLICY IF EXISTS "meeting_attendees_select" ON public.meeting_attendees;

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
      -- Use SECURITY DEFINER function to avoid querying meetings with RLS (would recurse)
      OR public.get_meeting_created_by(meeting_attendees.meeting_id) = auth.uid()
    )
  );
