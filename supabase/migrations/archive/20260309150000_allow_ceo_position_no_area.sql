-- Allow CEO-level positions (level = 0) to exist without area_id or subarea_id
-- Previously the constraint required every position to belong to an area or subarea,
-- but the CEO sits above all areas and should not be tied to one.

ALTER TABLE public.positions
DROP CONSTRAINT IF EXISTS positions_area_or_subarea_check;

ALTER TABLE public.positions
ADD CONSTRAINT positions_area_or_subarea_check
CHECK (level = 0 OR area_id IS NOT NULL OR subarea_id IS NOT NULL);
