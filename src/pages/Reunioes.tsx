import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useEmployees } from "@/hooks/useEmployees";
import { findOrCreateDM } from "@/hooks/useChat";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Video,
  Plus,
  Clock,
  Users,
  AlertCircle,
  Loader2,
  FileText,
  CalendarDays,
  Filter,
  MapPin,
  User,
  ChevronLeft,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Download,
  Search as SearchIcon,
  Send,
  Pencil,
  CalendarIcon,
  RefreshCw,
  RotateCcw,
  Upload,
  PhoneOff,
  Copy,
  Lock,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEndRoom } from "@/hooks/useLiveKit";
import { CopyGuestLinkButton } from "@/components/meetings/CopyGuestLinkButton";
import { getMeetingJoinability, formatOpensIn } from "@/lib/meeting-window";
import { useAuth } from "@/hooks/useAuth";
import {
  Meeting,
  MeetingAttendee,
  useMeetingsList,
  useMeetingDetail,
  useCreateMeeting,
  useCreateMeetingWithTranscript,
  useUpdateMeeting,
  useProcessTranscript,
  useMeetingAiJob,
} from "@/hooks/useMeetings";
import { useProjects } from "@/hooks/useProjects";
import { MeetingRecorder } from "@/components/meetings/MeetingRecorder";
import { MeetingSummary } from "@/components/meetings/MeetingSummary";
import { MeetingRecording } from "@/components/meetings/MeetingRecording";
import { MeetingApproval } from "@/components/meetings/MeetingApproval";
import { MeetingEditDialog } from "@/components/meetings/MeetingEditDialog";
import { MeetingAttendeesManager } from "@/components/meetings/MeetingAttendeesManager";
import { MeetingCard } from "@/components/meetings/MeetingCard";
import { MeetingsCalendar } from "@/components/meetings/MeetingsCalendar";
import { RecurringMeetingDialog } from "@/components/meetings/RecurringMeetingDialog";
import {
  useRecurringMeetings,
  useCreateRecurringMeeting,
  DEFAULT_RECURRENCE,
  type RecurringMeeting,
  type RecurrencePattern,
  type Weekday,
} from "@/hooks/useMeetingRecurrence";
import { Switch } from "@/components/ui/switch";
import { Repeat } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePermissions } from "@/hooks/usePermissions";
import { format, startOfDay, endOfDay, isToday, isSameDay, addDays, differenceInDays, startOfWeek, endOfWeek, endOfMonth, parseISO, isValid, isBefore, isAfter, startOfMonth, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Agendada", variant: "outline" },
  recording: { label: "Em andamento", variant: "destructive" },
  processing: { label: "Processando IA", variant: "secondary" },
  completed: { label: "Concluída", variant: "default" },
  cancelled: { label: "Cancelada", variant: "outline" },
};

const approvalMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Rejeitado", variant: "destructive" },
};

type TimeFilter = "today" | "week" | "month" | "all";

const filterLabels: Record<TimeFilter, string> = {
  today: "Hoje",
  week: "Esta Semana",
  month: "Este Mês",
  all: "Todas",
};

// Helper function to get the date for grouping
function getMeetingDate(meeting: Meeting): Date {
  // Prioridade: ocorrência efetiva > agendamento > próxima ocorrência (recorrente) > criação
  if (meeting.started_at) return new Date(meeting.started_at);
  if (meeting.scheduled_date) {
    const time = meeting.scheduled_time || "00:00:00";
    const iso = `${meeting.scheduled_date}T${time.length === 5 ? time + ":00" : time}`;
    const d = parseISO(iso);
    if (isValid(d)) return d;
    return parseISO(meeting.scheduled_date);
  }
  const next = (meeting as any).next_occurrence_at as string | null | undefined;
  if (next) return new Date(next);
  return new Date(meeting.created_at);
}

