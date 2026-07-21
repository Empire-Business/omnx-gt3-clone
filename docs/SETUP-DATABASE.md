# Setup de Banco de Dados — GT3 (Empire Manager)

> **LEIA APENAS ESTE DOCUMENTO.** Nenhum outro arquivo é necessário para replicar o banco.
>
> Este guia é a fonte de verdade única. Siga na ordem. Não pule etapas.

---

## Resumo Visual — escolha seu método

```
MÉTODO A — Supabase CLI (recomendado)         MÉTODO B — SQL Editor (sem CLI)
──────────────────────────────────────         ────────────────────────────────
1. supabase link --project-ref <REF>           1. SQL Editor → scripts/setup-database-schema.sql
2. supabase db push                            2. SQL Editor → scripts/setup-database-post-dump.sql
3. Configurar env vars                         3. Configurar env vars
4. bash scripts/setup-edge-functions.sh        4. bash scripts/setup-edge-functions.sh
5. Configurar secrets no painel Supabase       5. Configurar secrets no painel Supabase

Tempo: ~8 minutos                              Tempo: ~12 minutos (copiar/colar manual)
```

---

## O que está incluso

| Incluso no setup | Como é feito |
|------------------|--------------|
| ✅ 69 tabelas públicas, views, functions, triggers | Método A: `supabase db push` / Método B: `setup-database-schema.sql` |
| ✅ RLS policies (269) | Idem |
| ✅ Storage buckets (8) + policies | `00000000000001_post_setup.sql` / `setup-database-post-dump.sql` |
| ✅ Realtime publication (13 tabelas) | Idem |
| ✅ Garantia de RLS em todas as tabelas | Idem |
| ❌ Edge Functions | Deploy separado (Passo 4) |
| ❌ Dados dos seus usuários | Não migrados — banco começa vazio |

---

## Anti-padrões — NÃO faça isso

| Não faça | Por que quebra |
|----------|----------------|
| Rodar migrations em `supabase/migrations/archive/` | Estão desatualizadas, fora de ordem, referenciam tabelas inexistentes |
| Pular o post-setup (Etapa 2/Passo B2) | Uploads falham com "bucket not found" e Realtime não notifica |
| Rodar post-setup antes do schema | Falha — as tabelas ainda não existem |
| Usar `setup-database-complete.sql` no SQL Editor | Inclui schemas internos que causam erro no Free plan — use `setup-database-schema.sql` |
| Esquecer `VITE_SITE_URL` nas env vars | Redirecionamentos de auth e links de convite quebram |

---

## Passo 1 — Criar projeto no Supabase

