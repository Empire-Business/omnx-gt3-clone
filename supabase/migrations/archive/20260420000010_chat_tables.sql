-- ══════════════════════════════════════════════════════════════
-- Chat interno GT3 — Fase 1
-- ══════════════════════════════════════════════════════════════

-- ── Conversas ─────────────────────────────────────────────────
CREATE TABLE public.chat_conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('direct','group','area','project')),
  name          TEXT,
  description   TEXT,
  avatar_url    TEXT,
  area_id       UUID,
  project_id    UUID,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Índices
CREATE INDEX chat_conversations_tenant_idx ON public.chat_conversations(tenant_id);
CREATE INDEX chat_conversations_type_idx   ON public.chat_conversations(type, tenant_id);

-- ── Participantes ──────────────────────────────────────────────
CREATE TABLE public.chat_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at    TIMESTAMPTZ,
  UNIQUE(conversation_id, employee_id)
);

ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

CREATE INDEX chat_participants_conv_idx ON public.chat_participants(conversation_id);
CREATE INDEX chat_participants_emp_idx  ON public.chat_participants(employee_id);

-- ── Mensagens ─────────────────────────────────────────────────
CREATE TABLE public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL,
  content         TEXT,
  type            TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','video','audio','file','system')),
  attachments     JSONB NOT NULL DEFAULT '[]',
  reply_to_id     UUID REFERENCES public.chat_messages(id),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_has_content CHECK (
    (content IS NOT NULL AND char_length(content) > 0)
    OR jsonb_array_length(attachments) > 0
  )
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX chat_messages_conv_idx  ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX chat_messages_emp_idx   ON public.chat_messages(employee_id);

-- ── Reações ───────────────────────────────────────────────────
CREATE TABLE public.chat_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  reaction    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, employee_id, reaction)
);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX chat_reactions_msg_idx ON public.chat_reactions(message_id);

-- ══════════════════════════════════════════════════════════════
-- Helper: retorna o employee_id do usuário autenticado
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.chat_my_employee_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Helper: verifica se o usuário é participante da conversa
CREATE OR REPLACE FUNCTION public.chat_is_participant(p_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE conversation_id = p_conversation_id
      AND employee_id = public.chat_my_employee_id()
  );
$$;

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_conversations
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_conv_select" ON public.chat_conversations
  FOR SELECT USING (public.chat_is_participant(id));

CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "chat_conv_update" ON public.chat_conversations
  FOR UPDATE USING (public.chat_is_participant(id));

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_participants
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_part_select" ON public.chat_participants
  FOR SELECT USING (public.chat_is_participant(conversation_id));

CREATE POLICY "chat_part_insert" ON public.chat_participants
  FOR INSERT WITH CHECK (public.chat_is_participant(conversation_id));

CREATE POLICY "chat_part_update" ON public.chat_participants
  FOR UPDATE USING (employee_id = public.chat_my_employee_id());

CREATE POLICY "chat_part_delete" ON public.chat_participants
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_messages
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_msg_select" ON public.chat_messages
  FOR SELECT USING (public.chat_is_participant(conversation_id));

CREATE POLICY "chat_msg_insert" ON public.chat_messages
  FOR INSERT WITH CHECK (
    public.chat_is_participant(conversation_id)
    AND employee_id = public.chat_my_employee_id()
  );

CREATE POLICY "chat_msg_update" ON public.chat_messages
  FOR UPDATE USING (employee_id = public.chat_my_employee_id());

CREATE POLICY "chat_msg_delete" ON public.chat_messages
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- RLS — chat_reactions
-- ══════════════════════════════════════════════════════════════
CREATE POLICY "chat_react_select" ON public.chat_reactions
  FOR SELECT USING (
    public.chat_is_participant(
      (SELECT conversation_id FROM public.chat_messages WHERE id = message_id)
    )
  );

CREATE POLICY "chat_react_insert" ON public.chat_reactions
  FOR INSERT WITH CHECK (
    employee_id = public.chat_my_employee_id()
    AND public.chat_is_participant(
      (SELECT conversation_id FROM public.chat_messages WHERE id = message_id)
    )
  );

CREATE POLICY "chat_react_delete" ON public.chat_reactions
  FOR DELETE USING (employee_id = public.chat_my_employee_id());

-- ══════════════════════════════════════════════════════════════
-- Trigger: atualiza updated_at nas conversas quando nova mensagem
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.chat_touch_conversation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_messages_touch_conv
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_touch_conversation();
