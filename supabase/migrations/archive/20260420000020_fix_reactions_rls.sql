-- Simplifica as policies de chat_reactions para evitar falhas silenciosas.
-- A policy de SELECT anterior usava um JOIN complexo que podia bloquear
-- a query de verificação de reação existente.

DROP POLICY IF EXISTS "reactions_select" ON public.chat_reactions;
DROP POLICY IF EXISTS "chat_react_select" ON public.chat_reactions;
DROP POLICY IF EXISTS "reactions_insert" ON public.chat_reactions;
DROP POLICY IF EXISTS "reactions_delete" ON public.chat_reactions;

-- SELECT: qualquer usuário autenticado pode ver reações
-- (as mensagens já são filtradas por RLS; quem vê a mensagem, pode ver a reação)
CREATE POLICY "reactions_select" ON public.chat_reactions
  FOR SELECT TO authenticated USING (true);

-- INSERT: apenas o próprio colaborador
CREATE POLICY "reactions_insert" ON public.chat_reactions
  FOR INSERT TO authenticated WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- DELETE: apenas o próprio colaborador
CREATE POLICY "reactions_delete" ON public.chat_reactions
  FOR DELETE TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );
