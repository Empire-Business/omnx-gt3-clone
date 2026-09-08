/**
 * EventsCalendar — visão de calendário dos eventos internos.
 * Segue o mesmo padrão (localizer, mensagens em pt-BR, CSS compartilhado) do
 * `MeetingsCalendar`, para que as duas telas se pareçam.
 */
import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type Event as RbcEvent, type View } from "react-big-calendar";
import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isValid,
  parse,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CalendarDays, ClipboardList } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "@/styles/big-calendar.css";
import { InternalEvent, InternalEventStatus, STATUS_LABELS } from "./events-api";

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
  event: "Evento",
  noEventsInRange: "Nenhum evento neste período.",
  showMore: (n: number) => `+${n} mais`,
};

interface CalendarEntry extends RbcEvent {
  resource: InternalEvent;
}

/**
 * Cores por status, com tokens semânticos (nunca cor fixa).
 *
 * Não reaproveitamos as classes herdadas de Reuniões (`rbc-event-live` pinta de
 * destrutivo e pulsa infinitamente — um evento cancelado parecia estar ao vivo,
 * e rascunho/encerrado ficavam idênticos). O modificador `!` é necessário para
 * vencer o `background` que o CSS base do react-big-calendar aplica em
 * `.rbc-event`.
 */
const STATUS_EVENT_CLASSES: Record<InternalEventStatus, string> = {
  published: "!bg-primary !text-primary-foreground",
  draft: "!bg-muted !text-muted-foreground !border !border-dashed !border-border",
  cancelled: "!bg-destructive/20 !text-destructive !border-l-4 !border-l-destructive",
  done: "!bg-done-bg !text-done",
};

/** Sigla curta mostrada no próprio evento — o status não fica só na cor. */
const STATUS_SHORT: Record<InternalEventStatus, string> = {
  published: "",
  draft: "Rascunho",
  cancelled: "Cancelado",
  done: "Encerrado",
};

const LEGEND: Array<{ status: InternalEventStatus; dot: string }> = [
  { status: "published", dot: "bg-primary" },
  { status: "draft", dot: "bg-muted-foreground/50" },
  { status: "cancelled", dot: "bg-destructive" },
  { status: "done", dot: "bg-done" },
];

interface Props {
  events: InternalEvent[];
  onSelect: (event: InternalEvent) => void;
}

export function EventsCalendar({ events, onSelect }: Props) {
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState<Date>(new Date());

  const entries = useMemo<CalendarEntry[]>(() => {
    return events
      .map((e) => {
        const start = parseISO(e.starts_at);
        if (!isValid(start)) return null;
        const parsedEnd = e.ends_at ? parseISO(e.ends_at) : null;
        const end = parsedEnd && isValid(parsedEnd) ? parsedEnd : new Date(start.getTime() + 60 * 60_000);
        return { title: e.title, start, end, resource: e } as CalendarEntry;
      })
      .filter((e): e is CalendarEntry => e !== null);
  }, [events]);

  /** Intervalo que o calendário está de fato exibindo. */
  const visibleRange = useMemo(() => {
    switch (view) {
      case "day":
        return { start: startOfDay(date), end: endOfDay(date), label: "no dia" };
      case "week":
        return {
          start: startOfWeek(date, { locale: ptBR }),
          end: endOfWeek(date, { locale: ptBR }),
          label: "na semana",
        };
      case "agenda":
        return { start: startOfDay(date), end: endOfDay(addDays(date, 30)), label: "na agenda" };
      default:
        return { start: startOfMonth(date), end: endOfMonth(date), label: "no mês" };
    }
  }, [view, date]);

  /** Contador do cabeçalho — reflete o que está visível, não a lista inteira. */
  const visibleCount = useMemo(
    () =>
      entries.filter((e) => {
        const start = e.start as Date | undefined;
        return !!start && start >= visibleRange.start && start <= visibleRange.end;
      }).length,
    [entries, visibleRange],
  );

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 border-b border-border bg-muted/20">
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
          {visibleCount} {visibleCount === 1 ? "evento" : "eventos"} {visibleRange.label}
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {LEGEND.map(({ status, dot }) => (
            <li key={status} className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-sm", dot)} aria-hidden="true" />
              {STATUS_LABELS[status]}
            </li>
          ))}
        </ul>
      </div>

      <div className="p-3 h-[calc(100vh-320px)] min-h-[520px]">
        <Calendar
          localizer={localizer}
          events={entries}
          startAccessor="start"
          endAccessor="end"
          culture="pt-BR"
          messages={messages}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={["month", "week", "day", "agenda"]}
          popup
          onSelectEvent={(e) => onSelect((e as CalendarEntry).resource)}
          eventPropGetter={(e) => {
            const item = (e as CalendarEntry).resource;
            return { className: STATUS_EVENT_CLASSES[item.status] ?? "" };
          }}
          components={{
            event: ({ event }) => {
              const item = (event as CalendarEntry).resource;
              const start = (event as CalendarEntry).start as Date | undefined;
              const shortStatus = STATUS_SHORT[item.status];
              return (
                <div className="flex flex-col gap-0.5 leading-tight overflow-hidden h-full px-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <CalendarDays className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span
                      className={cn(
                        "font-semibold text-[11px] truncate",
                        item.status === "cancelled" && "line-through",
                      )}
                    >
                      {item.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] opacity-90">
                    {start && <span className="font-mono tracking-tight">{format(start, "HH:mm")}</span>}
                    {shortStatus && (
                      <span className="font-mono uppercase tracking-[0.08em] truncate">
                        {shortStatus}
                      </span>
                    )}
                    {item.registration_required && (
                      <ClipboardList className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                    )}
                  </div>
                </div>
              );
            },
          }}
        />
      </div>
    </div>
  );
}
