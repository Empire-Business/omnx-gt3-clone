/**
 * useMeetingStats — v8.36.0
 *
 * Estatísticas de participação de QUALQUER reunião do GT3.
 *
 * ════════════════════════════════════════════════════════════════════
 * DE ONDE VEM CADA MÉTRICA (validado contra o banco de produção)
 * ════════════════════════════════════════════════════════════════════
 *
 * 1) PRESENÇA MEDIDA (quem entrou + tempo de permanência + reconexões)
 *    → Fonte primária: `meeting_participant_events` (tabela nova, criada por
 *      outra frente). Se ela ainda não existir no banco, o hook NÃO quebra:
 *      detecta o erro de tabela inexistente e cai para a fonte legada.
 *      Agrupa por `participant_key` (`employee:<uuid>` / `guest:<uuid>`), que é
 *      ESTÁVEL entre reconexões — nunca por `participant_identity`, que o
 *      `livekit-token` monta como `<role>-<employee_id>-<Date.now()>` e que
 *      portanto muda a cada reconexão.
 *    → Fonte legada (já existe e TEM histórico real): `meeting_recording_events`,
 *      onde o `livekit-webhook` já grava `participant_joined` / `participant_left`
 *      com `created_at` e o payload completo do participante LiveKit
 *      (identity, name, kind, metadata com `employee_id`).
 *    → Quando nenhuma das duas tem evento para a reunião, `presence.available`
 *      vem `false` e a UI diz isso — nunca mostra zero como se fosse medição.
 *
 * 2) TEMPO DE FALA (ESTIMATIVA, não medição)
 *    → Fonte: `meetings.transcript_final ?? transcript_raw`.
 *      O formato real gravado é `[Speaker N]: texto` por linha (ver
 *      `useLiveKitTranscription.formatTranscript` e `MeetingRecorder`).
 *      A diarização do Soniox produz rótulos ANÔNIMOS (Speaker 1, Speaker 2…)
 *      e o texto salvo NÃO carrega timestamps por token.
 *    → Consequência honesta: NÃO é possível (a) atribuir um falante a uma
 *      pessoa e (b) medir segundos de fala. O que é possível é a PROPORÇÃO de
 *      fala entre falantes, por volume de caracteres. Os segundos exibidos são
 *      derivados dessa proporção aplicada à duração da reunião — por isso
 *      `speech.isEstimate === true` e `speech.speakersAreAnonymous === true`.
 *
 * 3) TEMPO DE CÂMERA ABERTA / FECHADA
 *    → NÃO É OBTENÍVEL HOJE. O `livekit-webhook` só trata `participant_joined`,
 *      `participant_left`, `room_started`, `room_finished` e os `egress_*`.
 *      Não assina `track_published` / `track_unpublished` (que é onde o LiveKit
 *      informa a câmera ligando/desligando), e nenhum evento de track existe no
 *      banco. `camera.available` é sempre `false` e a UI explica o que falta.
 *
 * 4) CONVIDADOS × PRESENTES
 *    → `meeting_attendees` é presença DECLARADA (convite / RSVP), não medida.
 *      O hook cruza convidados com quem realmente entrou (fonte 1) e classifica
 *      cada pessoa em: compareceu / faltou / entrou sem convite.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Meeting, MeetingAttendee } from "./useMeetings";

/**
 * Cliente sem os tipos gerados. Necessário porque
 * `src/integrations/supabase/types.ts` NÃO reflete o banco de produção
 * (`meeting_participant_events` ainda não está lá). Escopo limitado a este
 * arquivo — nada de `any`.
 */
const db = supabase as unknown as SupabaseClient;

/* ────────────────────────────────────────────────────────────────
   Tipos públicos
   ──────────────────────────────────────────────────────────────── */

export type PresenceSource = "participant_events" | "recording_events" | "none";

/** Um trecho contínuo dentro da sala (entrada → saída). */
export interface PresenceSession {
  joinedAt: string;
  leftAt: string | null;
  /** `true` quando a saída não foi registrada e o fim foi inferido. */
  inferredEnd: boolean;
  seconds: number;
}

export interface MeetingParticipantStat {
  /** Chave estável: employee_id quando existe, senão a identity do LiveKit. */
  key: string;
  identity: string | null;
  employeeId: string | null;
  name: string;
  avatarUrl: string | null;
  /** Papel declarado em `meeting_attendees`, quando convidado. */
  invitedRole: MeetingAttendee["role"] | null;
  wasInvited: boolean;
  firstJoinAt: string | null;
  lastLeaveAt: string | null;
  /** Soma de todas as sessões. */
  totalSeconds: number;
  /** % da duração total da reunião. `null` quando a duração é desconhecida. */
  attendanceRate: number | null;
  sessions: PresenceSession[];
  /** Nº de reentradas (sessões além da primeira). */
  reconnections: number;
}

export interface AbsentInvitee {
  key: string;
  employeeId: string | null;
  name: string;
  avatarUrl: string | null;
  role: MeetingAttendee["role"];
  /** Status declarado no convite (`pending`, `confirmed`, `declined`…). */
  declaredStatus: MeetingAttendee["attendance_status"];
}

export interface MeetingPresenceStats {
  /** `false` = não há NENHUM evento de presença medido para esta reunião. */
  available: boolean;
  source: PresenceSource;
  participants: MeetingParticipantStat[];
  absentInvitees: AbsentInvitee[];
  invitedCount: number;
  attendedCount: number;
  /** Presentes que não estavam na lista de convidados. */
  uninvitedCount: number;
  /** Média de permanência entre quem compareceu, em segundos. */
  averageSeconds: number;
}

export interface SpeakerStat {
  /** Rótulo anônimo da diarização, ex.: "Speaker 1". */
  speaker: string;
  characters: number;
  words: number;
  /** Fatia da fala total, 0..1. */
  share: number;
  /** Segundos DERIVADOS de `share × duração`. Estimativa, nunca medição. */
  estimatedSeconds: number | null;
  turns: number;
}

export interface MeetingSpeechStats {
  /** `false` = reunião sem transcrição utilizável. */
  available: boolean;
  /** Sempre `true`: derivado de volume de texto, não de cronômetro. */
  isEstimate: true;
  /**
   * Sempre `true` com o pipeline atual: o Soniox devolve rótulos anônimos
   * (Speaker 1/2/3) e não a identidade da pessoa.
   */
  speakersAreAnonymous: true;
  speakers: SpeakerStat[];
  totalCharacters: number;
  /** Duração usada como base da estimativa (segundos), se conhecida. */
  basisSeconds: number | null;
}

export interface MeetingCameraStats {
  /** Sempre `false` hoje — ver cabeçalho do arquivo. */
  available: false;
  /** Motivo legível, exibido na UI. */
  reason: string;
  /** O que precisa existir para a métrica passar a funcionar. */
  missing: string[];
}

export interface MeetingStats {
  meetingId: string;
  /** Duração da reunião em segundos: `duration_seconds` ou `ended_at - started_at`. */
  durationSeconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
  presence: MeetingPresenceStats;
  speech: MeetingSpeechStats;
  camera: MeetingCameraStats;
}

/* ────────────────────────────────────────────────────────────────
   Leitura defensiva de linhas cruas
   ──────────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function obj(value: unknown): Row | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : null;
}

/** `metadata` do LiveKit chega como string JSON — aceita objeto também. */
function parseMetadata(value: unknown): Row | null {
  const direct = obj(value);
  if (direct) return direct;
  const raw = str(value);
  if (!raw) return null;
  try {
    return obj(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Evento normalizado, independente da tabela de origem. */
interface NormalizedEvent {
  kind: "join" | "leave";
  at: string;
  /**
   * Chave de AGRUPAMENTO — precisa ser estável entre reconexões.
   *  - `meeting_participant_events`: `participant_key` (`employee:<uuid>` / `guest:<uuid>`).
   *  - `meeting_recording_events` (legado): a identity crua; a consolidação por
   *    `employee_id` no hook resolve a instabilidade por outro caminho.
   */
  key: string;
  /** Identity crua do LiveKit — só para auditoria/depuração, nunca para agrupar. */
  identity: string | null;
  name: string | null;
  employeeId: string | null;
  /** `session_seconds` já calculado pela origem, quando disponível (evento `left`). */
  sessionSeconds: number | null;
}

/**
 * Bots do LiveKit (gravação e agentes) não são gente e não contam presença.
 *
 * A checagem é por valor EXPLÍCITO de bot (`EGRESS`/`AGENT`) e não por
 * `!== "STANDARD"`: `meeting_participant_events` usa outro vocabulário em
 * `participant_kind` (`member`/`guest`/`unknown`), e um teste por diferença
 * descartaria todos os participantes reais da tabela nova.
 */
function isBotParticipant(identity: string | null, participantKind: string | null): boolean {
  const kind = participantKind?.toUpperCase();
  if (kind === "EGRESS" || kind === "AGENT") return true;
  if (!identity) return false;
  return identity.startsWith("EG_") || identity.startsWith("agent-");
}

/** `meeting_recording_events` → eventos normalizados. */
function normalizeRecordingEvents(rows: Row[]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const row of rows) {
    const eventType = str(row.event_type);
    if (eventType !== "participant_joined" && eventType !== "participant_left") continue;
    const at = str(row.created_at);
    if (!at) continue;

    const payload = obj(row.payload);
    const participant = payload ? obj(payload.participant) : null;
    const identity =
      str(row.participant_identity) ?? (participant ? str(participant.identity) : null);
    if (!identity) continue;

    const participantKind = participant ? str(participant.kind) : null;
    if (isBotParticipant(identity, participantKind)) continue;

    const meta = participant ? parseMetadata(participant.metadata) : null;

    out.push({
      kind: eventType === "participant_joined" ? "join" : "leave",
      at,
      // Legado não tem `participant_key`; a identity é a única chave disponível
      // e a consolidação por `employee_id` no hook cobre as reconexões.
      key: identity,
      identity,
      name: participant ? str(participant.name) : null,
      employeeId: meta ? str(meta.employee_id) : null,
      sessionSeconds: null,
    });
  }
  return out;
}

/**
 * `meeting_participant_events` → eventos normalizados.
 *
 * Schema da tabela (confirmado com a frente que a criou):
 *   id, tenant_id, meeting_id, huddle_id, event_type, occurred_at,
 *   participant_key, participant_kind, participant_role, employee_id,
 *   guest_request_id, display_name, participant_identity, session_seconds,
 *   reconnect_count, livekit_event_id, created_at
 *
 * Dois detalhes que mudam a conta:
 *  - `event_type` tem TRÊS valores: `joined` | `reconnected` | `left`.
 *    `reconnected` conta como abertura de sessão, igual a `joined`.
 *  - o agrupamento é por `participant_key`, estável entre reconexões.
 *    `participant_identity` fica só como rastro de auditoria.
 */
function normalizeParticipantEvents(rows: Row[]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const row of rows) {
    const rawType = str(row.event_type);
    if (!rawType) continue;
    const type = rawType.toLowerCase();
    const kind: "join" | "leave" | null =
      type === "left" || type === "leave" || type === "disconnected"
        ? "leave"
        : type === "joined" || type === "join" || type === "reconnected"
          ? "join"
          : null;
    if (!kind) continue;

    const at = str(row.occurred_at) ?? str(row.created_at);
    if (!at) continue;

    const identity = str(row.participant_identity);
    const employeeId = str(row.employee_id);
    // A chave de agrupamento é `participant_key`. Os fallbacks só existem para
    // uma linha malformada não sumir do painel — nunca são o caminho normal.
    const key =
      str(row.participant_key) ??
      (employeeId ? `employee:${employeeId}` : null) ??
      str(row.guest_request_id) ??
      identity;
    if (!key) continue;

    if (isBotParticipant(identity, str(row.participant_kind))) continue;

    const rawSeconds = row.session_seconds;
    const sessionSeconds =
      typeof rawSeconds === "number" && Number.isFinite(rawSeconds) && rawSeconds > 0
        ? Math.round(rawSeconds)
        : null;

    out.push({
      kind,
      at,
      key,
      identity,
      name: str(row.display_name),
      employeeId,
      sessionSeconds,
    });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────
   Pareamento join/leave → sessões
   ──────────────────────────────────────────────────────────────── */

interface RawParticipant {
  key: string;
  identity: string | null;
  name: string | null;
  employeeId: string | null;
  sessions: PresenceSession[];
}

/**
 * Pareia entradas e saídas pela chave de agrupamento (`key`), em ordem
 * cronológica.
 *
 * Regras (conservadoras de propósito):
 *  - `join` seguido de `join` sem `leave` = reconexão sem saída registrada;
 *    a sessão anterior fecha no instante do novo `join`.
 *  - `leave` sem `join` aberto é descartado (evento órfão).
 *  - sessão ainda aberta no fim fecha em `fallbackEnd` (ended_at da reunião)
 *    e é marcada com `inferredEnd`.
 */
function buildParticipants(
  events: NormalizedEvent[],
  fallbackEnd: string | null,
): RawParticipant[] {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const map = new Map<string, RawParticipant>();
  const open = new Map<string, string>();

  /**
   * Fecha a sessão aberta de `key`.
   *
   * `reportedSeconds` é o `session_seconds` que a origem já calculou. Quando vem
   * preenchido ele vence o cálculo local (a origem viu o evento cru do LiveKit);
   * quando vem nulo — sessão que não fechou direito — o pareamento próprio
   * assume. Por isso o cálculo local permanece aqui.
   */
  const closeOpen = (
    key: string,
    endAt: string | null,
    inferred: boolean,
    reportedSeconds: number | null,
  ) => {
    const start = open.get(key);
    if (!start) return;
    open.delete(key);
    const entry = map.get(key);
    if (!entry) return;
    const startMs = Date.parse(start);
    const endMs = endAt ? Date.parse(endAt) : NaN;
    const computed =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? Math.round((endMs - startMs) / 1000)
        : 0;
    entry.sessions.push({
      joinedAt: start,
      leftAt: endAt,
      inferredEnd: inferred,
      seconds: reportedSeconds ?? computed,
    });
  };

  for (const ev of ordered) {
    let entry = map.get(ev.key);
    if (!entry) {
      entry = {
        key: ev.key,
        identity: ev.identity,
        name: ev.name,
        employeeId: ev.employeeId,
        sessions: [],
      };
      map.set(ev.key, entry);
    }
    // Nome/employee_id/identity podem vir só em um dos eventos — preenche o que faltar.
    if (!entry.name && ev.name) entry.name = ev.name;
    if (!entry.employeeId && ev.employeeId) entry.employeeId = ev.employeeId;
    if (!entry.identity && ev.identity) entry.identity = ev.identity;

    if (ev.kind === "join") {
      // `joined`/`reconnected` sem `left` no meio: fecha a anterior no instante
      // da nova entrada, em vez de deixar duas sessões abertas.
      if (open.has(ev.key)) closeOpen(ev.key, ev.at, true, null);
      open.set(ev.key, ev.at);
    } else {
      closeOpen(ev.key, ev.at, false, ev.sessionSeconds);
    }
  }

  // Sessões ainda abertas: fecham no fim da reunião (inferido).
  for (const key of Array.from(open.keys())) {
    closeOpen(key, fallbackEnd, true, null);
  }

  return Array.from(map.values());
}

/* ────────────────────────────────────────────────────────────────
   Transcrição → proporção de fala
   ──────────────────────────────────────────────────────────────── */

const SPEAKER_LINE = /^\s*\[([^\]]+)\]\s*:\s*(.*)$/;

/**
 * Formato real gravado em `transcript_raw`/`transcript_final`:
 *   `[Speaker 1]: texto da fala`
 *   `[Speaker 2]: outra fala`
 * Uma linha por turno, sem timestamp. Ver `useLiveKitTranscription`.
 */
export function parseSpeechStats(
  transcript: string | null,
  basisSeconds: number | null,
): MeetingSpeechStats {
  const empty: MeetingSpeechStats = {
    available: false,
    isEstimate: true,
    speakersAreAnonymous: true,
    speakers: [],
    totalCharacters: 0,
    basisSeconds,
  };
  if (!transcript || !transcript.trim()) return empty;

  const acc = new Map<string, { characters: number; words: number; turns: number }>();

  for (const line of transcript.split("\n")) {
    const match = SPEAKER_LINE.exec(line);
    if (!match) continue;
    const speaker = match[1].trim();
    const text = match[2].trim();
    if (!speaker || !text) continue;
    const current = acc.get(speaker) ?? { characters: 0, words: 0, turns: 0 };
    current.characters += text.length;
    current.words += text.split(/\s+/).filter(Boolean).length;
    current.turns += 1;
    acc.set(speaker, current);
  }

  const totalCharacters = Array.from(acc.values()).reduce((s, v) => s + v.characters, 0);
  if (totalCharacters === 0) return empty;

  const speakers: SpeakerStat[] = Array.from(acc.entries())
    .map(([speaker, v]) => {
      const share = v.characters / totalCharacters;
      return {
        speaker,
        characters: v.characters,
        words: v.words,
        turns: v.turns,
        share,
        estimatedSeconds: basisSeconds != null ? Math.round(share * basisSeconds) : null,
      };
    })
    .sort((a, b) => b.characters - a.characters);

  return {
    available: true,
    isEstimate: true,
    speakersAreAnonymous: true,
    speakers,
    totalCharacters,
    basisSeconds,
  };
}

/* ────────────────────────────────────────────────────────────────
   Query
   ──────────────────────────────────────────────────────────────── */

/** Erros que significam "a tabela ainda não existe" — não são falha real. */
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "42P01" || code === "PGRST205" || code === "PGRST202") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("could not find the table");
}

