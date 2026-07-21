-- ─── BRECHA 1 (Crítica) — Troca de tenant via update do próprio perfil ──────
--
-- A policy `profiles_update_own` tinha apenas `USING (user_id = auth.uid())` e
-- NENHUM `WITH CHECK`. Em Postgres, sem WITH CHECK explícito num UPDATE, a
-- condição do USING é reaproveitada para a linha nova — o que impede editar o
-- perfil de OUTRO usuário, mas NÃO impede o próprio usuário de reescrever seu
-- `tenant_id`. Como praticamente todo o isolamento multi-tenant do sistema
-- deriva de get_user_tenant_id() (que lê profiles.tenant_id), corromper esse
-- campo corrompe o isolamento inteiro: o usuário passa a enxergar os dados de
-- qualquer outra empresa cliente.
--
-- Correção: WITH CHECK explícito que exige que o tenant_id da linha nova seja
-- igual ao tenant_id atual do usuário (lido por get_user_tenant_id(), que é
-- SECURITY DEFINER e lê o valor JÁ COMMITADO — ou seja, o tenant antigo).
-- Resultado: o usuário continua editando nome/avatar/status, mas qualquer
-- tentativa de alterar o próprio tenant_id via UPDATE direto é rejeitada.
--
-- Troca legítima de tenant (se um dia existir usuário multi-empresa) deverá
-- ser feita por função de servidor validada (service_role / SECURITY DEFINER),
-- nunca por UPDATE direto vindo do navegador.

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = public.get_user_tenant_id()
  );

COMMENT ON POLICY profiles_update_own ON public.profiles IS
  'Usuário edita apenas o próprio perfil e NÃO pode alterar o próprio tenant_id (WITH CHECK trava a coluna via get_user_tenant_id). Ver BRECHA 1 — docs/SEGURANCA.md.';
