/**
 * MeetingsCalendar — v8.13.0
 * Calendário de reuniões alinhado ao DS Empire/GT3.
 * - Expansão de recorrentes limitada ao range visível (via onRangeChange)
 * - Dedupe por id + start + title (evita pilhas em "Daily TI")
 * - Tile compacto com status, ícone e mono-time
 * - Header com legenda e contador
 */
import { useMemo, useState, useCallback } from "react";
import { Calendar, dateFnsLocalizer, type Event, type View } from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  addDays,
  isAfter,
  isBefore,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  endOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Repeat, Crown, Bell, Video, AlertCircle, Radio, CheckCircle2, Clock, MapPin, ArrowRight } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "@/styles/big-calendar.css";
import type { Meeting } from "@/hooks/useMeetings";
import type { RecurringMeeting } from "@/hooks/useMeetingRecurrence";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getMeetingJoinability, formatOpensIn } from "@/lib/meeting-window";

const locales = { "pt-BR": ptBR };

const localizer = dateFnsLocalizer({
  format: (date: Date, fmt: string) => format(date, fmt, { locale: ptBR }),
  parse: (str: string, fmt: string) => parse(str, fmt, new Date(), { locale: ptBR }),
  startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }),
  getDay,
  locales,
});

const messages = {
  allDay: "Dia inteiro",
  previous: "Anterior",
  next: "Próximo",
  today: "Hoje",
  month: "Mês",
  week: "Semana",
  day: "Dia",
  agenda: "Agenda",
  date: "Data",
  time: "Hora",
  event: "Reunião",
  noEventsInRange: "Nenhuma reunião neste período.",
  showMore: (n: number) => `+${n} mais`,
};

interface CalendarMeeting extends Event {
  resource: Meeting | RecurringMeeting;
  isRecurringInstance?: boolean;
  dedupeKey: string;
}

interface Props {
  meetings: Meeting[];
  recurringMeetings?: RecurringMeeting[];
  onSelect: (meeting: Meeting | RecurringMeeting) => void;
  onSelectSlot?: (slotInfo: { start: Date; end: Date }) => void;
}