interface PresenceQueryResult {
  source: PresenceSource;
  participants: RawParticipant[];
}

async function fetchPresence(
  meetingId: string,
  tenantId: string,
  fallbackEnd: string | null,
): Promise<PresenceQueryResult> {
  // 1) Tabela nova (dedicada). Ainda pode não existir no banco.
  const primary = await db
    .from("meeting_participant_events")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("tenant_id", tenantId);

  if (!primary.error) {
    const events = normalizeParticipantEvents((primary.data ?? []) as Row[]);
    if (events.length > 0) {
      return { source: "participant_events", participants: buildParticipants(events, fallbackEnd) };
    }
  } else if (!isMissingTableError(primary.error)) {
    throw primary.error;
  }

  // 2) Fonte legada — o livekit-webhook já grava join/leave aqui há meses.
  const legacy = await db
    .from("meeting_recording_events")
    .select("event_type, participant_identity, created_at, payload")
    .eq("meeting_id", meetingId)
    .eq("tenant_id", tenantId)
    .in("event_type", ["participant_joined", "participant_left"]);

  if (legacy.error) throw legacy.error;

  const events = normalizeRecordingEvents((legacy.data ?? []) as Row[]);
  if (events.length === 0) return { source: "none", participants: [] };
  return { source: "recording_events", participants: buildParticipants(events, fallbackEnd) };
}

