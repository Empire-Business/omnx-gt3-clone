-- =============================================================================
-- Presença em reunião — log de eventos (fundação das métricas de comparecimento)
-- Data: 2026-08-31 | Versão: v8.38.0
-- =============================================================================
--
-- PROBLEMA
-- `meetings.live_participants` e `meetings.participants` são JSONB de SNAPSHOT
-- do estado atual da sala. Quando a reunião acaba, o snapshot some (ou vira uma
-- foto do último instante). Não existe histórico: não dá para responder "quem
-- entrou", "às quantas horas saiu", "quanto tempo ficou", nem "quantas vezes
-- caiu e voltou". `meeting_attendees` também não resolve — ela só marca
-- `attendance_status='attended'` (booleano disfarçado), sem tempo nenhum.
--
-- SOLUÇÃO (portada do omnx-meet, `meeting_participant_events`)
-- Um LOG IMUTÁVEL, uma linha por evento de presença. Permanência total é a
-- SOMA dos `session_seconds` dos eventos 'left'; reconexão é um 'joined'
-- posterior ao primeiro (registrado como 'reconnected' + `reconnect_count`).
--
-- DIFERENÇAS EM RELAÇÃO AO omnx-meet (deliberadas, o schema do GT3 é outro)
--  1. O omnx-meet tem `meeting_participants` (uma linha por lead) e amarra o
--     evento nela via FK. O GT3 NÃO TEM essa tabela — tem `meeting_attendees`
--     (chaveada por meeting_id+email/employee_id) e `meeting_guest_requests`
--     (convidado externo). Por isso a tabela aqui é AUTOSSUFICIENTE: guarda
--     `participant_key` (chave estável derivada) + FKs opcionais.
--  2. No omnx-meet a identity do LiveKit é estável por participante. No GT3
--     NÃO É: `livekit-token` monta `${role}-${employee_id}-${Date.now()}`, ou
--     seja, cada reconexão gera uma identity NOVA. Agrupar por identity
--     contaria cada queda como uma pessoa diferente. Daí `participant_key`.
--  3. O omnx-meet deduplica com uma tabela global `livekit_events(event_id)`
--     que aborta o webhook inteiro em reentrega. No GT3 isso seria PERIGOSO:
--     o mesmo webhook dispara o Egress de gravação, e um gate global novo
--     poderia matar o fluxo de gravação (que é mais importante que a métrica).
--     Aqui a dedupe é LOCAL: índice único em `livekit_event_id`, escopado só a
--     esta tabela. Reentrega duplica nada e não afeta o resto do handler.
--
-- Escrita: exclusivamente pela Edge Function `livekit-webhook` (service_role).
-- =============================================================================

create table if not exists public.meeting_participant_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Um dos dois é obrigatório: o evento é de uma reunião OU de um huddle do
  -- chat (o livekit-webhook resolve os dois tipos de sala).
  meeting_id uuid references public.meetings (id) on delete cascade,
  huddle_id uuid references public.chat_huddles (id) on delete cascade,

  event_type text not null check (event_type in ('joined', 'reconnected', 'left')),
  occurred_at timestamptz not null default now(),

  -- Chave ESTÁVEL do participante ao longo da reunião inteira, imune ao
  -- sufixo Date.now() da identity. Formatos emitidos pelo webhook:
  --   'employee:<uuid>'  → membro autenticado (host/guest/observer)
  --   'guest:<uuid>'     → convidado externo (meeting_guest_requests.id)
  --   'identity:<raw>'   → fallback quando não dá para resolver nada
  participant_key text not null,

  -- 'member'  = colaborador autenticado do tenant (prefixo host-/guest-/observer-
  --             com employee_id no metadata do token)
  -- 'guest'   = convidado EXTERNO (livekit-guest-token, identity 'guest-<uuid>')
  -- 'unknown' = não foi possível classificar (não deve acontecer; fica logado)
  participant_kind text not null default 'unknown'
    check (participant_kind in ('member', 'guest', 'unknown')),

  -- Papel na sala, conforme o prefixo da identity do LiveKit.
  participant_role text
    check (participant_role in ('host', 'guest', 'observer', 'guest_external')),

  employee_id uuid references public.employees (id) on delete set null,
  guest_request_id uuid references public.meeting_guest_requests (id) on delete set null,

  display_name text,

  -- Identity crua daquela sessão específica (com o sufixo de timestamp).
  -- Serve para auditoria/depuração, NÃO para agrupar — use participant_key.
  -- Nome alinhado com meeting_recording_events.participant_identity (mesma
  -- convenção deste repo).
  participant_identity text,

  -- Só preenchido em 'left': duração DAQUELE segmento (não o acumulado).
  -- Permanência total = sum(session_seconds) filtrando event_type='left'.
  session_seconds integer check (session_seconds is null or session_seconds >= 0),

  -- Quantas vezes esta pessoa já reconectou nesta sala ATÉ este evento.
  -- O primeiro 'joined' não conta. Métrica final = max(reconnect_count).
  reconnect_count integer not null default 0 check (reconnect_count >= 0),

  -- Id do evento entregue pelo LiveKit. Usado só para dedupe de reentrega.
  livekit_event_id text,

  created_at timestamptz not null default now(),

  constraint meeting_participant_events_scope_check
    check (meeting_id is not null or huddle_id is not null),
  -- 'left' sem duração é registro incompleto; 'joined'/'reconnected' nunca têm.
  --
  -- O nome NÃO pode ser `..._session_seconds_check`: o `check` inline declarado
  -- na própria coluna `session_seconds` (acima) já recebe esse nome
  -- automaticamente do Postgres, e a colisão fazia a migration inteira falhar
  -- com `42710: check constraint already exists`. Pego num dry-run
  -- (BEGIN...ROLLBACK) antes de aplicar.
  constraint meeting_participant_events_session_only_on_left
    check ((event_type = 'left') or (session_seconds is null))
);

