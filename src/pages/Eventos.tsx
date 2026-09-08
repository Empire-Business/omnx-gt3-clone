/**
 * Eventos — área de Eventos Internos.
 *
 * Integra-se à aba de Reuniões: cada evento pode criar ou vincular uma reunião
 * nativa (LiveKit) através dos hooks existentes de `useMeetings` — ver
 * `EventMeetingPanel`.
 *
 * `useInternalEvents()` é chamado UMA única vez aqui; dados e mutations descem
 * por props para os filhos (regra do CLAUDE.md sobre hooks duplicados).
 *
 * Regra dos indicadores: cada KPI usa EXATAMENTE o mesmo predicado do filtro
 * que ele abre (`matchesFilter`), para que o número do cartão e a lista que
 * aparece ao clicar nunca divirjam.
 */
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { EmptyState, KpiCard } from "@/components/shared/SharedComponents";
import {
  AlertCircle,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  LayoutGrid,
  Plus,
  RotateCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { isAfter, isValid, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePermissions } from "@/hooks/usePermissions";
import { useInternalEvents } from "@/hooks/useInternalEvents";
import type { InternalEventInput } from "@/hooks/useInternalEvents";
import {
  useEventRegistrationCounts,
  useMyEventRegistrations,
} from "@/hooks/useEventRegistrations";
import { EventCard } from "@/components/events/EventCard";
import { EventDetail } from "@/components/events/EventDetail";
import { EventFormSheet } from "@/components/events/EventFormSheet";
import { EventsCalendar } from "@/components/events/EventsCalendar";
import type { InternalEvent, MutationLike } from "@/components/events/events-api";

type ListFilter = "all" | "upcoming" | "past" | "drafts" | "withForm" | "mine";

const FILTER_LABELS: Record<ListFilter, string> = {
  all: "Todos",
  upcoming: "Próximos",
  past: "Passados",
  drafts: "Rascunhos",
  withForm: "Com ficha",
  mine: "Para mim",
};

function startDate(event: InternalEvent): Date | null {
  const d = parseISO(event.starts_at);
  return isValid(d) ? d : null;
}

/**
 * Critério único de "evento válido na agenda": nem rascunho (ainda não existe
 * para os convidados) nem cancelado (não vai acontecer). Um evento encerrado
 * (`done`) aconteceu de verdade e continua contando como passado.
 */
function isOnAgenda(event: InternalEvent): boolean {
  return event.status === "published" || event.status === "done";
}

/** Predicado compartilhado entre a lista e os indicadores. */
function matchesFilter(event: InternalEvent, filter: ListFilter, now: Date): boolean {
  const start = startDate(event);
  switch (filter) {
    case "upcoming":
      return event.status === "published" && !!start && isAfter(start, now);
    case "past":
      return isOnAgenda(event) && !!start && !isAfter(start, now);
    case "drafts":
      return event.status === "draft";
    case "withForm":
      return event.registration_required;
    case "mine":
      // "Para mim" já vem recortado por público; aqui recortamos por status.
      return isOnAgenda(event);
    case "all":
    default:
      return true;
  }
}

export default function Eventos() {
  usePageTitle("Eventos");
  const { canManageProjects, isAdmin } = usePermissions();
  const canManage = canManageProjects;

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("evento");

  const [filter, setFilter] = useState<ListFilter>("upcoming");
  const [view, setView] = useState<"grid" | "calendar">("grid");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InternalEvent | null>(null);
  /** Evento recém-criado — leva o usuário até ele assim que o sheet fecha. */
  const justCreated = useRef<InternalEvent | null>(null);

  const {
    events,
    meusEventos,
    isLoading,
    isError,
    error,
    refetch,
    createEvent,
    updateEvent,
    publishEvent,
    announceEvent,
    cancelEvent,
    concludeEvent,
    deleteEvent,
  } = useInternalEvents();

  const source = filter === "mine" ? meusEventos : events;

  const selected = useMemo(
    () => (selectedId ? events.find((e) => e.id === selectedId) ?? null : null),
    [selectedId, events],
  );

  const filtered = useMemo(() => {
    const now = new Date();
    const term = search.trim().toLowerCase();

    const base = source.filter((event) => matchesFilter(event, filter, now));

    const searched = term
      ? base.filter(
          (e) =>
            e.title.toLowerCase().includes(term) ||
            (e.description ?? "").toLowerCase().includes(term),
        )
      : base;

    return [...searched].sort((a, b) => {
      const da = startDate(a)?.getTime() ?? 0;
      const db = startDate(b)?.getTime() ?? 0;

      if (filter === "past") return db - da;

      // "Para mim": o que ainda vai acontecer vem primeiro (em ordem
      // cronológica); os já ocorridos ficam no fim, do mais recente ao mais
      // antigo.
      if (filter === "mine" || filter === "all") {
        const t = now.getTime();
        const aFuture = da > t;
        const bFuture = db > t;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        return aFuture ? da - db : db - da;
      }

      return da - db;
    });
  }, [source, filter, search]);

  // Contagem de inscritos em lote — evita N+1 nos cards. Só é exibida quando o
  // RLS garante que o número está completo (`isReliable`).
  const visibleIds = useMemo(() => filtered.map((e) => e.id), [filtered]);
  const { getCount, isReliable: countsReliable } = useEventRegistrationCounts(visibleIds);

  // Selo "Inscrito" na listagem, sem abrir cada evento.
  const { isRegisteredIn } = useMyEventRegistrations();

  // Métricas — mesmo predicado dos filtros, sobre a lista completa.
  const metrics = useMemo(() => {
    const now = new Date();
    return {
      total: events.filter((e) => matchesFilter(e, "all", now)).length,
      upcoming: events.filter((e) => matchesFilter(e, "upcoming", now)).length,
      withForm: events.filter((e) => matchesFilter(e, "withForm", now)).length,
      mine: meusEventos.filter((e) => matchesFilter(e, "mine", now)).length,
    };
  }, [events, meusEventos]);

  const openEventById = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("evento", id);
    setSearchParams(next);
  };

  const openEvent = (event: InternalEvent) => openEventById(event.id);

  const closeEvent = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("evento");
    setSearchParams(next, { replace: true });
  };

  /** Clicar num indicador troca o filtro e limpa a busca (senão o número do
   *  cartão e a lista resultante divergiriam). */
  const applyFilter = (next: ListFilter) => {
    setFilter(next);
    setSearch("");
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (event: InternalEvent) => {
    setEditing(event);
    setFormOpen(true);
  };

  /**
   * O evento nasce como rascunho e o filtro padrão "Próximos" o esconderia —
   * a pessoa via o toast de sucesso e nada mudava na tela. Por isso guardamos
   * o evento criado e abrimos o detalhe dele assim que o sheet fecha (o filtro
   * de fundo também vai para "Rascunhos", para a volta fazer sentido).
   */
  const createEventWithRedirect: MutationLike<InternalEventInput, InternalEvent> = {
    isPending: createEvent.isPending,
    mutateAsync: async (input) => {
      const created = await createEvent.mutateAsync(input);
      justCreated.current = created;
      return created;
    },
  };

  const handleSaved = () => {
    setEditing(null);
    const created = justCreated.current;
    justCreated.current = null;
    if (!created) return;
    setSearch("");
    setFilter(created.status === "draft" ? "drafts" : "upcoming");
    openEventById(created.id);
  };

  const formSheet = (
    <EventFormSheet
      open={formOpen}
      onOpenChange={setFormOpen}
      event={editing}
      createEvent={createEventWithRedirect}
      updateEvent={updateEvent}
      onSaved={handleSaved}
    />
  );

  /* ═══ Detalhe ═══ */
  if (selectedId) {
    if (isLoading && !selected) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      );
    }
    if (isError && !selected) {
      return (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={closeEvent}>
            Voltar para eventos
          </Button>
          <div className="flex flex-wrap items-center gap-3 p-4 rounded-md border border-destructive/30 bg-destructive/5 text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <p className="text-sm">
              Erro ao carregar o evento: {error?.message ?? "Tente novamente."}
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
              <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
              Tentar de novo
            </Button>
          </div>
        </div>
      );
    }
    if (selected) {
      return (
        <>
          <EventDetail
            event={selected}
            canManage={canManage}
            canDelete={isAdmin}
            onBack={closeEvent}
            onEdit={openEdit}
            onDeleted={closeEvent}
            updateEvent={updateEvent}
            publishEvent={publishEvent}
            announceEvent={announceEvent}
            cancelEvent={cancelEvent}
            concludeEvent={concludeEvent}
            deleteEvent={deleteEvent}
          />
          {formSheet}
        </>
      );
    }
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={closeEvent}>
          Voltar para eventos
        </Button>
        <EmptyState
          icon={<CalendarDays className="w-7 h-7 text-muted-foreground" />}
          title="Evento não encontrado"
          description="Ele pode ter sido excluído ou você não faz parte do público convidado."
        />
      </div>
    );
  }

  /* ═══ Lista ═══ */
  const emptyCopy: Record<ListFilter, { title: string; description: string }> = {
    all: {
      title: "Nenhum evento por aqui",
      description: "Assim que um evento for criado, ele aparece nesta lista.",
    },
    upcoming: {
      title: "Nenhum evento agendado",
      description: "Eventos publicados com data futura aparecem aqui.",
    },
    past: {
      title: "Nenhum evento passado",
      description: "Os eventos que já aconteceram ficam guardados aqui.",
    },
    drafts: {
      title: "Nenhum rascunho",
      description:
        "Todo evento nasce como rascunho e fica aqui até ser publicado — ao publicar, ele passa para “Próximos”.",
    },
    withForm: {
      title: "Nenhum evento com ficha de inscrição",
      description: "Ative a ficha na criação ou na edição de um evento para acompanhar presenças.",
    },
    mine: {
      title: "Nenhum evento para você agora",
      description:
        "Aqui aparecem os eventos direcionados a você — da empresa toda, do seu setor ou nominais.",
    },
  };

  const empty = emptyCopy[filter];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Eventos internos</h1>
          <p className="text-muted-foreground text-sm">
            Encontros da empresa toda ou de setores específicos — com ficha de inscrição opcional.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Novo evento</span>
          </Button>
        )}
      </div>

      {/* Métricas */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? null : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => applyFilter("upcoming")}
            className="text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Ver os ${metrics.upcoming} eventos futuros`}
          >
            <KpiCard
              title="Eventos futuros"
              value={metrics.upcoming}
              icon={<CalendarRange className="w-5 h-5 text-primary" />}
            />
          </button>
          <button
            type="button"
            onClick={() => applyFilter("all")}
            className="text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Ver todos os ${metrics.total} eventos`}
          >
            <KpiCard
              title="Total de eventos"
              value={metrics.total}
              icon={<CalendarDays className="w-5 h-5 text-primary" />}
            />
          </button>
          <button
            type="button"
            onClick={() => applyFilter("withForm")}
            className="text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Ver os ${metrics.withForm} eventos com ficha de inscrição`}
          >
            <KpiCard
              title="Com ficha de inscrição"
              value={metrics.withForm}
              icon={<ClipboardList className="w-5 h-5 text-primary" />}
            />
          </button>
          <button
            type="button"
            onClick={() => applyFilter("mine")}
            className="text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Ver os ${metrics.mine} eventos direcionados a mim`}
          >
            <KpiCard
              title="Direcionados a mim"
              value={metrics.mine}
              icon={<Users className="w-5 h-5 text-primary" />}
            />
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as ListFilter)}>
          <TabsList className="flex-wrap h-auto">
            {(Object.keys(FILTER_LABELS) as ListFilter[]).map((key) => (
              <TabsTrigger key={key} value={key}>
                {FILTER_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar evento"
            className={cn("pl-8", search && "pr-8")}
            aria-label="Buscar evento"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center rounded-md border border-border overflow-hidden ml-auto">
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            aria-label="Visualizar em lista"
            className={cn(
              "px-2.5 py-1.5 transition-colors",
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            aria-pressed={view === "calendar"}
            aria-label="Visualizar em calendário"
            className={cn(
              "px-2.5 py-1.5 transition-colors",
              view === "calendar"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarRange className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Marcador da busca ativa — deixa claro que ela sobrevive à troca de filtro */}
      {search.trim() && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Busca ativa:</span>
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label={`Remover a busca por ${search.trim()}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-foreground transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {search.trim()}
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Conteúdo */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[260px] w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-md border border-destructive/30 bg-destructive/5 text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            Erro ao carregar os eventos: {error?.message ?? "Tente novamente."}
          </p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            Tentar de novo
          </Button>
        </div>
      ) : view === "calendar" ? (
        // O calendário recebe a lista completa e faz o próprio recorte temporal;
        // o "nenhum evento" fica por conta da mensagem interna dele, para que a
        // navegação entre meses nunca desapareça.
        <EventsCalendar events={source} onSelect={openEvent} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="w-7 h-7 text-muted-foreground" />}
          title={search.trim() ? "Nenhum resultado para a busca" : empty.title}
          description={
            search.trim()
              ? `Nenhum evento em “${FILTER_LABELS[filter]}” corresponde a “${search.trim()}”.`
              : empty.description
          }
          action={
            search.trim() ? (
              <Button variant="outline" onClick={() => setSearch("")} className="gap-1.5">
                <X className="w-4 h-4" aria-hidden="true" />
                Limpar busca
              </Button>
            ) : filter === "mine" ? (
              <Button variant="outline" onClick={() => applyFilter("upcoming")} className="gap-1.5">
                <CalendarRange className="w-4 h-4" aria-hidden="true" />
                Ver os próximos eventos
              </Button>
            ) : canManage ? (
              <Button onClick={openCreate} className="gap-1.5">
                <Plus className="w-4 h-4" aria-hidden="true" />
                {filter === "drafts" ? "Criar um rascunho" : "Criar evento"}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onOpen={openEvent}
              registered={isRegisteredIn(event.id)}
              registrationsCount={countsReliable ? getCount(event.id) : undefined}
            />
          ))}
        </div>
      )}

      {formSheet}
    </div>
  );
}