/* ────────────────────────────────────────────────────────────────
   Hook
   ──────────────────────────────────────────────────────────────── */

/** Diretório mínimo para resolver avatar/nome de um employee_id. */
export interface EmployeeDirectoryEntry {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

export interface UseMeetingStatsOptions {
  /** Lista de colaboradores do tenant, para resolver avatar e nome. */
  employees?: EmployeeDirectoryEntry[];
}

export function useMeetingStats(
  meeting: Meeting | null | undefined,
  options?: UseMeetingStatsOptions,
) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const meetingId = meeting?.id;
  const employees = options?.employees;

  // Duração: prefere o valor gravado; senão deriva de started_at/ended_at.
  const durationSeconds = useMemo<number | null>(() => {
    if (!meeting) return null;
    if (typeof meeting.duration_seconds === "number" && meeting.duration_seconds > 0) {
      return meeting.duration_seconds;
    }
    if (meeting.started_at && meeting.ended_at) {
      const diff = Date.parse(meeting.ended_at) - Date.parse(meeting.started_at);
      if (Number.isFinite(diff) && diff > 0) return Math.round(diff / 1000);
    }
    return null;
  }, [meeting]);

  const presenceQuery = useQuery({
    queryKey: ["meeting-stats", tenantId, meetingId],
    enabled: !!tenantId && !!meetingId,
    staleTime: 30_000,
    queryFn: () => fetchPresence(meetingId!, tenantId!, meeting?.ended_at ?? null),
  });

