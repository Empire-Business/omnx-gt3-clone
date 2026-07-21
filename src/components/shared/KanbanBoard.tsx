import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, Filter, MoreHorizontal,
  Pencil, Trash2, Clock, Settings, X,
  ListChecks, Tag, Paperclip, AlignLeft,
  Circle, Eye, CheckCircle2, Archive, Timer,
  LayoutGrid, List, User, Repeat, ArrowUp, ArrowDown, ArrowUpDown,
  Calendar as CalendarIcon, FolderKanban, Layers,
  AlertTriangle, CalendarRange, CalendarOff, Inbox,
} from "lucide-react";
import { TaskCalendarView } from "@/components/tasks/TaskCalendarView";
import { TaskTimerBadge } from "@/components/tasks/TaskTimerBadge";
import { PriorityPill } from "@/components/tasks/PriorityPill";
import { parseSmartDate } from "@/lib/smart-date-parser";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TaskDetailModal } from "@/components/shared/TaskDetailModal";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useTasks, TaskWithDetails } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useEmployees } from "@/hooks/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useKanbanColumns, KanbanColumn } from "@/hooks/useKanbanColumns";
import { KanbanSkeleton } from "@/components/shared/SmartSkeleton";
import { PermissionGuard } from "@/components/permissions/PermissionGuard";
import { StatusBadge, AvatarBadge } from "@/components/shared/SharedComponents";
import { HierarchyFilter } from "@/components/shared/HierarchyFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format, isToday, isValid, isWithinInterval, addDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { normalizeDateForSave, extractDateForInput, parseDateSafe, isTaskOverdue } from "@/lib/date-utils";
import { getTaskLabelStyle, getTaskLabelsWithProject, syncProjectLabel } from "@/lib/task-project-labels";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSupabaseAssetUrl } from "@/integrations/supabase/config";

