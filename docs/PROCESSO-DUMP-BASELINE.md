# Processo: Gerar Baseline de Banco + Migrations para Replicação

> Quando usar: o schema de produção evoluiu (novas tabelas, colunas, policies) e você quer regenerar o baseline para que novos projetos consigam replicar tudo via `supabase db push`.
>
> Este documento é o processo completo e real, testado em 2026-05-07.

---

## Visão Geral

```
Banco de produção
       │
       ▼  pg_dump --schema-only --no-owner --no-privileges
scripts/setup-database-complete.sql   ← dump bruto (preservar, não editar)
       │
       ▼  filtrar (remover schemas internos + comandos psql + event triggers)
supabase/migrations/00000000000000_init.sql   ← migration limpa para supabase db push
       │
       ▼  + buckets + realtime fallback
supabase/migrations/00000000000001_post_setup.sql   ← executado em segundo lugar
       │
       ▼
Banco destino recriado via: supabase db push
```

---

## Pré-requisitos

- Docker instalado (para rodar pg_dump sem instalar PostgreSQL local)
- Supabase CLI instalado (`brew install supabase/tap/supabase`)
- Acesso ao banco de produção (senha do banco — Project Settings → Database)

---

## Passo 1 — Gerar o dump bruto

```bash
# Connection string do banco de produção:
# app.supabase.com → seu projeto → Project Settings → Database → Connection string → URI
CONNECTION_STRING="postgresql://postgres:SENHA@db.REF.supabase.co:5432/postgres"

docker run --rm postgres:16-alpine pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  "$CONNECTION_STRING" \
  > scripts/setup-database-complete.sql
```

**Flags obrigatórias:**

| Flag | Por que |
|------|---------|
| `--schema-only` | Sem dados de usuários no dump |
| `--no-owner` | Remove `OWNER TO` — roles do novo projeto são diferentes |
| `--no-privileges` | Remove `GRANT/REVOKE` — evita conflito com roles do novo projeto |

**Não usar:**
- `--clean` e `--if-exists` — adicionam `DROP IF EXISTS` que podem ser destrutivos no destino
- `--quote-all-identifiers` — gera SQL mais verboso sem benefício real aqui

**Tamanho esperado:** 300KB–600KB para projetos médios (60–100 tabelas públicas).

> Salve o dump bruto em `scripts/setup-database-complete.sql` — ele é referência histórica. Nunca edite diretamente o que vai para novos projetos sem criar uma cópia filtrada.

---

## Passo 2 — Criar a migration filtrada

O dump bruto **não pode ser usado diretamente** como migration. Ele contém:

| Problema | Por que falha | Como detectar |
|----------|---------------|---------------|
| `\restrict ...` e `\unrestrict ...` | Psql meta-commands, não são SQL válido | `grep '\\restrict\|\\unrestrict' dump.sql` |
| `CREATE SCHEMA auth/extensions/graphql/...` | Schemas já existem em todo projeto Supabase novo — erro 42P06 | `grep '^CREATE SCHEMA' dump.sql` |
| `CREATE PUBLICATION supabase_realtime` | Publication já existe — erro 42710 | `grep '^CREATE PUBLICATION' dump.sql` |
| `CREATE EVENT TRIGGER pgrst_ddl_watch` etc. | Event triggers já existem — erro 42723 | `grep '^CREATE EVENT TRIGGER' dump.sql` |

### 2.1 — Copiar o dump como ponto de partida

```bash
cp scripts/setup-database-complete.sql supabase/migrations/00000000000000_init.sql
```

### 2.2 — Aplicar o filtro

Execute cada bloco abaixo em ordem. São todos `sed` ou remoções manuais precisas.

**Remover meta-comandos psql** (não são SQL, causam syntax error):
```bash
# Encontra todas as linhas \restrict e \unrestrict
grep -n '\\\\restrict\|\\\\unrestrict' supabase/migrations/00000000000000_init.sql
# Remove cada uma manualmente via editor ou:
sed -i '' '/^\\restrict /d; /^\\unrestrict /d' supabase/migrations/00000000000000_init.sql
```

