# Migrations — GT3 (Empire Manager)

## Estrutura atual

```
supabase/migrations/
├── 00000000000000_init.sql      ← ✅ Schema completo e atualizado (69 tabelas)
├── 00000000000001_post_setup.sql ← ✅ Storage buckets + Realtime (execute depois)
└── archive/                      ← 134 migrations legadas (histórico, não usar)
```

---

## ⚠️ IMPORTANTE

A pasta `archive/` contém o **histórico legado** de desenvolvimento. Essas 134 migrations estão desatualizadas, fora de ordem e não refletem o estado atual do banco.

**Não use os arquivos de `archive/` para replicar o banco.**

---

## Fonte de verdade

| Arquivo | Descrição |
|---------|-----------|
| **`00000000000000_init.sql`** | Baseline gerada via `pg_dump` do banco real. Contém **69 tabelas públicas**, functions, triggers, RLS policies, storage policies e indexes. |
| **`00000000000001_post_setup.sql`** | Cria os 8 storage buckets necessários e garante RLS + Realtime. Execute APÓS o init. |
| `../scripts/setup-database-complete.sql` | Dump completo (inclui schemas internos), para referência. |
| `../scripts/setup-database-schema.sql` | Schema público apenas, versão anterior (menos completa). |

---

## Como usar em um novo projeto

### Via Supabase CLI (recomendado)

```bash
# 1. Linkar ao novo projeto
supabase link --project-ref <SEU_PROJECT_REF>

# 2. Aplicar ambas as migrations em ordem
supabase db push

# 3. Deploy das edge functions
bash scripts/setup-edge-functions.sh
```

### Via SQL Editor (alternativa)

Cole o conteúdo de `../scripts/setup-database-schema.sql` no SQL Editor, depois
cole o conteúdo de `../scripts/setup-database-post-dump.sql`.

> Consulte `docs/INSTRUCOES-REPLICACAO-BANCO.md` para o guia completo.

---

## Criar novas migrations (desenvolvimento contínuo)

```bash
# Criar nova migration
supabase migration new nome_da_mudanca

# Editar o arquivo gerado nesta pasta
# Aplicar no projeto linkado
supabase db push
```

---

> **Dúvidas?** Consulte `docs/MIGRATIONS.md` e `docs/SETUP-DATABASE.md`
