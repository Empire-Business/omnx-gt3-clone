# SEGURANÇA — Remediação de Brechas Críticas (2026-07-13)

> Registro da correção das brechas identificadas em `OMNX-GT3-SEGURANCA.md`.
> Branch: `fix/seguranca-brechas-criticas`.
> **NADA disto protege produção até o deploy manual ser executado** (ver seção Deploy).

## Contexto de ambiente

- Supabase único e de **produção**: `opbdoulspzlabxzevffc` (clientes/dados reais).
- Frontend publicado em Vercel (`main`) **e** Lovable (`gt3.omnx.pro`) — ambos só sobem frontend.
- **Migrations e Edge Functions NÃO sobem por merge** — exigem `supabase db push` / `supabase functions deploy` manuais.

---

## Correções aplicadas (código na branch)

| Brecha | Gravidade | Correção | Arquivo |
|--------|-----------|----------|---------|
| 1 — troca de tenant via update do perfil | Crítica | `WITH CHECK` trava `tenant_id` em `profiles_update_own` | `migrations/20260713100000_fix_profiles_update_tenant_lock.sql` |
| 2 — auto-cadastro em qualquer tenant | Crítica | Tabela `tenant_invitations` + `handle_new_user` valida convite (tenant+email+token) | `migrations/20260713110000_fix_handle_new_user_invitations.sql` + `create-employee`/`create-tenant` |
| 3 — sequestro de conta cross-tenant | Crítica | Recusa 409 quando e-mail é de outro tenant; sem migração nem senha | `functions/create-employee/index.ts` |
| 4 — vazamento de dados via get_user_info | Crítica | Isolamento vale para TODAS as ações; ausente = negar | `functions/manage-access/index.ts` |
| 5 — SECURITY DEFINER com tenant livre | Crítica | `REVOKE` de PUBLIC/anon/authenticated; só `service_role` | `migrations/20260713120000_revoke_tenant_definer_functions.sql` |
| 6 — Edge Functions sem auth | Alta | `auth.getUser()` (JWT) em `send-chat-notification` e `process-ai` | ambas as functions |
| 7 — token Supabase no histórico Git | Crítica | **Ação no Dashboard — pendente do dono** (ver abaixo) | — |

### Decisão de engenharia — desvio do relatório na Brecha 6

O relatório sugeria `x-internal-secret` para `send-chat-notification`. **Rejeitado:** essa função é
chamada **pelo frontend** (`src/hooks/useChat.ts`) via `supabase.functions.invoke`, que envia o JWT do
usuário — um segredo compartilhado quebraria o chat em produção. O controle correto para função
client-invoked é validar o **JWT** (`auth.getUser()`), padrão já usado em `meeting-ai`. O `x-internal-secret`
permanece adequado apenas para `send-push` (server-to-server). Mesma lógica aplicada a `process-ai`.

### Decisão de engenharia — Brecha 5 sem trocar assinatura

O relatório sugeria reescrever `ensure_area_channel` para derivar o tenant da sessão. **Rejeitado:** a
função é chamada apenas por trigger-functions `SECURITY DEFINER` (owned por `postgres`) que passam
legitimamente `NEW.tenant_id` (contexto onde `auth.uid()` pode ser nulo, ex.: backfills). Trocar a
assinatura quebraria esses callers. O `REVOKE` de PUBLIC/anon/authenticated fecha o vetor de ataque
(RPC direto do navegador) sem afetar triggers (rodam como owner) nem as Edge Functions dos bots
(rodam como `service_role`, que mantém `GRANT`). Frontend não chama essas RPC (confirmado).

---

## Testes de regressão

> ⚠️ O harness de teste do projeto é Vitest + jsdom (frontend). Ele **não** exercita policies RLS do
> Postgres nem Edge Functions Deno. Testes de regressão reais destas brechas são de nível **SQL/API**.
> Abaixo os roteiros que travam cada brecha — rodar contra um banco (idealmente cópia via
> `INSTRUCOES-REPLICACAO-BANCO.md`, nunca destrutivamente em produção).

**Brecha 1** — autenticado como usuário comum, tentar:
```sql
UPDATE public.profiles SET tenant_id = '<outro-tenant>' WHERE user_id = auth.uid();
-- ESPERADO: 0 linhas / erro de policy (WITH CHECK). Editar full_name deve continuar funcionando.
```

**Brecha 2** — `supabase.auth.signUp({ email, password, options: { data: { invited_tenant_id: '<vitima>' }}})`
sem convite correspondente → o profile resultante NÃO pode ter `tenant_id = <vitima>` (deve criar tenant próprio).

**Brecha 3** — `POST /functions/v1/create-employee` com e-mail de usuário de outro tenant → **409**,
sem alterar `profiles.tenant_id` da vítima e sem `temp_password` na resposta.

**Brecha 4** — `POST /functions/v1/manage-access { action: 'get_user_info', target_user_id: '<outro-tenant>' }` → **403**.

**Brecha 5** — `POST /rest/v1/rpc/ensure_area_channel` (ou `ensure_omnx_bot`) como authenticated → **negado** (sem EXECUTE).

**Brecha 6** — `POST /functions/v1/send-chat-notification` e `/process-ai` sem header `Authorization` → **401**.

---

## DEPLOY — ✅ APLICADO EM PRODUÇÃO (2026-07-13)

> ⚠️ **NÃO usar `supabase db push` neste projeto.** O histórico de migrations do CLI
> está fora de sincronia com o remoto — produção sempre foi gerenciada via
> **Management API**, não via CLI. Um `db push` tentaria reaplicar dezenas de
> migrations já aplicadas + as migrations paralelas inacabadas (`20260713140000`
> tenant_features, `20260713160000`). Aplicar sempre **individualmente** via API.

Executado em 2026-07-13 (backup COMPLETED do dia às 07:24 confirmado antes):
- Migrations 1, 2, 5 aplicadas via `POST /v1/projects/opbdoulspzlabxzevffc/database/query`,
  uma a uma. Verificado no remoto: `profiles_update_own` com WITH CHECK; `tenant_invitations`
  criada + RLS ligada; `authenticated` SEM EXECUTE nas 3 funções DEFINER (service_role mantém).
- Edge Functions redeployadas: `supabase functions deploy <nome> --project-ref opbdoulspzlabxzevffc`
  para create-employee, create-tenant, manage-access, send-chat-notification, process-ai.
- Smoke test em produção: `process-ai` e `send-chat-notification` sem auth → **401**. ✅

**Rollback:** as migrations são aditivas/reversíveis —
- Brecha 1/5: recriar a policy/GRANTs antigos (guardados no `00000000000000_init.sql`).
- Brecha 2: `DROP FUNCTION` revertendo para `20260512150000` + `DROP TABLE tenant_invitations`.
- Edge Functions: `git revert` + `supabase functions deploy` da versão anterior.

---

## Pendente do dono (Dashboard Supabase — não é código)

1. **Brecha 7 — URGENTE** — Account → Access Tokens → revogar token `sbp_563dff32...` e conferir Audit Log.
   ⚠️ Confirmado em 2026-07-13 que o `SUPABASE_ACCESS_TOKEN` do `.env` **ainda está ativo**
   (foi usado para o deploy). Se for o mesmo token vazado, **revogar e gerar um novo de 7 dias**.
2. Auth → Attack Protection → habilitar CAPTCHA (login/signup/reset).
3. Auth → Rate Limits → endurecer limites.
4. Pós-Brecha 1: auditar `profiles` por `tenant_id` inconsistente com o histórico de convite.
