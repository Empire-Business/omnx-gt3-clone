-- ─── BRECHA 5 (Crítica) — SECURITY DEFINER com tenant como parâmetro livre ───
--
-- Três funções SECURITY DEFINER recebem "para qual empresa" (p_tenant_id) como
-- argumento e NÃO validam que o chamador pertence a esse tenant. Sem nenhum
-- REVOKE customizado, o default do Postgres deixa QUALQUER usuário autenticado
-- (ou anon) chamá-las via REST (POST /rest/v1/rpc/...):
--
--   • ensure_area_channel(area, tenant, nome) — cria canal de chat dentro da
--     empresa informada e adiciona os admins dela como membros.
--   • ensure_omnx_bot(tenant) / ensure_system_bot(tenant) — INSERT direto em
--     auth.users criando um usuário-bot dentro da empresa informada.
--
-- Análise dos chamadores legítimos (grep no repo):
--   • ensure_area_channel é chamada APENAS por trigger-functions SECURITY
--     DEFINER (trg_area_channel_create, feed broadcast triggers) — todas
--     owned por `postgres`. Chamadas aninhadas dentro de SECURITY DEFINER
--     rodam com os privilégios do owner, então NÃO dependem do EXECUTE do
--     usuário final. O frontend NÃO chama essas RPC (confirmado no grep de src/).
--   • ensure_omnx_bot / ensure_system_bot são chamadas por Edge Functions
--     (omnx-bot, system-bot-notify) usando o cliente service_role.
--
-- Correção: revogar EXECUTE de PUBLIC/anon/authenticated e conceder apenas a
-- service_role. Assim o vetor de ataque via RPC do navegador é fechado, sem
-- quebrar triggers internos (rodam como owner) nem as Edge Functions
-- (rodam como service_role). Esta é a correção correta e de menor risco —
-- reescrever assinaturas para derivar o tenant da sessão quebraria os
-- trigger-callers, que passam legitimamente o tenant da linha (NEW.tenant_id).

REVOKE ALL ON FUNCTION public.ensure_area_channel(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_area_channel(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_area_channel(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_area_channel(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_omnx_bot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_omnx_bot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_omnx_bot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_omnx_bot(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_system_bot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_system_bot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_system_bot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_system_bot(uuid) TO service_role;
