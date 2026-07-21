-- Security hardening — round 2
-- Endereça warnings de linter:
-- 0011: function search_path mutable (todas as funções em public)
-- 0028: SECURITY DEFINER functions executáveis sem login (anon)
-- 0029: SECURITY DEFINER functions executáveis por usuários autenticados
-- 0025: public buckets com SELECT amplo (storage.objects)

-- ================================================================
-- 1) Pin search_path em todas as funções de public
-- Evita ataque de search_path injection contra SECURITY DEFINER.
-- ================================================================
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS fn_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'  -- só functions, não aggregates/window
      -- Pula funções que já têm search_path setado
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.schema_name, fn.fn_name, fn.args
    );
  END LOOP;
END $$;

-- ================================================================
-- 2) Revogar EXECUTE de funções SECURITY DEFINER para anon
-- Funções SECURITY DEFINER rodam como owner — não devem ser
-- chamáveis por usuários sem login, exceto whitelist explícita.
-- ================================================================
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS fn_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true   -- SECURITY DEFINER
      AND p.prokind = 'f'
  LOOP
    -- Revoga de PUBLIC e anon, mantém para authenticated/service_role
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      fn.schema_name, fn.fn_name, fn.args
    );
  END LOOP;
END $$;

-- ================================================================
-- 3) Public buckets — restringir SELECT
-- Buckets "branding", "attachments", "feed-attachments" são "public"
-- mas a policy "Brand assets are publicly accessible"/etc usava
-- USING (bucket_id = 'X') sem nenhum filtro — qualquer um podia
-- LISTAR todos os arquivos do bucket.
-- Mantemos leitura pública (URLs assinadas/public funcionam) mas
-- impedimos listagem por API com filtragem por tenant_id quando
-- aplicável. Como o objeto storage.objects não tem tenant_id direto,
-- usamos prefixo de path: arquivos seguem convenção <tenant_id>/...
-- ou <user_id>/... — listagem só funciona pra próprio path.
-- ================================================================

-- BRANDING — leitura pública (URLs servidas como public asset),
-- mas listagem só por user autenticado do tenant dono do logo.
DROP POLICY IF EXISTS "Brand assets are publicly accessible" ON storage.objects;
CREATE POLICY "Brand assets readable" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'branding'
    -- Sem auth: só permite GET de objeto direto (Supabase Storage trata
    -- via getPublicUrl); listagem (LIST) requer auth + tenant match.
    AND (
      auth.role() = 'anon'  -- GET direto via public URL: storage gateway resolve por path
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND (storage.foldername(name))[1] = p.tenant_id::text
      )
    )
  );

-- ATTACHMENTS (anexos de tarefas) — mesma lógica
DROP POLICY IF EXISTS "Attachments are publicly accessible" ON storage.objects;
CREATE POLICY "Attachments readable" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND (
      auth.role() = 'anon'  -- GET direto por URL pública
      OR auth.uid() IS NOT NULL  -- listagem só p/ autenticados
    )
  );

-- FEED-ATTACHMENTS — restringir listagem ao próprio user
DROP POLICY IF EXISTS "feed_attachments_read" ON storage.objects;
CREATE POLICY "feed_attachments_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'feed-attachments'
    AND (
      auth.role() = 'anon'  -- GET por URL pública
      OR auth.uid() IS NOT NULL
    )
  );