**Remover criação de schemas internos:**
Os schemas `auth`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`, `realtime`, `storage`, `supabase_migrations`, `vault` já existem. Remova os blocos de `CREATE SCHEMA` + `ALTER SCHEMA ... OWNER`:

```bash
# Identifica os blocos
grep -n '^CREATE SCHEMA\|^ALTER SCHEMA.*OWNER' supabase/migrations/00000000000000_init.sql
# Remove as linhas de CREATE SCHEMA para schemas internos
sed -i '' '/^CREATE SCHEMA auth;/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^CREATE SCHEMA extensions;/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^CREATE SCHEMA graphql;/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^CREATE SCHEMA graphql_public;/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^CREATE SCHEMA pgbouncer;/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^CREATE SCHEMA realtime;/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^CREATE SCHEMA storage;/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^CREATE SCHEMA supabase_migrations;/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^CREATE SCHEMA vault;/d' supabase/migrations/00000000000000_init.sql
# Remove ALTER SCHEMA ... OWNER para schemas internos
sed -i '' '/^ALTER SCHEMA auth OWNER/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^ALTER SCHEMA extensions OWNER/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^ALTER SCHEMA graphql OWNER/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^ALTER SCHEMA graphql_public OWNER/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^ALTER SCHEMA pgbouncer OWNER/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^ALTER SCHEMA realtime OWNER/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^ALTER SCHEMA storage OWNER/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^ALTER SCHEMA supabase_migrations OWNER/d' supabase/migrations/00000000000000_init.sql
sed -i '' '/^ALTER SCHEMA vault OWNER/d' supabase/migrations/00000000000000_init.sql
```

**Remover CREATE PUBLICATION** (já existe em todo projeto Supabase):
```bash
grep -n '^CREATE PUBLICATION' supabase/migrations/00000000000000_init.sql
sed -i '' '/^CREATE PUBLICATION/d' supabase/migrations/00000000000000_init.sql
```

**Remover CREATE EVENT TRIGGER** (já existem em todo projeto Supabase):

Os event triggers problemáticos são: `issue_graphql_placeholder`, `issue_pg_cron_access`, `issue_pg_graphql_access`, `issue_pg_net_access`, `pgrst_ddl_watch`, `pgrst_drop_watch`.

Como cada um ocupa um bloco com comentário, a remoção mais limpa é pelo editor:
```bash
# Identificar linhas
grep -n '^CREATE EVENT TRIGGER' supabase/migrations/00000000000000_init.sql
```
Remova cada bloco completo (incluindo o comentário `--` acima e as linhas em branco ao redor).

**Remover objetos dos schemas internos** (tabelas, funções, triggers em `auth`, `storage`, etc.):

Este é o maior volume de remoção. O dump geralmente tem grandes seções de DDL para `auth.users`, `storage.objects`, etc. que não podem ser recriados.

```bash
# Verificar se há DDL de schemas internos que não foram removidos
grep -c '^CREATE TABLE auth\.\|^CREATE TABLE storage\.\|^CREATE TABLE extensions\.' \
  supabase/migrations/00000000000000_init.sql
```

Se retornar > 0, os blocos precisam ser removidos manualmente — cada bloco começa com:
```
-- Name: xxx; Type: TABLE; Schema: auth; Owner: xxx
```

> **ATENÇÃO:** Preserve as `storage.objects` POLICIES — elas são políticas de acesso para os buckets e devem permanecer. Remova apenas os `CREATE TABLE storage.objects` e similares, não as `CREATE POLICY ... ON storage.objects`.

---

## Passo 3 — Checklist de verificação

Execute cada verificação. Qualquer resultado diferente do esperado requer correção antes de continuar.

```bash
INIT=supabase/migrations/00000000000000_init.sql

