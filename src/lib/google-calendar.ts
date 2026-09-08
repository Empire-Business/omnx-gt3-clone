/**
 * google-calendar — monta o link do "Google Calendar Web Intent" (a tela de
 * criação de evento do Google já pré-preenchida).
 *
 * Por que Web Intent e não a API oficial: a API exige OAuth (consentimento,
 * client id, refresh token e um backend guardando segredo) para fazer
 * exatamente o que a URL faz — só que sem o usuário ver o que está sendo salvo.
 * O Web Intent abre o Google já logado na conta do próprio navegador, o usuário
 * confere e salva. Zero credencial no bundle, zero escopo pedido.
 *
 * Fuso: as datas vão em UTC (sufixo `Z`). O Google converte para o fuso da
 * agenda de quem está salvando, então um evento das 14h em São Paulo continua
 * às 14h para quem está em São Paulo, sem depender de o GT3 e o Google
 * concordarem sobre qual é o fuso "certo".
 */

/** Uma hora, em ms — duração assumida quando o evento não tem fim declarado. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export interface GoogleCalendarEventInput {
  title: string;
  /** ISO do início (`internal_events.starts_at`). */
  startsAt: string;
  /** ISO do fim. Ausente ⇒ início + 1h. */
  endsAt?: string | null;
  /** Corpo do convite (descrição + links). */
  details?: string | null;
  /** Campo "Local" do Google — usamos o link da sala do GT3 quando existe. */
  location?: string | null;
}

/** `2026-09-04T17:30:00Z` → `20260904T173000Z`. */
function toGoogleUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Retorna a URL do Google Calendar, ou `null` quando a data do evento é
 * inválida (sem data não existe convite — quem chama decide o que dizer ao
 * usuário).
 */
export function buildGoogleCalendarUrl(input: GoogleCalendarEventInput): string | null {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const parsedEnd = input.endsAt ? new Date(input.endsAt) : null;
  const end =
    parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd.getTime() > start.getTime()
      ? parsedEnd
      : new Date(start.getTime() + DEFAULT_DURATION_MS);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title || "Evento",
    dates: `${toGoogleUtc(start)}/${toGoogleUtc(end)}`,
  });
  if (input.details) params.set("details", input.details);
  if (input.location) params.set("location", input.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Link absoluto de uma rota do GT3 (o convite do Google vai para fora do app —
 * caminho relativo lá dentro não leva a lugar nenhum).
 */
export function absoluteAppUrl(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