  const stats = useMemo<MeetingStats | null>(() => {
    if (!meeting) return null;

    const employeeById = new Map<string, EmployeeDirectoryEntry>();
    (employees ?? []).forEach((e) => employeeById.set(e.id, e));

    const attendees = meeting.meeting_attendees ?? [];
    const attendeeByEmployee = new Map<string, MeetingAttendee>();
    attendees.forEach((a) => {
      if (a.employee_id) attendeeByEmployee.set(a.employee_id, a);
    });
    // Fallback por nome normalizado, para convidados sem employee_id.
    const norm = (s: string) => s.trim().toLowerCase();
    const attendeeByName = new Map<string, MeetingAttendee>();
    attendees.forEach((a) => attendeeByName.set(norm(a.name), a));

    const raw = presenceQuery.data?.participants ?? [];
    const source: PresenceSource = presenceQuery.data?.source ?? "none";

    // Consolida por pessoa: a mesma pessoa pode reentrar com identity nova
    // (o LiveKit inclui timestamp na identity de convidado).
    const merged = new Map<string, RawParticipant>();
    for (const p of raw) {
      // Na tabela nova `p.key` já é estável (`employee:`/`guest:`), então este
      // merge é no-op. No legado ele é o que reúne as identities fragmentadas
      // da mesma pessoa — por isso `employee_id` vem primeiro.
      const key = p.employeeId ?? p.key;
      const existing = merged.get(key);
      if (existing) {
        existing.sessions.push(...p.sessions);
        if (!existing.name && p.name) existing.name = p.name;
        if (!existing.employeeId && p.employeeId) existing.employeeId = p.employeeId;
      } else {
        merged.set(key, { ...p, sessions: [...p.sessions] });
      }
    }

    const participants: MeetingParticipantStat[] = Array.from(merged.entries())
      .map(([key, p]) => {
        const sessions = [...p.sessions].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
        const totalSeconds = sessions.reduce((s, v) => s + v.seconds, 0);
        const employee = p.employeeId ? employeeById.get(p.employeeId) : undefined;
        const attendee =
          (p.employeeId ? attendeeByEmployee.get(p.employeeId) : undefined) ??
          (p.name ? attendeeByName.get(norm(p.name)) : undefined);
        const name =
          employee?.full_name?.trim() || p.name?.trim() || attendee?.name || "Participante";
        return {
          key,
          identity: p.identity,
          employeeId: p.employeeId,
          name,
          avatarUrl: employee?.avatar_url ?? null,
          invitedRole: attendee?.role ?? null,
          wasInvited: !!attendee,
          firstJoinAt: sessions[0]?.joinedAt ?? null,
          lastLeaveAt: sessions[sessions.length - 1]?.leftAt ?? null,
          totalSeconds,
          attendanceRate:
            durationSeconds && durationSeconds > 0
              ? Math.min(1, totalSeconds / durationSeconds)
              : null,
          sessions,
          reconnections: Math.max(0, sessions.length - 1),
        };
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds);

    const presentEmployeeIds = new Set(
      participants.map((p) => p.employeeId).filter((id): id is string => !!id),
    );
    const presentNames = new Set(participants.map((p) => norm(p.name)));

    const absentInvitees: AbsentInvitee[] = attendees
      .filter((a) => {
        if (a.employee_id && presentEmployeeIds.has(a.employee_id)) return false;
        return !presentNames.has(norm(a.name));
      })
      .map((a) => {
        const employee = a.employee_id ? employeeById.get(a.employee_id) : undefined;
        return {
          key: a.id,
          employeeId: a.employee_id,
          name: employee?.full_name?.trim() || a.name,
          avatarUrl: employee?.avatar_url ?? null,
          role: a.role,
          declaredStatus: a.attendance_status,
        };
      });

    const attendedCount = participants.length;
    const averageSeconds =
      attendedCount > 0
        ? Math.round(participants.reduce((s, p) => s + p.totalSeconds, 0) / attendedCount)
        : 0;

    const presence: MeetingPresenceStats = {
      available: source !== "none" && participants.length > 0,
      source,
      participants,
      absentInvitees,
      invitedCount: attendees.length,
      attendedCount,
      uninvitedCount: participants.filter((p) => !p.wasInvited).length,
      averageSeconds,
    };

    const speech = parseSpeechStats(
      meeting.transcript_final ?? meeting.transcript_raw ?? null,
      durationSeconds,
    );

    const camera: MeetingCameraStats = {
      available: false,
      reason:
        "O GT3 ainda não registra quando a câmera é ligada ou desligada — o webhook do LiveKit não assina eventos de track.",
      missing: [
        "Assinar os eventos track_published e track_unpublished no painel do LiveKit Cloud.",
        "Tratar esses eventos em supabase/functions/livekit-webhook/index.ts, filtrando source = CAMERA.",
        "Persistir cada evento (participante, ligou/desligou, instante) para permitir o cálculo por sessão.",
      ],
    };

    return {
      meetingId: meeting.id,
      durationSeconds,
      startedAt: meeting.started_at,
      endedAt: meeting.ended_at,
      presence,
      speech,
      camera,
    };
  }, [meeting, employees, presenceQuery.data, durationSeconds]);

  return {
    stats,
    isLoading: presenceQuery.isLoading,
    isError: presenceQuery.isError,
    error: presenceQuery.error as Error | null,
    refetch: presenceQuery.refetch,
  };
}

/* ────────────────────────────────────────────────────────────────
   Formatação
   ──────────────────────────────────────────────────────────────── */

/** `3720` → `"1h 02min"`; `95` → `"1min 35s"`; `12` → `"12s"`. */
export function formatDurationShort(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const totalMinutes = Math.floor(seconds / 60);
  const restSeconds = Math.round(seconds % 60);
  if (totalMinutes < 60) {
    return restSeconds > 0 ? `${totalMinutes}min ${restSeconds}s` : `${totalMinutes}min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}min` : `${hours}h`;
}
