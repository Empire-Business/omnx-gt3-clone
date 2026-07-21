/**
 * meeting-window — regra de janela de entrada em reuniões.
 * Sala fica acessível de 10 min antes do horário agendado até 10 min após
 * o término previsto (start + duration). Reuniões em andamento ("recording")
 * são sempre acessíveis. Reuniões sem agendamento (instantâneas) seguem o
 * fluxo livre até serem encerradas.
 */

const PRE_OPEN_MS = 10 * 60 * 1000; // 10 minutos antes
const POST_CLOSE_MS = 10 * 60 * 1000; // 10 minutos após o término

export interface MeetingLike {
  status?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  duration_seconds?: number | null;
  estimated_duration_minutes?: number | null;
  next_occurrence_at?: string | null;
  livekit_room_name?: string | null;
}

export interface JoinabilityResult {
  joinable: boolean;
  /** Por que não pode entrar (mensagem curta para tooltip/toast) */
  reason?: string;
  /** Quando a sala abre (se ainda não abriu) */
  opensAt?: Date;
  /** Quando a sala fecha (se já abriu) */
  closesAt?: Date;
}

function buildScheduledStart(m: MeetingLike): Date | null {
  if (m.next_occurrence_at) {
    const d = new Date(m.next_occurrence_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (m.scheduled_date) {
    const time = m.scheduled_time || "09:00";
    const t = time.length === 5 ? `${time}:00` : time;
    const iso = `${m.scheduled_date}T${t}`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function getMeetingJoinability(m: MeetingLike, now: Date = new Date()): JoinabilityResult {
  if (!m.livekit_room_name) {
    return { joinable: false, reason: "Sem sala ativa" };
  }
  if (m.status === "completed") {
    return { joinable: false, reason: "Reunião encerrada" };
  }
  if (m.status === "cancelled") {
    return { joinable: false, reason: "Reunião cancelada" };
  }
  // Em andamento — sempre permite
  if (m.status === "recording") {
    return { joinable: true };
  }

  const start = buildScheduledStart(m);
  // Sem agendamento — instantânea, libera enquanto não estiver encerrada
  if (!start) {
    return { joinable: true };
  }

  // Prioridade: duração estimada (configurada) > duração real (já encerrada) > 60min default
  const durationMs =
    m.estimated_duration_minutes && m.estimated_duration_minutes > 0
      ? m.estimated_duration_minutes * 60 * 1000
      : m.duration_seconds && m.duration_seconds > 0
        ? m.duration_seconds * 1000
        : 60 * 60 * 1000;
  const opensAt = new Date(start.getTime() - PRE_OPEN_MS);
  const closesAt = new Date(start.getTime() + durationMs + POST_CLOSE_MS);
  const t = now.getTime();

  if (t < opensAt.getTime()) {
    return { joinable: false, reason: "Sala abre 10 min antes do início", opensAt };
  }
  if (t > closesAt.getTime()) {
    return { joinable: false, reason: "Janela de entrada encerrada", closesAt };
  }
  return { joinable: true, opensAt, closesAt };
}

/** Formata "abre em Xm" ou "abre às HH:MM" para tooltips */
export function formatOpensIn(opensAt: Date, now: Date = new Date()): string {
  const diffMs = opensAt.getTime() - now.getTime();
  if (diffMs <= 0) return "agora";
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `em ${diffMin} min`;
  const hh = String(opensAt.getHours()).padStart(2, "0");
  const mm = String(opensAt.getMinutes()).padStart(2, "0");
  const sameDay = opensAt.toDateString() === now.toDateString();
  if (sameDay) return `às ${hh}:${mm}`;
  const dd = String(opensAt.getDate()).padStart(2, "0");
  const MM = String(opensAt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${MM} ${hh}:${mm}`;
}
