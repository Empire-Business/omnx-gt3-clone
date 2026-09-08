/**
 * EventDetail — detalhe de um evento interno: público, inscritos, respostas
 * da ficha e a ponte com a aba de Reuniões.
 */
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AvatarBadge, EmptyState } from "@/components/shared/SharedComponents";
import { EventAnnounceDialog } from "./EventAnnounceDialog";
import {
  AlertCircle,
  Ban,
  Building2,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock,
  Flag,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Pencil,
  RotateCw,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { absoluteAppUrl, buildGoogleCalendarUrl } from "@/lib/google-calendar";
import { markdownToPlainText, markdownToSingleLine } from "@/lib/markdown-text";
import { useAreas } from "@/hooks/useAreas";
import { useEmployees } from "@/hooks/useEmployees";
import { useEventRegistrations } from "@/hooks/useEventRegistrations";
import type {
  EventAnnounceRequest,
  InternalEventUpdateInput,
} from "@/hooks/useInternalEvents";
import {
  EventRegistrationAnswers,
  InternalEvent,
  MutationLike,
  SCOPE_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  formatAnswer,
  parseRegistrationForm,
} from "./events-api";
import { EventMeetingPanel } from "./EventMeetingPanel";
import { EventRegistrationDialog } from "./EventRegistrationDialog";

interface Props {
  event: InternalEvent;
  canManage: boolean;
  /** Excluir exige admin — a policy do banco não aceita manager. */
  canDelete: boolean;
  onBack: () => void;
  onEdit: (event: InternalEvent) => void;
  onDeleted: () => void;
  updateEvent: MutationLike<{ id: string; updates: InternalEventUpdateInput }, InternalEvent>;
  /* O retorno traz também o resultado da divulgação (Feed/chat/notificações);
     a tela não usa esse dado — só o estado de carregando. */
  publishEvent: MutationLike<EventAnnounceRequest, unknown>;
  /** Divulga de novo um evento já publicado (Feed + canal geral + notificação). */
  announceEvent: MutationLike<EventAnnounceRequest, unknown>;
  cancelEvent: MutationLike<string, InternalEvent>;
  concludeEvent: MutationLike<string, InternalEvent>;
  deleteEvent: MutationLike<string, string>;
}

/** Qual confirmação está aberta (uma por vez). */
type ConfirmKind = "cancelEvent" | "conclude" | "delete" | "unregister" | null;

export function EventDetail({
  event,
  canManage,
  canDelete,
  onBack,
  onEdit,
  onDeleted,
  updateEvent,
  publishEvent,
  announceEvent,
  cancelEvent,
  concludeEvent,
  deleteEvent,
}: Props) {
  const navigate = useNavigate();
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  /** Diálogo de divulgação: publicar (rascunho) ou divulgar de novo. */
  const [announceMode, setAnnounceMode] = useState<"publish" | "reannounce" | null>(null);

  // Uma única chamada do hook — dados e mutations saem daqui (regra CLAUDE.md).
  const {
    activeRegistrations,
    isRegistered,
    isLoading: registrationsLoading,
    isError: registrationsError,
    error: registrationsErrorObj,
    refetch: refetchRegistrations,
    register,
    cancelRegistration,
  } = useEventRegistrations(event.id);

  const areasQuery = useAreas();
  const employeesQuery = useEmployees({ status: "active" });

  const fields = useMemo(
    () => parseRegistrationForm(event.registration_form).fields,
    [event.registration_form],
  );

  const start = useMemo(() => {
    const d = parseISO(event.starts_at);
    return isValid(d) ? d : null;
  }, [event.starts_at]);

  const end = useMemo(() => {
    if (!event.ends_at) return null;
    const d = parseISO(event.ends_at);
    return isValid(d) ? d : null;
  }, [event.ends_at]);

  const targets = useMemo(() => event.targets ?? [], [event.targets]);

  const targetAreas = useMemo(() => {
    const ids = new Set(targets.map((t) => t.area_id).filter((id): id is string => !!id));
    return (areasQuery.data ?? []).filter((a) => ids.has(a.id));
  }, [targets, areasQuery.data]);

  const targetEmployees = useMemo(() => {
    const ids = new Set(targets.map((t) => t.employee_id).filter((id): id is string => !!id));
    return (employeesQuery.data ?? []).filter((e) => ids.has(e.id));
  }, [targets, employeesQuery.data]);

  /**
   * O evento já acabou? Usa o término quando existe; senão, o início.
   * Recalcular a cada render é suficiente: a página re-renderiza a cada ação.
   */
  const hasEnded = useMemo(() => {
    const reference = end ?? start;
    return !!reference && reference.getTime() <= Date.now();
  }, [start, end]);

  /** Inscrição só enquanto o evento está publicado e ainda não terminou. */
  const isOpenForRegistration =
    event.registration_required && event.status === "published" && !hasEnded;

  /** Encerrar só faz sentido para evento publicado que já aconteceu. */
  const canConclude = canManage && event.status === "published" && hasEnded;

  const handleRegister = async (answers: EventRegistrationAnswers) => {
    await register.mutateAsync({ eventId: event.id, answers });
  };

  /**
   * Link da sala do GT3, quando o evento tem reunião LiveKit vinculada. Vai
   * para o campo "Local" do Google (é onde o Google Agenda e o Meet mostram o
   * botão de entrar) E para o corpo do convite — quem abre o convite no
   * celular costuma ler o corpo, não o local.
   */
  const meetingUrl = useMemo(() => {
    const room = event.meeting?.livekit_room_name;
    if (!room || event.meeting?.meeting_mode !== "livekit") return null;
    return absoluteAppUrl(`/meet/${room}`);
  }, [event.meeting?.livekit_room_name, event.meeting?.meeting_mode]);

  /** Resumo sem marcação — o cabeçalho não renderiza Markdown. */
  const descriptionSummary = useMemo(
    () => markdownToSingleLine(event.description, 180),
    [event.description]
  );

  const googleCalendarUrl = useMemo(() => {
    const eventUrl = absoluteAppUrl(`/eventos?evento=${event.id}`);
    const details = [
      // O Google Agenda não interpreta Markdown no corpo do convite.
      markdownToPlainText(event.description) || null,
      meetingUrl ? `Sala da reunião no GT3: ${meetingUrl}` : null,
      `Evento no GT3: ${eventUrl}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    return buildGoogleCalendarUrl({
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      details,
      location: meetingUrl,
    });
  }, [event.id, event.title, event.description, event.starts_at, event.ends_at, meetingUrl]);

  const handleAddToGoogleCalendar = () => {
    if (!googleCalendarUrl) {
      toast.error("Este evento está sem data válida — não dá para montar o convite.");
      return;
    }
    // `window.open` devolve `null` quando o navegador bloqueia a aba. Sem este
    // caminho o clique simplesmente não faz nada e o usuário acha que quebrou.
    const win = window.open(googleCalendarUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      navigator.clipboard?.writeText(googleCalendarUrl).catch(() => undefined);
      toast.error("O navegador bloqueou a nova aba. O link foi copiado — cole na barra de endereço.");
      return;
    }
    toast.success("Abrindo o Google Agenda com o evento preenchido.");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
            Voltar
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground tracking-tight truncate" title={event.title}>
              {event.title}
            </h1>
            {descriptionSummary && (
              <p
                className="text-muted-foreground text-sm mt-0.5 line-clamp-2"
                title={descriptionSummary}
              >
                {descriptionSummary}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANTS[event.status]}>{STATUS_LABELS[event.status]}</Badge>

          {event.registration_required && event.status === "published" && hasEnded && (
            <Badge variant="outline" className="text-[11px]">
              Inscrições encerradas
            </Badge>
          )}

          {/* Agenda do Google — para todo mundo que enxerga o evento, não só
              para quem administra: quem precisa do compromisso na agenda é o
              participante. Some em evento cancelado (não há o que agendar). */}
          {event.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddToGoogleCalendar}
              className="gap-1.5"
              title={
                meetingUrl
                  ? "Abre o Google Agenda com data, horário e o link da sala do GT3"
                  : "Abre o Google Agenda com data e horário preenchidos"
              }
            >
              <CalendarPlus className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Adicionar ao Google Agenda</span>
              <span className="sm:hidden">Google Agenda</span>
            </Button>
          )}

          {isOpenForRegistration && !isRegistered && (
            <Button size="sm" onClick={() => setRegistrationOpen(true)} className="gap-1.5">
              <ClipboardList className="w-4 h-4" aria-hidden="true" />
              Inscrever-se
            </Button>
          )}
          {isOpenForRegistration && isRegistered && (
            <>
              <Badge variant="outline" className="gap-1 text-[11px]">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                Inscrito
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={cancelRegistration.isPending}
                onClick={() => setConfirm("unregister")}
              >
                {cancelRegistration.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                )}
                Cancelar inscrição
              </Button>
            </>
          )}

          {canManage && event.status === "draft" && (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={publishEvent.isPending}
              onClick={() => setAnnounceMode("publish")}
            >
              {publishEvent.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
              Publicar
            </Button>
          )}

          {/* Ações secundárias — botões no desktop, menu abaixo de `sm`. */}
          {canManage && (
            <>
              <div className="hidden sm:flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(event)} className="gap-1.5">
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                  Editar
                </Button>

                {event.status === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={announceEvent.isPending}
                    onClick={() => setAnnounceMode("reannounce")}
                  >
                    {announceEvent.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Megaphone className="w-4 h-4" aria-hidden="true" />
                    )}
                    Divulgar de novo
                  </Button>
                )}

                {canConclude && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={concludeEvent.isPending}
                    onClick={() => setConfirm("conclude")}
                  >
                    {concludeEvent.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Flag className="w-4 h-4" aria-hidden="true" />
                    )}
                    Marcar como encerrado
                  </Button>
                )}

                {event.status !== "cancelled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setConfirm("cancelEvent")}
                  >
                    <Ban className="w-4 h-4" aria-hidden="true" />
                    Cancelar evento
                  </Button>
                )}

                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setConfirm("delete")}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Excluir
                  </Button>
                )}
              </div>

              <div className="sm:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                      Ações
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onEdit(event)}>
                      <Pencil className="w-4 h-4 mr-2" aria-hidden="true" />
                      Editar
                    </DropdownMenuItem>

                    {event.status === "published" && (
                      <DropdownMenuItem onSelect={() => setAnnounceMode("reannounce")}>
                        <Megaphone className="w-4 h-4 mr-2" aria-hidden="true" />
                        Divulgar de novo
                      </DropdownMenuItem>
                    )}

                    {canConclude && (
                      <DropdownMenuItem onSelect={() => setConfirm("conclude")}>
                        <Flag className="w-4 h-4 mr-2" aria-hidden="true" />
                        Marcar como encerrado
                      </DropdownMenuItem>
                    )}

                    {event.status !== "cancelled" && (
                      <DropdownMenuItem onSelect={() => setConfirm("cancelEvent")}>
                        <Ban className="w-4 h-4 mr-2" aria-hidden="true" />
                        Cancelar evento
                      </DropdownMenuItem>
                    )}

                    {canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setConfirm("delete")}
                        >
                          <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                          Excluir
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </div>

      {announceMode && (
        <EventAnnounceDialog
          open
          onOpenChange={(open) => !open && setAnnounceMode(null)}
          event={event}
          mode={announceMode}
          isPending={publishEvent.isPending || announceEvent.isPending}
          onConfirm={async (channelIds) => {
            const mutation = announceMode === "publish" ? publishEvent : announceEvent;
            try {
              await mutation.mutateAsync({ id: event.id, channelIds });
              setAnnounceMode(null);
            } catch {
              // erro já reportado pelo hook — o diálogo fica aberto para nova tentativa
            }
          }}
        />
      )}

      {/* ═══ Confirmações ═══ */}
      <AlertDialog
        open={confirm === "unregister"}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar sua inscrição?</AlertDialogTitle>
            <AlertDialogDescription>
              Você deixa de constar na lista de inscritos deste evento. É possível se inscrever de
              novo enquanto as inscrições estiverem abertas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter inscrição</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelRegistration.mutateAsync({}).catch(() => undefined)}
            >
              Cancelar inscrição
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirm === "conclude"}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar este evento como encerrado?</AlertDialogTitle>
            <AlertDialogDescription>
              O evento passa a aparecer como encerrado para todos os convidados. As inscrições e as
              respostas da ficha continuam disponíveis para consulta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => concludeEvent.mutateAsync(event.id).catch(() => undefined)}
            >
              Marcar como encerrado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirm === "cancelEvent"}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este evento?</AlertDialogTitle>
            <AlertDialogDescription>
              O evento deixa de aceitar inscrições e aparece como cancelado para todos os
              convidados. As inscrições já feitas são preservadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelEvent.mutateAsync(event.id).catch(() => undefined)}
            >
              Cancelar evento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "delete"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este evento?</AlertDialogTitle>
            <AlertDialogDescription>
              A ação é permanente e remove também as inscrições e respostas da ficha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteEvent.mutateAsync(event.id);
                  onDeleted();
                } catch {
                  // erro já reportado pelo hook
                }
              }}
            >
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Capa */}
      {event.cover_url && (
        <div className="h-40 sm:h-56 w-full overflow-hidden rounded-md border border-border bg-muted">
          <img
            src={event.cover_url}
            alt={`Capa do evento ${event.title}`}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Visão geral</TabsTrigger>
          <TabsTrigger value="audience">Público</TabsTrigger>
          <TabsTrigger value="registrations">
            Inscritos
            {/* O RLS só entrega a lista completa a quem gerencia — para os
                demais o número seria falso, então não é exibido. */}
            {canManage && activeRegistrations.length > 0 && (
              <span className="ml-1.5 font-mono text-[10px]">{activeRegistrations.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══ Visão geral ═══ */}
        <TabsContent value="info" className="space-y-4">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-border">
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                Detalhes do evento
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5 px-5 py-4">
              <div className="space-y-1">
                <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="w-3 h-3" aria-hidden="true" />
                  Início
                </div>
                <p className="text-sm font-medium text-foreground">
                  {start ? format(start, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  Término
                </div>
                <p className="text-sm font-medium text-foreground">
                  {end ? format(end, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" aria-hidden="true" />
                  Público
                </div>
                <p className="text-sm font-medium text-foreground">{SCOPE_LABELS[event.scope]}</p>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                  <ClipboardList className="w-3 h-3" aria-hidden="true" />
                  Ficha
                </div>
                <p className="text-sm font-medium text-foreground">
                  {event.registration_required
                    ? `${fields.length} pergunta${fields.length === 1 ? "" : "s"}`
                    : "Sem inscrição"}
                </p>
              </div>
            </div>

            {event.description && (
              /* A descrição é escrita em Markdown (o mesmo texto vai para o
                 convite do Google Agenda e para o Feed). Renderizar cru
                 deixava `**negrito**` e `### títulos` à mostra. */
              <div className="px-5 pb-5">
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {event.description}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          <EventMeetingPanel event={event} canManage={canManage} updateEvent={updateEvent} />
        </TabsContent>

        {/* ═══ Público ═══ */}
        <TabsContent value="audience">
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">
                {SCOPE_LABELS[event.scope]}
              </span>
            </div>

            <div className="px-5 py-4">
              {event.scope === "company" && (
                <p className="text-sm text-muted-foreground">
                  Todos os colaboradores ativos da empresa veem este evento.
                </p>
              )}

              {event.scope === "areas" &&
                (areasQuery.isLoading ? (
                  <Skeleton className="h-8 w-64" />
                ) : areasQuery.isError ? (
                  <div className="flex flex-wrap items-center gap-2 text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <p className="text-sm">Erro ao carregar os setores.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => areasQuery.refetch()}
                    >
                      <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                      Tentar de novo
                    </Button>
                  </div>
                ) : targetAreas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum setor definido.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {targetAreas.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => navigate("/areas-cargos")}
                        className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm text-foreground transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {area.name}
                      </button>
                    ))}
                  </div>
                ))}

              {event.scope === "custom" &&
                (employeesQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : employeesQuery.isError ? (
                  <div className="flex flex-wrap items-center gap-2 text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <p className="text-sm">Erro ao carregar os colaboradores.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => employeesQuery.refetch()}
                    >
                      <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                      Tentar de novo
                    </Button>
                  </div>
                ) : targetEmployees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma pessoa definida.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {targetEmployees.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => navigate(`/colaboradores?id=${emp.id}`)}
                        className="flex items-center gap-2.5 rounded-md border border-border bg-muted/20 px-3 py-2 text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <AvatarBadge
                          name={emp.full_name ?? "—"}
                          avatarUrl={emp.avatar_url ?? undefined}
                          size="sm"
                        />
                        <span className="text-sm text-foreground truncate">
                          {emp.full_name ?? "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </TabsContent>

        {/* ═══ Inscritos ═══ */}
        <TabsContent value="registrations">
          {!event.registration_required ? (
            <EmptyState
              icon={<ClipboardList className="w-7 h-7 text-muted-foreground" />}
              title="Este evento não pede inscrição"
              description="Ative a ficha de inscrição na edição do evento para acompanhar quem confirmou presença."
              action={
                canManage ? (
                  <Button variant="outline" onClick={() => onEdit(event)} className="gap-1.5">
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                    Editar evento
                  </Button>
                ) : undefined
              }
            />
          ) : registrationsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : registrationsError ? (
            <div className="flex flex-wrap items-center gap-3 p-4 rounded-md border border-destructive/30 bg-destructive/5 text-destructive">
              <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <p className="text-sm">
                Erro ao carregar os inscritos:{" "}
                {registrationsErrorObj?.message ?? "Tente novamente."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => refetchRegistrations()}
              >
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                Tentar de novo
              </Button>
            </div>
          ) : activeRegistrations.length === 0 ? (
            <EmptyState
              icon={<Users className="w-7 h-7 text-muted-foreground" />}
              title="Ninguém inscrito ainda"
              description="Assim que os convidados confirmarem presença, eles aparecem aqui com as respostas da ficha."
            />
          ) : (
            <div className="space-y-2">
              {activeRegistrations.map((reg) => {
                const name = reg.employee?.profiles?.full_name ?? "Colaborador";
                const createdAt = parseISO(reg.created_at);
                return (
                  <div key={reg.id} className="rounded-md border border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/colaboradores?id=${reg.employee_id}`)}
                        className="flex items-center gap-2.5 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Abrir perfil de ${name}`}
                      >
                        <AvatarBadge
                          name={name}
                          avatarUrl={reg.employee?.profiles?.avatar_url ?? undefined}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {isValid(createdAt)
                              ? format(createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                              : "—"}
                          </p>
                        </div>
                      </button>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        Inscrito
                      </Badge>
                    </div>

                    {fields.length > 0 && (
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2 border-t border-border pt-3">
                        {fields.map((field) => (
                          <div key={field.id}>
                            <dt className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
                              {field.label}
                            </dt>
                            <dd className="text-sm text-foreground mt-0.5 break-words">
                              {formatAnswer(reg.answers?.[field.id], field.type)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <EventRegistrationDialog
        event={event}
        open={registrationOpen}
        onOpenChange={setRegistrationOpen}
        onSubmit={handleRegister}
        isPending={register.isPending}
      />
    </div>
  );
}
