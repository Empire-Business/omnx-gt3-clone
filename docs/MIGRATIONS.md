# Migrations — GT3 (Empire Manager)

> Arquitetura e governança de migrations do projeto.

---

## Situação atual (2026-05-07)

| Fonte | Estado | Uso |
|-------|--------|-----|
| `supabase/migrations/00000000000000_init.sql` | ✅ **Fonte de verdade** | Migration completa — use via `supabase db push` |
| `supabase/migrations/00000000000001_post_setup.sql` | ✅ Atualizada | Storage buckets + Realtime + RLS — execute em segundo |
| `scripts/setup-database-complete.sql` | ✅ Referência | Dump pg_dump bruto — para SQL Editor (fallback) |
| `supabase/migrations/archive/` (134 arquivos) | ❌ Legado | Histórico — não use para replicar |

---

## Como replicar o banco para um novo projeto

### Via Supabase CLI (recomendado)

```bash
supabase link --project-ref <REF>
supabase db push
bash scripts/setup-edge-functions.sh
```

Isso aplica as 2 migrations em ordem e recria tudo: 69 tabelas, RLS, functions, triggers, storage buckets.

### Via SQL Editor (fallback)

```
1. scripts/setup-database-schema.sql  ← schema limpo (SQL Editor)
2. scripts/setup-database-post-dump.sql  ← buckets + realtime
```

Consulte `docs/INSTRUCOES-REPLICACAO-BANCO.md` para o guia completo.

---

## Por que as 134 migrations de archive estão desatualizadas?

1. **Desenvolvimento via Dashboard**: tabelas criadas diretamente na UI do Supabase nunca viraram migrations.
2. **Seeds misturados**: a migration `20260221150100_...sql` é um bloco `DO $$` com dados de demo.
3. **Ordem quebrada**: as 3 migrations mais antigas fazem `ALTER TABLE` em tabelas que só são criadas na 4ª.
4. **Migrations de diagnóstico**: scripts de debug commitados como migrations.
5. **Migrations duplicadas**: colunas criadas mais de uma vez.

**Não delete e não mova o archive.** O Supabase CLI rastreia o que já foi aplicado em `supabase_migrations.schema_migrations`. Remover arquivos causa erros de `migration not found` no projeto original.

---

## Como criar novas migrations (desenvolvimento contínuo)

Para mudanças de schema **após** o baseline estar em produção:

```bash
# Criar nova migration
supabase migration new nome_da_mudanca

# Editar o arquivo gerado em supabase/migrations/
# NÃO use o Dashboard para criar — sempre via CLI

# Aplicar no projeto linkado
supabase db push
```

Nunca crie tabelas pelo Dashboard sem gerar a migration correspondente:
```bash
supabase db diff -f nome_da_mudanca
```

---

## Quando regenerar o baseline

| Situação | Ação |
|----------|------|
| Nova tabela via `supabase migration new` | Continua normalmente — não regenera baseline |
| Grande redesign (10+ novas tabelas) | Regenerar — ver `docs/PROCESSO-DUMP-BASELINE.md` |
| Novo bucket de storage | Só atualiza `00000000000001_post_setup.sql` |
| Schema muito divergente do init.sql | Regenerar para manter novos projetos funcionando |

---

> Última atualização: 2026-05-07 | Migrations ativas: 2 | Archive: 134 (legado) | Tabelas públicas: 69