comment on table public.meeting_participant_events is
  'Log imutável de presença (joined/reconnected/left) por participante de sala LiveKit, com granularidade de sessão. Fonte única: Edge Function livekit-webhook (service_role). Permanência total = SUM(session_seconds) dos eventos left agrupados por participant_key. Distinto de meeting_recording_events, que audita o ciclo de vida da GRAVAÇÃO.';

comment on column public.meeting_participant_events.participant_key is
  'Chave estável do participante na sala (employee:<uuid> | guest:<uuid> | identity:<raw>). NECESSÁRIA porque livekit-token gera uma identity nova a cada reconexão (${role}-${employee_id}-${Date.now()}).';
comment on column public.meeting_participant_events.session_seconds is
  'Duração deste segmento de presença, só em event_type=left. Somar para obter permanência total mesmo com reconexões.';
comment on column public.meeting_participant_events.reconnect_count is
  'Reconexões acumuladas até este evento. O primeiro joined não conta.';
comment on column public.meeting_participant_events.livekit_event_id is
  'Id do evento do LiveKit — apenas para dedupe de reentrega (índice único parcial). Não é chave de negócio.';

-- ── Índices ────────────────────────────────────────────────────────────────
-- Consulta principal da futura tela de métricas: linha do tempo de presença de
-- uma reunião, agrupada por participante.
create index if not exists meeting_participant_events_meeting_idx
  on public.meeting_participant_events using btree (meeting_id, participant_key, occurred_at);

create index if not exists meeting_participant_events_huddle_idx
  on public.meeting_participant_events using btree (huddle_id, occurred_at)
  where huddle_id is not null;

-- "De quantas reuniões o colaborador X participou / quanto tempo somou":
-- consulta por pessoa, no escopo do tenant.
create index if not exists meeting_participant_events_tenant_employee_idx
  on public.meeting_participant_events using btree (tenant_id, employee_id, occurred_at desc);

create index if not exists meeting_participant_events_tenant_idx
  on public.meeting_participant_events using btree (tenant_id);

-- DEDUPE: o LiveKit reentrega webhooks. Índice único PARCIAL — se o evento
-- vier sem id (não deveria), o insert ainda passa em vez de derrubar tudo.
create unique index if not exists meeting_participant_events_livekit_event_id_key
  on public.meeting_participant_events using btree (livekit_event_id)
  where livekit_event_id is not null;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.meeting_participant_events enable row level security;

-- SELECT apenas. Sem policy de INSERT/UPDATE/DELETE para `authenticated`:
-- o log é imutável e escrito só pelo service_role no livekit-webhook — mesmo
-- padrão de meeting_recording_events (que também só tem policy de SELECT).
--
-- O critério é mais restrito que o de meeting_recording_events (tenant puro)
-- porque presença é dado pessoal: quanto tempo cada colaborador ficou numa
-- sala. Segue o mesmo desenho de meeting_attendees_select — admin/gestor veem
-- tudo do tenant, o criador da reunião vê a reunião dele, e o colaborador
-- comum vê apenas as próprias linhas.
create policy "meeting_participant_events_select"
  on public.meeting_participant_events
  for select
  to authenticated
  using (
    tenant_id = public.get_user_tenant_id()
    and (
      public.is_admin()
      or public.has_role(auth.uid(), 'manager'::public.app_role)
      or (meeting_id is not null and public.get_meeting_created_by(meeting_id) = auth.uid())
      or (
        employee_id is not null
        and exists (
          select 1 from public.employees e
          where e.id = meeting_participant_events.employee_id
            and e.user_id = auth.uid()
        )
      )
    )
  );
