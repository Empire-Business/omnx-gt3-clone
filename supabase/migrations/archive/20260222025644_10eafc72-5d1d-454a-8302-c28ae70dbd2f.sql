
-- Module 18.1: Process multi-dimensional classification (N:N with areas/subareas)

-- Create process_areas junction table
CREATE TABLE public.process_areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES public.company_areas(id) ON DELETE CASCADE,
  subarea_id UUID REFERENCES public.subareas(id) ON DELETE SET NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(process_id, area_id, subarea_id)
);

-- Enable RLS
ALTER TABLE public.process_areas ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "tenant_select_process_areas" ON public.process_areas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM processes p WHERE p.id = process_areas.process_id AND p.tenant_id = get_user_tenant_id())
  );

CREATE POLICY "admin_manage_process_areas" ON public.process_areas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM processes p WHERE p.id = process_areas.process_id AND p.tenant_id = get_user_tenant_id()) AND is_admin()
  );

-- Migrate existing data from processes.area_id/subarea_id to process_areas
-- (só roda se as colunas legacy ainda existirem — em clones novos, pula)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'processes' AND column_name = 'area_id'
  ) THEN
    EXECUTE 'INSERT INTO public.process_areas (process_id, area_id, subarea_id, is_primary)
             SELECT id, area_id, subarea_id, true
             FROM public.processes
             WHERE area_id IS NOT NULL';
  END IF;
END $$;
