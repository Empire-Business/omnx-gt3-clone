-- Migration: Add area_id to positions table and make subarea_id nullable
-- This allows area-level positions (Directors) that don't belong to a specific subarea

-- Step 1: Add area_id column to positions table
ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.company_areas(id) ON DELETE SET NULL;

-- Step 2: Make subarea_id nullable (was previously required)
ALTER TABLE public.positions
ALTER COLUMN subarea_id DROP NOT NULL;

-- Step 3: Add check constraint to ensure at least one of area_id or subarea_id is set
-- This ensures data integrity - a position must belong to either an area or a subarea
ALTER TABLE public.positions
DROP CONSTRAINT IF EXISTS positions_area_or_subarea_check;

ALTER TABLE public.positions
ADD CONSTRAINT positions_area_or_subarea_check
CHECK (area_id IS NOT NULL OR subarea_id IS NOT NULL);

-- Step 4: Create index for area_id lookups
CREATE INDEX IF NOT EXISTS idx_positions_area_id ON public.positions(area_id);

-- Step 5: Update existing positions to set area_id based on their subarea's parent area
-- This ensures data consistency for existing records
UPDATE public.positions p
SET area_id = s.area_id
FROM public.subareas s
WHERE p.subarea_id = s.id
AND p.area_id IS NULL;

-- Step 6: Add comment to document the change
COMMENT ON COLUMN public.positions.area_id IS 'Direct reference to area for area-level positions (e.g., Directors). Either area_id or subarea_id must be set.';
