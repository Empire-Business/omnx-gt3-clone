-- ══════════════════════════════════════════════════════════════
-- APROVAR OS ITENS DA MESMA REUNIÃO DUAS VEZES PARA DE DUPLICAR
--
-- `meeting_approved_items` foi criada justamente para registrar o que já
-- virou tarefa/projeto a partir de uma reunião. Só que a Edge Function
-- `meeting-approve` **escreve nela e nunca a lê**, e a tabela não tem
-- nenhuma restrição de unicidade (só a PK em `id`). Nenhuma tela do
-- frontend consulta a tabela — a única referência a ela em `src/` é o
-- `types.ts` gerado.
--
-- Resultado: aprovar a mesma reunião de novo — voltando na tela, por
-- retentativa de rede do `functions.invoke`, ou reprocessando a IA — cria
-- as tarefas outra vez. A trilha que existia para impedir isso estava
-- sendo preenchida e ignorada.
--
-- Checar no código não basta: duas execuções simultâneas passam juntas
-- pela verificação e inserem as duas. A garantia tem que estar no banco.
--
-- Esta migration cria a chave de deduplicação e o índice único. A função
-- passa a RESERVAR a linha em `meeting_approved_items` antes de criar a
-- tarefa (INSERT ... ON CONFLICT DO NOTHING RETURNING): só cria o que
-- conseguiu reservar. Mesmo padrão já usado em `notify-upcoming-events`.
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. Chave de deduplicação
--    A sugestão da IA não tem id estável, então a identidade do item é
--    (reunião, tipo, título normalizado). Normalizar evita que espaço a
--    mais ou caixa diferente criem um "item novo".
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.meeting_approved_items
  ADD COLUMN IF NOT EXISTS suggestion_key text;

COMMENT ON COLUMN public.meeting_approved_items.suggestion_key IS
  'Título normalizado da sugestão (minúsculo, sem espaço duplicado). Junto de (meeting_id, item_type) identifica o item e impede aprovação em duplicidade.';

-- ─────────────────────────────────────────────────────────────
-- 2. Backfill do histórico
--    Preenche a chave a partir do título já guardado em
--    `original_suggestion`. Linhas sem título utilizável caem no id, que
--    é único por construção.
-- ─────────────────────────────────────────────────────────────
UPDATE public.meeting_approved_items
   SET suggestion_key = COALESCE(
         NULLIF(lower(regexp_replace(trim(original_suggestion->>'title'), '\s+', ' ', 'g')), ''),
         NULLIF(lower(regexp_replace(trim(original_suggestion->>'name'),  '\s+', ' ', 'g')), ''),
         id::text
       )
 WHERE suggestion_key IS NULL;

-- As duplicatas que JÁ existem em produção (o bug) impediriam a criação do
-- índice único. Elas são histórico e não podem ser apagadas: preservamos a
-- primeira aprovação de cada grupo com a chave limpa e desambiguamos as
-- demais com o próprio id. Assim o índice entra sem perder registro nenhum.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY meeting_id, item_type, suggestion_key
           ORDER BY approved_at NULLS LAST, id
         ) AS rn
    FROM public.meeting_approved_items
)
UPDATE public.meeting_approved_items m
   SET suggestion_key = m.suggestion_key || ' #dup:' || m.id::text
  FROM ranked r
 WHERE r.id = m.id
   AND r.rn > 1;

ALTER TABLE public.meeting_approved_items
  ALTER COLUMN suggestion_key SET NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. A trava
-- ─────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS meeting_approved_items_dedupe_uq
  ON public.meeting_approved_items (meeting_id, item_type, suggestion_key);

-- Consulta quente: "o que já foi aprovado nesta reunião?"
CREATE INDEX IF NOT EXISTS meeting_approved_items_meeting_idx
  ON public.meeting_approved_items (meeting_id, item_type);

COMMENT ON TABLE public.meeting_approved_items IS
  'Itens da reunião já convertidos em tarefa/projeto. A UNIQUE (meeting_id, item_type, suggestion_key) é a trava que impede aprovar o mesmo item duas vezes — a Edge Function meeting-approve reserva a linha aqui ANTES de criar o registro real.';