type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "A Fazer" },
  { value: "doing", label: "Em Andamento" },
  { value: "review", label: "Em Revisão" },
  { value: "ajustes", label: "Ajustes" },
  { value: "done", label: "Concluído" },
  { value: "arquivado", label: "Arquivado" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

const COLOR_OPTIONS = [
  { value: "bg-muted", label: "Cinza" },
  { value: "bg-info-light", label: "Azul" },
  { value: "bg-warning-light", label: "Amarelo" },
  { value: "bg-primary-light", label: "Violeta" },
  { value: "bg-success-light", label: "Verde" },
  { value: "bg-danger-light", label: "Vermelho" },
];

/** Status icon component matching the reference design */
function StatusIcon({ statusKey, className }: { statusKey: string; className?: string }) {
  const iconClass = cn("w-4 h-4", className);
  switch (statusKey) {
    case "backlog":
      return <Archive className={cn(iconClass, "text-muted-foreground")} />;
    case "todo":
      return <Circle className={cn(iconClass, "text-muted-foreground")} />;
    case "doing":
      return <Timer className={cn(iconClass, "text-warning")} />;
    case "review":
      return <Eye className={cn(iconClass, "text-primary")} />;
    case "ajustes":
      return <Pencil className={cn(iconClass, "text-warning")} />;
    case "done":
      return <CheckCircle2 className={cn(iconClass, "text-success")} />;
    case "arquivado":
      return <Archive className={cn(iconClass, "text-muted-foreground/50")} />;
    default:
      return <Circle className={cn(iconClass, "text-muted-foreground")} />;
  }
}

/** GT3 OMNX — column background uses neutral surface tints with one
 *  semantic colored stripe at the top (status-coded). Avoids "all yellow" feel.
 */
function getColumnBg(statusKey: string): string {
  // Tonal layering: muted neutral background, status accent comes via the
  // top stripe (StatusIcon already conveys color). Same neutral for all
  // active states; only "done" gets a subtle success tint to celebrate done.
  switch (statusKey) {
    case "done":
      return "bg-success-light/40 dark:bg-success-light/10";
    case "arquivado":
      return "bg-muted/10";
    default:
      return "bg-muted/30 dark:bg-muted/20";
  }
}

/** Color of the top stripe over each column */
function getColumnStripeColor(statusKey: string): string {
  switch (statusKey) {
    case "backlog":
      return "bg-muted-foreground/40";
    case "todo":
      return "bg-info";
    case "doing":
      return "bg-primary";
    case "review":
      return "bg-warning";
    case "ajustes":
      return "bg-warning";
    case "done":
      return "bg-success";
    case "arquivado":
      return "bg-muted-foreground/30";
    default:
      return "bg-muted-foreground/40";
  }
}

interface KanbanBoardProps {
  projectId?: string;
  showProjectFilter?: boolean;
  showColumnManagement?: boolean;
  showSearch?: boolean;
  showHierarchyFilter?: boolean;
  showKpiTabs?: boolean;
  showViewToggle?: boolean;
  compact?: boolean;
  kpiFilter?: "all" | "today" | "overdue" | "week" | "noDate" | "mine";
  onKpiChange?: (k: "all" | "today" | "overdue" | "week" | "noDate" | "mine") => void;
  myEmployeeId?: string | null;
  viewMode?: "kanban" | "list" | "calendar";
  onViewModeChange?: (m: "kanban" | "list" | "calendar") => void;
  /** Quando vira `true`, abre o dialog de criação de tarefa (já travado no projeto atual). */
  openCreate?: boolean;
  /** Chamado logo após consumir `openCreate`, para o pai resetar o sinal. */
  onOpenCreateConsumed?: () => void;
}

export function KanbanBoard({
  projectId,
  showProjectFilter = true,
  showColumnManagement = true,
  showSearch = true,
  showHierarchyFilter = false,
  showKpiTabs = false,
  showViewToggle = true,
  compact = false,
  kpiFilter = "all",
  onKpiChange,
  myEmployeeId = null,
  viewMode: viewModeProp,
  onViewModeChange,
  openCreate = false,
  onOpenCreateConsumed,
}: KanbanBoardProps) {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: tasks, isLoading: tasksLoading, isFetching: tasksFetching, error: tasksError, refetch: refetchTasks, createTask, updateTask, moveTask, deleteTask, batchUpdateSortOrder, batchUpdate, batchDelete, syncAssignees } = useTasks(projectId);
  const { data: projects, isLoading: projectsLoading, isFetching: projectsFetching, error: projectsError } = useProjects();
  const { data: employees, isLoading: employeesLoading, isFetching: employeesFetching, error: employeesError } = useEmployees();
  const { canManageProjects, isMember } = usePermissions();
  const { user, profile } = useAuth();
  const { data: columns, isLoading: columnsLoading, isFetching: columnsFetching, error: columnsError, saveColumns } = useKanbanColumns();

  const [viewModeInternal, setViewModeInternal] = useState<"kanban" | "list" | "calendar">(isMobile ? "list" : "kanban");
  const viewMode = viewModeProp ?? viewModeInternal;
  const setViewMode = (m: "kanban" | "list" | "calendar") => {
    if (onViewModeChange) onViewModeChange(m);
    if (viewModeProp === undefined) setViewModeInternal(m);
  };
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [projectFilter, setProjectFilter] = useState<string>(() => searchParams.get("projectId") || "all");
  const [filterAreaType, setFilterAreaType] = useState("");
  const [filterSubareaId, setFilterSubareaId] = useState("");
  const [filterPositionId, setFilterPositionId] = useState("");
  const [filterAssigneeId, setFilterAssigneeId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<"sort_order" | "priority">("sort_order");
  const [colDateSort, setColDateSort] = useState<Record<string, "none" | "asc" | "desc">>({});
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");
  const [overdueFilter, setOverdueFilter] = useState<"all" | "overdue" | "on_time" | "no_date">("all");
  const [batchMode, setBatchMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithDetails | null>(null);
  const [detailTask, setDetailTask] = useState<TaskWithDetails | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<KanbanColumn | null>(null);
  const [colForm, setColForm] = useState({ name: "", color: "bg-muted", statusKey: "backlog" as TaskStatus });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [groupBy, setGroupBy] = useState<"status" | "assignee" | "priority" | "project">("status");
  const [quickAddOpen, setQuickAddOpen] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddDescription, setQuickAddDescription] = useState("");
  const [quickAddAssignee, setQuickAddAssignee] = useState<string>("");
  const [quickAddProject, setQuickAddProject] = useState<string>("");

  // ── Recorrência ──────────────────────────────────────────────
  type RecFrequency = "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "specific_days" | "custom";
  const REC_FREQUENCY_OPTIONS: { value: RecFrequency; label: string }[] = [
    { value: "daily", label: "Diariamente" },
    { value: "weekdays", label: "Dias úteis (seg–sex)" },
    { value: "weekly", label: "Semanalmente" },
    { value: "biweekly", label: "Quinzenalmente" },
    { value: "monthly", label: "Mensalmente" },
    { value: "specific_days", label: "Dias específicos" },
    { value: "custom", label: "Intervalo personalizado" },
  ];
  const REC_DAYS = [
    { v: 0, l: "Dom" }, { v: 1, l: "Seg" }, { v: 2, l: "Ter" },
    { v: 3, l: "Qua" }, { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" },
  ];

  const [recEnabled, setRecEnabled] = useState(false);
  const [recFrequency, setRecFrequency] = useState<RecFrequency>("weekly");
  const [recIntervalDays, setRecIntervalDays] = useState(7);
  const [recDaysOfWeek, setRecDaysOfWeek] = useState<number[]>([1]);
  const [recEndDate, setRecEndDate] = useState("");

  const toggleRecDay = (day: number) =>
    setRecDaysOfWeek((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());

  const calcRecNext = (freq: RecFrequency, intervalDays: number, daysOfWeek: number[]): string => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    today.setDate(today.getDate() + 1);
    if (freq === "weekdays") { while (today.getDay() === 0 || today.getDay() === 6) today.setDate(today.getDate() + 1); }
    else if (freq === "weekly") { today.setDate(today.getDate() + 6); }
    else if (freq === "biweekly") { today.setDate(today.getDate() + 13); }
    else if (freq === "monthly") { today.setMonth(today.getMonth() + 1); }
    else if (freq === "specific_days" && daysOfWeek.length > 0) {
      for (let i = 0; i < 7; i++) { if (daysOfWeek.includes(today.getDay())) break; today.setDate(today.getDate() + 1); }
    } else if (freq === "custom") { today.setDate(today.getDate() + intervalDays - 1); }
    return today.toISOString().substring(0, 10);
  };

  const resetRecurrence = () => {
    setRecEnabled(false); setRecFrequency("weekly"); setRecIntervalDays(7);
    setRecDaysOfWeek([1]); setRecEndDate("");
  };

  // Abre automaticamente a tarefa indicada pelo parâmetro ?taskId=
  useEffect(() => {
    const taskIdParam = searchParams.get("taskId");
    if (!taskIdParam || !tasks) return;
    const found = tasks.find((t) => t.id === taskIdParam);
    if (found) {
      setDetailTask(found);
      setDetailOpen(true);
      setSearchParams((prev) => { prev.delete("taskId"); return prev; }, { replace: true });
    }
  }, [tasks, searchParams, setSearchParams]);

  // Aplica filtro de projeto vindo da URL (?projectId=) e limpa o param
  useEffect(() => {
    const projectIdParam = searchParams.get("projectId");
    if (!projectIdParam) return;
    setProjectFilter(projectIdParam);
    setSearchParams((prev) => { prev.delete("projectId"); return prev; }, { replace: true });
  }, [searchParams, setSearchParams]);

  const [form, setForm] = useState({
    title: "", description: "", priority: "medium" as TaskPriority,
    status: "todo" as TaskStatus, project_id: projectId || "", assignee_id: "", due_date: "",
    checklist_items: [] as { text: string; checked: boolean }[],
  });
  const [newCheckItem, setNewCheckItem] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const pendingFileInputRef = useRef<HTMLInputElement>(null);

  // Rascunho automático do formulário de CRIAÇÃO (sobrevive a refresh/desmontagem/troca de aba).
  const draftKey = `omnx:taskdraft:${projectId || "global"}`;
  const emptyForm = () => ({
    title: "", description: "", priority: "medium" as TaskPriority,
    status: "todo" as TaskStatus, project_id: projectId || "", assignee_id: "", due_date: "",
    checklist_items: [] as { text: string; checked: boolean }[],
  });
  const loadTaskDraft = () => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return { ...emptyForm(), ...d, project_id: d.project_id || projectId || "" };
    } catch { return null; }
  };
  const clearTaskDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* noop */ } };

  // Combined loading state - show skeleton during initial load or refetch without data
  const isInitiallyLoading = tasksLoading || projectsLoading || employeesLoading || columnsLoading;
  const isRefetchingWithoutData = (tasksFetching && !tasks) || (projectsFetching && !projects) || (employeesFetching && !employees) || (columnsFetching && !columns);
  const showSkeleton = isInitiallyLoading || isRefetchingWithoutData;

  const currentEmployee = (employees || []).find((e) => e.user_id === user?.id);

  const canModifyTask = useCallback((task: TaskWithDetails) => {
    if (!isMember) return true;
    return currentEmployee && task.assignee_id === currentEmployee.id;
  }, [isMember, currentEmployee]);

  // Listener: atalho 1–9 move tarefa pra coluna N (declarado depois de canModifyTask)
  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<{ taskId: string; columnIndex: number }>;
      const visibleCols = (columns || []).filter((c) =>
        c.statusKey === "arquivado" ? showArchived : true
      );
      const targetCol = visibleCols[ce.detail.columnIndex];
      if (!targetCol) return;
      const task = (tasks || []).find((t) => t.id === ce.detail.taskId);
      if (!task || !canModifyTask(task)) return;
      moveTask.mutate({
        id: ce.detail.taskId,
        status: targetCol.statusKey as TaskStatus,
        sort_order: task.sort_order ?? 0,
      });
    };
    window.addEventListener("task:move-to-column", handler as EventListener);
    return () => window.removeEventListener("task:move-to-column", handler as EventListener);
  }, [columns, tasks, showArchived, moveTask, canModifyTask]);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId, type } = result;

    if (type === "COLUMN") {
      if (sortBy !== "sort_order") return;
      if (!columns) return;
      const newCols = [...columns];
      const [moved] = newCols.splice(source.index, 1);
      newCols.splice(destination.index, 0, moved);
      const reordered = newCols.map((c, i) => ({ ...c, sort_order: i }));
      saveColumns.mutate(reordered);
      return;
    }

    const task = (tasks || []).find((t) => t.id === draggableId);
    if (task && !canModifyTask(task)) {
      toast.error("Você só pode mover suas próprias tarefas");
      return;
    }

    const allTasks = tasks || [];
    const sourceCol = (columns || []).find((c) => c.id === source.droppableId);
    const destCol = (columns || []).find((c) => c.id === destination.droppableId);
    if (!sourceCol || !destCol) return;

    const sourceStatus = sourceCol.statusKey as TaskStatus;
    const destStatus = destCol.statusKey as TaskStatus;

    // Get tasks for affected columns sorted by current sort_order
    const sourceTasks = allTasks
      .filter((t) => t.status === sourceStatus)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Remove task from source
    const movedTask = sourceTasks.find((t) => t.id === draggableId);
    if (!movedTask) return;

    const updates: { id: string; status: TaskStatus; sort_order: number }[] = [];

    if (sourceStatus === destStatus) {
      if (sortBy !== "sort_order") return;
      // Same column reorder
      const colTasks = sourceTasks.filter((t) => t.id !== draggableId);
      colTasks.splice(destination.index, 0, movedTask);
      colTasks.forEach((t, i) => {
        updates.push({ id: t.id, status: destStatus, sort_order: i });
      });
    } else {
      // Cross-column move
      const newSourceTasks = sourceTasks.filter((t) => t.id !== draggableId);
      newSourceTasks.forEach((t, i) => {
        updates.push({ id: t.id, status: sourceStatus, sort_order: i });
      });

      const destTasks = allTasks
        .filter((t) => t.status === destStatus)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      destTasks.splice(destination.index, 0, movedTask);
      destTasks.forEach((t, i) => {
        updates.push({ id: t.id, status: destStatus, sort_order: i });
      });
    }

    // Optimistic update
    const qc = (window as any).__queryClient;

    batchUpdateSortOrder.mutate(updates);
  }, [batchUpdateSortOrder, columns, saveColumns, tasks, canModifyTask, sortBy]);

  // Gatilho externo (ex.: botão "+ Tarefa" no topo do projeto) para abrir o
  // dialog de criação. O sinal é consumido imediatamente para não reabrir em
  // re-render/remontagem.
  //
  // IMPORTANTE: este hook precisa ficar ANTES dos early returns abaixo
  // (queryError / showSkeleton). Caso contrário a contagem de hooks varia entre
  // renders (skeleton → carregado) e o React quebra com o erro #300/#310 em
  // produção. A lógica de abrir é inlinada com os setters de `useState` (sempre
  // definidos) — não chamamos `handleOpenCreate`, que é declarado depois dos
  // returns e estaria na TDZ durante o render de skeleton.
  useEffect(() => {
    if (!openCreate) return;
    setForm(loadTaskDraft() || emptyForm());
    setPendingAttachments([]);
    setEditingTask(null);
    setDialogOpen(true);
    onOpenCreateConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreate]);

  // Persiste o rascunho continuamente enquanto o diálogo de CRIAÇÃO está aberto,
  // para que título/descrição/seleções nunca se percam (refresh, blip de sessão, etc.).
  useEffect(() => {
    if (!dialogOpen || editingTask) return;
    const hasContent =
      form.title || form.description || form.assignee_id || form.due_date || form.checklist_items.length > 0;
    try {
      if (hasContent) localStorage.setItem(draftKey, JSON.stringify(form));
      else localStorage.removeItem(draftKey);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dialogOpen, editingTask]);

  // Hardening: se alguma query falhou, mostra erro em vez de skeleton infinito.
  const queryError = tasksError || projectsError || employeesError || columnsError;
  if (queryError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
        <div className="text-sm font-medium text-destructive">Erro ao carregar o quadro</div>
        <p className="text-xs text-muted-foreground max-w-md">
          {(queryError as Error)?.message ?? "Tente novamente em alguns segundos."}
        </p>
        <button
          onClick={() => refetchTasks()}
          className="text-xs text-primary hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (showSkeleton) {
    return <KanbanSkeleton />;
  }

  const resetForm = () => setForm({
    title: "", description: "", priority: "medium", status: "todo",
    project_id: projectId || "", assignee_id: "", due_date: "", checklist_items: [],
  });

  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const filtered = (tasks || []).filter((t) => {
    // Hide archived unless toggle is on
    if (t.status === "arquivado" && !showArchived) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (showProjectFilter && projectFilter !== "all" && t.project_id !== projectFilter) return false;
    if (filterAreaType || filterSubareaId || filterPositionId) {
      // Coleta todos os candidatos: assignee_id direto + assignees[] multi
      const candidateIds: string[] = [];
      if (t.assignee_id) candidateIds.push(t.assignee_id);
      const multi = (t as any).assignees as Array<{ employee_id: string }> | undefined;
      if (Array.isArray(multi)) for (const a of multi) if (a?.employee_id) candidateIds.push(a.employee_id);
      if (candidateIds.length === 0) return false;
      const matches = candidateIds.some((id) => {
        const assignee = (employees || []).find((e) => e.id === id);
        if (!assignee) return false;
        if (filterAreaType && assignee.area_type !== filterAreaType) return false;
        if (filterPositionId && assignee.position_id !== filterPositionId) return false;
        return true;
      });
      if (!matches) return false;
    }
    if (filterAssigneeId) {
      const inSingle = t.assignee_id === filterAssigneeId;
      const inMulti = Array.isArray((t as any).assignees) &&
        ((t as any).assignees as Array<{ employee_id: string }>).some((a) => a?.employee_id === filterAssigneeId);
      if (!inSingle && !inMulti) return false;
    }
    // Date range filter
    if (dateRangeStart && t.due_date) {
      const taskDate = t.due_date.substring(0, 10);
      if (taskDate < dateRangeStart) return false;
    }
    if (dateRangeEnd && t.due_date) {
      const taskDate = t.due_date.substring(0, 10);
      if (taskDate > dateRangeEnd) return false;
    }
    // Overdue filter
    if (overdueFilter !== "all") {
      const now = new Date();
      if (overdueFilter === "no_date") {
        if (t.due_date) return false;
      } else if (overdueFilter === "overdue") {
        if (!t.due_date || !isTaskOverdue(t.due_date) || t.status === "done" || t.status === "arquivado") return false;
      } else if (overdueFilter === "on_time") {
        if (!t.due_date || isTaskOverdue(t.due_date)) return false;
      }
    }
    // KPI chip filter (vindo da página /tarefas)
    if (kpiFilter && kpiFilter !== "all") {
      const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
      const sevenDays = new Date(todayDate); sevenDays.setDate(sevenDays.getDate() + 7);
      if (kpiFilter === "today") {
        if (!t.due_date) return false;
        const d = parseDateSafe(t.due_date);
        if (!d || !isToday(d)) return false;
      } else if (kpiFilter === "overdue") {
        if (!t.due_date || !isTaskOverdue(t.due_date) || t.status === "done") return false;
      } else if (kpiFilter === "week") {
        if (!t.due_date) return false;
        const d = parseDateSafe(t.due_date);
        if (!d) return false;
        const dn = d.getTime();
        if (dn < todayDate.getTime() || dn > sevenDays.getTime()) return false;
      } else if (kpiFilter === "noDate") {
        if (t.due_date) return false;
      } else if (kpiFilter === "mine") {
        const isAssigneeSingle = !!myEmployeeId && t.assignee_id === myEmployeeId;
        const isAssigneeMulti = !!myEmployeeId && Array.isArray((t as any).assignees) &&
          (t as any).assignees.some((a: any) => a.employee_id === myEmployeeId);
        if (!isAssigneeSingle && !isAssigneeMulti) return false;
      }
    }
    return true;
  });

  const getColumnTasks = (col: KanbanColumn) => {
    const sk = String(col.statusKey);
    let colTasks: TaskWithDetails[];
    if (sk.startsWith("assignee:")) {
      const id = sk.slice("assignee:".length);
      colTasks = filtered.filter((t) =>
        id === "unassigned" ? !t.assignee_id : t.assignee_id === id
      );
    } else if (sk.startsWith("priority:")) {
      const p = sk.slice("priority:".length);
      colTasks = filtered.filter((t) => (t.priority || "medium") === p);
    } else if (sk.startsWith("project:")) {
      const id = sk.slice("project:".length);
      colTasks = filtered.filter((t) =>
        id === "noproject" ? !t.project_id : t.project_id === id
      );
    } else {
      colTasks = filtered.filter((t) => t.status === col.statusKey);
    }
    const dateDir = colDateSort[col.statusKey] ?? "none";
    if (dateDir !== "none") {
      return colTasks.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return dateDir === "asc"
          ? a.due_date.localeCompare(b.due_date)
          : b.due_date.localeCompare(a.due_date);
      });
    }
    if (sortBy === "priority") {
      return colTasks.sort((a, b) => (PRIORITY_ORDER[a.priority || "medium"] ?? 2) - (PRIORITY_ORDER[b.priority || "medium"] ?? 2));
    }
    return colTasks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };

  const handleColDateSortToggle = (statusKey: string) => {
    setColDateSort((prev) => {
      const current = prev[statusKey] ?? "none";
      const next = current === "none" ? "asc" : current === "asc" ? "desc" : "none";
      return { ...prev, [statusKey]: next };
    });
  };

  const getColDateSortIcon = (statusKey: string) => {
    const dir = colDateSort[statusKey] ?? "none";
    return dir === "none" ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  };

  const getColDateSortLabel = (statusKey: string) => {
    const dir = colDateSort[statusKey] ?? "none";
    return dir === "none" ? "Ordenar por prazo" : dir === "asc" ? "Prazo: mais antigo primeiro" : "Prazo: mais recente primeiro";
  };

  const handleOpenCreate = (statusKey?: TaskStatus) => {
    const draft = loadTaskDraft();
    setForm(draft ? { ...draft, status: statusKey || draft.status } : { ...emptyForm(), status: statusKey || "todo" });
    setPendingAttachments([]);
    setEditingTask(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (t: TaskWithDetails) => {
    const checklist = Array.isArray(t.checklist_items) ? (t.checklist_items as any[]) : [];
    setForm({
      title: t.title, description: t.description || "",
      priority: (t.priority || "medium") as TaskPriority,
      status: (t.status || "todo") as TaskStatus,
      project_id: t.project_id || projectId || "",
      assignee_id: t.assignee_id || "",
      due_date: extractDateForInput(t.due_date),
      checklist_items: checklist,
    });
    setEditingTask(t);
    setDialogOpen(true);
  };

  const handleOpenDetail = (t: TaskWithDetails) => {
    setDetailTask(t);
    setDetailOpen(true);
  };

  const resetQuickAdd = () => {
    setQuickAddTitle("");
    setQuickAddDescription("");
    setQuickAddAssignee("");
    setQuickAddProject("");
  };
  const handleQuickAdd = async (statusKey: TaskStatus) => {
    const rawTitle = quickAddTitle.trim();
    if (!rawTitle) {
      setQuickAddOpen(null);
      resetQuickAdd();
      return;
    }
    // Auto-detecção de prazo no título (pt-BR)
    const smart = parseSmartDate(rawTitle);
    const finalTitle = smart?.cleanedText || rawTitle;
    const dueDate = smart?.date ?? null;
    try {
      const quickAssignee = isMember
        ? currentEmployee?.id ?? null
        : quickAddAssignee || null;
      await createTask.mutateAsync({
        title: finalTitle,
        description: quickAddDescription.trim() || null,
        priority: "medium",
        status: statusKey,
        project_id: quickAddProject || projectId || null,
        assignee_id: quickAssignee,
        due_date: dueDate,
        checklist_items: null,
      } as any);
      if (smart) toast.success(`Prazo "${smart.matched}" detectado e aplicado`);
      resetQuickAdd();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar tarefa");
    }
  };

  const handleDetailSave = async (id: string, updates: any) => {
    const selectedProject = projects?.find((project) => project.id === updates.project_id) || null;
    const nextLabels = syncProjectLabel(
      Array.isArray(updates.labels) ? updates.labels : [],
      selectedProject,
      projects || []
    );

    await updateTask.mutateAsync({ id, ...updates, labels: nextLabels });
    toast.success("Tarefa atualizada!");
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Título é obrigatório"); return; }
    try {
      // Member só pode atribuir tarefas a si mesmo (na criação).
      const isCreatingNew = !editingTask;
      const enforcedAssignee =
        isCreatingNew && isMember
          ? currentEmployee?.id ?? null
          : form.assignee_id || null;
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        status: form.status,
        project_id: form.project_id || null,
        assignee_id: enforcedAssignee,
        due_date: normalizeDateForSave(form.due_date),
        checklist_items: form.checklist_items.length > 0 ? form.checklist_items : null,
      };
      const selectedProject = projects?.find((project) => project.id === payload.project_id) || null;
      const labels = syncProjectLabel([], selectedProject, projects || []);
      if (editingTask) {
        const currentLabels = Array.isArray((editingTask as any)?.labels)
          ? ((editingTask as any).labels as { text: string; color: string }[])
          : [];
        await updateTask.mutateAsync({
          id: editingTask.id,
          ...payload,
          labels: syncProjectLabel(currentLabels, selectedProject, projects || []) as any,
        });
        toast.success("Tarefa atualizada!");
      } else {
        const newTask = await createTask.mutateAsync({ ...payload, labels: labels as any });
        if (newTask?.id) {
          if (recEnabled && profile?.tenant_id) {
            await supabase.from("task_recurrence").insert({
              task_id: newTask.id,
              tenant_id: profile.tenant_id,
              frequency: recFrequency,
              interval_days: recFrequency === "custom" ? recIntervalDays : null,
              days_of_week: (recFrequency === "weekly" || recFrequency === "specific_days") ? recDaysOfWeek : null,
              day_of_month: null,
              end_date: recEndDate || null,
              next_occurrence: calcRecNext(recFrequency, recIntervalDays, recDaysOfWeek),
              is_active: true,
            });
          }
          if (pendingAttachments.length > 0) {
            const uploaded: { name: string; url: string; type: string; size: number; uploaded_at: string }[] = [];
            for (const file of pendingAttachments) {
              const ext = file.name.split(".").pop();
              const path = `task-attachments/${newTask.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
              const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, { upsert: true });
              if (upErr) { toast.error(`Erro ao anexar ${file.name}`); continue; }
              const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);
              uploaded.push({ name: file.name, url: publicUrl, type: file.type, size: file.size, uploaded_at: new Date().toISOString() });
            }
            if (uploaded.length > 0) {
              const coverUrl = uploaded.find((a) => a.type.startsWith("image/"))?.url || null;
              await updateTask.mutateAsync({ id: newTask.id, attachments: uploaded, cover_url: coverUrl });
            }
            setPendingAttachments([]);
          }
        }
        toast.success("Tarefa criada!");
      }
      clearTaskDraft();
      resetRecurrence();
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handlePendingFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name}: máximo 10MB`); return false; }
      return true;
    });
    setPendingAttachments((prev) => [...prev, ...valid]);
    if (pendingFileInputRef.current) pendingFileInputRef.current.value = "";
  };

  const handleDescriptionPasteCreate = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items || []);
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        if (file.size > 10 * 1024 * 1024) { toast.error("Imagem muito grande (máx 10MB)"); return; }
        e.preventDefault();
        const named = new File([file], `imagem-${Date.now()}.${file.type.split("/")[1] || "png"}`, { type: file.type });
        setPendingAttachments((prev) => [...prev, named]);
        toast.success("Imagem adicionada aos anexos — será enviada ao criar a tarefa");
        return;
      }
    }
  };

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    setForm({ ...form, checklist_items: [...form.checklist_items, { text: newCheckItem.trim(), checked: false }] });
    setNewCheckItem("");
  };

  const toggleCheckItem = (idx: number) => {
    const items = [...form.checklist_items];
    items[idx] = { ...items[idx], checked: !items[idx].checked };
    setForm({ ...form, checklist_items: items });
  };

  const removeCheckItem = (idx: number) => {
    setForm({ ...form, checklist_items: form.checklist_items.filter((_, i) => i !== idx) });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir tarefa?")) return;
    try {
      await deleteTask.mutateAsync(id);
      toast.success("Tarefa excluída!");
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleBatchAction = async (action: string, value?: string) => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) { toast.error("Selecione ao menos uma tarefa"); return; }
    try {
      if (action === "delete") {
        if (!confirm(`Excluir ${ids.length} tarefa(s)?`)) return;
        await batchDelete.mutateAsync(ids);
        toast.success(`${ids.length} tarefa(s) excluída(s)!`);
      } else if (action === "status" && value) {
        await batchUpdate.mutateAsync({ ids, changes: { status: value as TaskStatus } });
        toast.success(`${ids.length} tarefa(s) movida(s)!`);
      } else if (action === "priority" && value) {
        await batchUpdate.mutateAsync({ ids, changes: { priority: value as TaskPriority } });
        toast.success(`${ids.length} tarefa(s) atualizada(s)!`);
      } else if (action === "assignee") {
        await batchUpdate.mutateAsync({ ids, changes: { assignee_id: value || null } });
        toast.success(`${ids.length} tarefa(s) atualizada(s)!`);
      }
      setSelectedTaskIds(new Set());
      setBatchMode(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const clearFilters = () => {
    setSearch("");
    setProjectFilter("all");
    setFilterAreaType("");
    setFilterSubareaId("");
    setFilterPositionId("");
    setFilterAssigneeId("");
    setDateRangeStart("");
    setDateRangeEnd("");
    setOverdueFilter("all");
  };

  const hasActiveFilters = search || projectFilter !== "all" || filterAreaType || filterAssigneeId || dateRangeStart || dateRangeEnd || overdueFilter !== "all";

  const handleAddColumn = () => {
    setEditingColumn(null);
    setColForm({ name: "", color: "bg-muted", statusKey: "backlog" });
    setColumnDialogOpen(true);
  };

  const handleEditColumn = (col: KanbanColumn) => {
    setEditingColumn(col);
    setColForm({ name: col.name, color: col.color, statusKey: col.statusKey as TaskStatus });
    setColumnDialogOpen(true);
  };

  const handleSaveColumn = () => {
    if (!colForm.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const currentCols = columns || [];
    if (editingColumn) {
      const updated = currentCols.map((c) =>
        c.id === editingColumn.id ? { ...c, name: colForm.name.trim(), color: colForm.color, statusKey: colForm.statusKey } : c
      );
      saveColumns.mutate(updated);
      toast.success("Coluna atualizada!");
    } else {
      const newCol: KanbanColumn = {
        id: `col-${Date.now()}`, name: colForm.name.trim(), color: colForm.color,
        statusKey: colForm.statusKey, sort_order: currentCols.length,
      };
      saveColumns.mutate([...currentCols, newCol]);
      toast.success("Coluna adicionada!");
    }
    setColumnDialogOpen(false);
  };

  const handleDeleteColumn = (colId: string) => {
    const currentCols = columns || [];
    if (currentCols.length <= 1) { toast.error("Mínimo de 1 coluna"); return; }
    if (!confirm("Excluir esta coluna? As tarefas permanecerão no mesmo status.")) return;
    const updated = currentCols.filter((c) => c.id !== colId).map((c, i) => ({ ...c, sort_order: i }));
    saveColumns.mutate(updated);
    toast.success("Coluna removida!");
  };

  const currentColumns: KanbanColumn[] = (() => {
    if (groupBy === "status") {
      return (columns || []).filter((c) => {
        if (c.statusKey === "arquivado" && !showArchived) return false;
        return true;
      });
    }
    if (groupBy === "assignee") {
      const ids = new Set<string>();
      for (const t of filtered) ids.add(t.assignee_id ?? "unassigned");
      const rows: KanbanColumn[] = [];
      let i = 0;
      // ordena: primeiro nomes, depois "Sem responsável" no fim
      const sortedIds = [...ids].sort((a, b) => {
        if (a === "unassigned") return 1;
        if (b === "unassigned") return -1;
        const na = (employees || []).find((e) => e.id === a)?.full_name ?? "";
        const nb = (employees || []).find((e) => e.id === b)?.full_name ?? "";
        return na.localeCompare(nb);
      });
      for (const id of sortedIds) {
        const emp = id === "unassigned" ? null : (employees || []).find((e) => e.id === id);
        rows.push({
          id: `assignee:${id}`,
          name: id === "unassigned" ? "Sem responsável" : emp?.full_name ?? "Colaborador",
          color: "bg-muted",
          statusKey: `assignee:${id}` as any,
          sort_order: i++,
        });
      }
      return rows;
    }
    if (groupBy === "priority") {
      const order: { key: string; label: string }[] = [
        { key: "urgent", label: "Urgente" },
        { key: "high", label: "Alta" },
        { key: "medium", label: "Média" },
        { key: "low", label: "Baixa" },
      ];
      return order.map((o, i) => ({
        id: `priority:${o.key}`,
        name: o.label,
        color: "bg-muted",
        statusKey: `priority:${o.key}` as any,
        sort_order: i,
      }));
    }
    if (groupBy === "project") {
      const ids = new Set<string>();
      for (const t of filtered) ids.add(t.project_id ?? "noproject");
      const rows: KanbanColumn[] = [];
      let i = 0;
      const sortedIds = [...ids].sort((a, b) => {
        if (a === "noproject") return 1;
        if (b === "noproject") return -1;
        const na = (projects || []).find((p) => p.id === a)?.name ?? "";
        const nb = (projects || []).find((p) => p.id === b)?.name ?? "";
        return na.localeCompare(nb);
      });
      for (const id of sortedIds) {
        const proj = id === "noproject" ? null : (projects || []).find((p) => p.id === id);
        rows.push({
          id: `project:${id}`,
          name: id === "noproject" ? "Sem projeto" : proj?.name ?? "Projeto",
          color: "bg-muted",
          statusKey: `project:${id}` as any,
          sort_order: i++,
        });
      }
      return rows;
    }
    return [];
  })();
  const isVirtualGroup = groupBy !== "status";

  // KPI counts (Todas/Hoje/Atrasadas/Esta semana/Sem prazo/Minhas) — para o dropdown na toolbar
  const kpiCounts = (() => {
    const today = startOfDay(new Date());
    const weekEnd = addDays(today, 7);
    let total = 0, todayN = 0, overdueN = 0, weekN = 0, noDate = 0, mineN = 0;
    for (const t of tasks || []) {
      if ((t.status as any) === "arquivado") continue;
      total++;
      if (!t.due_date) noDate++;
      else {
        const d = parseDateSafe(t.due_date);
        if (d) {
          if (isToday(d)) todayN++;
          if (isTaskOverdue(t.due_date) && t.status !== "done") overdueN++;
          if (isWithinInterval(d, { start: today, end: weekEnd })) weekN++;
        }
      }
      if (myEmployeeId && (t.assignee_id === myEmployeeId ||
        (t as any).assignees?.some((a: any) => a.employee_id === myEmployeeId))) mineN++;
    }
    return { all: total, today: todayN, overdue: overdueN, week: weekN, noDate, mine: mineN };
  })();
  const KPI_OPTIONS = [
    { key: "all" as const, label: "Todas", icon: Inbox, count: kpiCounts.all, tone: "muted" },
    { key: "today" as const, label: "Hoje", icon: CalendarIcon, count: kpiCounts.today, tone: "warning" },
    { key: "overdue" as const, label: "Atrasadas", icon: AlertTriangle, count: kpiCounts.overdue, tone: "danger" },
    { key: "week" as const, label: "Esta semana", icon: CalendarRange, count: kpiCounts.week, tone: "info" },
    { key: "noDate" as const, label: "Sem prazo", icon: CalendarOff, count: kpiCounts.noDate, tone: "muted" },
    { key: "mine" as const, label: "Minhas", icon: User, count: kpiCounts.mine, tone: "primary" },
  ];
  const activeKpi = KPI_OPTIONS.find((k) => k.key === kpiFilter) || KPI_OPTIONS[0];

  return (
    <>
      {/* Toolbar — estilo mockup: views à esquerda · ações à direita */}
      {(showSearch || showProjectFilter || showColumnManagement || showHierarchyFilter) && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {/* View mode toggle — 3 botões: Quadro · Lista · Calendário */}
          {showViewToggle && (
          <div className="flex items-center gap-0 bg-secondary rounded-md p-0.5">
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "h-7 gap-1.5 px-2.5 text-xs border-0 shadow-none",
                viewMode === "kanban" && "bg-card shadow-sm"
              )}
              title="Quadro (Kanban)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Quadro</span>
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className={cn(
                "h-7 gap-1.5 px-2.5 text-xs border-0 shadow-none",
                viewMode === "list" && "bg-card shadow-sm"
              )}
              title="Lista"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </Button>
            <Button
              variant={viewMode === "calendar" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "h-7 gap-1.5 px-2.5 text-xs border-0 shadow-none",
                viewMode === "calendar" && "bg-card shadow-sm"
              )}
              title="Calendário"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Calendário</span>
            </Button>
          </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
          {showSearch && (
            searchOpen || search ? (
              <div className="relative w-full sm:w-[260px] animate-in fade-in slide-in-from-left-2 duration-150">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Buscar tarefas…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => { if (!search) setSearchOpen(false); }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearch("");
                      setSearchOpen(false);
                    }
                  }}
                  autoFocus
                  className="pl-8 pr-7 h-8 text-sm bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                />
                {search && (
                  <button
                    onClick={() => { setSearch(""); setSearchOpen(false); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Limpar busca"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchOpen(true)}
                className="h-8 w-8 p-0 border-0 text-muted-foreground hover:text-foreground"
                title="Buscar (atalho: /)"
              >
                <Search className="w-3.5 h-3.5" />
              </Button>
            )
          )}

          {/* Filtros condensados em popover (consolida views, agrupar, responsável, projeto, hierarquia, ordem, período) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 px-2.5 text-xs border-0 relative",
                  hasActiveFilters || groupBy !== "status" || filterAssigneeId
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Filtros"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filtros</span>
                {(hasActiveFilters || groupBy !== "status" || filterAssigneeId) && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[380px] p-3 max-w-[calc(100vw-2rem)]">
              <div className="flex flex-col gap-3">
                {/* Agrupar por */}
                <div>
                  <Label className="text-2xs text-muted-foreground uppercase tracking-wide">Agrupar por</Label>
                  <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="status">Status</SelectItem>
                      <SelectItem value="assignee">Responsável</SelectItem>
                      <SelectItem value="priority">Prioridade</SelectItem>
                      <SelectItem value="project">Projeto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Filtro de Responsável (quando hierarquia disponível) */}
                {showHierarchyFilter && (
                  <div>
                    <Label className="text-2xs text-muted-foreground uppercase tracking-wide">Responsável</Label>
                    <Select value={filterAssigneeId || "all"} onValueChange={(v) => setFilterAssigneeId(v === "all" ? "" : v)}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[260px]">
                        <SelectItem value="all">Todos os responsáveis</SelectItem>
                        {(employees || [])
                          .filter((e) => e.status === "active")
                          .map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showProjectFilter && (
                  <div>
                    <Label className="text-2xs text-muted-foreground uppercase tracking-wide">Projeto</Label>
                    <Select value={projectFilter} onValueChange={setProjectFilter}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue placeholder="Projeto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os projetos</SelectItem>
                        {(projects || []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showHierarchyFilter && (
                  <div>
                    <Label className="text-2xs text-muted-foreground uppercase tracking-wide">Hierarquia</Label>
                    <div className="mt-1">
                      <HierarchyFilter
                        areaId={filterAreaType}
                        subareaId={filterSubareaId}
                        positionId={filterPositionId}
                        onAreaChange={setFilterAreaType}
                        onSubareaChange={setFilterSubareaId}
                        onPositionChange={setFilterPositionId}
                        onClear={() => {
                          setFilterAreaType('');
                          setFilterSubareaId('');
                          setFilterPositionId('');
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-2xs text-muted-foreground uppercase tracking-wide">Ordenar</Label>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sort_order">Manual</SelectItem>
                        <SelectItem value="priority">Prioridade</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-2xs text-muted-foreground uppercase tracking-wide">Status temporal</Label>
                    <Select value={overdueFilter} onValueChange={(v) => setOverdueFilter(v as typeof overdueFilter)}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="overdue">Atrasadas</SelectItem>
                        <SelectItem value="on_time">Em dia</SelectItem>
                        <SelectItem value="no_date">Sem data</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-2xs text-muted-foreground uppercase tracking-wide">Período</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-2xs text-muted-foreground">De</span>
                      <Input
                        type="date"
                        value={dateRangeStart}
                        onChange={(e) => setDateRangeStart(e.target.value)}
                        className="h-8 text-xs px-2 w-full min-w-0"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-2xs text-muted-foreground">Até</span>
                      <Input
                        type="date"
                        value={dateRangeEnd}
                        onChange={(e) => setDateRangeEnd(e.target.value)}
                        className="h-8 text-xs px-2 w-full min-w-0"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <Button
                    variant={showArchived ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setShowArchived(!showArchived)}
                    className="gap-1 h-7 text-xs flex-1"
                  >
                    <Archive className="w-3.5 h-3.5" /> Arquivadas
                  </Button>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="gap-1 h-7 text-xs flex-1 text-destructive hover:text-destructive"
                    >
                      <X className="w-3 h-3" /> Limpar
                    </Button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            data-action="nova-tarefa"
            size="sm"
            onClick={() => handleOpenCreate()}
            className="gap-1.5 h-8 font-medium"
            title="Nova tarefa (atalho: N)"
          >
            <Plus className="w-3.5 h-3.5" /> Tarefa
          </Button>

          {/* Ações secundárias — em menu suspenso para não poluir */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 border-0 text-muted-foreground hover:text-foreground"
                title="Mais ações"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { setBatchMode(!batchMode); setSelectedTaskIds(new Set()); }}>
                <ListChecks className="w-3.5 h-3.5 mr-2" />
                {batchMode ? "Sair da seleção" : "Selecionar várias"}
              </DropdownMenuItem>
              {showColumnManagement && !isMobile && (
                <DropdownMenuItem onSelect={handleAddColumn}>
                  <Settings className="w-3.5 h-3.5 mr-2" />
                  Gerenciar colunas
                </DropdownMenuItem>
              )}
              {hasActiveFilters && (
                <DropdownMenuItem onSelect={clearFilters} className="text-destructive">
                  <X className="w-3.5 h-3.5 mr-2" />
                  Limpar filtros
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
      )}

      {/* KPI Tab Strip — só aparece em contexto de tarefas de projeto (showKpiTabs=true) */}
      {showKpiTabs && onKpiChange && (
        <div className="flex items-center gap-1 mb-3 border-b border-border overflow-x-auto">
          {KPI_OPTIONS.map(({ key, label, count }) => {
            const active = kpiFilter === key;
            return (
              <button
                key={key}
                onClick={() => onKpiChange(key)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{label}</span>
                <span className={cn(
                  "tabular-nums text-[11px]",
                  active ? "text-foreground font-semibold" : "text-muted-foreground/70"
                )}>
                  {count}
                </span>
                {active && (
                  <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tabs de colunas em mobile — design system pill com tracking por scroll */}
      {viewMode === "kanban" && (
        <MobileColumnTabs
          columns={currentColumns}
          getCount={(col) => getColumnTasks(col).length}
          getStripeColor={getColumnStripeColor}
        />
      )}

      {/* Board or List View */}
      {viewMode === "kanban" ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="columns-droppable" direction="horizontal" type="COLUMN">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex gap-3 md:gap-4 overflow-x-auto pb-4 flex-1 min-h-0 snap-x snap-mandatory md:snap-none px-[6vw] md:px-0 [scroll-padding-inline:6vw] md:[scroll-padding-inline:0]"
              >
                {currentColumns.map((col, colIndex) => {
                  const colTasks = getColumnTasks(col);
                  return (
                    <Draggable key={col.id} draggableId={col.id} index={colIndex} isDragDisabled={isVirtualGroup}>
                      {(colProvided) => (
                        <div
                          id={`kanban-col-${col.id}`}
                          ref={colProvided.innerRef}
                          {...colProvided.draggableProps}
                          className={cn(
                            "flex-shrink-0 flex flex-col snap-center md:snap-start relative",
                            "w-[88vw] sm:w-auto",
                            compact ? "sm:min-w-[260px] sm:max-w-[280px]" : "sm:min-w-[290px] sm:max-w-[310px]"
                          )}
                        >
                          {/* Column header — flat, sem bg, sem border */}
                          <div className="flex items-center justify-between px-2 py-2">
                            <div className="flex items-center gap-2.5" {...colProvided.dragHandleProps}>
                              <StatusIcon statusKey={col.statusKey} />
                              <span className="text-sm font-semibold text-foreground">{col.name}</span>
                              {(() => {
                                const ColSortIcon = getColDateSortIcon(col.statusKey);
                                const active = (colDateSort[col.statusKey] ?? "none") !== "none";
                                return (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                      "h-7 w-7 p-0 text-muted-foreground hover:text-foreground",
                                      active && "text-foreground bg-background/60"
                                    )}
                                    title={getColDateSortLabel(col.statusKey)}
                                    onClick={() => handleColDateSortToggle(col.statusKey)}
                                  >
                                    <ColSortIcon className="w-4 h-4" />
                                  </Button>
                                );
                              })()}
                              <span className="text-xs text-muted-foreground font-medium tabular-nums">
                                {colTasks.length}
                              </span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenCreate(col.statusKey as TaskStatus)}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                              {showColumnManagement && (
                                <PermissionGuard can="canManageProjects">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                                        <MoreHorizontal className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEditColumn(col)}>
                                        <Pencil className="w-4 h-4 mr-2" /> Editar coluna
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleDeleteColumn(col.id)} className="text-danger">
                                        <Trash2 className="w-4 h-4 mr-2" /> Remover coluna
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </PermissionGuard>
                              )}
                            </div>
                          </div>

                          {/* Droppable area — sem overflow próprio (evita nested scroll com main) */}
                          <Droppable droppableId={col.id} type="TASK">
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={cn(
                                  "flex-1 px-2 pb-2 flex flex-col gap-2 min-h-[120px] transition-colors",
                                  snapshot.isDraggingOver && "bg-primary/5"
                                )}
                              >
                                {colTasks.map((task, index) => {
                                  const rawTaskLabels = Array.isArray((task as any)?.labels) ? (task as any).labels as { text: string; color: string }[] : [];
                                  const taskLabels = getTaskLabelsWithProject(
                                    rawTaskLabels,
                                    task.project_id,
                                    task.project_name,
                                    projects || []
                                  );
                                  const taskAttachments = Array.isArray((task as any)?.attachments) ? (task as any).attachments : [];
                                  const taskCover = normalizeSupabaseAssetUrl((task as any)?.cover_url);
                                  return (
                                    <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={batchMode || isVirtualGroup}>
                                      {(provided, snapshot) => (
                                        <div
                                          ref={provided.innerRef}
                                          {...provided.draggableProps}
                                          {...provided.dragHandleProps}
                                          data-task-card="true"
                                          data-task-id={task.id}
                                          tabIndex={0}
                                          onClick={(e) => {
                                            if (batchMode) {
                                              toggleTaskSelection(task.id);
                                              return;
                                            }
                                            if (e.metaKey || e.ctrlKey) {
                                              window.open(
                                                `/tarefas?taskId=${task.id}`,
                                                "_blank",
                                                "noopener,noreferrer"
                                              );
                                              return;
                                            }
                                            handleOpenDetail(task);
                                          }}
                                          className={cn(
                                            "bg-card rounded-md shadow-sm hover:shadow-md transition-shadow duration-100 group focus:outline-none focus:ring-2 focus:ring-ring",
                                            !batchMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                                            snapshot.isDragging && "shadow-lg ring-2 ring-primary/20 rotate-1 cursor-grabbing",
                                            batchMode && selectedTaskIds.has(task.id) && "ring-2 ring-primary"
                                          )}
                                        >
                                          {/* Cover Image */}
                                          {taskCover && (
                                            <div className="h-24 w-full overflow-hidden rounded-t-lg">
                                              <img src={taskCover} alt="" className="w-full h-full object-cover" />
                                            </div>
                                          )}
                                          <div className="p-3">
                                            {/* Batch checkbox */}
                                            {batchMode && (
                                              <div className="flex items-center gap-2 mb-2">
                                                <input
                                                  type="checkbox"
                                                  checked={selectedTaskIds.has(task.id)}
                                                  onChange={() => toggleTaskSelection(task.id)}
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="w-4 h-4 rounded border-border"
                                                />
                                              </div>
                                            )}
                                            {/* Status stripe + labels — Flat Modern */}
                                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                              <div className={cn("h-[3px] w-7 rounded-sm opacity-70", getColumnStripeColor(task.status))} aria-hidden />
                                              {taskLabels.map((label, li) => (
                                                <span
                                                  key={li}
                                                  className="text-2xs font-medium rounded px-1.5 py-0.5"
                                                  style={getTaskLabelStyle(label.color)}
                                                >
                                                  {label.text}
                                                </span>
                                              ))}
                                            </div>
                                            {/* Title */}
                                            <p className="text-[13px] font-medium text-foreground leading-[1.35]">{task.title}</p>
                                            {/* Project name (subtle, plain — abaixo do título) */}
                                            {!projectId && task.project_name && (
                                              <p className="text-[11.5px] text-muted-foreground/80 truncate mt-1">{task.project_name}</p>
                                            )}
                                            {/* Footer compacto — priority + meta + avatars + status (hover) */}
                                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2.5 min-w-0">
                                              <PriorityPill priority={task.priority} />
                                              {task.due_date && (() => {
                                                const d = parseDateSafe(task.due_date);
                                                if (!isValid(d)) return null;
                                                return (
                                                  <span className={cn("text-[11.5px] flex items-center gap-0.5",
                                                    task.due_date && isTaskOverdue(task.due_date) && task.status !== "done" && task.status !== "arquivado"
                                                      ? "text-danger font-medium"
                                                      : isToday(d)
                                                        ? "text-warning"
                                                        : "text-muted-foreground"
                                                  )}>
                                                    <Clock className="w-3 h-3" />
                                                    {format(d, "dd/MM", { locale: ptBR })}
                                                  </span>
                                                );
                                              })()}
                                              {Array.isArray(task.checklist_items) && (task.checklist_items as any[]).length > 0 && (() => {
                                                const items = task.checklist_items as { text: string; checked: boolean }[];
                                                const done = items.filter((i) => i.checked).length;
                                                return (
                                                  <span className={cn("text-[11.5px] flex items-center gap-0.5", done === items.length ? "text-success" : "text-muted-foreground")}>
                                                    <ListChecks className="w-3 h-3" />
                                                    {done}/{items.length}
                                                  </span>
                                                );
                                              })()}
                                              {taskAttachments.length > 0 && (
                                                <span className="text-[11.5px] flex items-center gap-0.5 text-muted-foreground">
                                                  <Paperclip className="w-3 h-3" />
                                                  {taskAttachments.length}
                                                </span>
                                              )}
                                              {task.has_recurrence && (
                                                <Repeat
                                                  className="w-3 h-3 text-primary"
                                                  aria-label={`Recorrente: ${task.recurrence_frequency ?? ""}`}
                                                />
                                              )}
                                              {task.description && (
                                                <AlignLeft className="w-3 h-3 text-muted-foreground" />
                                              )}
                                              <TaskTimerBadge taskId={task.id} />

                                              {/* spacer */}
                                              <div className="flex-1" />

                                              {/* Avatars à direita */}
                                              <div className="flex -space-x-1.5">
                                                {task.assignees && task.assignees.length > 0
                                                  ? task.assignees.slice(0, 3).map((a) => (
                                                      <AvatarBadge key={a.employee_id} name={a.full_name || "?"} avatarUrl={a.avatar_url} size="xs" />
                                                    ))
                                                  : task.assignee_name
                                                    ? <AvatarBadge name={task.assignee_name} avatarUrl={task.assignee_avatar} size="xs" />
                                                    : null
                                                }
                                                {task.assignees && task.assignees.length > 3 && (
                                                  <span className="w-5 h-5 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center text-muted-foreground border border-background">
                                                    +{task.assignees.length - 3}
                                                  </span>
                                                )}
                                              </div>

                                              {/* Status dropdown — só aparece no hover do card */}
                                              {canModifyTask(task) && (
                                                <DropdownMenu>
                                                  <DropdownMenuTrigger asChild>
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-5 px-1.5 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity max-w-[100px] truncate flex-shrink-0"
                                                      onClick={(e) => e.stopPropagation()}
                                                      title={columns?.find(c => c.statusKey === task.status)?.name ?? task.status}
                                                    >
                                                      <span className="truncate">{columns?.find(c => c.statusKey === task.status)?.name ?? task.status}</span>
                                                    </Button>
                                                  </DropdownMenuTrigger>
                                                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                    {(columns || []).filter(c => c.statusKey !== task.status).map((col) => (
                                                      <DropdownMenuItem
                                                        key={col.id}
                                                        onSelect={() => moveTask.mutate({ id: task.id, status: col.statusKey as TaskStatus, sort_order: 0 })}
                                                      >
                                                        {col.name}
                                                      </DropdownMenuItem>
                                                    ))}
                                                  </DropdownMenuContent>
                                                </DropdownMenu>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </Draggable>
                                  );
                                })}
                                {provided.placeholder}
                                {/* Quick-add inline expandido */}
                                {quickAddOpen === col.statusKey ? (
                                  <div className="bg-card rounded-md border border-primary/40 p-2 mx-1 flex flex-col gap-1.5 shadow-sm">
                                    <Input
                                      autoFocus
                                      value={quickAddTitle}
                                      onChange={(e) => setQuickAddTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                          e.preventDefault();
                                          handleQuickAdd(col.statusKey as TaskStatus);
                                        } else if (e.key === "Escape") {
                                          setQuickAddOpen(null);
                                          resetQuickAdd();
                                        }
                                      }}
                                      placeholder="Título da tarefa…"
                                      className="h-8 text-sm font-medium border-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1.5"
                                    />
                                    <Textarea
                                      value={quickAddDescription}
                                      onChange={(e) => setQuickAddDescription(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          setQuickAddOpen(null);
                                          resetQuickAdd();
                                        }
                                      }}
                                      placeholder="Descrição (opcional)"
                                      rows={2}
                                      className="text-xs resize-none border-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1.5 py-1 min-h-[40px]"
                                    />
                                    <div className="flex flex-col gap-1 pt-1 border-t border-border/40">
                                      <Select
                                        value={quickAddAssignee || "none"}
                                        onValueChange={(v) => setQuickAddAssignee(v === "none" ? "" : v)}
                                      >
                                        <SelectTrigger className="h-7 text-xs px-2">
                                          <User className="w-3 h-3 mr-1 text-muted-foreground" />
                                          <SelectValue placeholder="Responsável" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">Sem responsável</SelectItem>
                                          {(employees || [])
                                            .filter((e) => e.status === "active")
                                            .map((e) => (
                                              <SelectItem key={e.id} value={e.id}>
                                                {e.full_name}
                                              </SelectItem>
                                            ))}
                                        </SelectContent>
                                      </Select>
                                      {!projectId && (
                                        <Select
                                          value={quickAddProject || "none"}
                                          onValueChange={(v) =>
                                            setQuickAddProject(v === "none" ? "" : v)
                                          }
                                        >
                                          <SelectTrigger className="h-7 text-xs px-2">
                                            <FolderKanban className="w-3 h-3 mr-1 text-muted-foreground" />
                                            <SelectValue placeholder="Projeto" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">Sem projeto</SelectItem>
                                            {(projects || []).map((p) => (
                                              <SelectItem key={p.id} value={p.id}>
                                                {p.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between pt-1">
                                      <p className="text-2xs text-muted-foreground">
                                        Enter cria · Esc cancela
                                      </p>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 text-2xs px-2"
                                          onClick={() => {
                                            setQuickAddOpen(null);
                                            resetQuickAdd();
                                          }}
                                        >
                                          Cancelar
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="h-6 text-2xs px-2"
                                          disabled={!quickAddTitle.trim() || createTask.isPending}
                                          onClick={() =>
                                            handleQuickAdd(col.statusKey as TaskStatus)
                                          }
                                        >
                                          Criar
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuickAddOpen(col.statusKey);
                                      setQuickAddTitle("");
                                    }}
                                    className="mx-1 mt-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-2xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" /> Adicionar tarefa
                                  </button>
                                )}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : viewMode === "calendar" ? (
        <TaskCalendarView
          tasks={filtered}
          onOpenTask={(t) => handleOpenDetail(t)}
          onCreateTask={(dateIso) => {
            resetForm();
            setForm((f) => ({ ...f, due_date: dateIso, status: "todo" }));
            setEditingTask(null);
            setDialogOpen(true);
          }}
        />
      ) : (
        /* List view - mobile friendly */
        <div className="flex flex-col gap-4">
          {currentColumns.map((col) => {
            const colTasks = getColumnTasks(col);
            if (colTasks.length === 0) return null;
            return (
              <div key={col.id} className="bg-card rounded-xl border border-border/50 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/30">
                  <StatusIcon statusKey={col.statusKey} />
                  <span className="text-sm font-semibold text-foreground">{col.name}</span>
                  <span className="text-xs text-muted-foreground font-medium tabular-nums">
                    {colTasks.length}
                  </span>
                </div>
                <div className="p-3 space-y-2">
                  {colTasks.map((task) => {
                    const rawTaskLabels = Array.isArray((task as any)?.labels) ? (task as any).labels as { text: string; color: string }[] : [];
                    const taskLabels = getTaskLabelsWithProject(
                      rawTaskLabels,
                      task.project_id,
                      task.project_name,
                      projects || []
                    );
                    const taskAttachments = Array.isArray((task as any)?.attachments) ? (task as any).attachments : [];
                    return (
                      <div
                        key={task.id}
                        onClick={() => handleOpenDetail(task)}
                        className="bg-background rounded-lg border border-border/50 p-3 cursor-pointer entity-card-hover"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground mb-1">{task.title}</p>
                            {!projectId && task.project_name && (
                              <p className="text-xs text-primary mb-2">{task.project_name}</p>
                            )}
                            <div className="flex items-center flex-wrap gap-1.5">
                              <PriorityPill priority={task.priority} />
                              {task.due_date && (() => {
                                const d = parseDateSafe(task.due_date);
                                if (!isValid(d)) return null;
                                return (
                                  <span className={cn("text-2xs flex items-center gap-0.5",
                                    d < new Date() && task.status !== "done" && task.status !== "arquivado"
                                      ? "text-danger font-medium"
                                      : isToday(d)
                                        ? "text-warning"
                                        : "text-muted-foreground"
                                  )}>
                                    <Clock className="w-3 h-3" />
                                    {format(d, "dd/MM", { locale: ptBR })}
                                  </span>
                                );
                              })()}
                              {Array.isArray(task.checklist_items) && (task.checklist_items as any[]).length > 0 && (() => {
                                const items = task.checklist_items as { text: string; checked: boolean }[];
                                const done = items.filter((i) => i.checked).length;
                                return (
                                  <span className={cn("text-2xs flex items-center gap-0.5", done === items.length ? "text-success" : "text-muted-foreground")}>
                                    <ListChecks className="w-3 h-3" />
                                    {done}/{items.length}
                                  </span>
                                );
                              })()}
                              {taskAttachments.length > 0 && (
                                <span className="text-2xs flex items-center gap-0.5 text-muted-foreground">
                                  <Paperclip className="w-3 h-3" />
                                  {taskAttachments.length}
                                </span>
                              )}
                            </div>
                          </div>
                          {task.assignee_name && (
                            <AvatarBadge name={task.assignee_name} avatarUrl={task.assignee_avatar} size="sm" />
                          )}
                        </div>
                        {taskLabels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {taskLabels.map((label, li) => (
                              <span
                                key={li}
                                className="text-2xs font-medium rounded border px-1.5 py-0.5"
                                style={getTaskLabelStyle(label.color)}
                              >
                                {label.text}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Inline status button */}
                        {canModifyTask(task) && (
                          <div className="mt-2 pt-2 border-t border-border/30">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs w-full justify-start"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {columns?.find(c => c.statusKey === task.status)?.name ?? task.status}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                                {(columns || []).filter(c => c.statusKey !== task.status).map((col) => (
                                  <DropdownMenuItem
                                    key={col.id}
                                    onSelect={() => moveTask.mutate({ id: task.id, status: col.statusKey as TaskStatus, sort_order: 0 })}
                                  >
                                    {col.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{editingTask ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Título *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título da tarefa" className="h-10 font-medium" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} onPaste={!editingTask ? handleDescriptionPasteCreate : undefined} placeholder="Detalhes da tarefa..." rows={3} className="resize-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!projectId && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projeto</Label>
                  <Select value={form.project_id || "none"} onValueChange={(v) => setForm({ ...form, project_id: v === "none" ? "" : v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem projeto</SelectItem>
                      {(projects || []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className={projectId ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Responsável</Label>
                {isMember && !editingTask ? (
                  <div className="h-10 px-3 flex items-center rounded-md border border-input bg-muted/40 text-sm text-muted-foreground">
                    {currentEmployee?.full_name ?? "Você"} · não pode atribuir a outros
                  </div>
                ) : (
                  <Select value={form.assignee_id || "none"} onValueChange={(v) => setForm({ ...form, assignee_id: v === "none" ? "" : v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem responsável</SelectItem>
                      {(employees || []).filter((e) => e.status === "active").map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data de Vencimento</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="h-10" />
            </div>

            {/* Checklist */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5" /> Checklist
                {form.checklist_items.length > 0 && (
                  <span className="text-muted-foreground font-normal">({form.checklist_items.filter(i => i.checked).length}/{form.checklist_items.length})</span>
                )}
              </Label>
              {form.checklist_items.length > 0 && (
                <div className="space-y-1">
                  {form.checklist_items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 transition-colors group">
                      <button type="button" onClick={() => toggleCheckItem(idx)} className="flex-shrink-0">
                        {item.checked
                          ? <CheckCircle2 className="w-4 h-4 text-success" />
                          : <Circle className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                        }
                      </button>
                      <span className={cn("text-sm flex-1", item.checked && "line-through text-muted-foreground")}>{item.text}</span>
                      <button type="button" onClick={() => removeCheckItem(idx)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={newCheckItem}
                  onChange={(e) => setNewCheckItem(e.target.value)}
                  placeholder="Adicionar item ao checklist..."
                  className="text-sm h-8"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCheckItem(); } }}
                />
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={addCheckItem} disabled={!newCheckItem.trim()} type="button">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Anexos — só na criação */}
            {!editingTask && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" /> Anexos
                </Label>
                <input
                  ref={pendingFileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handlePendingFileAdd}
                />
                {pendingAttachments.length > 0 && (
                  <div className="space-y-1">
                    {pendingAttachments.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/50 text-sm group">
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                        <button
                          type="button"
                          onClick={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => pendingFileInputRef.current?.click()}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Adicionar arquivo
                </Button>
              </div>
            )}
          </div>

            {/* Recorrência — só na criação */}
            {!editingTask && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer select-none">
                    <Repeat className="w-3.5 h-3.5 text-primary" />
                    Recorrência
                  </Label>
                  <button
                    type="button"
                    onClick={() => setRecEnabled(!recEnabled)}
                    className={cn(
                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
                      recEnabled ? "bg-primary" : "bg-input"
                    )}
                  >
                    <span className={cn(
                      "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                      recEnabled ? "translate-x-4" : "translate-x-1"
                    )} />
                  </button>
                </div>

                {recEnabled && (
                  <div className="space-y-3">
                    <Select value={recFrequency} onValueChange={(v) => setRecFrequency(v as RecFrequency)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REC_FREQUENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {(recFrequency === "weekly" || recFrequency === "specific_days") && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {recFrequency === "specific_days" ? "Dias permitidos" : "Dias da semana"}
                        </p>
                        <div className="flex gap-1 flex-wrap">
                          {REC_DAYS.map((d) => (
                            <button key={d.v} type="button" onClick={() => toggleRecDay(d.v)}
                              className={cn(
                                "w-9 h-7 rounded-md text-xs font-medium transition-colors",
                                recDaysOfWeek.includes(d.v)
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                              )}>
                              {d.l}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {recFrequency === "custom" && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">A cada</span>
                        <Input type="number" min={1} value={recIntervalDays}
                          onChange={(e) => setRecIntervalDays(Number(e.target.value))}
                          className="w-16 h-8 text-sm text-center" />
                        <span className="text-xs text-muted-foreground">dias</span>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs text-muted-foreground">Data de término (opcional)</Label>
                      <Input type="date" value={recEndDate} onChange={(e) => setRecEndDate(e.target.value)} className="h-8 text-sm mt-1" />
                    </div>
                  </div>
                )}
              </div>
            )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetRecurrence(); setPendingAttachments([]); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createTask.isPending || updateTask.isPending} className="shadow-sm font-medium">
              {editingTask ? "Salvar" : "Criar Tarefa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={detailTask} open={detailOpen} onOpenChange={setDetailOpen}
        onSave={handleDetailSave} onDelete={handleDelete}
        onSyncAssignees={(taskId, employeeIds) => syncAssignees.mutate({ taskId, employeeIds })}
        employees={(employees || []).map((e) => ({ id: e.id, full_name: e.full_name, status: e.status, user_id: e.user_id }))}
        projects={(projects || []).map((p) => ({ id: p.id, name: p.name }))}
        projectId={projectId}
        canEdit={detailTask ? canModifyTask(detailTask) || !isMember : false}
      />

      {/* Batch action bar */}
      {batchMode && selectedTaskIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-lg shadow-lg px-5 py-3.5 flex items-center gap-3 flex-wrap backdrop-blur-sm">
          <span className="text-sm font-medium text-foreground">{selectedTaskIds.size} selecionada(s)</span>
          <Select onValueChange={(v) => handleBatchAction("status", v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Mover para..." /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => handleBatchAction("priority", v)}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Prioridade..." /></SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => handleBatchAction("assignee", v === "none" ? "" : v)}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Atribuir..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem responsável</SelectItem>
              {(employees || []).filter((e) => e.status === "active").map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => handleBatchAction("delete")}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setBatchMode(false); setSelectedTaskIds(new Set()); }}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancelar
          </Button>
        </div>
      )}

      {/* Column Edit Dialog */}
      <Dialog open={columnDialogOpen} onOpenChange={setColumnDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingColumn ? "Editar Coluna" : "Nova Coluna"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome *</Label>
              <Input value={colForm.name} onChange={(e) => setColForm({ ...colForm, name: e.target.value })} placeholder="Nome da coluna" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status das tarefas</Label>
              <Select value={colForm.statusKey} onValueChange={(v) => setColForm({ ...colForm, statusKey: v as TaskStatus })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-2xs text-muted-foreground mt-1">Define qual status as tarefas terão nesta coluna.</p>
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setColForm({ ...colForm, color: c.value })}
                    className={cn(
                      "w-8 h-8 rounded-lg border-2 transition-all",
                      c.value,
                      colForm.color === c.value ? "border-primary scale-110" : "border-transparent"
                    )}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setColumnDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveColumn}>
              {editingColumn ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* MobileColumnTabs — pill tabs com tracking via IntersectionObserver */
function MobileColumnTabs({
  columns,
  getCount,
  getStripeColor,
}: {
  columns: KanbanColumn[];
  getCount: (col: KanbanColumn) => number;
  getStripeColor: (statusKey: string) => string;
}) {
  const [activeId, setActiveId] = useState<string | null>(columns[0]?.id ?? null);
  const tabsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const els = columns
      .map((c) => document.getElementById(`kanban-col-${c.id}`))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const id = visible.target.id.replace("kanban-col-", "");
          setActiveId(id);
        }
      },
      { threshold: [0.4, 0.6, 0.8], rootMargin: "0px -20% 0px -20%" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [columns]);

  useEffect(() => {
    if (!activeId || !tabsRef.current) return;
    const btn = tabsRef.current.querySelector<HTMLButtonElement>(`[data-col-id="${activeId}"]`);
    if (btn) btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  if (columns.length === 0) return null;

  return (
    <div
      ref={tabsRef}
      className="md:hidden flex items-center gap-1.5 mb-3 overflow-x-auto -mx-3 px-3 pb-1.5"
    >
      {columns.map((col) => {
        const count = getCount(col);
        const active = activeId === col.id;
        const dotColor = getStripeColor(col.statusKey);
        return (
          <button
            key={col.id}
            type="button"
            data-col-id={col.id}
            onClick={() => {
              const el = document.getElementById(`kanban-col-${col.id}`);
              el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            }}
            className={cn(
              "group flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-full border whitespace-nowrap transition-all duration-200",
              active
                ? "bg-foreground text-background border-foreground shadow-sm"
                : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-border/80"
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dotColor)} />
            <span className="text-xs font-semibold tracking-tight">{col.name}</span>
            <span
              className={cn(
                "min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold tabular-nums flex items-center justify-center transition-colors",
                active
                  ? "bg-background/20 text-background"
                  : "bg-muted text-muted-foreground group-hover:bg-muted/70"
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

