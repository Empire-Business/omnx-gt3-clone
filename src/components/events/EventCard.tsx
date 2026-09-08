/**
 * EventCard — cartão de um evento interno na listagem.
 *
 * Acessibilidade: o cartão é um `<article>` cujo `<h3>` contém o único elemento
 * clicável (padrão "stretched link" — o botão recebe um `::after` que cobre o
 * cartão inteiro). Assim o leitor de tela anuncia todo o conteúdo (data,
 * escopo, status, ficha, reunião) em vez de um `aria-label` que engolia tudo.
 */
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Clock,
  Network,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { markdownToSingleLine } from "@/lib/markdown-text";
import {
  InternalEvent,
  InternalEventScope,
  SCOPE_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
} from "./events-api";

interface EventCardProps {
  event: InternalEvent;
  onOpen: (event: InternalEvent) => void;
  /** Exibe selo "Inscrito" quando o usuário atual já se inscreveu */
  registered?: boolean;
  /**
   * Nº de inscritos ativos. `undefined` quando o dado não existe ou não é
   * confiável para este usuário (o RLS esconde as inscrições alheias) — nesse
   * caso nada é exibido, nunca "0 inscritos".
   */
  registrationsCount?: number;
}

const SCOPE_ICONS: Record<InternalEventScope, typeof Building2> = {
  company: Building2,
  areas: Network,
  custom: UserRound,
};

function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

export function EventCard({ event, onOpen, registered, registrationsCount }: EventCardProps) {
  const start = safeDate(event.starts_at);
  const end = safeDate(event.ends_at);
  const ScopeIcon = SCOPE_ICONS[event.scope] ?? Building2;
  const showCount = event.registration_required && typeof registrationsCount === "number";
  const descriptionPreview = markdownToSingleLine(event.description, 160);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border border-border bg-card text-left",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-foreground/15",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        event.status === "cancelled" && "opacity-70",
      )}
    >
      {/* Capa */}
      <div className="relative h-28 w-full bg-muted overflow-hidden">
        {event.cover_url ? (
          <img
            src={event.cover_url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/15 via-muted to-muted flex items-center justify-center">
            <CalendarDays className="w-7 h-7 text-muted-foreground/50" aria-hidden="true" />
          </div>
        )}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
          {registered && (
            <Badge variant="default" className="text-[10px]">
              Inscrito
            </Badge>
          )}
          <Badge variant={STATUS_VARIANTS[event.status]} className="text-[10px]">
            {STATUS_LABELS[event.status]}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pt-3 pb-3.5">
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <ScopeIcon className="w-3 h-3" aria-hidden="true" />
          {SCOPE_LABELS[event.scope]}
        </div>

        <h3 className="text-[15px] font-semibold text-foreground tracking-tight leading-snug line-clamp-2">
          <button
            type="button"
            onClick={() => onOpen(event)}
            className={cn(
              "text-left outline-none",
              // Stretched link: cobre o cartão inteiro, mantendo um único
              // elemento focável por teclado.
              "after:absolute after:inset-0 after:content-['']",
            )}
          >
            {event.title}
          </button>
        </h3>

        {descriptionPreview && (
          /* Texto puro: o card não renderiza Markdown, e sem isso o resumo
             aparecia com `**` e `###` à mostra. */
          <p
            className="mt-1 text-[13px] text-muted-foreground leading-relaxed line-clamp-2"
            title={descriptionPreview}
          >
            {descriptionPreview}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {start && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
              {format(start, "dd MMM, HH:mm", { locale: ptBR })}
            </span>
          )}
          {end && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              até {format(end, "HH:mm", { locale: ptBR })}
            </span>
          )}
          {showCount && (
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              {registrationsCount} {registrationsCount === 1 ? "inscrito" : "inscritos"}
            </span>
          )}
          {event.registration_required && (
            <span className="inline-flex items-center gap-1">
              <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
              Com ficha
            </span>
          )}
          {event.meeting_id && (
            <span className="inline-flex items-center gap-1 text-primary">
              <Video className="w-3.5 h-3.5" aria-hidden="true" />
              Reunião vinculada
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