echo "=== ITENS QUE DEVEM SER ZERO ==="
echo -n "\\restrict e \\unrestrict: "
grep -c '\\\\restrict\|\\\\unrestrict' "$INIT" || echo 0

echo -n "CREATE SCHEMA internos: "
grep -c '^CREATE SCHEMA auth\|^CREATE SCHEMA extensions\|^CREATE SCHEMA graphql\|^CREATE SCHEMA realtime\|^CREATE SCHEMA storage\|^CREATE SCHEMA vault' "$INIT" || echo 0

echo -n "CREATE PUBLICATION: "
grep -c '^CREATE PUBLICATION' "$INIT" || echo 0

echo -n "CREATE EVENT TRIGGER: "
grep -c '^CREATE EVENT TRIGGER' "$INIT" || echo 0

echo -n "OWNER TO supabase_admin: "
grep -c 'OWNER TO supabase_admin' "$INIT" || echo 0

echo ""
echo "=== ITENS QUE DEVEM TER VALOR > 0 ==="
echo -n "Tabelas public (deve bater com produção): "
grep -c '^CREATE TABLE public\.' "$INIT"

echo -n "CREATE EXTENSION IF NOT EXISTS: "
grep -c '^CREATE EXTENSION IF NOT EXISTS' "$INIT"

echo -n "ALTER PUBLICATION supabase_realtime: "
grep -c 'ALTER PUBLICATION supabase_realtime' "$INIT"

echo -n "Policies storage.objects: "
grep -c 'ON storage\.objects' "$INIT"
```

**Resultado esperado para este projeto (GT3):**

| Verificação | Valor esperado |
|-------------|---------------|
| `\restrict` e `\unrestrict` | 0 |
| CREATE SCHEMA internos | 0 |
| CREATE PUBLICATION | 0 |
| CREATE EVENT TRIGGER | 0 |
| OWNER TO supabase_admin | 0 |
| Tabelas public | 69 |
| CREATE EXTENSION IF NOT EXISTS | 7 |
| ALTER PUBLICATION supabase_realtime | 13 |
| Policies storage.objects | ≥ 30 |

---

## Passo 4 — Criar/atualizar a migration de post-setup

A migration `00000000000001_post_setup.sql` não pode vir do pg_dump — são dados que precisam de INSERT manual.

### 4.1 — Descobrir os storage buckets do banco de produção

```bash
supabase db query --linked \
  "SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id;"
```

### 4.2 — Descobrir tabelas no Realtime

```bash
supabase db query --linked \
  "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;"
```

### 4.3 — Montar o arquivo post-setup

Estrutura padrão de `supabase/migrations/00000000000001_post_setup.sql`:

```sql
-- Storage buckets (ON CONFLICT para ser idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('nome-do-bucket', 'nome-do-bucket', true/false, LIMITE_EM_BYTES_OU_NULL, ARRAY[...] OU NULL),
  ...
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Garantia de RLS (fallback se alguma tabela ficou sem)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- Realtime fallback (garante tabelas na publication)
DO $$
DECLARE tbl TEXT;
  tables TEXT[] := ARRAY['chat_messages', 'chat_presence', ...]; -- lista do passo 4.2
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = tbl) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
```

---

## Passo 5 — Testar com supabase db push

### 5.1 — Via dry-run (sem projeto real necessário)

```bash
supabase link --project-ref <REF_DO_PROJETO_DE_TESTE>
supabase db push --dry-run
```

Confirme que aparece exatamente 2 migrations para aplicar: `00000000000000` e `00000000000001`.

### 5.2 — Push real

```bash
supabase db push
```

Não deve haver erros. Avisos (`NOTICE`) sobre objetos já existentes são normais.

### 5.3 — Validar no SQL Editor do projeto de teste

```sql
-- Contar tabelas públicas (deve bater com produção)
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Verificar buckets
SELECT name FROM storage.buckets ORDER BY name;

-- Verificar RLS (deve retornar 0 linhas)
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = tablename AND c.relrowsecurity = true
  );

