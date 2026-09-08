/**
 * EventMeetingPanel — a ponte entre Eventos Internos e a aba de Reuniões.
 *
 * Regra: este painel NÃO reimplementa nada de reunião. Ele consome
 * `useCreateMeeting` / `useMeetingsList` de `useMeetings` e apenas grava o
 * `meeting_id` no evento (mutation recebida por prop, vinda da página).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarSync,
  Clock,
  Link2,
  Loader2,
  Unlink,
  Video,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import type {
  InternalEventMeeting,
  InternalEventUpdateInput,
} from "@/hooks/useInternalEvents";
import { useAuth } from "@/hooks/useAuth";
import {
  useCreateMeeting,
  useDeleteMeeting,
  useMeetingsList,
  useSyncMeetingAttendees,
  useUpdateMeeting,
} from "@/hooks/useMeetings";
import { getMeetingJoinability, formatOpensIn } from "@/lib/meeting-window";
import { InternalEvent, MutationLike } from "./events-api";

interface Props {
  event: InternalEvent;
  /** Só quem gerencia o evento pode criar/vincular/desvincular a reunião. */
  canManage: boolean;
  updateEvent: MutationLike<{ id: string; updates: InternalEventUpdateInput }, InternalEvent>;
}

/**
 * Rótulos em português dos status de `meetings` — o banco guarda os valores
 * crus em inglês. Mesmo espírito de `STATUS_LABELS` em `events-api.ts` e do
 * `statusMap` da página de Reuniões. Status desconhecido cai no valor cru.
 */
const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendada",
  recording: "Em andamento",
  processing: "Processando IA",
  completed: "Concluída",
  cancelled: "Cancelada",
};

/** Status em que a reunião não serve mais para ser vinculada a um evento. */
const CLOSED_MEETING_STATUSES = new Set(["completed", "cancelled"]);

function meetingStatusLabel(status: string | null | undefined): string {
  if (!status) return "Sem status";
  return MEETING_STATUS_LABELS[status] ?? status;
}

/** `scheduled_time` volta do banco como "HH:MM:SS"; comparamos só "HH:MM". */
function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

/** O embed do evento pode (ou não) trazer `created_by` da reunião. */
type LinkedMeeting = InternalEventMeeting & { created_by?: string | null };

