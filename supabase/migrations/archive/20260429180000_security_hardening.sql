-- Security hardening — corrige vulnerabilidades de RLS e isolamento multi-tenant
-- 1) task_assignees: policies usavam task_assignees.id = auth.uid() (id é PK, não user_id)
-- 2) chat_reactions: SELECT com USING true vazava entre tenants
-- 3) chat-attachments: DELETE sem checagem de ownership/tenant
-- 4) platform thumbnails: políticas só checavam authenticated, não admin
-- 5) kb_docs_select: join com self-reference em vez de knowledge_base_documents
-- 6) realtime.messages: sem RLS — qualquer user assinava qualquer canal

-- ================================================================
-- 1) task_assignees — fix predicate
-- ================================================================
DROP POLICY IF EXISTS "task_assignees_select" ON public.task_assignees;
DROP POLICY IF EXISTS "task_assignees_insert" ON public.task_assignees;
DROP POLICY IF EXISTS "task_assignees_delete" ON public.task_assignees;
DROP POLICY IF EXISTS "task_assignees_update" ON public.task_assignees;

CREATE POLICY "task_assignees_select" ON public.task_assignees
  FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "task_assignees_insert" ON public.task_assignees
  FOR INSERT TO authenticated WITH CHECK (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "task_assignees_delete" ON public.task_assignees
  FOR DELETE TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "task_assignees_update" ON public.task_assignees
  FOR UPDATE TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  ) WITH CHECK (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- ================================================================
-- 2) chat_reactions — SELECT scoped por conversation membership
-- ================================================================
DROP POLICY IF EXISTS "reactions_select" ON public.chat_reactions;
DROP POLICY IF EXISTS "chat_react_select" ON public.chat_reactions;

CREATE POLICY "chat_react_select" ON public.chat_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_reactions.message_id
        AND m.conversation_id IN (SELECT conversation_id FROM public.chat_my_conversation_ids())
    )
  );

-- ================================================================
-- 3) chat-attachments storage — DELETE por path do uploader
-- (path convencional: "<user_id>/<conversation_id>/<filename>")
-- ================================================================
DROP POLICY IF EXISTS "chat_attach_delete" ON storage.objects;
CREATE POLICY "chat_attach_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (
      -- Owner do arquivo (path começa com user_id)
      (auth.uid())::text = (storage.foldername(name))[1]
      OR
      -- Ou admin do tenant
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
      )
    )
  );

-- ================================================================
-- 4) platform thumbnails — admin scoping
-- ================================================================
DROP POLICY IF EXISTS "admins can upload platform thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "admins can delete platform thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload platform thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete platform thumbnails" ON storage.objects;

CREATE POLICY "admins can upload platform thumbnails"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE POLICY "admins can delete platform thumbnails"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'platform-thumbnails'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- ================================================================
-- 5) knowledge_base_documents (kb_docs_select) — fix self-reference join
-- A condition original usava knowledge_base_shares.document_id = knowledge_base_shares.id
-- (sempre falsa). Corrige para document_id = knowledge_base_documents.id.
-- Mantém: docs de empresa (não pessoais), docs próprios, e docs compartilhados.
-- ================================================================
DROP POLICY IF EXISTS "kb_docs_select" ON public.knowledge_base_documents;

CREATE POLICY "kb_docs_select" ON public.knowledge_base_documents
  FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND (
      -- Docs da empresa (não pessoais) — todos do tenant veem
      is_personal = false
      OR
      -- Doc próprio
      owner_id = auth.uid()
      OR
      -- Doc compartilhado comigo
      EXISTS (
        SELECT 1 FROM public.knowledge_base_shares s
        WHERE s.document_id = knowledge_base_documents.id
          AND s.shared_with = auth.uid()
      )
    )
  );

-- ================================================================
-- 6) realtime.messages — RLS por tenant + conversation
-- Sem políticas, qualquer usuário autenticado assinava qualquer canal,
-- recebendo broadcasts de outros tenants (chat, presence, meetings…).
-- ================================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_messages_select" ON realtime.messages;
CREATE POLICY "realtime_messages_select" ON realtime.messages
  FOR SELECT TO authenticated USING (
    -- Topic deve mencionar tenant_id do usuário OU conversation que ele participa
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (
          realtime.messages.topic LIKE 'tenant:' || p.tenant_id::text || ':%'
          OR realtime.messages.topic = 'tenant:' || p.tenant_id::text
        )
    )
    OR
    -- Canais de chat: topic no formato "chat:<conversation_id>"
    (
      realtime.messages.topic LIKE 'chat:%'
      AND substring(realtime.messages.topic from 6) IN (
        SELECT conversation_id::text FROM public.chat_my_conversation_ids()
      )
    )
  );

DROP POLICY IF EXISTS "realtime_messages_insert" ON realtime.messages;
CREATE POLICY "realtime_messages_insert" ON realtime.messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND realtime.messages.topic LIKE 'tenant:' || p.tenant_id::text || '%'
    )
  );
