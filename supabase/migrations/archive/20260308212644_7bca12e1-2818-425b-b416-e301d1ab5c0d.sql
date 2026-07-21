
-- Meetings table
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  created_by uuid,
  transcript_raw text,
  transcript_final text,
  summary_markdown text,
  action_items jsonb DEFAULT '[]',
  key_points jsonb DEFAULT '[]',
  attention_points jsonb DEFAULT '[]',
  participants jsonb DEFAULT '[]',
  approval_status text DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  generated_projects jsonb DEFAULT '[]',
  generated_tasks jsonb DEFAULT '[]',
  soniox_session_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND is_admin());

-- Trigger for updated_at
CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Meeting approved items table
CREATE TABLE public.meeting_approved_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  item_type text NOT NULL,
  item_id uuid,
  original_suggestion jsonb,
  approved_at timestamptz DEFAULT now()
);

ALTER TABLE public.meeting_approved_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mai_select" ON public.meeting_approved_items FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "mai_insert" ON public.meeting_approved_items FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND (is_admin() OR has_role(auth.uid(), 'manager')));

CREATE POLICY "mai_delete" ON public.meeting_approved_items FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND is_admin());