-- Verificar Realtime
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;
```

---

## Passo 6 — Configurar secrets dos serviços externos

Cada projeto novo precisa das suas próprias chaves. Nunca compartilhe as chaves do projeto original.

| Serviço | Como obter | Secrets |
|---------|-----------|---------|
| LiveKit (vídeo) | [livekit.io](https://livekit.io) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| OpenRouter (IA) | [openrouter.ai](https://openrouter.ai) | `OPENROUTER_API_KEY` |
| Resend (email) | [resend.com](https://resend.com) | `RESEND_API_KEY` |
| Web Push | `npx web-push generate-vapid-keys` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Soniox (transcrição) | [soniox.com](https://soniox.com) | `SONIOX_API_KEY` |
| S3/R2 (gravações) | Cloudflare R2, AWS S3 ou MinIO | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` |
| App | Domínio do novo app | `SITE_URL` |

---

## Passo 7 — Versionar e documentar

```bash
git add scripts/setup-database-complete.sql
git add supabase/migrations/00000000000000_init.sql
git add supabase/migrations/00000000000001_post_setup.sql

git commit -m "infra: regenera baseline de banco via pg_dump para replicação

Contexto: schema de produção evoluiu — novas tabelas/policies precisam estar
no baseline para novos projetos replicarem corretamente via supabase db push.
Mudanças: N tabelas, N policies, N triggers atualizados.
Impacto/Testes: testado com supabase db push em projeto de teste — N tabelas criadas."
```

Atualize também a data em `CLAUDE.md` (tabela de documentos) e `docs/SETUP-DATABASE.md`.

---

## Diagnóstico: quando o init.sql foi deletado acidentalmente

Se o arquivo `supabase/migrations/00000000000000_init.sql` sumir do diretório mas ainda estiver no git:

```bash
# Verificar se está no git
git status supabase/migrations/00000000000000_init.sql
# Deve mostrar "deleted:" se foi removido localmente

# Restaurar
git restore supabase/migrations/00000000000000_init.sql

# Verificar que está ok
grep -c '^CREATE TABLE public\.' supabase/migrations/00000000000000_init.sql
```

Se o arquivo não estava no git ainda, recomece do Passo 1.

---

## Manutenção: quando regenerar o baseline

| Situação | Ação |
|----------|------|
| Nova tabela criada no Dashboard | Criar migration nova normal (`supabase migration new`) |
| Grande redesign (10+ novas tabelas) | Regenerar baseline completo (Passos 1-7) |
| Novo bucket de storage | Atualizar só `00000000000001_post_setup.sql` |
| Nova tabela no Realtime | Adicionar ao fallback do `00000000000001_post_setup.sql` |
| Nunca | Editar `00000000000000_init.sql` diretamente na mão — sempre regenere do pg_dump |

---

## Checklist Final

```
[ ] pg_dump gerado com --schema-only --no-owner --no-privileges
[ ] \restrict e \unrestrict removidos do init.sql
[ ] CREATE SCHEMA internos removidos
[ ] CREATE PUBLICATION removido
[ ] CREATE EVENT TRIGGER removido
[ ] Tabelas public = N (bate com produção)
[ ] CREATE EXTENSION IF NOT EXISTS presentes
[ ] ALTER PUBLICATION presentes
[ ] storage.objects policies presentes
[ ] post_setup.sql tem todos os buckets
[ ] supabase db push --dry-run sem erro
[ ] supabase db push sem erro
[ ] Contagem de tabelas no projeto de teste bate com produção
[ ] Buckets criados (8 neste projeto)
[ ] RLS habilitado em todas as tabelas (0 linhas no check)
[ ] Edge Functions deployadas: bash scripts/setup-edge-functions.sh
[ ] Secrets configurados no painel Supabase
[ ] Commit feito
[ ] Datas atualizadas em CLAUDE.md e SETUP-DATABASE.md
```

---

> Última atualização: 2026-05-07 | Testado: 69 tabelas públicas, 8 buckets, 13 tabelas Realtime, 26 Edge Functions