1. Acesse [app.supabase.com](https://app.supabase.com) e faça login
2. Clique em **"New project"**
3. Defina nome e **Database Password** — anote bem, será necessária depois
4. Aguarde a criação (~1-2 minutos)

> **Plano Free:** `pg_cron` e `pg_net` não são disponíveis. Recorrência automática de tarefas e mensagens agendadas não funcionarão. Todo o restante funciona normalmente.

---

## Método A — Via Supabase CLI (recomendado)

### A.1 — Instalar CLI e fazer login

```bash
# macOS
brew install supabase/tap/supabase

# Linux / Outros
npm install -g supabase

supabase login
```

### A.2 — Linkar ao projeto e aplicar migrations

```bash
# Project Ref: app.supabase.com → seu projeto → Settings → General → Reference ID
supabase link --project-ref <SEU_PROJECT_REF>

# Aplica as 2 migrations em ordem:
# 1. 00000000000000_init.sql   — 69 tabelas, RLS, functions, triggers
# 2. 00000000000001_post_setup.sql — 8 buckets, Realtime, RLS check
supabase db push
```

Tempo: ~60-120 segundos. Não deve haver erros (avisos `NOTICE` são normais).

### A.3 — Validar

```sql
-- No SQL Editor do novo projeto:
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Esperado: 69

SELECT name FROM storage.buckets ORDER BY name;
-- Esperado: 8 buckets
```

Pule para o **Passo 2 — Credenciais** abaixo.

---

## Método B — Via SQL Editor (sem CLI)

### B.1 — Schema completo

1. No Dashboard, vá em **SQL Editor → New query**
2. Abra **`scripts/setup-database-schema.sql`** — selecione TODO e cole
3. Clique **"Run"** — aguarde ~60 segundos

### B.2 — Post-setup (OBRIGATÓRIO)

1. Nova query no SQL Editor
2. Abra **`scripts/setup-database-post-dump.sql`** — selecione TODO e cole
3. Clique **"Run"**

**O que faz:** Cria 8 storage buckets, verifica Realtime publication, garante RLS em todas as tabelas.

---

## Passo 2 — Credenciais do projeto

1. Vá em **Project Settings → API**
2. Copie:
   - **Project URL** (ex: `https://abcdefgh12345678.supabase.co`)
   - **anon public** key (começa com `eyJ...`)
   - **service_role secret** key (começa com `eyJ...` — **nunca exponha no frontend**)

---

## Passo 3 — Variáveis de ambiente

### No Lovable

1. **Settings → Environment Variables**
2. Adicione:

```
VITE_SUPABASE_URL=<Project URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
VITE_SITE_URL=<URL do seu app no Vercel/Lovable>
```

### No Vercel (se deploy separado)

```bash
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add VITE_SITE_URL
```

---

## Passo 4 — Deploy das Edge Functions

Sem as Edge Functions estas funcionalidades **não funcionam**: criação de tenant, notificações, vídeo (LiveKit), IA, webhooks.

```bash
supabase login
supabase link --project-ref <SEU_PROJECT_REF>

bash scripts/setup-edge-functions.sh
```

Este script deploya automaticamente as 26 funções e exibe a lista completa de secrets no final.

---

## Passo 5 — Secrets das Edge Functions

**Dashboard → Project Settings → Edge Functions → Secrets**

**Obrigatórias (todas as funções):**
```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

**Por funcionalidade:**
```
# Vídeo (LiveKit)
LIVEKIT_URL=            LIVEKIT_API_KEY=        LIVEKIT_API_SECRET=

# IA (OpenRouter)
OPENROUTER_API_KEY=

# Email
RESEND_API_KEY=

# Notificações Push
VAPID_PUBLIC_KEY=       VAPID_PRIVATE_KEY=      VAPID_SUBJECT=mailto:seu@email.com
# Gerar: npx web-push generate-vapid-keys

# Transcrição de áudio
SONIOX_API_KEY=

# Gravações (S3/R2 — opcional)
S3_ENDPOINT=            S3_BUCKET=              S3_ACCESS_KEY=
S3_SECRET_KEY=          S3_PUBLIC_URL=

# App
SITE_URL=https://seu-dominio.vercel.app
```

> ⚠️ **Duplicando para outra empresa?** As chaves dos serviços externos (LiveKit, OpenRouter, etc.) também devem ser trocadas. O novo cliente precisa criar suas próprias contas. **Nunca compartilhe chaves do projeto original.**

---

## Passo 6 — Reconectar chaves de serviços externos

Se este projeto está sendo repassado para outra pessoa/empresa:

| Serviço | Como obter novas chaves |
|---------|------------------------|
| **LiveKit** | [livekit.io](https://livekit.io) → criar conta → novo projeto |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) → criar conta → API Key |
| **Resend** | [resend.com](https://resend.com) → criar conta → API Key |
| **Soniox** | [soniox.com](https://soniox.com) → criar conta → API Key |
| **Web Push** | `npx web-push generate-vapid-keys` (local, grátis) |
| **S3/R2** | Cloudflare R2, AWS S3 ou MinIO → criar bucket |

---

## Passo 7 — Testar

1. Acesse a URL do app
2. Crie uma conta de teste
3. Verifique:
   - [ ] Login e criação de conta funcionam
   - [ ] Dashboard carrega sem erros
   - [ ] Upload de avatar funciona (testa storage bucket)
   - [ ] Mensagem no chat aparece em tempo real (testa Realtime)
   - [ ] Criar tarefa/projeto funciona

---

## Checklist Final

```
[ ] Projeto Supabase criado e projeto linkado
[ ] Schema aplicado (supabase db push OU setup-database-schema.sql)
[ ] Post-setup aplicado (incluso em db push OU setup-database-post-dump.sql)
[ ] Env vars configuradas (VITE_SUPABASE_URL, PUBLISHABLE_KEY, SERVICE_ROLE, SITE_URL)
[ ] Edge Functions deployadas (bash scripts/setup-edge-functions.sh)
[ ] Secrets obrigatórias configuradas (SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY)
[ ] Secrets de serviços externos configuradas (LiveKit, OpenRouter, etc.)
[ ] App testado: login + upload + chat em tempo real
```

---

## Troubleshooting

**"ERROR: must be owner of extension pg_cron"**
→ Plano Free. Esperado — recorrência automática não funciona. Restante ok.

**"relation X already exists"**
→ Você rodou o script mais de uma vez. É apenas aviso, não erro fatal.

**"Bucket not found" ao fazer upload**
→ Passo A.2/B.2 não foi executado. Rode `supabase db push` ou o post-dump.

**Realtime não notifica**
→ Mesmo que acima — o post-setup configura as tabelas na publication.

**Edge Function falha no deploy**
→ Verifique as secrets obrigatórias no Dashboard.

**App não conecta ao Supabase**
→ Verifique `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. URL deve terminar em `.supabase.co`.

---

> Última atualização: 2026-05-07 | Schema: 69 tabelas públicas, 269 policies, 8 buckets, 13 tabelas Realtime, 26 Edge Functions