const DOW_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function expandRecurringOccurrences(
  rm: RecurringMeeting,
  windowStart: Date,
  windowEnd: Date,
): { start: Date; end: Date }[] {
  const pattern = rm.recurrence_pattern;
  if (!pattern) return [];
  const [hh, mm] = (pattern.time || "09:00").split(":").map(Number);
  const endDate = pattern.end_date ? new Date(pattern.end_date) : null;
  const allowedDays = pattern.freq === "daily"
    ? [0, 1, 2, 3, 4, 5, 6]
    : pattern.byday.map((d) => DOW_INDEX[d]).filter((n) => n !== undefined);

  const out: { start: Date; end: Date }[] = [];
  let cursor = new Date(windowStart);
  cursor.setHours(0, 0, 0, 0);

  while (!isAfter(cursor, windowEnd)) {
    if (endDate && isAfter(cursor, endDate)) break;
    if (allowedDays.includes(cursor.getDay())) {
      const start = new Date(cursor);
      start.setHours(hh || 9, mm || 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60_000);
      out.push({ start, end });
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

function getDefaultRange(view: View): { start: Date; end: Date } {
  const now = new Date();
  switch (view) {
    case "month":
      return {
        start: startOfWeek(startOfMonth(now), { locale: ptBR }),
        end: endOfWeek(endOfMonth(now), { locale: ptBR }),
      };
    case "week":
      return {
        start: startOfWeek(now, { locale: ptBR }),
        end: endOfWeek(now, { locale: ptBR }),
      };
    case "day":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "agenda":
    default:
      return { start: now, end: addDays(now, 30) };
  }
}

export function MeetingsCalendar({ meetings, recurringMeetings, onSelect, onSelectSlot }: Props) {
  const [view, setView] = useState<View>("week");
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date }>(() =>
    getDefaultRange("week"),
  );
  const [preview, setPreview] = useState<CalendarMeeting | null>(null);

  // Atualiza range quando o usuário navega/troca view
  const handleRangeChange = useCallback((range: any) => {
    if (Array.isArray(range)) {
      const sorted = [...range].sort((a, b) => a.getTime() - b.getTime());
      setVisibleRange({
        start: startOfDay(sorted[0]),
        end: endOfDay(sorted[sorted.length - 1]),
      });
    } else if (range?.start && range?.end) {
      setVisibleRange({
        start: startOfDay(new Date(range.start)),
        end: endOfDay(new Date(range.end)),
      });
    }
  }, []);

  const events = useMemo<CalendarMeeting[]>(() => {
    const windowStart = visibleRange.start;
    const windowEnd = visibleRange.end;

    // Reuniões pontuais — apenas as que caem na janela
    const oneTime = meetings
      .filter((m) => !(m as any).is_recurring)
      .map((m) => {
        const isoStart =
          (m as any).next_occurrence_at ||
          (m.scheduled_date
            ? `${m.scheduled_date}T${m.scheduled_time || "09:00"}`
            : m.started_at);
        if (!isoStart) return null;
        const start = new Date(isoStart);
        if (isBefore(start, windowStart) || isAfter(start, windowEnd)) return null;
        const durationMin =
          m.duration_seconds && m.duration_seconds > 0
            ? Math.round(m.duration_seconds / 60)
            : 60;
        const end = new Date(start.getTime() + durationMin * 60_000);
        return {
          title: m.title,
          start,
          end,
          resource: m,
          dedupeKey: `m-${m.id}-${start.toISOString()}`,
        } as CalendarMeeting;
      })
      .filter(Boolean) as CalendarMeeting[];

    // Recorrentes — expande só dentro da janela visível
    const recurring = (recurringMeetings ?? []).flatMap((rm) =>
      expandRecurringOccurrences(rm, windowStart, windowEnd).map((occ) => ({
        title: rm.title,
        start: occ.start,
        end: occ.end,
        resource: rm,
        isRecurringInstance: true,
        dedupeKey: `rec-${rm.id}-${occ.start.toISOString()}`,
      } as CalendarMeeting)),
    );

    // Dedupe: mesmo dedupeKey aparece só uma vez
    const seen = new Set<string>();
    return [...oneTime, ...recurring].filter((e) => {
      if (seen.has(e.dedupeKey)) return false;
      seen.add(e.dedupeKey);
      return true;
    });
  }, [meetings, recurringMeetings, visibleRange]);

  // Stats para header
  const stats = useMemo(() => {
    const total = events.length;
    const recurring = events.filter((e) => e.isRecurringInstance).length;
    const live = events.filter((e) => (e.resource as any).status === "recording").length;
    const completed = events.filter((e) => (e.resource as any).status === "completed").length;
    return { total, recurring, live, completed };
  }, [events]);

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* Header com legenda + stats */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            {stats.total} {stats.total === 1 ? "reunião" : "reuniões"}
            {stats.recurring > 0 && ` · ${stats.recurring} recorrente${stats.recurring === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-primary" /> Agendada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-primary/70 ring-1 ring-primary/30" /> Recorrente
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-destructive animate-pulse" /> Ao vivo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-muted-foreground/50" /> Encerrada
          </span>
        </div>
      </div>

      <div className="p-3 h-[calc(100vh-260px)] min-h-[600px]">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          culture="pt-BR"
          messages={messages}
          view={view}
          onView={(v) => {
            setView(v);
            setVisibleRange(getDefaultRange(v));
          }}
          views={["month", "week", "day", "agenda"]}
          step={30}
          timeslots={2}
          min={new Date(1970, 0, 1, 6, 0)}
          max={new Date(1970, 0, 1, 23, 0)}
          scrollToTime={new Date(1970, 0, 1, 8, 0)}
          onRangeChange={handleRangeChange}
          onSelectEvent={(e) => setPreview(e as CalendarMeeting)}
          onSelectSlot={onSelectSlot}
          selectable={!!onSelectSlot}
          popup
          eventPropGetter={(event) => {
            const ev = event as CalendarMeeting;
            const m = ev.resource as any;
            const isRec = ev.isRecurringInstance || m.is_recurring;
            const endTime = (ev.end as Date)?.getTime?.() ?? 0;
            const missed = isRec && endTime > 0 && Date.now() > endTime;
            const baseCls = isRec
              ? "rbc-event-recurring"
              : m.status === "completed"
                ? "rbc-event-completed"
                : m.status === "recording"
                  ? "rbc-event-live"
                  : "rbc-event-scheduled";
            return { className: missed ? `${baseCls} rbc-event-missed` : baseCls };
          }}
          components={{
            event: ({ event }) => {
              const ev = event as CalendarMeeting;
              const m = ev.resource as any;
              const isRec = ev.isRecurringInstance || m.is_recurring;
              const time = ev.start ? format(ev.start as Date, "HH:mm") : "";
              const endTime = (ev.end as Date)?.getTime?.() ?? 0;
              const missed = isRec && endTime > 0 && Date.now() > endTime;
              const isLive = m.status === "recording";
              const isDone = m.status === "completed";

              return (
                <div className="flex flex-col gap-0.5 leading-tight overflow-hidden h-full px-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    {isLive ? (
                      <Radio className="w-3 h-3 shrink-0" aria-hidden="true" />
                    ) : isRec ? (
                      <Repeat className="w-3 h-3 shrink-0" aria-hidden="true" />
                    ) : isDone ? (
                      <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <Video className="w-3 h-3 shrink-0" aria-hidden="true" />
                    )}
                    <span className={`font-semibold text-[11px] truncate ${missed ? "line-through" : ""}`}>
                      {ev.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] opacity-90 min-w-0 flex-wrap">
                    <span className="font-mono tracking-tight">{time}</span>
                    {missed && (
                      <span className="inline-flex items-center gap-0.5 font-medium">
                        <AlertCircle className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                        não iniciada
                      </span>
                    )}
                    {isRec && !missed && m.host_name && (
                      <span className="inline-flex items-center gap-0.5 truncate">
                        <Crown className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{String(m.host_name).split(" ")[0]}</span>
                      </span>
                    )}
                    {isRec && !missed && typeof m.reminder_minutes_before === "number" && m.reminder_minutes_before > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Bell className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                        {m.reminder_minutes_before}m
                      </span>
                    )}
                  </div>
                </div>
              );
            },
          }}
        />
      </div>

      {/* Modal de preview rápido */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-[440px] p-0 gap-0 overflow-hidden">
          {preview && (() => {
            const m = preview.resource as any;
            const isRec = preview.isRecurringInstance || m.is_recurring;
            const startDate = preview.start as Date;
            const endDate = preview.end as Date;
            const isLive = m.status === "recording";
            const isDone = m.status === "completed";
            const isCancelled = m.status === "cancelled";
            const roomName = m.livekit_room_name as string | undefined;
            // Para instâncias recorrentes, monta uma "ocorrência virtual" usando start do evento
            const meetingForJoin = preview.isRecurringInstance
              ? {
                  ...m,
                  next_occurrence_at: (preview.start as Date).toISOString(),
                  status: "scheduled",
                }
              : m;
            const joinability = getMeetingJoinability(meetingForJoin);
            const canJoin = joinability.joinable;

            const statusLabel = isLive
              ? "Ao vivo"
              : isDone
                ? "Encerrada"
                : isCancelled
                  ? "Cancelada"
                  : isRec
                    ? "Recorrente"
                    : "Agendada";
            const statusClass = isLive
              ? "bg-destructive/15 text-destructive"
              : isDone
                ? "bg-muted text-muted-foreground"
                : isCancelled
                  ? "bg-muted text-muted-foreground line-through"
                  : isRec
                    ? "bg-warning/15 text-warning"
                    : "bg-primary/15 text-primary";

            return (
              <>
                <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2 flex items-center gap-2">
                    {isRec ? <Repeat className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                    {isRec ? "Reunião recorrente" : "Reunião"}
                    <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium normal-case tracking-normal ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <DialogTitle className="text-[18px] font-semibold tracking-tight leading-snug">
                    {preview.title}
                  </DialogTitle>
                </DialogHeader>

                <div className="px-6 py-4 space-y-3">
                  <div className="flex items-center gap-2.5 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">
                        {format(startDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(startDate, "HH:mm")} – {format(endDate, "HH:mm")}
                      </p>
                    </div>
                  </div>

                  {m.location && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <p className="text-foreground truncate">{m.location}</p>
                    </div>
                  )}

                  {isRec && m.host_name && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <Crown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <p className="text-foreground">Host: {m.host_name}</p>
                    </div>
                  )}

                  {isRec && typeof m.reminder_minutes_before === "number" && m.reminder_minutes_before > 0 && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <Bell className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <p className="text-foreground">Aviso {m.reminder_minutes_before} min antes</p>
                    </div>
                  )}

                  {m.description && (
                    <div className="pt-1 border-t border-border">
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap">
                        {m.description}
                      </p>
                    </div>
                  )}
                </div>

                <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onSelect(preview.resource);
                      setPreview(null);
                    }}
                    className="text-xs"
                  >
                    Ver detalhes
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                  {canJoin ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        window.open(`/meet/${roomName}?role=guest`, "_blank", "noopener");
                        setPreview(null);
                      }}
                      className="gap-1.5"
                    >
                      <Video className="w-3.5 h-3.5" />
                      Entrar
                    </Button>
                  ) : joinability.opensAt ? (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Abre {formatOpensIn(joinability.opensAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {joinability.reason || "Sala indisponível"}
                    </span>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
