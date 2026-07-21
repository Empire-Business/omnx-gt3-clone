-- Fix same-subarea hierarchy where alphabetical sort produced wrong parent.
-- Rule: within a subarea, "Gerente de X" is parent of other positions at the same level.

-- Gerente de atendimento → Agente de atendimento
UPDATE public.positions AS p
SET reports_to_id = gerente.id
FROM public.positions AS gerente
WHERE p.title = 'Agente de atendimento'
  AND gerente.title = 'Gerente de atendimento'
  AND p.subarea_id = gerente.subarea_id
  AND p.tenant_id = gerente.tenant_id;

-- Gerente de tecnologia → Assistente de tecnologia
UPDATE public.positions AS p
SET reports_to_id = gerente.id
FROM public.positions AS gerente
WHERE p.title = 'Assistente de tecnologia'
  AND gerente.title = 'Gerente de tecnologia'
  AND p.subarea_id = gerente.subarea_id
  AND p.tenant_id = gerente.tenant_id;

-- Gerente de marketing → Gestor de tráfego
UPDATE public.positions AS p
SET reports_to_id = gerente.id
FROM public.positions AS gerente
WHERE p.title = 'Gestor de tráfego'
  AND gerente.title = 'Gerente de marketing'
  AND p.subarea_id = gerente.subarea_id
  AND p.tenant_id = gerente.tenant_id;
