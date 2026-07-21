-- Security hardening — force drop + recreate
-- A migration anterior (20260429180000) usava DROP POLICY IF EXISTS pelos
-- nomes "task_assignees_select" / "reactions_select" / etc. Se o scanner
-- ainda detecta as policies antigas, é porque os nomes reais no DB diferem
-- (case, whitespace, ou múltiplas policies coexistindo).
-- Esta migration faz drop universal por tabela via pg_policies.

-- ================================================================
-- 1) task_assignees — drop TODAS + recriar
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_assignees'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.task_assignees', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_assignees_select" ON public.task_assignees
  FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );
CREATE POLICY "task_assignees_insert" ON public.task_assignees
  FOR INSERT TO authenticated WITH CHECK (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );
CREATE POLICY "task_assignees_update" ON public.task_assignees
  FOR UPDATE TO authenticated
  USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );
CREATE POLICY "task_assignees_delete" ON public.task_assignees
  FOR DELETE TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- ================================================================
-- 2) chat_reactions — drop TODAS + recriar (sem USING true)
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_reactions'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.chat_reactions', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_react_select" ON public.chat_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_reactions.message_id
        AND m.conversation_id IN (
          SELECT conversation_id FROM public.chat_my_conversation_ids()
        )
    )
  );

CREATE POLICY "chat_react_insert" ON public.chat_reactions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_reactions.message_id
        AND m.conversation_id IN (
          SELECT conversation_id FROM public.chat_my_conversation_ids()
        )
    )
    AND employee_id = public.chat_my_employee_id()
  );

CREATE POLICY "chat_react_delete" ON public.chat_reactions
  FOR DELETE TO authenticated USING (
    employee_id = public.chat_my_employee_id()
  );

-- ================================================================
-- 3) Storage: chat-attachments DELETE — drop todas + recriar com ownership
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (policyname ILIKE '%chat_attach%' OR policyname ILIKE '%chat-attach%' OR policyname ILIKE '%chat attach%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "chat_attach_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "chat_attach_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "chat_attach_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'chat-attachments'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
      )
    )
  );

-- ================================================================
-- 4) Storage: platform-thumbnails — drop todas + recriar com admin check
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (policyname ILIKE '%platform%thumbnail%' OR policyname ILIKE '%platform_thumbnail%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "platform_thumbnails_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'platform-thumbnails');

CREATE POLICY "platform_thumbnails_insert_admin" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE POLICY "platform_thumbnails_update_admin" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE POLICY "platform_thumbnails_delete_admin" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- ================================================================
-- 5) knowledge_base_documents kb_docs_select — drop TODAS + recriar
-- ================================================================
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'knowledge_base_documents'
      AND policyname ILIKE 'kb_docs_select%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.knowledge_base_documents', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "kb_docs_select" ON public.knowledge_base_documents
  FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND (
      is_personal = false
      OR owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.knowledge_base_shares s
        WHERE s.document_id = knowledge_base_documents.id
          AND s.shared_with = auth.uid()
      )
    )
  );

-- ================================================================
-- 6) realtime.messages — RLS + policies
-- ================================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
  LOOP
    EXECUTE format('DROP POLICY %I ON realtime.messages', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "realtime_messages_select" ON realtime.messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND realtime.messages.topic LIKE 'tenant:' || p.tenant_id::text || '%'
    )
    OR (
      realtime.messages.topic LIKE 'chat:%'
      AND substring(realtime.messages.topic from 6) IN (
        SELECT conversation_id::text FROM public.chat_my_conversation_ids()
      )
    )
  );

CREATE POLICY "realtime_messages_insert" ON realtime.messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND realtime.messages.topic LIKE 'tenant:' || p.tenant_id::text || '%'
    )
    OR (
      realtime.messages.topic LIKE 'chat:%'
      AND substring(realtime.messages.topic from 6) IN (
        SELECT conversation_id::text FROM public.chat_my_conversation_ids()
      )
    )
  );

-- Verificação final: lista policies das tabelas afetadas (vai aparecer no log)
DO $$
DECLARE rec record;
BEGIN
  RAISE NOTICE '=== Policies finais ===';
  FOR rec IN
    SELECT schemaname || '.' || tablename AS tbl, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename IN ('task_assignees', 'chat_reactions', 'knowledge_base_documents'))
       OR (schemaname = 'storage' AND tablename = 'objects' AND (policyname ILIKE '%chat_attach%' OR policyname ILIKE '%platform_thumbnail%'))
       OR (schemaname = 'realtime' AND tablename = 'messages')
    ORDER BY tbl, cmd, policyname
  LOOP
    RAISE NOTICE '%: % (%) USING=% CHECK=%',
      rec.tbl, rec.policyname, rec.cmd, COALESCE(rec.qual, 'NULL'), COALESCE(rec.with_check, 'NULL');
  END LOOP;
END $$;
