-- Migration: Meeting Enhancements
-- Adds scheduled date/time, project linking, location, and attendees management

-- Add new columns to meetings table
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS scheduled_date DATE,
ADD COLUMN IF NOT EXISTS scheduled_time TIME,
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS location TEXT;

-- Create meeting_attendees table for explicit participant management
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'required' CHECK (role IN ('organizer', 'required', 'optional')),
  attendance_status TEXT DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'confirmed', 'declined', 'attended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, email)
);

-- Add tenant_id to meeting_attendees for RLS
ALTER TABLE meeting_attendees ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_date ON meetings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_meetings_project_id ON meetings(project_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting_id ON meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_employee_id ON meeting_attendees(employee_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_tenant_id ON meeting_attendees(tenant_id);

-- Enable RLS on meeting_attendees
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Users can view attendees from their tenant meetings" ON meeting_attendees;
DROP POLICY IF EXISTS "Users can insert attendees in their tenant meetings" ON meeting_attendees;
DROP POLICY IF EXISTS "Users can update attendees in their tenant meetings" ON meeting_attendees;
DROP POLICY IF EXISTS "Users can delete attendees from their tenant meetings" ON meeting_attendees;

-- RLS Policies for meeting_attendees
CREATE POLICY "Users can view attendees from their tenant meetings"
  ON meeting_attendees FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert attendees in their tenant meetings"
  ON meeting_attendees FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update attendees in their tenant meetings"
  ON meeting_attendees FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete attendees from their tenant meetings"
  ON meeting_attendees FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Trigger to set tenant_id from meeting when inserting attendee
CREATE OR REPLACE FUNCTION set_meeting_attendee_tenant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM meetings
    WHERE id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_meeting_attendee_tenant ON meeting_attendees;
CREATE TRIGGER trg_set_meeting_attendee_tenant
  BEFORE INSERT ON meeting_attendees
  FOR EACH ROW
  EXECUTE FUNCTION set_meeting_attendee_tenant();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_meeting_attendee_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_meeting_attendee_timestamp ON meeting_attendees;
CREATE TRIGGER trg_update_meeting_attendee_timestamp
  BEFORE UPDATE ON meeting_attendees
  FOR EACH ROW
  EXECUTE FUNCTION update_meeting_attendee_timestamp();

-- RLS Policy for meetings update (idempotent)
DROP POLICY IF EXISTS "Users can update meetings in their tenant" ON meetings;
CREATE POLICY "Users can update meetings in their tenant"
  ON meetings FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE user_id = auth.uid()
    )
  );
