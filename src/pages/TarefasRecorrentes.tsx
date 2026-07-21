import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Repeat, Calendar, Clock, Pause, Play, Trash2,
  ChevronRight, AlertCircle, CheckSquare, Search,
  List, Users,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useEmployees } from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RecurrenceDetailModal } from "@/components/shared/RecurrenceDetailModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Diariamente",
  weekly: "Semanalmente",
  biweekly: "Quinzenalmente",
  monthly: "Mensalmente",
  custom: "Personalizado",
};

interface RecurrenceRow {
  id: string;
  task_id: string;
  frequency: string;
  interval_days: number | null;
  days_of_week: number[] | null;
  day_of_month: number | null;
  end_date: string | null;
  next_occurrence: string;
  is_active: boolean;
  created_at: string;
  task_title: string;
  task_status: string;
  task_priority: string;
  project_name: string | null;
  assignee_name: string | null;
}

export default function TarefasRecorrentes() {
  const { profile, user } = useAuth();
  const tenantId = profile?.tenant_id;
  const { isMember, isAdmin, isCeo } = usePermissions();
  const canViewByPerson = isAdmin || isCeo;
  const { data: employees } = useEmployees();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "paused">("all");
  const [viewMode, setViewMode] = useState<"list" | "person">("list");
  const [selectedRecurrence, setSelectedRecurrence] = useState<RecurrenceRow | null>(null);

  // Find current user's employee record (for member filtering)
  const currentEmployee = (employees || []).find((e) => e.user_id === user?.id);

  const { data: recurrences, isLoading } = useQuery({
    queryKey: ["all-recurrences", tenantId, isMember, currentEmployee?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_recurrence")
        .select("*")
        .order("next_occurrence", { ascending: true });
      if (error) throw error;

      if (!data || data.length === 0) return [];

      // Fetch related task info
      const taskIds = data.map((r) => r.task_id);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, priority, project_id, assignee_id")
        .in("id", taskIds);

      // Member filter: only show recurrences for tasks assigned to current user
      const filteredTasks = isMember && currentEmployee
        ? (tasks || []).filter((t) => t.assignee_id === currentEmployee.id)
        : (tasks || []);

      const allowedTaskIds = new Set(filteredTasks.map((t) => t.id));
      const filteredData = data.filter((r) => allowedTaskIds.has(r.task_id));

      const projIds = [...new Set(filteredTasks.filter((t) => t.project_id).map((t) => t.project_id!))] as string[];
      const assigneeIds = [...new Set(filteredTasks.filter((t) => t.assignee_id).map((t) => t.assignee_id!))] as string[];

      const [projResult, assigneeResult] = await Promise.all([
        projIds.length > 0
          ? supabase.from("projects").select("id, name").in("id", projIds)
          : Promise.resolve({ data: [] as any[] }),
        assigneeIds.length > 0
          ? supabase.from("organograma_view").select("employee_id, full_name").in("employee_id", assigneeIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const projMap = new Map((projResult.data || []).map((p: any) => [p.id, p.name]));
      const assigneeMap = new Map((assigneeResult.data || []).map((a: any) => [a.employee_id, a.full_name]));
      const taskMap = new Map(filteredTasks.map((t) => [t.id, t]));

      return filteredData.map((r): RecurrenceRow => {
        const task = taskMap.get(r.task_id);
        return {
          ...r,
          task_title: task?.title || "Tarefa removida",
          task_status: task?.status || "unknown",
          task_priority: task?.priority || "medium",
          project_name: task?.project_id ? projMap.get(task.project_id) || null : null,
          assignee_name: task?.assignee_id ? assigneeMap.get(task.assignee_id) || null : null,
        };
      });
    },
    enabled: !!tenantId,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("task_recurrence")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-recurrences", tenantId] });
      qc.invalidateQueries({ queryKey: ["tasks", tenantId] });
    },
  });

  const deleteRecurrence = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("task_recurrence")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-recurrences", tenantId] });
      qc.invalidateQueries({ queryKey: ["tasks", tenantId] });
      toast.success("Tarefa removida da agenda!");
    },
  });

  const filtered = (recurrences || []).filter((r) => {
    if (search && !r.task_title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus === "active" && !r.is_active) return false;
    if (filterStatus === "paused" && r.is_active) return false;
    return true;
  });

  const activeCount = (recurrences || []).filter((r) => r.is_active).length;
  const pausedCount = (recurrences || []).filter((r) => !r.is_active).length;
  const nextDue = (recurrences || [])
    .filter((r) => r.is_active)
    .sort((a, b) => a.next_occurrence.localeCompare(b.next_occurrence))[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground flex items-center gap-2">
            <Repeat className="w-6 h-6 text-primary" />
            Agenda Semanal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isMember
              ? "Suas tarefas que se repetem automaticamente"
              : "Gerencie todas as tarefas que se repetem automaticamente"}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/tarefas")} className="gap-1.5">
          <CheckSquare className="w-4 h-4" /> Ver Kanban
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border border-border bg-card empire-top-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Play className="w-4 h-4 text-success" /> Ativas
          </div>
          <p className="text-2xl font-bold text-foreground">{activeCount}</p>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Pause className="w-4 h-4 text-warning" /> Pausadas
          </div>
          <p className="text-2xl font-bold text-foreground">{pausedCount}</p>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Calendar className="w-4 h-4 text-info" /> Próxima execução
          </div>
          <p className="text-2xl font-bold text-foreground">
            {nextDue
              ? format(new Date(nextDue.next_occurrence + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
              : "—"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título da tarefa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ({(recurrences || []).length})</SelectItem>
            <SelectItem value="active">Ativas ({activeCount})</SelectItem>
            <SelectItem value="paused">Pausadas ({pausedCount})</SelectItem>
          </SelectContent>
        </Select>
        {canViewByPerson && (
          <div className="flex border border-border rounded-md overflow-hidden">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none h-9 px-3 gap-1.5"
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4" /> Lista
            </Button>
            <Button
              variant={viewMode === "person" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none h-9 px-3 gap-1.5"
              onClick={() => setViewMode("person")}
            >
              <Users className="w-4 h-4" /> Por Pessoa
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Repeat className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {(recurrences || []).length === 0
              ? "Sua agenda semanal está vazia. Abra uma tarefa e clique em \"Adicionar à agenda\"."
              : "Nenhum item da agenda encontrado com os filtros atuais."}
          </p>
        </div>
      ) : viewMode === "person" && canViewByPerson ? (
        /* ===== BY PERSON VIEW — WEEKLY CALENDAR ===== */
        <div className="space-y-6">
          {(() => {
            const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
            const today = new Date();
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            const weekDates = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(startOfWeek);
              d.setDate(startOfWeek.getDate() + i);
              return d;
            });
            const todayStr = format(today, "yyyy-MM-dd");

            const grouped = new Map<string, { name: string; items: RecurrenceRow[] }>();
            for (const rec of filtered) {
              const key = rec.assignee_name || "Sem responsável";
              if (!grouped.has(key)) grouped.set(key, { name: key, items: [] });
              grouped.get(key)!.items.push(rec);
            }

            return Array.from(grouped.values())
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((group) => {
                // Tarefas que mapeiam a dias da semana
                const calendarItems = group.items.filter(
                  (r) => r.frequency === "daily" || r.frequency === "weekly" || r.frequency === "biweekly" || (r.days_of_week && r.days_of_week.length > 0)
                );
                // Tarefas sem dia fixo (mensal, custom sem days_of_week)
                const otherItems = group.items.filter(
                  (r) => r.frequency !== "daily" && r.frequency !== "weekly" && r.frequency !== "biweekly" && (!r.days_of_week || r.days_of_week.length === 0)
                );

                // Montar grid: tasksByDay[0..6]
                const tasksByDay: RecurrenceRow[][] = Array.from({ length: 7 }, () => []);
                for (const rec of calendarItems) {
                  if (rec.frequency === "daily") {
                    tasksByDay.forEach((arr) => arr.push(rec));
                  } else {
                    for (const day of rec.days_of_week || []) {
                      if (day >= 0 && day <= 6) tasksByDay[day].push(rec);
                    }
                  }
                }

                return (
                  <div key={group.name} className="border border-border rounded-lg overflow-hidden bg-card">
                    {/* Cabeçalho do grupo */}
                    <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-sm text-foreground">{group.name}</span>
                      <Badge variant="secondary" className="text-2xs">{group.items.length}</Badge>
                    </div>

                    {/* Grade de calendário semanal */}
                    <div className="overflow-x-auto">
                      <div className="grid grid-cols-7 min-w-[480px]">
                        {/* Cabeçalhos dos dias */}
                        {weekDates.map((date, idx) => {
                          const isToday = format(date, "yyyy-MM-dd") === todayStr;
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "px-2 py-2 text-center border-b border-border",
                                isToday ? "bg-primary/8" : "bg-muted/30",
                                idx < 6 && "border-r border-border"
                              )}
                            >
                              <p className={cn(
                                "text-2xs font-semibold uppercase tracking-wider",
                                isToday ? "text-primary" : "text-muted-foreground"
                              )}>
                                {DAY_NAMES[idx]}
                              </p>
                              <p className={cn(
                                "text-sm font-bold leading-tight",
                                isToday ? "text-primary" : "text-foreground"
                              )}>
                                {format(date, "dd")}
                              </p>
                              <p className="text-2xs text-muted-foreground/60">
                                {format(date, "MMM", { locale: ptBR })}
                              </p>
                            </div>
                          );
                        })}

                        {/* Células com tarefas */}
                        {tasksByDay.map((dayTasks, dayIdx) => {
                          const isToday = format(weekDates[dayIdx], "yyyy-MM-dd") === todayStr;
                          return (
                            <div
                              key={dayIdx}
                              className={cn(
                                "p-1.5 min-h-[90px] align-top",
                                isToday && "bg-primary/5",
                                dayIdx < 6 && "border-r border-border"
                              )}
                            >
                              <div className="space-y-1">
                                {dayTasks.length === 0 ? (
                                  <div className="h-full flex items-center justify-center py-3">
                                    <span className="text-2xs text-muted-foreground/30">—</span>
                                  </div>
                                ) : (
                                  dayTasks.map((rec) => (
                                    <button
                                      key={rec.id}
                                      onClick={() => setSelectedRecurrence(rec)}
                                      title={rec.task_title}
                                      className={cn(
                                        "w-full text-left px-1.5 py-1 rounded text-2xs font-medium leading-tight transition-colors truncate block",
                                        rec.is_active
                                          ? "bg-primary/12 text-primary hover:bg-primary/20 border border-primary/20"
                                          : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent line-through opacity-60"
                                      )}
                                    >
                                      {rec.task_title}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tarefas sem dia fixo (mensal, custom) */}
                    {otherItems.length > 0 && (
                      <div className="border-t border-border px-3 py-2.5 bg-muted/20">
                        <p className="text-2xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                          Sem dia fixo
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {otherItems.map((rec) => (
                            <button
                              key={rec.id}
                              onClick={() => setSelectedRecurrence(rec)}
                              title={rec.task_title}
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded text-2xs font-medium transition-colors",
                                rec.is_active
                                  ? "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                                  : "bg-muted text-muted-foreground border border-border"
                              )}
                            >
                              <Calendar className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate max-w-[120px]">{rec.task_title}</span>
                              <span className="opacity-50">· {FREQUENCY_LABELS[rec.frequency] || rec.frequency}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
          })()}
          <div className="text-2xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Tarefas são criadas automaticamente todo dia à meia-noite (horário de Brasília)
          </div>
        </div>
      ) : (
        /* ===== LIST VIEW ===== */
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          {/* Desktop table header */}
          <div className="hidden md:grid grid-cols-[1fr_140px_140px_120px_100px_80px] gap-3 px-4 py-3 bg-muted/50 text-xs font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
            <span>Tarefa</span>
            <span>Frequência</span>
            <span>Próxima data</span>
            <span>Responsável</span>
            <span>Status</span>
            <span>Ações</span>
          </div>

          <div className="divide-y divide-border">
            {filtered.map((rec) => {
              const isOverdue = rec.is_active && new Date(rec.next_occurrence + "T23:59:59") < new Date();
              return (
                <div
                  key={rec.id}
                  className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px_120px_100px_80px] gap-2 md:gap-3 px-4 py-3 hover:bg-muted/30 transition-colors items-center"
                >
                  {/* Task info */}
                  <div
                    className="flex items-center gap-2 cursor-pointer group"
                    onClick={() => setSelectedRecurrence(rec)}
                  >
                    <Repeat className={cn("w-4 h-4 flex-shrink-0", rec.is_active ? "text-primary" : "text-muted-foreground")} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {rec.task_title}
                      </p>
                      {rec.project_name && (
                        <p className="text-2xs text-muted-foreground truncate">{rec.project_name}</p>
                      )}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hidden md:block" />
                  </div>

                  {/* Frequency */}
                  <div className="flex items-center gap-1.5">
                    <span className="md:hidden text-2xs text-muted-foreground">Frequência:</span>
                    <Badge variant="secondary" className="text-xs">
                      {FREQUENCY_LABELS[rec.frequency] || rec.frequency}
                      {rec.frequency === "custom" && rec.interval_days && (
                        <span className="ml-1 opacity-70">({rec.interval_days}d)</span>
                      )}
                    </Badge>
                  </div>

                  {/* Next occurrence */}
                  <div className="flex items-center gap-1.5">
                    <span className="md:hidden text-2xs text-muted-foreground">Próxima:</span>
                    <span className={cn(
                      "text-sm flex items-center gap-1",
                      isOverdue ? "text-danger font-medium" : "text-foreground"
                    )}>
                      {isOverdue && <AlertCircle className="w-3.5 h-3.5" />}
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      {format(new Date(rec.next_occurrence + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>

                  {/* Assignee */}
                  <div className="text-sm text-muted-foreground truncate">
                    <span className="md:hidden text-2xs">Responsável: </span>
                    {rec.assignee_name || "—"}
                  </div>

                  {/* Status */}
                  <div>
                    <Badge
                      variant={rec.is_active ? "default" : "outline"}
                      className={cn(
                        "text-xs",
                        rec.is_active ? "bg-success/10 text-success border-success/20" : "text-muted-foreground"
                      )}
                    >
                      {rec.is_active ? "Ativa" : "Pausada"}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title={rec.is_active ? "Pausar" : "Ativar"}
                      onClick={() => {
                        toggleActive.mutate({ id: rec.id, is_active: !rec.is_active });
                        toast.success(rec.is_active ? "Item da agenda pausado" : "Item da agenda ativado");
                      }}
                    >
                      {rec.is_active
                        ? <Pause className="w-3.5 h-3.5 text-warning" />
                        : <Play className="w-3.5 h-3.5 text-success" />
                      }
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Remover da agenda"
                      onClick={() => {
                        if (confirm("Remover este item da agenda? A tarefa original não será afetada.")) {
                          deleteRecurrence.mutate(rec.id);
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer info */}
          <div className="px-4 py-2.5 bg-muted/30 border-t border-border text-2xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Tarefas são criadas automaticamente todo dia à meia-noite (horário de Brasília)
          </div>
        </div>
      )}

      {/* End date info */}
      {(recurrences || []).some((r) => r.end_date) && (
        <div className="text-2xs text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          Itens da agenda com data limite serão desativados automaticamente quando a data for atingida.
        </div>
      )}

      {/* Detail Modal */}
      <RecurrenceDetailModal
        recurrence={selectedRecurrence}
        open={!!selectedRecurrence}
        onOpenChange={(open) => { if (!open) setSelectedRecurrence(null); }}
        currentEmployeeId={currentEmployee?.id}
      />
    </div>
  );
}
