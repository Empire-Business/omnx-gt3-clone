# Instruções de Replicação do Banco — Copie e Cole no Sistema Novo

> Este arquivo é um **prompt pronto** para copiar e colar em outro agente de IA, no Lovable, ou enviar para um desenvolvedor. Não edite o conteúdo abaixo — ele é a fonte de verdade.

---

## Opção A — Via Supabase CLI (recomendado para desenvolvedores)

```
Você está replicando o banco de dados GT3 (Empire Manager) via Supabase CLI.

Siga EXATAMENTE esta ordem. Não pule etapas.

PRÉ-REQUISITO: Supabase CLI instalado
  macOS:   brew install supabase/tap/supabase
  Linux:   https://supabase.com/docs/guides/cli/getting-started
  Login:   supabase login

ETAPA 1 — Linkar o novo projeto Supabase
  supabase link --project-ref <SEU_PROJECT_REF>
  (Project Ref: app.supabase.com → seu projeto → Settings → General → Reference ID)

ETAPA 2 — Aplicar as migrations (schema completo + post-setup)
  supabase db push
  Aplica em ordem:
    1. supabase/migrations/00000000000000_init.sql   — 69 tabelas, RLS, functions, triggers
    2. supabase/migrations/00000000000001_post_setup.sql — 8 storage buckets + verificações

  Tempo estimado: 60–120 segundos.
  AVISO: requer plano Pro+ para extensões pg_cron e pg_net.
    No plano Free, recorrência automática de tarefas não funciona.

ETAPA 3 — Variáveis de ambiente
  No painel do Lovable/Vercel, configure:
    VITE_SUPABASE_URL=<Project URL do Supabase>
    VITE_SUPABASE_PUBLISHABLE_KEY=<anon public key>
    SUPABASE_SERVICE_ROLE_KEY=<service_role key>
    VITE_SITE_URL=<URL do app>

ETAPA 4 — Deploy das Edge Functions
  bash scripts/setup-edge-functions.sh
  (o script imprime a lista de secrets necessários no final da execução)

ETAPA 5 — Configurar secrets das Edge Functions
  Dashboard Supabase → Project Settings → Edge Functions → Secrets
  Obrigatórios para todas as funções:
    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
  Para reuniões (LiveKit):
    LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
  Para IA (OpenRouter):
    OPENROUTER_API_KEY
  Para notificações push/email:
    RESEND_API_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
  Para transcrição de áudio:
    SONIOX_API_KEY
  Para gravações S3 (opcional):
    S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL
  Para redirecionamentos:
    SITE_URL=https://seu-dominio.vercel.app

O QUE NÃO FAZER:
  - NÃO rode as migrations em supabase/migrations/archive/ — estão fora de ordem e quebradas.
  - NÃO execute setup-database-complete.sql no SQL Editor se já rodou supabase db push.
```

---

## Opção B — Via SQL Editor (fallback, sem CLI)

```
Você está replicando o banco de dados GT3 (Empire Manager) via SQL Editor do Supabase.

Siga EXATAMENTE esta ordem. Não pule etapas. Não use as migrations legadas.

ETAPA 1 — Schema completo (obrigatório)
  Arquivo: scripts/setup-database-schema.sql  ← USE ESTE (limpo, sem meta-comandos psql)
  Ação: Cole TODO o conteúdo no SQL Editor do novo projeto Supabase e execute.
  Tempo: ~60-120 segundos.
  O que faz: Cria ~43 tabelas base + RLS policies + functions + triggers.

  ALTERNATIVA (schema mais completo mas requer plano Pro+):
  Arquivo: scripts/setup-database-complete.sql (69 tabelas, inclui schemas internos)
  Use somente se quiser o dump completo — pode ter avisos em Free plan.

ETAPA 2 — Configuração pós-dump (obrigatório)
  Arquivo: scripts/setup-database-post-dump.sql
  Ação: Cole TODO o conteúdo no SQL Editor e execute.
  O que faz: Cria 8 storage buckets, verifica Realtime publication, garante RLS.
  AVISO: Sem esta etapa, uploads de arquivos e notificações em tempo real NÃO funcionarão.

ETAPA 3 — Variáveis de ambiente (obrigatório)
  No painel do Lovable/Vercel, configure:
    VITE_SUPABASE_URL=<Project URL do Supabase>
    VITE_SUPABASE_PUBLISHABLE_KEY=<anon public key>
    SUPABASE_SERVICE_ROLE_KEY=<service_role key>
    VITE_SITE_URL=<URL do app>

ETAPA 4 — Edge Functions (recomendado)
  Se o cliente usar funcionalidades avançadas (notificações, IA, vídeo, webhooks):
  1. Instale Supabase CLI: brew install supabase/tap/supabase
  2. Login: supabase login
  3. Link: supabase link --project-ref <REF>
  4. Execute: bash scripts/setup-edge-functions.sh
  5. Configure secrets em Project Settings → Edge Functions → Secrets

O QUE NÃO FAZER:
  - NÃO rode as migrations em supabase/migrations/archive/ — estão desatualizadas e quebradas.
  - NÃO use setup-database-complete.sql se já rodou setup-database-schema.sql (schemas conflitantes).
  - NÃO esqueça a Etapa 2 (post-dump).
```

---

## Resumo Visual

```
OPÇÃO A — Supabase CLI (recomendado)       OPÇÃO B — SQL Editor (fallback)
─────────────────────────────────────       ────────────────────────────────────────
supabase link --project-ref <REF>           SQL Editor → scripts/setup-database-schema.sql
supabase db push                            SQL Editor → scripts/setup-database-post-dump.sql
                │                                          │
                ├── 00000000000000_init.sql (69 tabelas)  └── 43 tabelas base
                └── 00000000000001_post_setup.sql (8 buckets)
                                 │
                      Mesma Etapa 3-5 para ambas:
                  → Configurar env vars (VITE_SUPABASE_URL, etc.)
                  → bash scripts/setup-edge-functions.sh
                  → Configurar secrets no painel Supabase
```

---

## Anti-padrões (o sistema novo DEVE saber disso)

| Não faça | Por que |
|----------|---------|
| Rodar `supabase db push` com as migrations em `archive/` | Elas estão fora de ordem, têm seeds misturados e referenciam tabelas inexistentes |
| Criar buckets manualmente pelo Dashboard | O script `setup-database-post-dump.sql` já faz isso com as configurações corretas |
| Ignorar o `setup-database-post-dump.sql` | Uploads falharão com "bucket not found" e Realtime não notificará |
| Rodar `setup-database-complete.sql` via SQL Editor como primeira etapa | Inclui schemas internos que podem causar conflito — prefira `setup-database-schema.sql` |

---

> Última atualização: 2026-05-07
