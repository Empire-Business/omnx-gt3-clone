/**
 * Conecta no banco prod e gera um SQL achatado com TODO o schema:
 * extensions, types, sequences, tables, FKs, indexes, functions, triggers,
 * policies, views. Sem dados — só DDL.
 *
 * Uso:
 *   node scripts/dump-schema.mjs > supabase/SETUP_COMPLETE.sql
 */

import pg from 'pg'

const CONN = process.argv[2] || process.env.DATABASE_URL
if (!CONN) {
  console.error('Falta connection string. Uso: node scripts/dump-schema.mjs "postgresql://..."')
  process.exit(1)
}

const client = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } })
await client.connect()

const out = []
const w = (s) => out.push(s)
const log = (s) => console.error('· ' + s)

w('-- ─────────────────────────────────────────────────────────────────')
w('-- SETUP COMPLETO — gerado por introspecção do banco vivo')
w('-- Cole no SQL Editor do Supabase e Run.')
w('-- Geração: ' + new Date().toISOString())
w('-- ─────────────────────────────────────────────────────────────────')
w('')
w('SET statement_timeout = 0;')
w('SET lock_timeout = 0;')
w('SET client_encoding = \'UTF8\';')
w('SET standard_conforming_strings = on;')
w('SET check_function_bodies = false;')
w('SET client_min_messages = warning;')
w('')

// ───────────────────── EXTENSIONS ─────────────────────
log('extensions')
const exts = await client.query(`
  SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql') ORDER BY extname
`)
for (const r of exts.rows) {
  w(`CREATE EXTENSION IF NOT EXISTS "${r.extname}";`)
}
w('')

