-- Fix: positions with subarea_id set that still report directly to CEO
-- (e.g. "Gerente de vendas" level=1 was excluded from previous migration)
UPDATE public.positions AS p
SET reports_to_id = dir.id
FROM public.subareas AS sub,
     public.positions AS dir
WHERE p.subarea_id = sub.id
  AND dir.area_id = sub.area_id
  AND dir.subarea_id IS NULL
  AND dir.level = 1
  AND dir.id != p.id
  AND p.reports_to_id IN (SELECT id FROM public.positions WHERE level = 0)
  AND p.tenant_id = dir.tenant_id;
