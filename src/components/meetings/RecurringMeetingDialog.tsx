/**
 * RecurringMeetingDialog — v8.12.1
 * Dialog admin-only para criar/editar reuniões recorrentes.
 * Tabs: Configuração (frequência/horário/aviso) + Membros (attendees).
 *
 * Fluxo de criação: usuário preenche configuração e clica "Criar" →
 * meeting é gerado com id → dialog troca para edição e habilita tab Membros.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CalendarClock, Bell, Users, Settings2, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_RECURRENCE,
  useCreateRecurringMeeting,
  useUpdateRecurringMeeting,
  useRecurringMeetings,
  type RecurrencePattern,
  type RecurringMeeting,
  type Weekday,
} from "@/hooks/useMeetingRecurrence";
import { useAreas } from "@/hooks/useAreas";
import { MeetingAttendeesManager } from "./MeetingAttendeesManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const WEEKDAYS: { code: Weekday; label: string }[] = [
  { code: "MO", label: "Seg" },
  { code: "TU", label: "Ter" },
  { code: "WE", label: "Qua" },
  { code: "TH", label: "Qui" },
  { code: "FR", label: "Sex" },
  { code: "SA", label: "Sáb" },
  { code: "SU", label: "Dom" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: RecurringMeeting | null;
}

export function RecurringMeetingDialog({ open, onOpenChange, editing }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pattern, setPattern] = useState<RecurrencePattern>(DEFAULT_RECURRENCE);
  const [reminderMin, setReminderMin] = useState(5);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [tab, setTab] = useState<"config" | "members">("config");
  const { data: areas = [] } = useAreas();
  const [areaMembers, setAreaMembers] = useState<{ employee_id: string; user_id: string; full_name: string; work_email: string | null }[]>([]);
  const [loadingAreaMembers, setLoadingAreaMembers] = useState(false);
  const [addingArea, setAddingArea] = useState(false);
  // Quando criar uma nova, guarda o id após salvar para liberar a aba Membros
  const [createdId, setCreatedId] = useState<string | null>(null);

  const createMut = useCreateRecurringMeeting();
  const updateMut = useUpdateRecurringMeeting();
  const { data: recurringMeetings } = useRecurringMeetings();
  const qc = useQueryClient();

  // Resolve qual id usar para attendees: editing prevalece sobre createdId
  const meetingId = editing?.id ?? createdId;
  const meetingForAttendees = editing
    ? null
    : recurringMeetings?.find((m) => m.id === createdId) ?? null;

  // Busca membros da área sempre que areaId muda
  useEffect(() => {
    let cancelled = false;
    if (!areaId) {
      setAreaMembers([]);
      return;
    }
    setLoadingAreaMembers(true);
    (async () => {
      const { data, error } = await (supabase as any).rpc("employees_by_area", {
        p_area_id: areaId,
      });
      if (cancelled) return;
      if (error) {
        console.warn("Falha ao buscar membros da área", error);
        setAreaMembers([]);
      } else {
        setAreaMembers((data || []) as any);
      }
      setLoadingAreaMembers(false);
    })();
    return () => { cancelled = true; };
  }, [areaId]);

  const handleAddAreaMembers = async () => {
    if (!meetingId || areaMembers.length === 0) return;
    setAddingArea(true);
    try {
      const rows = areaMembers.map((m) => ({
        meeting_id: meetingId,
        employee_id: m.employee_id,
        name: m.full_name || "—",
        email: m.work_email || null,
        role: "required" as const,
      }));
      const { error } = await supabase
        .from("meeting_attendees")
        .upsert(rows as any, { onConflict: "meeting_id,employee_id", ignoreDuplicates: true });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["meeting-attendees", meetingId] });
      await qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
      toast.success(`${areaMembers.length} membro(s) da área adicionados`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar membros da área");
    } finally {
      setAddingArea(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setPattern(editing.recurrence_pattern ?? DEFAULT_RECURRENCE);
      setReminderMin(editing.reminder_minutes_before ?? 5);
      setAreaId(editing.area_id ?? null);
      setCreatedId(null);
      setTab("config");
    } else {
      setTitle("");
      setDescription("");
      setPattern(DEFAULT_RECURRENCE);
      setReminderMin(5);
      setAreaId(null);
      setCreatedId(null);
      setTab("config");
    }
  }, [editing, open]);

  const toggleDay = (day: Weekday) => {
    setPattern((p) => ({
      ...p,
      byday: p.byday.includes(day)
        ? p.byday.filter((d) => d !== day)
        : [...p.byday, day],
    }));
  };

  const handleSubmit = async () => {
    if (!title.trim() || pattern.byday.length === 0) return;
    if (editing) {
      await updateMut.mutateAsync({
        id: editing.id,
        patch: {
          title: title.trim(),
          description: description.trim() || null,
          recurrence_pattern: pattern,
          reminder_minutes_before: reminderMin,
          area_id: areaId,
        },
      });
      setTab("members");
    } else {
      const created = await createMut.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        pattern,
        reminder_minutes_before: reminderMin,
        area_id: areaId,
      });
      if (created?.id) {
        setCreatedId(created.id);
        setTab("members");
      } else {
        onOpenChange(false);
      }
    }
  };

  const submitting = createMut.isPending || updateMut.isPending;
  const canSubmit = title.trim().length > 0 && pattern.byday.length > 0 && !submitting;
  const membersTabEnabled = !!meetingId;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[520px] p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-6 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="w-5 h-5 text-primary" />
            {editing
              ? "Editar reunião recorrente"
              : createdId
                ? "Reunião criada — adicione os membros"
                : "Nova reunião recorrente"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Defina frequência, horário e participantes — instâncias futuras serão geradas automaticamente.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="config">
              <Settings2 className="w-4 h-4 mr-1.5" />
              Configuração
            </TabsTrigger>
            <TabsTrigger value="members" disabled={!membersTabEnabled}>
              <Users className="w-4 h-4 mr-1.5" />
              Membros
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rec-title">Título *</Label>
              <Input
                id="rec-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Daily TI 09:30"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rec-desc">Descrição</Label>
              <Textarea
                id="rec-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pauta padrão, objetivos..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                Área responsável
              </Label>
              <Select
                value={areaId ?? "none"}
                onValueChange={(v) => setAreaId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem área específica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem área específica</SelectItem>
                  {(areas || []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A reunião aparecerá no dashboard de todos os colaboradores desta área.
              </p>

              {/* Indicador de quem verá a reunião */}
              {areaId && (
                <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="text-xs text-foreground">
                      {loadingAreaMembers
                        ? "Carregando..."
                        : areaMembers.length === 0
                          ? "Nenhum colaborador ativo nesta área"
                          : `${areaMembers.length} colaborador${areaMembers.length === 1 ? "" : "es"} verá${areaMembers.length === 1 ? "" : "ão"} esta reunião no dashboard`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select
                  value={pattern.freq}
                  onValueChange={(v: "daily" | "weekly") =>
                    setPattern((p) => ({ ...p, freq: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diária (todos os dias)</SelectItem>
                    <SelectItem value="weekly">Semanal (dias específicos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rec-time">Horário</Label>
                <Input
                  id="rec-time"
                  type="time"
                  value={pattern.time}
                  onChange={(e) =>
                    setPattern((p) => ({ ...p, time: e.target.value }))
                  }
                />
              </div>
            </div>

            {pattern.freq === "weekly" && (
              <div className="space-y-2">
                <Label>Dias da semana</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const active = pattern.byday.includes(d.code);
                    return (
                      <button
                        key={d.code}
                        type="button"
                        onClick={() => toggleDay(d.code)}
                        className={cn(
                          "h-9 min-w-[3rem] px-3 rounded-md text-sm font-medium border transition-colors",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground border-border hover:bg-accent",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rec-reminder" className="flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5" />
                  Avisar antes (min)
                </Label>
                <Input
                  id="rec-reminder"
                  type="number"
                  min={0}
                  max={120}
                  value={reminderMin}
                  onChange={(e) =>
                    setReminderMin(Math.max(0, Math.min(120, Number(e.target.value) || 0)))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rec-end">Data final (opcional)</Label>
                <Input
                  id="rec-end"
                  type="date"
                  value={pattern.end_date ?? ""}
                  onChange={(e) =>
                    setPattern((p) => ({ ...p, end_date: e.target.value || null }))
                  }
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="members" className="py-2">
            {meetingId ? (
              <MeetingAttendeesManager meetingId={meetingId} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Salve a configuração primeiro para adicionar membros.
              </p>
            )}
          </TabsContent>
        </Tabs>
        </div>

        <div className="px-6 py-3 border-t border-border bg-card flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {tab === "members" ? "Concluir" : "Cancelar"}
          </Button>
          {tab === "config" && (
            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {editing
                ? "Salvar e ir para membros"
                : "Criar e adicionar membros"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
