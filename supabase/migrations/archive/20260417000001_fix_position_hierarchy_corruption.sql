-- ============================================================
-- Migration: Fix corrupted position hierarchy
-- Problem:   Many positions had reports_to_id pointing to
--            "Vendedor (Closer)" across different subareas,
--            and subarea-level positions reported directly to CEO.
-- ============================================================

-- Step 1: Clear cross-subarea wrong parent links
-- (positions whose parent has a different subarea_id — invalid unless parent is area/org level)
UPDATE public.positions AS p
SET reports_to_id = NULL
FROM public.positions AS parent
WHERE p.reports_to_id = parent.id
  AND parent.subarea_id IS NOT NULL
  AND p.subarea_id IS NOT NULL
  AND p.subarea_id != parent.subarea_id;

-- Step 2: Fix subarea positions reporting directly to CEO
-- Route them through the Director of their area instead
UPDATE public.positions AS p
SET reports_to_id = dir.id
FROM public.subareas AS sub
JOIN public.positions AS dir
  ON dir.area_id = sub.area_id
 AND dir.subarea_id IS NULL
 AND dir.level = 1
WHERE p.subarea_id = sub.id
  AND p.reports_to_id IN (
    SELECT id FROM public.positions WHERE level = 0
  )
  AND p.level != 1  -- don't move managers/directors
  AND p.tenant_id = dir.tenant_id;

-- Step 3: Fix positions with no parent that are in subareas
-- (orphans after step 1 — route through area Director via same logic)
UPDATE public.positions AS p
SET reports_to_id = dir.id
FROM public.subareas AS sub
JOIN public.positions AS dir
  ON dir.area_id = sub.area_id
 AND dir.subarea_id IS NULL
 AND dir.level = 1
WHERE p.subarea_id = sub.id
  AND p.reports_to_id IS NULL
  AND p.level != 1
  AND p.tenant_id = dir.tenant_id;