// ───────────────────── ENUM TYPES ─────────────────────
log('enum types')
const enums = await client.query(`
  SELECT n.nspname AS schema, t.typname AS name,
         array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
  GROUP BY n.nspname, t.typname
  ORDER BY t.typname
`)
for (const r of enums.rows) {
  const arr = Array.isArray(r.labels) ? r.labels : String(r.labels).replace(/^\{|\}$/g, '').split(',')
  const labels = arr.map((l) => `'${String(l).replace(/'/g, "''")}'`).join(', ')
  w(`DO $$ BEGIN`)
  w(`  CREATE TYPE public."${r.name}" AS ENUM (${labels});`)
  w(`EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
}
w('')

// ───────────────────── SEQUENCES (standalone) ─────────────────────
log('sequences')
const seqs = await client.query(`
  SELECT sequence_name FROM information_schema.sequences
  WHERE sequence_schema = 'public' ORDER BY sequence_name
`)
for (const r of seqs.rows) {
  w(`CREATE SEQUENCE IF NOT EXISTS public."${r.sequence_name}";`)
}
w('')

// ───────────────────── TABLES ─────────────────────
log('tables')
const tables = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`)

for (const t of tables.rows) {
  const tn = t.table_name
  const cols = await client.query(
    `
    SELECT column_name, data_type, udt_name, is_nullable, column_default,
           character_maximum_length, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `,
    [tn],
  )
  const colDefs = cols.rows.map((c) => {
    let type = c.data_type
    if (type === 'USER-DEFINED') type = `public."${c.udt_name}"`
    else if (type === 'ARRAY') type = `${c.udt_name.replace(/^_/, '')}[]`
    else if (type === 'character varying' && c.character_maximum_length) type = `varchar(${c.character_maximum_length})`
    else if (type === 'numeric' && c.numeric_precision) type = `numeric(${c.numeric_precision},${c.numeric_scale || 0})`
    let def = `"${c.column_name}" ${type}`
    if (c.column_default) def += ` DEFAULT ${c.column_default}`
    if (c.is_nullable === 'NO') def += ' NOT NULL'
    return '  ' + def
  })
  w(`CREATE TABLE IF NOT EXISTS public."${tn}" (`)
  w(colDefs.join(',\n'))
  w(`);`)
  w('')
}

// ───────────────────── PRIMARY KEYS & UNIQUES ─────────────────────
log('primary keys & uniques')
const pks = await client.query(`
  SELECT conname, conrelid::regclass::text AS table_name,
         pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE contype IN ('p','u') AND connamespace = 'public'::regnamespace
  ORDER BY conrelid::regclass::text, conname
`)
for (const r of pks.rows) {
  w(`ALTER TABLE ${r.table_name} ADD CONSTRAINT "${r.conname}" ${r.def};`)
}
w('')

// ───────────────────── FOREIGN KEYS ─────────────────────
log('foreign keys')
const fks = await client.query(`
  SELECT conname, conrelid::regclass::text AS table_name,
         pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE contype = 'f' AND connamespace = 'public'::regnamespace
  ORDER BY conrelid::regclass::text, conname
`)
for (const r of fks.rows) {
  w(`ALTER TABLE ${r.table_name} ADD CONSTRAINT "${r.conname}" ${r.def};`)
}
w('')

// ───────────────────── CHECK CONSTRAINTS ─────────────────────
log('check constraints')
const checks = await client.query(`
  SELECT conname, conrelid::regclass::text AS table_name,
         pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE contype = 'c' AND connamespace = 'public'::regnamespace
  ORDER BY conrelid::regclass::text, conname
`)
for (const r of checks.rows) {
  w(`ALTER TABLE ${r.table_name} ADD CONSTRAINT "${r.conname}" ${r.def};`)
}
w('')

// ───────────────────── INDEXES (não-PK/Unique já criados) ─────────────────────
log('indexes')
const indexes = await client.query(`
  SELECT indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname NOT IN (
      SELECT conname FROM pg_constraint WHERE contype IN ('p','u') AND connamespace='public'::regnamespace
    )
  ORDER BY tablename, indexname
`)
for (const r of indexes.rows) {
  w(r.indexdef + ';')
}
w('')

// ───────────────────── FUNCTIONS ─────────────────────
log('functions')
const fns = await client.query(`
  SELECT pg_get_functiondef(p.oid) AS def, l.lanname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND l.lanname NOT IN ('c', 'internal')
    -- Pula funções que vêm de extensions instaladas (não nossas)
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.objid = p.oid AND d.deptype = 'e'
    )
  ORDER BY p.proname
`)
for (const r of fns.rows) {
  w(r.def + ';')
  w('')
}

// ───────────────────── VIEWS ─────────────────────
log('views')
const views = await client.query(`
  SELECT table_name, view_definition
  FROM information_schema.views WHERE table_schema = 'public'
  ORDER BY table_name
`)
for (const r of views.rows) {
  w(`CREATE OR REPLACE VIEW public."${r.table_name}" AS`)
  w(r.view_definition)
  w('')
}

// ───────────────────── TRIGGERS ─────────────────────
// Inclui triggers em public.* E em auth.users (handle_new_user).
log('triggers')
const trigs = await client.query(`
  SELECT pg_get_triggerdef(t.oid, true) AS def, n.nspname AS schema, c.relname AS tbl
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND (
      n.nspname = 'public'
      OR (n.nspname = 'auth' AND c.relname = 'users')
    )
  ORDER BY n.nspname, c.relname, t.tgname
`)
for (const r of trigs.rows) {
  // Triggers em auth.users precisam ser criados com permissão especial — envolver em DO block
  // pra ignorar erros se a role não tiver privilégio (Supabase Cloud já libera service_role)
  if (r.schema === 'auth') {
    w('DO $$ BEGIN')
    w('  ' + r.def + ';')
    w('EXCEPTION WHEN insufficient_privilege THEN')
    w('  RAISE NOTICE \'Trigger em auth.* requer privilégio: %\', SQLERRM;')
    w('END $$;')
  } else {
    w(r.def + ';')
  }
}
w('')

// ───────────────────── RLS ENABLE ─────────────────────
log('rls enable')
const rls = await client.query(`
  SELECT c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
  ORDER BY c.relname
`)
for (const r of rls.rows) {
  w(`ALTER TABLE public."${r.relname}" ENABLE ROW LEVEL SECURITY;`)
}
w('')

// ───────────────────── POLICIES ─────────────────────
log('policies')
const policies = await client.query(`
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname = 'public'
  ORDER BY tablename, policyname
`)
for (const p of policies.rows) {
  const cmd = p.cmd || 'ALL'
  const using = p.qual ? ` USING (${p.qual})` : ''
  const check = p.with_check ? ` WITH CHECK (${p.with_check})` : ''
  const rolesArr = Array.isArray(p.roles) ? p.roles : String(p.roles || '').replace(/^\{|\}$/g, '').split(',').filter(Boolean)
  const roles = rolesArr.length ? ` TO ${rolesArr.join(', ')}` : ''
  w(`CREATE POLICY "${p.policyname}" ON public."${p.tablename}" AS ${p.permissive} FOR ${cmd}${roles}${using}${check};`)
}
w('')

// ───────────────────── GRANTs ao service_role ─────────────────────
// Edge Functions do Supabase usam service_role. Sem GRANT, dão 401/403.
log('grants')
w('-- GRANTs essenciais pro service_role (Edge Functions)')
w('GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role, postgres;')
w('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;')
w('GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role, postgres;')
w('GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;')
w('-- Garantia pra tabelas/funções criadas no futuro')
w('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role, postgres;')
w('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role, postgres;')
w('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role, postgres;')
w('')

await client.end()

// Imprime no stdout (pra redirecionar pra arquivo) — log vai pro stderr
process.stdout.write(out.join('\n'))
console.error('\n✅ Schema dump completo — ' + out.length + ' linhas')
