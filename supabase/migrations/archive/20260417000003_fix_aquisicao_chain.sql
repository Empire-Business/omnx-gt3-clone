-- Fix Aquisição hierarchy chain:
-- Líder de pré-vendas → Vendedor (Closer) → SDR

-- Step 1: Vendedor (Closer) reports to Líder de pré-vendas
UPDATE public.positions AS vendedor
SET reports_to_id = lider.id
FROM public.positions AS lider
WHERE vendedor.title = 'Vendedor (Closer)'
  AND lider.title = 'Líder de pré-vendas'
  AND vendedor.tenant_id = lider.tenant_id;

-- Step 2: SDR reports to Vendedor (Closer)
UPDATE public.positions AS sdr
SET reports_to_id = vendedor.id
FROM public.positions AS vendedor
WHERE sdr.title = 'SDR'
  AND vendedor.title = 'Vendedor (Closer)'
  AND sdr.tenant_id = vendedor.tenant_id;

-- Step 3: Gerente de vendas reports to Diretor of its area (via subarea lookup)
UPDATE public.positions AS p
SET reports_to_id = dir.id
FROM public.subareas AS sub,
     public.positions AS dir
WHERE p.title = 'Gerente de vendas'
  AND p.subarea_id = sub.id
  AND dir.area_id = sub.area_id
  AND dir.subarea_id IS NULL
  AND dir.level = 1
  AND dir.id != p.id
  AND p.tenant_id = dir.tenant_id;