// Helper function to group meetings by date
function groupMeetingsByDate(meetings: Meeting[]): { date: string; meetings: Meeting[] }[] {
  const groups: Record<string, Meeting[]> = {};

  meetings.forEach((meeting) => {
    const date = getMeetingDate(meeting);
    const dateKey = format(date, "yyyy-MM-dd");

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(meeting);
  });

  // Keep the newest meetings first inside each date group.
  Object.keys(groups).forEach((dateKey) => {
    groups[dateKey].sort((a, b) => {
      // First by scheduled_time, placing later times above earlier ones.
      if (a.scheduled_time && b.scheduled_time) {
        return b.scheduled_time.localeCompare(a.scheduled_time);
      }
      if (a.scheduled_time) return 1;
      if (b.scheduled_time) return -1;
      // Then by created_at, newest first.
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  });

  // Render the newest date groups first.
  return Object.entries(groups)
    .map(([date, meetings]) => ({
      date,
      meetings,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Helper function to format date group header
function formatDateHeader(dateStr: string): string {
  const date = parseISO(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  if (isSameDay(date, today)) {
    return `Hoje - ${format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
  }
  if (isSameDay(date, tomorrow)) {
    return `Amanhã - ${format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
  }
  if (isSameDay(date, yesterday)) {
    return `Ontem - ${format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
  }
  return format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export default function Reunioes() {
  usePageTitle("Reuniões");
  const { canManageProjects, isAdmin } = usePermissions();
  const { user, profile } = useAuth();
  const endRoom = useEndRoom();

  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("info");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<"choose" | "schedule" | "instant_invite">("choose");
  const [instantTitle, setInstantTitle] = useState("");
  const [instantInvitees, setInstantInvitees] = useState<Set<string>>(new Set());
  const [inviteSearch, setInviteSearch] = useState("");
  const [sendingInvites, setSendingInvites] = useState(false);
  const [sendingMeetingInvites, setSendingMeetingInvites] = useState(false);
  const [scheduledInvitees, setScheduledInvitees] = useState<Set<string>>(new Set());
  const [scheduledSearch, setScheduledSearch] = useState("");
  const [scheduledDuration, setScheduledDuration] = useState<number>(60);
  const [scheduledVisibility, setScheduledVisibility] = useState<"all" | "invitees">("all");
  const { data: allEmployees = [] } = useEmployees();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [listView, setListView] = useState<"list" | "calendar">("list");
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringMeeting | null>(null);
  const { data: recurringMeetings } = useRecurringMeetings();
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>(DEFAULT_RECURRENCE);
  const [reminderMinutes, setReminderMinutes] = useState(5);
  const createRecurring = useCreateRecurringMeeting();
  const [newMeeting, setNewMeeting] = useState<{
    title: string;
    description: string;
    scheduled_date: string;
    scheduled_time: string;
    project_id: string;
    location: string;
    meeting_mode: 'in_person' | 'external_link' | 'livekit';
  }>({
    title: "",
    description: "",
    scheduled_date: "",
    scheduled_time: "",
    project_id: "",
    location: "",
    meeting_mode: "livekit",
  });
  const [importData, setImportData] = useState({ title: "", transcript: "" });

  const { data: meetings, isLoading: meetingsLoading, isFetching: meetingsFetching, refetch } = useMeetingsList();
  const selectedMeetingStatus = selectedMeetingId
    ? meetings?.find(m => m.id === selectedMeetingId)?.status
    : undefined;
  const shouldPollMeeting =
    selectedMeetingStatus === "processing" || selectedMeetingStatus === "recording";
  const { data: selectedMeeting, isLoading: meetingLoading, isFetching: meetingFetching, refetch: refetchMeeting } = useMeetingDetail(
    selectedMeetingId || undefined,
    shouldPollMeeting ? { refetchInterval: 3000 } : {}
  );
  const { data: projects, isLoading: projectsLoading, isFetching: projectsFetching } = useProjects();

  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const processTranscript = useProcessTranscript();
  const createWithTranscript = useCreateMeetingWithTranscript();
  const { data: aiJob } = useMeetingAiJob(
    selectedMeetingId || undefined,
    selectedMeetingStatus === "processing",
  );

  // Filter meetings based on time filter
  const filteredMeetings = useMemo(() => {
    if (!meetings) return [];
    if (timeFilter === "all") return meetings;

    const now = new Date();
    const today = startOfDay(now);
    const weekStart = startOfWeek(now, { locale: ptBR });
    const weekEnd = endOfWeek(now, { locale: ptBR });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    return meetings.filter((meeting) => {
      const meetingDate = getMeetingDate(meeting);
      if (!isValid(meetingDate)) return false;

      switch (timeFilter) {
        case "today":
          return isSameDay(meetingDate, today);
        case "week":
          return isWithinInterval(meetingDate, { start: weekStart, end: weekEnd });
        case "month":
          return isWithinInterval(meetingDate, { start: monthStart, end: monthEnd });
        default:
          return true;
      }
    });
  }, [meetings, timeFilter]);

  // Group meetings by date
  const groupedMeetings = useMemo(() => {
    return groupMeetingsByDate(filteredMeetings);
  }, [filteredMeetings]);

  const handleCreateMeeting = async () => {
    if (!newMeeting.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }

    if (recurrenceEnabled) {
      if (recurrencePattern.byday.length === 0) {
        toast.error("Selecione pelo menos um dia da semana");
        return;
      }
      const created = await createRecurring.mutateAsync({
        title: newMeeting.title,
        description: newMeeting.description || undefined,
        pattern: recurrencePattern,
        reminder_minutes_before: reminderMinutes,
      });
      setCreateDialogOpen(false);
      setRecurrenceEnabled(false);
      setRecurrencePattern(DEFAULT_RECURRENCE);
      setReminderMinutes(5);
      setNewMeeting({
        title: "",
        description: "",
        scheduled_date: "",
        scheduled_time: "",
        project_id: "",
        location: "",
        meeting_mode: "livekit",
      });
      // Abre dialog de edição para gerenciar membros
      const fresh: any = { id: created.id, title: newMeeting.title, description: newMeeting.description || null, recurrence_pattern: recurrencePattern, reminder_minutes_before: reminderMinutes, is_recurring: true };
      setEditingRecurring(fresh as RecurringMeeting);
      setRecurringDialogOpen(true);
      return;
    }

    const created = await createMeeting.mutateAsync({
      title: newMeeting.title,
      description: newMeeting.description,
      scheduled_date: newMeeting.scheduled_date || undefined,
      scheduled_time: newMeeting.scheduled_time || undefined,
      project_id: newMeeting.project_id || undefined,
      location: newMeeting.location || undefined,
      meeting_mode: newMeeting.meeting_mode,
      estimated_duration_minutes: scheduledDuration,
    });

    // Persiste participantes selecionados
    if (scheduledInvitees.size > 0) {
      const invitedEmployees = (allEmployees || []).filter(
        (e) => e.user_id && scheduledInvitees.has(e.user_id),
      );
      const rows = invitedEmployees.map((e) => ({
        meeting_id: created.id,
        employee_id: e.id,
        name: e.full_name || "—",
        email: e.email || null,
        role: "required" as const,
      }));
      if (rows.length > 0) {
        const { error: attErr } = await supabase.from("meeting_attendees").insert(rows);
        if (attErr) console.warn("Falha ao adicionar participantes", attErr);
      }

      // Envia convite no chat (DM) para cada convidado
      if (created.livekit_room_name && profile?.user_id && profile.tenant_id) {
        const inviterName = profile.full_name || "Alguém";
        const dt = newMeeting.scheduled_date && newMeeting.scheduled_time
          ? `${newMeeting.scheduled_date} ${newMeeting.scheduled_time}`
          : "";
        const inviteAttachment = {
          type: "meeting_invite",
          meeting_id: created.id,
          room_name: created.livekit_room_name,
          title: newMeeting.title,
          host_name: inviterName,
          scheduled_at: dt || null,
        };
        for (const userId of scheduledInvitees) {
          try {
            const dmId = await findOrCreateDM(profile.user_id, userId, profile.tenant_id);
            await supabase.from("chat_messages" as any).insert({
              channel_id: dmId,
              tenant_id: profile.tenant_id,
              author_id: profile.user_id,
              content: dt
                ? `📅 ${inviterName} convidou você para uma reunião em ${dt}`
                : `📅 ${inviterName} convidou você para uma reunião`,
              attachments: [inviteAttachment],
            });
          } catch (err) {
            console.warn("Falha ao convidar", userId, err);
          }
        }
      }
    }

    setCreateDialogOpen(false);
    setDialogStep("choose");
    setNewMeeting({
      title: "",
      description: "",
      scheduled_date: "",
      scheduled_time: "",
      project_id: "",
      location: "",
      meeting_mode: "livekit",
    });
    setScheduledInvitees(new Set());
    setScheduledSearch("");
    setScheduledDuration(60);
    setScheduledVisibility("all");
    setActiveTab("attendees");
    setSelectedMeetingId(created.id);
  };

  const handleMeetingClick = (meetingId: string) => {
    setActiveTab("info");
    setSelectedMeetingId(meetingId);
  };

  const handleBackToList = () => {
    setSelectedMeetingId(null);
    setActiveTab("info");
  };

  const handleReprocessTranscript = async (meeting: Meeting) => {
    try {
      await processTranscript.mutateAsync({
        meeting_id: meeting.id,
        transcript: meeting.transcript_raw ?? undefined,
      });
      refetchMeeting();
    } catch {
      // erro já tratado pelo hook
    }
  };

  const handleResetToScheduled = async (meeting: Meeting) => {
    try {
      await updateMeeting.mutateAsync({
        id: meeting.id,
        updates: { status: "scheduled" },
      });
      refetchMeeting();
    } catch {
      // erro já tratado pelo hook
    }
  };

  const handleImportTranscript = async () => {
    if (!importData.title.trim() || !importData.transcript.trim()) {
      toast.error("Título e transcrição são obrigatórios");
      return;
    }
    await createWithTranscript.mutateAsync({
      title: importData.title,
      transcript: importData.transcript,
    });
    setImportDialogOpen(false);
    setImportData({ title: "", transcript: "" });
  };

  // Loading state
  if (meetingsLoading || meetings === undefined) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Loading state while meeting detail is being fetched
  if (selectedMeetingId && meetingLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={handleBackToList}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Voltar
        </Button>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Meeting detail view
  if (selectedMeetingId && selectedMeeting) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBackToList}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{selectedMeeting.title}</h1>
              {selectedMeeting.description && (
                <p className="text-muted-foreground">{selectedMeeting.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusMap[selectedMeeting.status]?.variant || "outline"}>
              {statusMap[selectedMeeting.status]?.label || selectedMeeting.status}
            </Badge>
            {selectedMeeting.meeting_mode === "livekit" && selectedMeeting.livekit_room_name && (() => {
              const j = getMeetingJoinability(selectedMeeting as any);
              if (j.joinable) {
                return (
                  <Button
                    size="sm"
                    onClick={() => {
                      const role = selectedMeeting.created_by === user?.id ? "host" : "guest";
                      window.open(
                        `/meet/${selectedMeeting.livekit_room_name}?role=${role}`,
                        "_blank",
                        "noopener",
                      );
                    }}
                    className="gap-1.5"
                  >
                    <Video className="w-4 h-4" />
                    Entrar na sala
                  </Button>
                );
              }
              if (j.opensAt) {
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="gap-1.5"
                    title={`Sala abre ${formatOpensIn(j.opensAt)}`}
                  >
                    <Clock className="w-4 h-4" />
                    Abre {formatOpensIn(j.opensAt)}
                  </Button>
                );
              }
              return null;
            })()}
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
              <Pencil className="w-4 h-4 mr-1" />
              Editar
            </Button>
          </div>
        </div>

        {/* Info Bar */}
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          {selectedMeeting.scheduled_date && (
            <div className="flex items-center gap-1">
              <CalendarDays className="w-4 h-4" />
              <span>
                {format(parseISO(selectedMeeting.scheduled_date), "dd/MM/yyyy", { locale: ptBR })}
                {selectedMeeting.scheduled_time && ` às ${selectedMeeting.scheduled_time}`}
              </span>
            </div>
          )}
          {selectedMeeting.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{selectedMeeting.location}</span>
            </div>
          )}
          {selectedMeeting.project && (
            <div className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              <span>Projeto: {selectedMeeting.project.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>
              {(selectedMeeting.meeting_attendees || []).filter((a) => a.attendance_status === "attended").length} participantes
            </span>
          </div>
        </div>

        {/* Banner: reunião em andamento (LiveKit) — transcrição em tempo real */}
        {selectedMeeting.status === "recording" && selectedMeeting.meeting_mode === "livekit" && (
          <div className="flex items-center gap-4 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <Loader2 className="w-5 h-5 animate-spin text-destructive flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm">Reunião em andamento</p>
              <p className="text-xs text-muted-foreground">
                Transcrevendo automaticamente com Soniox. Ao encerrar a sala, a IA gera resumo e tarefas sugeridas.
              </p>
            </div>
          </div>
        )}

        {/* Banner: progresso real do job de IA */}
        {selectedMeeting.status === "processing" && (() => {
          const phaseLabels: Record<string, string> = {
            queued: "Na fila",
            chunking: "Dividindo transcrição",
            extracting: "Extraindo tarefas",
            reducing: "Compactando análises",
            consolidating: "Consolidando resumo",
            saving: "Salvando resultados",
            done: "Concluído",
          };
          const progress = aiJob?.progress ?? 0;
          const phase = aiJob?.phase ? phaseLabels[aiJob.phase] || aiJob.phase : "Iniciando";
          const total = aiJob?.total_chunks ?? 0;
          const processed = aiJob?.processed_chunks ?? 0;
          return (
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-4">
                <Loader2 className="w-5 h-5 animate-spin text-warning flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Processando transcrição com IA</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {phase}
                    {total > 0 && aiJob?.phase === "extracting" ? ` — fragmento ${processed}/${total}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReprocessTranscript(selectedMeeting)}
                    disabled={processTranscript.isPending}
                    title="Reinicia o processamento do zero"
                  >
                    {processTranscript.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <RefreshCw className="w-4 h-4" />}
                    <span className="ml-1 hidden sm:inline">Reiniciar</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResetToScheduled(selectedMeeting)}
                    disabled={updateMeeting.isPending}
                    title="Volta para o estado 'Agendada' para gravar novamente"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="ml-1 hidden sm:inline">Resetar</span>
                  </Button>
                </div>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{progress}%</span>
                {aiJob?.failed_chunks ? (
                  <span className="text-destructive">{aiJob.failed_chunks} fragmento(s) com falha</span>
                ) : (
                  <span>Reuniões longas levam alguns minutos</span>
                )}
              </div>
              {aiJob?.error_message && (
                <p className="text-xs text-destructive">{aiJob.error_message}</p>
              )}
            </div>
          );
        })()}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="info">Visão geral</TabsTrigger>
            {(selectedMeeting.status === "scheduled" || selectedMeeting.status === "recording") && (
              <TabsTrigger value="recording">Gravação</TabsTrigger>
            )}
            {selectedMeeting.meeting_mode === "livekit" && (
              selectedMeeting.recording_url ||
              selectedMeeting.recording_status === "recording" ||
              selectedMeeting.recording_status === "pending" ||
              selectedMeeting.recording_status === "failed"
            ) && (
              <TabsTrigger value="video">Vídeo</TabsTrigger>
            )}
            {selectedMeeting.status === "completed" && (
              <>
                <TabsTrigger value="ai">Transcrição & IA</TabsTrigger>
                <TabsTrigger value="approval">Aprovação</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="info" className="space-y-6">
            {/* Card principal — Detalhes */}
            <div className="rounded-md border border-border bg-card overflow-hidden">
              {/* Header com título e descrição */}
              <div className="px-6 pt-5 pb-5 border-b border-border">
                <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2">
                  Detalhes da reunião
                </div>
                <h2 className="text-[20px] font-semibold text-foreground tracking-tight leading-tight">
                  {selectedMeeting.title}
                </h2>
                {selectedMeeting.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap">
                    {selectedMeeting.description}
                  </p>
                )}
              </div>

              {/* Grid de metadados */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5 px-6 py-5">
                {selectedMeeting.scheduled_date && (
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                      <CalendarIcon className="w-3 h-3" />
                      Data
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {format(parseISO(selectedMeeting.scheduled_date), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
                {selectedMeeting.scheduled_time && (
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Horário
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {selectedMeeting.scheduled_time}
                    </p>
                  </div>
                )}
                {selectedMeeting.duration_seconds && selectedMeeting.duration_seconds > 0 && (
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Duração
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {(() => {
                        const mins = Math.floor(selectedMeeting.duration_seconds / 60);
                        const secs = selectedMeeting.duration_seconds % 60;
                        if (mins === 0) return `${secs}s`;
                        if (mins < 60) return `${mins}m`;
                        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
                      })()}
                    </p>
                  </div>
                )}
                {selectedMeeting.location && (
                  <div className="space-y-1 col-span-2">
                    <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" />
                      {selectedMeeting.meeting_mode === "external_link" ? "Link" : "Local"}
                    </div>
                    {selectedMeeting.meeting_mode === "external_link" && selectedMeeting.location.startsWith("http") ? (
                      <a
                        href={selectedMeeting.location}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary hover:underline truncate block"
                      >
                        {selectedMeeting.location}
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-foreground truncate">{selectedMeeting.location}</p>
                    )}
                  </div>
                )}
                {selectedMeeting.project && (
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                      <FileText className="w-3 h-3" />
                      Projeto
                    </div>
                    <button
                      type="button"
                      onClick={() => window.open(`/projetos/${selectedMeeting.project!.id}`, "_self")}
                      className="text-sm font-medium text-primary hover:underline text-left truncate block"
                    >
                      {selectedMeeting.project.name}
                    </button>
                  </div>
                )}
                {!selectedMeeting.duration_seconds && selectedMeeting.started_at && selectedMeeting.ended_at && (
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Duração
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {(() => {
                        const sec = Math.floor((new Date(selectedMeeting.ended_at).getTime() - new Date(selectedMeeting.started_at).getTime()) / 1000);
                        const mins = Math.floor(sec / 60);
                        const secs = sec % 60;
                        if (mins === 0) return `${secs}s`;
                        if (mins < 60) return `${mins}m`;
                        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
                      })()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Card de Participantes integrado */}
            <div className="rounded-md border border-border bg-card overflow-hidden">
              <div className="px-6 pt-5 pb-4">
                <MeetingAttendeesManager
                  meetingId={selectedMeeting.id}
                  projectId={selectedMeeting.project_id}
                />
              </div>
            </div>

            {/* Controles do host para reuniões LiveKit */}
            {selectedMeeting.meeting_mode === 'livekit' &&
              selectedMeeting.livekit_room_name &&
              selectedMeeting.created_by === user?.id &&
              selectedMeeting.status !== 'completed' &&
              selectedMeeting.status !== 'cancelled' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Controles do host</CardTitle>
                    <CardDescription>
                      Gerencie a sala e convide pessoas externas (sem login).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const j = getMeetingJoinability(selectedMeeting as any);
                      if (j.joinable) {
                        return (
                          <Button
                            size="sm"
                            onClick={() => {
                              if (!selectedMeeting.livekit_room_name) return;
                              window.open(`/meet/${selectedMeeting.livekit_room_name}?role=host`, "_blank", "noopener");
                            }}
                            className="gap-1.5"
                          >
                            <Video className="w-4 h-4" />
                            Entrar na sala
                          </Button>
                        );
                      }
                      return (
                        <div className="text-2xs text-muted-foreground inline-flex items-center gap-1.5 mr-1">
                          <Clock className="w-3 h-3" />
                          {j.opensAt
                            ? `Sala abre ${formatOpensIn(j.opensAt)}`
                            : j.reason || "Sala indisponível"}
                        </div>
                      );
                    })()}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sendingMeetingInvites}
                      onClick={async () => {
                        if (!profile?.user_id || !profile.tenant_id || !selectedMeeting.livekit_room_name) return;
                        const attendees = (selectedMeeting.meeting_attendees || []).filter(
                          (a) => a.employee_id,
                        );
                        if (attendees.length === 0) {
                          toast.info("Adicione participantes antes de enviar convites");
                          return;
                        }
                        // Resolve user_ids dos employees em uma query
                        const empIds = attendees.map((a) => a.employee_id!).filter(Boolean);
                        const { data: emps } = await supabase
                          .from("employees")
                          .select("id, user_id")
                          .in("id", empIds);
                        const userIds = (emps || [])
                          .map((e: any) => e.user_id)
                          .filter((uid: string | null) => uid && uid !== profile.user_id);
                        if (userIds.length === 0) {
                          toast.info("Nenhum participante elegível para receber convite");
                          return;
                        }
                        setSendingMeetingInvites(true);
                        const inviterName = profile.full_name || "Alguém";
                        const dt =
                          selectedMeeting.scheduled_date && selectedMeeting.scheduled_time
                            ? `${selectedMeeting.scheduled_date} ${selectedMeeting.scheduled_time}`
                            : "";
                        const inviteAttachment = {
                          type: "meeting_invite",
                          meeting_id: selectedMeeting.id,
                          room_name: selectedMeeting.livekit_room_name,
                          title: selectedMeeting.title,
                          host_name: inviterName,
                          scheduled_at: dt || null,
                        };
                        let sent = 0;
                        for (const uid of userIds) {
                          try {
                            const dmId = await findOrCreateDM(profile.user_id, uid, profile.tenant_id);
                            await supabase.from("chat_messages" as any).insert({
                              channel_id: dmId,
                              tenant_id: profile.tenant_id,
                              author_id: profile.user_id,
                              content: dt
                                ? `📅 ${inviterName} convidou você para uma reunião em ${dt}`
                                : `📞 ${inviterName} convidou você para uma reunião`,
                              attachments: [inviteAttachment],
                            });
                            sent++;
                          } catch (err) {
                            console.warn("Falha ao convidar", uid, err);
                          }
                        }
                        setSendingMeetingInvites(false);
                        if (sent > 0) {
                          toast.success(`Convite enviado para ${sent} ${sent === 1 ? "pessoa" : "pessoas"} via chat`);
                        } else {
                          toast.error("Nenhum convite foi enviado");
                        }
                      }}
                    >
                      {sendingMeetingInvites ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-1.5" />
                      )}
                      Enviar convites
                    </Button>
                    <CopyGuestLinkButton
                      roomName={selectedMeeting.livekit_room_name}
                      variant="outline"
                      size="sm"
                    />
                    {(selectedMeeting.recording_status === 'recording' ||
                      selectedMeeting.status === 'recording') && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <PhoneOff className="w-4 h-4 mr-2" />
                            Encerrar reunião para todos
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Encerrar reunião para todos?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Todos os participantes serão desconectados imediatamente. A gravação será finalizada e processada com IA.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={endRoom.isPending}>
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              disabled={endRoom.isPending}
                              onClick={async (e) => {
                                e.preventDefault();
                                if (!selectedMeeting.livekit_room_name) return;
                                try {
                                  await endRoom.mutateAsync(
                                    selectedMeeting.livekit_room_name,
                                  );
                                  toast.success('Reunião encerrada');
                                  refetchMeeting();
                                  refetch();
                                } catch (err) {
                                  toast.error(
                                    (err as Error).message || 'Falha ao encerrar',
                                  );
                                }
                              }}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {endRoom.isPending && (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              )}
                              Encerrar agora
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </CardContent>
                </Card>
              )}
          </TabsContent>


          {(selectedMeeting.status === "scheduled" || selectedMeeting.status === "recording") && (
            <TabsContent value="recording">
              <MeetingRecorder
                meeting={selectedMeeting}
                onProcessingComplete={() => {
                  refetchMeeting();
                  refetch();
                }}
              />
            </TabsContent>
          )}

          {selectedMeeting.meeting_mode === "livekit" && (
            selectedMeeting.recording_url ||
            selectedMeeting.recording_status === "recording" ||
            selectedMeeting.recording_status === "pending" ||
            selectedMeeting.recording_status === "failed"
          ) && (
            <TabsContent value="video">
              <MeetingRecording meeting={selectedMeeting} />
            </TabsContent>
          )}

          {selectedMeeting.status === "completed" && (
            <>
              <TabsContent value="ai" className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReprocessTranscript(selectedMeeting)}
                    disabled={processTranscript.isPending}
                  >
                    {processTranscript.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Reprocessar IA
                  </Button>
                </div>

                <MeetingSummary meeting={selectedMeeting} />

                {selectedMeeting.transcript_raw && (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                      <CardTitle className="text-base">Transcrição Original</CardTitle>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(selectedMeeting.transcript_raw || "");
                              toast.success("Transcrição copiada");
                            } catch {
                              toast.error("Não foi possível copiar");
                            }
                          }}
                          title="Copiar transcrição"
                        >
                          <Copy className="w-3.5 h-3.5" /> Copiar
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5">
                              <Download className="w-3.5 h-3.5" /> Exportar
                              <ChevronDown className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {(() => {
                              const text = selectedMeeting.transcript_raw || "";
                              const safeName = (selectedMeeting.title || "transcricao").replace(/[^\w\-]+/g, "_");
                              const dateStr = selectedMeeting.scheduled_date
                                ? format(parseISO(selectedMeeting.scheduled_date), "yyyy-MM-dd", { locale: ptBR })
                                : format(new Date(), "yyyy-MM-dd");
                              const baseFileName = `${safeName}_${dateStr}`;
                              const triggerDownload = (blob: Blob, ext: string) => {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `${baseFileName}.${ext}`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                                toast.success(`Exportado como ${ext.toUpperCase()}`);
                              };
                              return (
                                <>
                                  <DropdownMenuItem onSelect={() => {
                                    triggerDownload(new Blob([text], { type: "text/plain;charset=utf-8" }), "txt");
                                  }}>
                                    <FileText className="w-3.5 h-3.5 mr-2" /> Texto (.txt)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => {
                                    const md = `# ${selectedMeeting.title}\n\n` +
                                      (selectedMeeting.scheduled_date ? `**Data:** ${format(parseISO(selectedMeeting.scheduled_date), "dd/MM/yyyy", { locale: ptBR })}\n\n` : "") +
                                      `## Transcrição\n\n${text}`;
                                    triggerDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), "md");
                                  }}>
                                    <FileText className="w-3.5 h-3.5 mr-2" /> Markdown (.md)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => {
                                    triggerDownload(new Blob([text], { type: "application/json;charset=utf-8" }), "json");
                                  }}>
                                    <FileText className="w-3.5 h-3.5 mr-2" /> JSON (.json)
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => {
                                    // Imprime / salvar PDF via dialog do navegador
                                    const w = window.open("", "_blank");
                                    if (!w) { toast.error("Pop-up bloqueado"); return; }
                                    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${selectedMeeting.title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:32px auto;padding:0 24px;color:#222;line-height:1.6}h1{font-size:22px;margin-bottom:4px}.meta{color:#666;font-size:13px;margin-bottom:24px}pre{white-space:pre-wrap;font-family:inherit;font-size:14px}</style></head><body><h1>${selectedMeeting.title}</h1><div class="meta">${selectedMeeting.scheduled_date ? format(parseISO(selectedMeeting.scheduled_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}</div><pre>${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c))}</pre><script>setTimeout(()=>window.print(),300)</script></body></html>`);
                                    w.document.close();
                                  }}>
                                    <Download className="w-3.5 h-3.5 mr-2" /> PDF (imprimir)
                                  </DropdownMenuItem>
                                </>
                              );
                            })()}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[400px]">
                        <pre className="whitespace-pre-wrap text-sm">
                          {selectedMeeting.transcript_raw}
                        </pre>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              <TabsContent value="approval">
                <MeetingApproval
                  meeting={selectedMeeting}
                  onApproved={() => {
                    refetchMeeting();
                    refetch();
                  }}
                />
              </TabsContent>
            </>
          )}
        </Tabs>

        {/* Edit Dialog */}
        <MeetingEditDialog
          meeting={selectedMeeting}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reuniões</h1>
          <p className="text-muted-foreground text-sm">Gerencie suas reuniões e transcrições</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Dialog: Importar Transcrição (renderizado escondido — abre via dropdown) */}
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Importar Transcrição de Reunião</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="import-title">Título da Reunião *</Label>
                  <Input
                    id="import-title"
                    value={importData.title}
                    onChange={(e) => setImportData({ ...importData, title: e.target.value })}
                    placeholder="Ex: Reunião de planejamento Q2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="import-transcript">Transcrição *</Label>
                  <p className="text-xs text-muted-foreground">
                    Cole o texto da transcrição abaixo. A IA irá extrair tarefas, resumo e pontos de atenção automaticamente.
                  </p>
                  <Textarea
                    id="import-transcript"
                    value={importData.transcript}
                    onChange={(e) => setImportData({ ...importData, transcript: e.target.value })}
                    placeholder="Cole aqui a transcrição da reunião..."
                    rows={12}
                    className="font-mono text-sm resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleImportTranscript}
                  disabled={
                    createWithTranscript.isPending ||
                    !importData.title.trim() ||
                    !importData.transcript.trim()
                  }
                >
                  {createWithTranscript.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Processar com IA
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button onClick={() => { setDialogStep("choose"); setCreateDialogOpen(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Reunião</span>
          </Button>
          <Sheet open={createDialogOpen} onOpenChange={(o) => { setCreateDialogOpen(o); if (!o) setDialogStep("choose"); }}>
          <SheetContent
            side="right"
            className="!w-full sm:!w-[520px] sm:!max-w-[520px] p-0 gap-0 flex flex-col h-full overflow-hidden border-l shadow-2xl"
          >
            {/* Header com tipografia do DS */}
            <SheetHeader className="px-6 py-5 border-b border-border bg-card">
              <SheetTitle className="text-[20px] font-semibold tracking-tight text-foreground">
                {dialogStep === "choose" ? "Nova Reunião"
                 : dialogStep === "instant_invite" ? "Iniciar agora"
                 : "Agendar Reunião"}
              </SheetTitle>
              <SheetDescription className="text-[13px] text-muted-foreground">
                {dialogStep === "choose"
                  ? "Escolha como deseja iniciar."
                  : dialogStep === "instant_invite"
                    ? "Convide colaboradores. Cada um receberá um convite no chat."
                    : "Defina os detalhes da reunião."}
              </SheetDescription>
            </SheetHeader>

            {dialogStep === "choose" ? (
              <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-3">
                {/* Eyebrow tag — DS pattern */}
                <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-1">
                  Modo da reunião
                </div>

                {/* Card: Início imediato */}
                <button
                  onClick={() => {
                    setInstantTitle(`Reunião rápida — ${format(new Date(), "dd/MM HH:mm", { locale: ptBR })}`);
                    setInstantInvitees(new Set());
                    setInviteSearch("");
                    setDialogStep("instant_invite");
                  }}
                  className="group relative overflow-hidden rounded-md border border-border bg-card text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-foreground/15"
                >
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-primary">
                        Recomendado
                      </span>
                      <Video className="w-4 h-4 text-muted-foreground/60" />
                    </div>
                    <h3 className="text-[17px] font-semibold text-foreground tracking-tight leading-tight mb-1.5">
                      Iniciar agora
                    </h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">
                      Abra uma sala imediatamente e convide colaboradores pelo chat.
                    </p>
                    <div className="flex items-center justify-end mt-4 pt-3 border-t border-border/60">
                      <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-foreground group-hover:text-primary transition-colors">
                        Iniciar →
                      </span>
                    </div>
                  </div>
                </button>

                {/* Card: Agendada */}
                <button
                  onClick={() => setDialogStep("schedule")}
                  className="group relative overflow-hidden rounded-md border border-border bg-card text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-foreground/15"
                >
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                        Planejada
                      </span>
                      <CalendarIcon className="w-4 h-4 text-muted-foreground/60" />
                    </div>
                    <h3 className="text-[17px] font-semibold text-foreground tracking-tight leading-tight mb-1.5">
                      Agendar
                    </h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">
                      Data, hora, projeto e participantes para uma reunião futura.
                    </p>
                    <div className="flex items-center justify-end mt-4 pt-3 border-t border-border/60">
                      <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-foreground group-hover:text-primary transition-colors">
                        Agendar →
                      </span>
                    </div>
                  </div>
                </button>

                {/* Card: Recorrente — admin-only */}
                <button
                  type="button"
                  onClick={() => {
                    if (!isAdmin) return;
                    setRecurringDialogOpen(true);
                    setCreateDialogOpen(false);
                  }}
                  disabled={!isAdmin}
                  title={!isAdmin ? "Apenas administradores podem criar reuniões recorrentes" : undefined}
                  className={cn(
                    "group relative overflow-hidden rounded-md border bg-card text-left transition-all duration-300",
                    isAdmin
                      ? "border-border hover:-translate-y-0.5 hover:shadow-md hover:border-foreground/15 cursor-pointer"
                      : "border-border/60 opacity-55 cursor-not-allowed",
                  )}
                >
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground inline-flex items-center gap-1.5">
                        Repetida
                        {!isAdmin && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="inline-flex items-center gap-1 text-muted-foreground/80">
                              <Lock className="w-2.5 h-2.5" />
                              Admin
                            </span>
                          </>
                        )}
                      </span>
                      <Repeat className="w-4 h-4 text-muted-foreground/60" />
                    </div>
                    <h3 className="text-[17px] font-semibold text-foreground tracking-tight leading-tight mb-1.5">
                      Recorrente
                    </h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">
                      {isAdmin
                        ? "Repete diária ou semanalmente — ideal para dailies e 1:1s."
                        : "Apenas administradores podem criar reuniões recorrentes."}
                    </p>
                    {isAdmin && (
                      <div className="flex items-center justify-end mt-4 pt-3 border-t border-border/60">
                        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-foreground group-hover:text-primary transition-colors">
                          Configurar →
                        </span>
                      </div>
                    )}
                  </div>
                </button>

                {/* Footnote — DS pattern (mono caption) */}
                <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground/60 mt-3 text-center leading-relaxed">
                  Salas privadas LiveKit · gravação e IA automáticas
                </p>
              </div>
            ) : dialogStep === "instant_invite" ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Título da reunião */}
                <div className="px-6 pt-5 pb-3 border-b border-border">
                  <Label className="text-xs font-medium text-foreground">Título</Label>
                  <Input
                    value={instantTitle}
                    onChange={(e) => setInstantTitle(e.target.value)}
                    className="mt-1.5 h-9 text-sm"
                    placeholder="Reunião rápida"
                  />
                </div>

                {/* Lista de convidados */}
                <div className="px-6 pt-3 pb-2 flex items-center justify-between">
                  <span className="text-2xs font-medium text-muted-foreground uppercase tracking-[0.08em]">
                    Convidar · {instantInvitees.size}
                  </span>
                  {instantInvitees.size > 0 && (
                    <button
                      onClick={() => setInstantInvitees(new Set())}
                      className="text-2xs text-muted-foreground hover:text-foreground"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <div className="px-6 pb-2">
                  <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={inviteSearch}
                      onChange={(e) => setInviteSearch(e.target.value)}
                      placeholder="Buscar colaborador..."
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3">
                  <div className="flex flex-col gap-0.5 pb-2">
                    {(allEmployees || [])
                      .filter((e) => e.status === "active" && e.user_id && e.user_id !== user?.id)
                      .filter((e) => !inviteSearch.trim() || (e.full_name || "").toLowerCase().includes(inviteSearch.toLowerCase()))
                      .map((e) => {
                        const checked = instantInvitees.has(e.user_id!);
                        return (
                          <label
                            key={e.id}
                            className={cn(
                              "flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-colors",
                              checked ? "bg-primary/10" : "hover:bg-muted"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(ev) => {
                                const next = new Set(instantInvitees);
                                if (ev.target.checked) next.add(e.user_id!);
                                else next.delete(e.user_id!);
                                setInstantInvitees(next);
                              }}
                              className="w-4 h-4 rounded border-border accent-primary"
                            />
                            <AvatarBadge name={e.full_name || "?"} avatarUrl={e.avatar_url} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate leading-tight">{e.full_name}</p>
                              {e.position_title && (
                                <p className="text-2xs text-muted-foreground truncate">
                                  {e.position_title}
                                  {(e.subarea_name || e.area_name) && ` · ${e.subarea_name || e.area_name}`}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>

                {/* Footer fixo */}
                <div className="px-6 py-3 border-t border-border bg-card flex items-center justify-between gap-2">
                  <button
                    onClick={() => setDialogStep("choose")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Voltar
                  </button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sendingInvites || createMeeting.isPending || !instantTitle.trim()}
                      onClick={async () => {
                        try {
                          const m = await createMeeting.mutateAsync({
                            title: instantTitle.trim(),
                            meeting_mode: "livekit",
                          });
                          setCreateDialogOpen(false);
                          setDialogStep("choose");
                          if (m.livekit_room_name) {
                            window.open(`/meet/${m.livekit_room_name}?role=host`, "_blank", "noopener");
                          }
                        } catch { /* tratado pelo hook */ }
                      }}
                    >
                      Iniciar sem convidar
                    </Button>
                    <Button
                      size="sm"
                      disabled={sendingInvites || createMeeting.isPending || !instantTitle.trim() || instantInvitees.size === 0}
                      onClick={async () => {
                        if (!profile?.user_id || !profile.tenant_id) return;
                        setSendingInvites(true);
                        try {
                          const m = await createMeeting.mutateAsync({
                            title: instantTitle.trim(),
                            meeting_mode: "livekit",
                          });
                          if (m.livekit_room_name) {
                            // Cria DM com cada convidado e posta msg de convite
                            const inviterName = profile.full_name || "Alguém";
                            const inviteAttachment = {
                              type: "meeting_invite",
                              meeting_id: m.id,
                              room_name: m.livekit_room_name,
                              title: instantTitle.trim(),
                              host_name: inviterName,
                            };
                            for (const userId of instantInvitees) {
                              try {
                                const dmId = await findOrCreateDM(profile.user_id, userId, profile.tenant_id);
                                await supabase.from("chat_messages" as any).insert({
                                  channel_id: dmId,
                                  tenant_id: profile.tenant_id,
                                  author_id: profile.user_id,
                                  content: `📞 ${inviterName} convidou você para uma reunião`,
                                  attachments: [inviteAttachment],
                                });
                              } catch (err) {
                                console.warn("Falha ao convidar", userId, err);
                              }
                            }
                            toast.success(`Convites enviados para ${instantInvitees.size} ${instantInvitees.size === 1 ? "pessoa" : "pessoas"}`);
                            setCreateDialogOpen(false);
                            setDialogStep("choose");
                            window.open(`/meet/${m.livekit_room_name}?role=host`, "_blank", "noopener");
                          }
                        } catch { /* tratado */ }
                        finally { setSendingInvites(false); }
                      }}
                    >
                      {(sendingInvites || createMeeting.isPending)
                        ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        : <Send className="w-3.5 h-3.5 mr-1.5" />}
                      {instantInvitees.size > 0
                        ? `Iniciar e convidar ${instantInvitees.size}`
                        : "Iniciar e convidar"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Seção: Informações */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span className="text-2xs font-semibold text-foreground uppercase tracking-[0.08em]">Informações</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-xs font-medium text-foreground">Título *</Label>
                  <Input
                    id="title"
                    value={newMeeting.title}
                    onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                    placeholder="Ex: Daily Standup, Kickoff Projeto Alpha"
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description" className="text-xs font-medium text-foreground">Descrição / pauta</Label>
                    <span className="text-2xs text-muted-foreground">{newMeeting.description.length}/500</span>
                  </div>
                  <Textarea
                    id="description"
                    value={newMeeting.description}
                    onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value.slice(0, 500) })}
                    placeholder="• Tópico 1...&#10;• Tópico 2...&#10;• Decisões esperadas..."
                    rows={4}
                    className="text-sm resize-none"
                  />
                  <p className="text-2xs text-muted-foreground">Compartilhada com participantes; usada como contexto pela IA.</p>
                </div>
              </div>

              {/* Seção: Quando */}
              <div className="space-y-4 pt-1 border-t border-border">
                <div className="flex items-center gap-2 pt-3">
                  <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-2xs font-semibold text-foreground uppercase tracking-[0.08em]">Quando</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_date" className="text-xs font-medium text-foreground">Data</Label>
                    <Input
                      id="scheduled_date"
                      type="date"
                      value={newMeeting.scheduled_date}
                      onChange={(e) => setNewMeeting({ ...newMeeting, scheduled_date: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_time" className="text-xs font-medium text-foreground">Horário</Label>
                    <Input
                      id="scheduled_time"
                      type="time"
                      value={newMeeting.scheduled_time}
                      onChange={(e) => setNewMeeting({ ...newMeeting, scheduled_time: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-foreground">Duração estimada</Label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[15, 30, 60, 90, 120].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setScheduledDuration(min)}
                        className={cn(
                          "h-8 rounded-md text-xs font-medium border transition-colors",
                          scheduledDuration === min
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-accent",
                        )}
                      >
                        {min < 60 ? `${min}m` : `${min / 60}h${min % 60 ? ` ${min % 60}m` : ""}`}
                      </button>
                    ))}
                  </div>
                  {newMeeting.scheduled_time && (
                    <p className="text-2xs text-muted-foreground">
                      Termina às{" "}
                      {(() => {
                        const [h, m] = newMeeting.scheduled_time.split(":").map(Number);
                        const total = h * 60 + m + scheduledDuration;
                        const hh = Math.floor(total / 60) % 24;
                        const mm = total % 60;
                        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
                      })()}
                    </p>
                  )}
                </div>
              </div>

              {/* Seção: Onde */}
              <div className="space-y-4 pt-1 border-t border-border">
                <div className="flex items-center gap-2 pt-3">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span className="text-2xs font-semibold text-foreground uppercase tracking-[0.08em]">Onde</span>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-foreground">Modo da reunião</Label>
                  <Select
                    value={newMeeting.meeting_mode}
                    onValueChange={(v) => setNewMeeting({ ...newMeeting, meeting_mode: v as 'in_person' | 'external_link' | 'livekit' })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="livekit">🎥 Sala interna (gravada + IA)</SelectItem>
                      <SelectItem value="external_link">🔗 Link externo (Meet, Zoom...)</SelectItem>
                      <SelectItem value="in_person">🏢 Presencial</SelectItem>
                    </SelectContent>
                  </Select>
                  {newMeeting.meeting_mode !== 'livekit' && (
                    <p className="text-2xs text-muted-foreground">
                      {newMeeting.meeting_mode === 'external_link' && 'Cole o link do Google Meet/Zoom no campo abaixo.'}
                      {newMeeting.meeting_mode === 'in_person' && 'Sem videochamada — apenas registro presencial.'}
                    </p>
                  )}
                </div>
                {newMeeting.meeting_mode !== 'livekit' && (
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-xs font-medium text-foreground">
                      {newMeeting.meeting_mode === 'external_link' ? 'Link da videochamada' : 'Local'}
                    </Label>
                    <Input
                      id="location"
                      value={newMeeting.location}
                      onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                      placeholder={newMeeting.meeting_mode === 'external_link' ? 'https://meet.google.com/...' : 'Ex: Sala 3 — Sede SP'}
                      className="h-9 text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Seção: Contexto */}
              <div className="space-y-4 pt-1 border-t border-border">
                <div className="flex items-center gap-2 pt-3">
                  <Filter className="w-3.5 h-3.5 text-primary" />
                  <span className="text-2xs font-semibold text-foreground uppercase tracking-[0.08em]">Contexto</span>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-foreground">Projeto vinculado</Label>
                  <Select
                    value={newMeeting.project_id || "none"}
                    onValueChange={(v) => setNewMeeting({ ...newMeeting, project_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Nenhum projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum projeto</SelectItem>
                      {projects?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-2xs text-muted-foreground">Decisões e tarefas geradas pela IA serão atribuídas ao projeto.</p>
                </div>
              </div>

              {/* Seção: Participantes */}
              <div className="space-y-4 pt-1 border-t border-border">
                <div className="flex items-center justify-between pt-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span className="text-2xs font-semibold text-foreground uppercase tracking-[0.08em]">
                      Participantes · {scheduledInvitees.size}
                    </span>
                  </div>
                  {scheduledInvitees.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setScheduledInvitees(new Set())}
                      className="text-2xs text-muted-foreground hover:text-foreground"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <p className="text-2xs text-muted-foreground -mt-2">
                  Convidados receberão um convite no chat com o link da reunião.
                </p>
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={scheduledSearch}
                    onChange={(e) => setScheduledSearch(e.target.value)}
                    placeholder="Buscar colaborador..."
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted/20">
                  <div className="flex flex-col gap-0.5 p-1">
                    {(allEmployees || [])
                      .filter((e) => e.status === "active" && e.user_id && e.user_id !== user?.id)
                      .filter((e) => !scheduledSearch.trim() || (e.full_name || "").toLowerCase().includes(scheduledSearch.toLowerCase()))
                      .slice(0, 50)
                      .map((e) => {
                        const checked = scheduledInvitees.has(e.user_id!);
                        return (
                          <label
                            key={e.id}
                            className={cn(
                              "flex items-center gap-2.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors",
                              checked ? "bg-primary/10" : "hover:bg-muted",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(ev) => {
                                const next = new Set(scheduledInvitees);
                                if (ev.target.checked) next.add(e.user_id!);
                                else next.delete(e.user_id!);
                                setScheduledInvitees(next);
                              }}
                              className="w-3.5 h-3.5 rounded border-border accent-primary"
                            />
                            <AvatarBadge name={e.full_name || "?"} avatarUrl={e.avatar_url} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate leading-tight">{e.full_name}</p>
                              {e.position_title && (
                                <p className="text-2xs text-muted-foreground truncate">
                                  {e.position_title}
                                  {(e.subarea_name || e.area_name) && ` · ${e.subarea_name || e.area_name}`}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* Seção: Visibilidade */}
              <div className="space-y-3 pt-1 border-t border-border">
                <div className="flex items-center gap-2 pt-3">
                  <User className="w-3.5 h-3.5 text-primary" />
                  <span className="text-2xs font-semibold text-foreground uppercase tracking-[0.08em]">Visibilidade</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { v: "all" as const, label: "Toda a empresa", hint: "Aparece para todos do tenant" },
                    { v: "invitees" as const, label: "Apenas convidados", hint: "Privada — só participantes" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setScheduledVisibility(o.v)}
                      className={cn(
                        "rounded-md border p-2.5 text-left transition-colors",
                        scheduledVisibility === o.v
                          ? "bg-primary/5 border-primary text-foreground"
                          : "bg-card border-border hover:bg-accent",
                      )}
                    >
                      <p className="text-xs font-medium">{o.label}</p>
                      <p className="text-2xs text-muted-foreground mt-0.5">{o.hint}</p>
                    </button>
                  ))}
                </div>
              </div>


            </div>
            )}
            {/* Footer fixo com Voltar / Cancelar / Criar quando em schedule */}
            {dialogStep === "schedule" && (
              <div className="px-6 py-3 border-t border-border bg-card flex items-center justify-between gap-2">
                <button
                  onClick={() => setDialogStep("choose")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Voltar
                </button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateMeeting}
                    disabled={createMeeting.isPending || !newMeeting.title.trim()}
                  >
                    {createMeeting.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Criar reunião
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
        </div>
      </div>

      {/* View tabs (Lista / Calendário / Recorrentes) */}
      <Tabs value={listView} onValueChange={(v) => setListView(v as typeof listView)}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="list">
              <Filter className="w-4 h-4 mr-1.5" />
              Lista
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays className="w-4 h-4 mr-1.5" />
              Calendário
            </TabsTrigger>
          </TabsList>

          {listView === "list" && (
            <div className="flex items-center gap-2 flex-wrap">
              {(Object.keys(filterLabels) as TimeFilter[]).map((filter) => (
                <Button
                  key={filter}
                  variant={timeFilter === filter ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeFilter(filter)}
                >
                  {filterLabels[filter]}
                </Button>
              ))}
            </div>
          )}

        </div>

        <TabsContent value="calendar" className="mt-4">
          <MeetingsCalendar
            meetings={meetings || []}
            recurringMeetings={recurringMeetings}
            onSelect={(m) => {
              const rm = m as RecurringMeeting;
              if (rm.is_recurring) {
                const canEdit = isAdmin || rm.created_by === user?.id;
                if (canEdit) {
                  setEditingRecurring(rm);
                  setRecurringDialogOpen(true);
                } else {
                  // Não é host nem admin — abre o detalhe da reunião base
                  handleMeetingClick(rm.id);
                }
              } else {
                handleMeetingClick(m.id);
              }
            }}
          />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
      {filteredMeetings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarDays className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhuma reunião encontrada</p>
            <p className="text-sm text-muted-foreground">
              {timeFilter !== "all"
                ? `Sem reuniões para ${filterLabels[timeFilter].toLowerCase()}`
                : canManageProjects
                  ? "Crie uma nova reunião para começar"
                  : "Nenhuma reunião em que você é participante."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedMeetings.map(({ date, meetings: dateMeetings }) => (
            <div key={date} className="space-y-3">
              {/* Date Header */}
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">{formatDateHeader(date)}</h2>
                <Badge variant="secondary" className="ml-2">
                  {dateMeetings.length} {dateMeetings.length === 1 ? "reunião" : "reuniões"}
                </Badge>
              </div>

              {/* Meeting Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dateMeetings.map((meeting) => (
                  <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    onClick={() => handleMeetingClick(meeting.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
        </TabsContent>
      </Tabs>

      <RecurringMeetingDialog
        open={recurringDialogOpen}
        onOpenChange={(o) => {
          setRecurringDialogOpen(o);
          if (!o) setEditingRecurring(null);
        }}
        editing={editingRecurring}
      />
    </div>
  );
}
