-- ─── Áreas customizadas ────────────────────────────────────────────────
-- O frontend (src/pages/AreasCargos.tsx) permite criar áreas ALÉM da
-- Estrutura T fixa (acquisition/delivery/operation). Áreas customizadas usam:
--   • type     = slug único gerado por slugifyAreaType() (ex.: "marketing-a1b2c3")
--   • position = 'custom'
--
-- Os CHECK constraints originais só aceitavam os 3 tipos e as 3 posições da
-- Estrutura T, fazendo o INSERT de área custom falhar com HTTP 400
-- (violação de check). Esta migration relaxa os constraints:
--   1. Remove o CHECK de `type` (slugs são arbitrários).
--   2. Recria o CHECK de `position` incluindo 'custom'.
-- O UNIQUE (tenant_id, type) é mantido — o slug tem sufixo aleatório, então
-- nunca colide entre áreas custom nem com os 3 tipos fixos.

ALTER TABLE public.company_areas DROP CONSTRAINT IF EXISTS company_areas_type_check;

ALTER TABLE public.company_areas DROP CONSTRAINT IF EXISTS company_areas_position_check;
ALTER TABLE public.company_areas ADD CONSTRAINT company_areas_position_check
  CHECK ("position" = ANY (ARRAY['left'::text, 'right'::text, 'bottom'::text, 'custom'::text]));