export function EventMeetingPanel({ event, canManage, updateEvent }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");

  const meetingsQuery = useMeetingsList();
  const createMeeting = useCreateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const updateMeeting = useUpdateMeeting();
  const syncAttendees = useSyncMeetingAttendees();

  // A reunião vinculada já vem embutida no evento (`meeting:meetings(...)`),
  // então não há query extra aqui.
  const meeting = (event.meeting ?? null) as LinkedMeeting | null;
  const busy =
    createMeeting.isPending ||
    updateEvent.isPending ||
    deleteMeeting.isPending ||
    syncAttendees.isPending;

  /**
   * Tick de 30s — a janela de entrada da sala é calculada no render. Sem isto,
   * quem deixa a tela aberta esperando fica travado em "Sala abre em 10 min"
   * e o botão de entrar nunca aparece.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const eventStart = useMemo(() => {
    const d = parseISO(event.starts_at);
    return isValid(d) ? d : null;
  }, [event.starts_at]);

  /**
   * `created_by` da reunião. Se o embed do evento não trouxer o campo, caímos
   * na lista de reuniões (já carregada para o seletor de vínculo) — sem query
   * nova. Isso decide host × guest, e host é quem liga a transcrição/resumo.
   */
  const meetingCreatedBy = useMemo<string | null>(() => {
    if (!meeting) return null;
    if (meeting.created_by !== undefined) return meeting.created_by;
    return meetingsQuery.data?.find((m) => m.id === meeting.id)?.created_by ?? null;
  }, [meeting, meetingsQuery.data]);

  /** Público do evento, no formato que `useSyncMeetingAttendees` espera. */
  const audience = useMemo(() => {
    const targets = event.targets ?? [];
    return {
      scope: event.scope,
      employeeIds: targets
        .map((t) => t.employee_id)
        .filter((id): id is string => Boolean(id)),
      areaIds: targets.map((t) => t.area_id).filter((id): id is string => Boolean(id)),
    };
  }, [event.targets, event.scope]);

  /**
   * Dá visibilidade da sala ao público do evento. A policy `meetings_select`
   * não conhece `internal_events` — sem participantes em `meeting_attendees`
   * o embed volta `null` e o convidado vê "reunião não está mais disponível".
   *
   * Falhar aqui NÃO invalida a reunião: ela existe e está vinculada, só ficou
   * restrita a admins/criador. Por isso o erro vira aviso, não exceção.
   */
  const grantAudienceAccess = async (meetingId: string) => {
    try {
      const result = await syncAttendees.mutateAsync({
        meetingId,
        scope: audience.scope,
        employeeIds: audience.employeeIds,
        areaIds: audience.areaIds,
      });
      if (result.warning) toast.warning(result.warning);
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      toast.error(
        `A sala foi vinculada, mas não foi possível liberar o acesso ao público do evento (${message}). ` +
          "Adicione os participantes na aba Reuniões.",
      );
    }
  };

  const handleCreateMeeting = async () => {
    if (!eventStart) {
      toast.error("Defina a data de início do evento antes de criar a reunião");
      return;
    }
    let created: { id: string } | null = null;
    try {
      created = await createMeeting.mutateAsync({
        title: event.title,
        description: event.description ?? undefined,
        scheduled_date: format(eventStart, "yyyy-MM-dd"),
        scheduled_time: format(eventStart, "HH:mm"),
        meeting_mode: "livekit",
      });
      await updateEvent.mutateAsync({ id: event.id, updates: { meeting_id: created.id } });
    } catch {
      // Compensação: sem o vínculo no evento a sala vira fantasma — o botão
      // continuaria oferecendo "Criar reunião" e cada clique criaria outra.
      if (created) {
        try {
          await deleteMeeting.mutateAsync(created.id);
          toast.info("A sala criada foi desfeita — nenhuma reunião órfã ficou para trás.");
        } catch {
          toast.error(
            `A reunião ${created.id} foi criada mas não pôde ser vinculada nem removida. ` +
              "Apague-a manualmente na aba Reuniões.",
          );
        }
      }
      return; // erros de cada passo já foram reportados pelos hooks
    }
    await grantAudienceAccess(created.id);
  };

  const handleLink = async () => {
    if (!selectedMeetingId) return;
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        updates: { meeting_id: selectedMeetingId },
      });
    } catch {
      return; // erro já reportado pelo hook
    }
    setLinkDialogOpen(false);
    const linkedId = selectedMeetingId;
    setSelectedMeetingId("");
    await grantAudienceAccess(linkedId);
  };

  const handleUnlink = async () => {
    try {
      await updateEvent.mutateAsync({ id: event.id, updates: { meeting_id: null } });
    } catch {
      // erro já reportado pelo hook
    }
  };

  /**
   * Remarcar o evento não mexe na reunião, e a janela de entrada da sala vem
   * da data DELA. Sinalizamos a divergência em vez de sincronizar sozinhos —
   * pode haver caso legítimo de a sala ter horário próprio.
   */
  const dateMismatch = useMemo(() => {
    if (!meeting || !eventStart) return false;
    const eventDate = format(eventStart, "yyyy-MM-dd");
    const eventTime = format(eventStart, "HH:mm");
    return (
      meeting.scheduled_date !== eventDate ||
      normalizeTime(meeting.scheduled_time) !== eventTime
    );
  }, [meeting, eventStart]);

  const handleSyncMeetingDate = async () => {
    if (!meeting || !eventStart) return;
    try {
      await updateMeeting.mutateAsync({
        id: meeting.id,
        updates: {
          scheduled_date: format(eventStart, "yyyy-MM-dd"),
          scheduled_time: format(eventStart, "HH:mm"),
        },
      });
    } catch {
      // erro já reportado pelo hook
    }
  };

  /**
   * Reuniões encerradas/canceladas não podem ser vinculadas — a janela de
   * entrada já está fechada e o botão nasceria morto.
   */
  const linkableMeetings = useMemo(
    () =>
      (meetingsQuery.data ?? []).filter(
        (m) => !CLOSED_MEETING_STATUSES.has(m.status ?? ""),
      ),
    [meetingsQuery.data],
  );

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-border">
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5">
          <Video className="w-3 h-3" aria-hidden="true" />
          Reunião interna
        </div>
        <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
          Eventos remotos ou híbridos acontecem dentro da sala de reunião do GT3 —
          com gravação, transcrição e resumo por IA.
        </p>
      </div>

      <div className="px-5 py-4">
        {!meeting ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {event.meeting_id
                ? "A reunião vinculada não está mais disponível."
                : "Nenhuma reunião vinculada a este evento."}
            </p>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleCreateMeeting} disabled={busy} className="gap-1.5">
                  {createMeeting.isPending || syncAttendees.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Video className="w-4 h-4" aria-hidden="true" />
                  )}
                  Criar reunião para o evento
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLinkDialogOpen(true)}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <Link2 className="w-4 h-4" aria-hidden="true" />
                  Vincular reunião existente
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate("/reunioes")}
              className="group w-full text-left rounded-md border border-border bg-muted/20 px-4 py-3 transition-colors hover:border-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Abrir a reunião ${meeting.title} em Reuniões`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{meeting.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {meeting.scheduled_date && isValid(parseISO(meeting.scheduled_date))
                      ? `${format(parseISO(meeting.scheduled_date), "dd 'de' MMMM", {
                          locale: ptBR,
                        })}${meeting.scheduled_time ? ` às ${normalizeTime(meeting.scheduled_time)}` : ""}`
                      : "Sem agendamento"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px]">
                    {meetingStatusLabel(meeting.status)}
                  </Badge>
                  <ArrowRight
                    className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </button>

            {dateMismatch && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A data da reunião está diferente da data do evento. A sala só abre
                    perto do horário agendado <strong>na reunião</strong> — se a divergência
                    não for intencional, sincronize.
                  </p>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSyncMeetingDate}
                    disabled={busy || updateMeeting.isPending || !eventStart}
                    className="gap-1.5"
                  >
                    {updateMeeting.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CalendarSync className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    Sincronizar data da reunião
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {meeting.meeting_mode === "livekit" && meeting.livekit_room_name && (() => {
                const joinability = getMeetingJoinability(meeting, now);
                if (joinability.joinable) {
                  return (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        // A Edge Function `livekit-token` só REBAIXA papel — quem
                        // pede `guest` nunca vira host, e sem host o pipeline de
                        // transcrição/resumo não roda. Mesmo critério de /reunioes.
                        const role = meetingCreatedBy === user?.id ? "host" : "guest";
                        window.open(
                          `/meet/${meeting.livekit_room_name}?role=${role}`,
                          "_blank",
                          "noopener",
                        );
                      }}
                    >
                      <Video className="w-4 h-4" aria-hidden="true" />
                      Entrar na sala
                    </Button>
                  );
                }
                if (joinability.opensAt) {
                  return (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      Sala abre {formatOpensIn(joinability.opensAt, now)}
                    </span>
                  );
                }
                return null;
              })()}
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleUnlink}
                  disabled={busy}
                  className="gap-1.5 text-muted-foreground"
                >
                  {updateEvent.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  Desvincular
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dialog: vincular reunião existente */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Vincular reunião existente</DialogTitle>
            <DialogDescription>
              Escolha uma reunião já criada na aba Reuniões para associar a este evento.
              Reuniões concluídas ou canceladas não aparecem na lista.
            </DialogDescription>
          </DialogHeader>

          {meetingsQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : meetingsQuery.isError ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <p className="text-xs">Erro ao carregar as reuniões.</p>
            </div>
          ) : linkableMeetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma reunião disponível para vincular.
            </p>
          ) : (
            <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId}>
              <SelectTrigger aria-label="Selecionar reunião">
                <SelectValue placeholder="Selecione uma reunião" />
              </SelectTrigger>
              <SelectContent>
                {linkableMeetings.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title}
                    {m.scheduled_date && isValid(parseISO(m.scheduled_date))
                      ? ` — ${format(parseISO(m.scheduled_date), "dd/MM/yyyy", { locale: ptBR })}`
                      : ""}
                    {` · ${meetingStatusLabel(m.status)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={handleLink} disabled={busy || !selectedMeetingId}>
              {(updateEvent.isPending || syncAttendees.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
