import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Calendar, Users, Plus, UserPlus, UserMinus,
  FolderKanban, LayoutGrid, List, X, FileText, Flag, MessageSquare,
  Search, Settings, Filter,
  Calendar as CalendarIcon,
  Circle, CircleDashed, CircleDot, CircleCheck, CircleX, PauseCircle,
} from "lucide-react";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { useEmployees } from "@/hooks/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGuard } from "@/components/permissions/PermissionGuard";
import { StatusBadge, ProgressBar, AvatarBadge, EmptyState } from "@/components/shared/SharedComponents";
import { KanbanBoard } from "@/components/shared/KanbanBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProjectDocuments } from "@/components/projects/ProjectDocuments";
import { cn } from "@/lib/utils";

export default function ProjetoDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { data: tasks, isLoading: loadingTasks } = useTasks(id);
  const { data: employees } = useEmployees();
  const { canManageProjects } = usePermissions();
  const { addMember, removeMember } = useProjects();
  const [activeView, setActiveView] = useState<"list" | "kanban" | "calendar" | "docs">("kanban");
  const [pendingCreate, setPendingCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [kpiFilter, setKpiFilter] = useState<"all" | "today" | "overdue" | "week" | "noDate" | "mine">("all");
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [addByPositionId, setAddByPositionId] = useState("");
  const [addByAreaId, setAddByAreaId] = useState("");
  const [addBySubareaId, setAddBySubareaId] = useState("");

  const activeEmployees = useMemo(() => (employees || []).filter(e => e.status === "active"), [employees]);

  const availablePositions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of activeEmployees) {
      if (e.position_id && e.position_title) seen.set(e.position_id, e.position_title);
    }
    return Array.from(seen.entries()).map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [activeEmployees]);

  const availableAreas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of activeEmployees) {
      if (e.area_id && e.area_name) seen.set(e.area_id, e.area_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeEmployees]);

  const availableSubareas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of activeEmployees) {
      if (e.subarea_id && e.subarea_name) seen.set(e.subarea_id, e.subarea_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeEmployees]);

  const project = projects?.find((p) => p.id === id);

  const handleAddMember = async (employeeId: string) => {
    if (!project) return;
    try { await addMember.mutateAsync({ project_id: project.id, employee_id: employeeId }); toast.success("Membro adicionado!"); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleRemoveMember = async (employeeId: string) => {
    if (!project) return;
    try { await removeMember.mutateAsync({ project_id: project.id, employee_id: employeeId }); toast.success("Membro removido!"); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleAddByPosition = async (positionId: string) => {
    if (!project) return;
    const toAdd = activeEmployees.filter(
      (e) => e.position_id === positionId && !project.members?.some((m) => m.employee_id === e.id)
    );
    for (const e of toAdd) await handleAddMember(e.id);
    toast.success(`${toAdd.length} colaborador(es) adicionado(s)`);
    setAddByPositionId("");
  };

  const handleAddByArea = async (areaId: string) => {
    if (!project) return;
    const toAdd = activeEmployees.filter(
      (e) => e.area_id === areaId && !project.members?.some((m) => m.employee_id === e.id)
    );
    for (const e of toAdd) await handleAddMember(e.id);
    toast.success(`${toAdd.length} colaborador(es) adicionado(s)`);
    setAddByAreaId("");
  };

  const handleAddBySubarea = async (subareaId: string) => {
    if (!project) return;
    const toAdd = activeEmployees.filter(
      (e) => e.subarea_id === subareaId && !project.members?.some((m) => m.employee_id === e.id)
    );
    for (const e of toAdd) await handleAddMember(e.id);
    toast.success(`${toAdd.length} colaborador(es) adicionado(s)`);
    setAddBySubareaId("");
  };

  if (loadingProjects || loadingTasks) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="ghost" onClick={() => navigate("/projetos")} className="self-start gap-2">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <EmptyState
          icon={<FolderKanban className="w-8 h-8 text-muted-foreground" />}
          title="Projeto não encontrado"
          description="O projeto pode ter sido excluído ou você não tem acesso."
        />
      </div>
    );
  }

  const progress = project.task_count && project.task_count > 0
    ? Math.round(((project.done_task_count || 0) / project.task_count) * 100)
    : project.progress || 0;

  const availableEmployees = (employees || []).filter(
    (e) => e.status === "active" && !project.members?.some((m) => m.employee_id === e.id)
  );

  const ownerEmployee = (project as any).owner_id
    ? (employees || []).find((e) => e.id === (project as any).owner_id)
    : null;

  // Status meta (GT3 chip + ícone)
  type StatusKey = "active" | "planning" | "on_hold" | "completed" | "cancelled";
  const STATUS_META: Record<StatusKey, { label: string; Icon: React.ComponentType<{ className?: string }>; chip: string; iconBlock: string }> = {
    active:    { label: "Em produção",  Icon: CircleDashed, chip: "bg-success-light text-success",                          iconBlock: "bg-success-light text-success" },
    planning:  { label: "Planejamento", Icon: Circle,        chip: "bg-info-light text-info",                                iconBlock: "bg-info-light text-info" },
    on_hold:   { label: "Pausado",      Icon: PauseCircle,   chip: "bg-warning-light text-warning",                          iconBlock: "bg-warning-light text-warning" },
    completed: { label: "Concluído",    Icon: CircleCheck,   chip: "bg-[hsl(var(--done-bg))] text-[hsl(var(--done))]",       iconBlock: "bg-[hsl(var(--done-bg))] text-[hsl(var(--done))]" },
    cancelled: { label: "Cancelado",    Icon: CircleX,       chip: "bg-danger-light text-danger",                            iconBlock: "bg-danger-light text-danger" },
  };
  const statusKey = ((project.status || "planning") as StatusKey);
  const statusMeta = STATUS_META[statusKey] ?? STATUS_META.planning;
  const StatusIcon = statusMeta.Icon;

  // Eyebrow: usa área dos membros (ou "Projeto") + status
  const memberArea = (project.members || []).map((m) => (m as any).area_name as string | undefined).find(Boolean);
  const eyebrowLeft = memberArea || "Projeto";

  // Vence em — formato GT3 relativo
  const dueLabel = (() => {
    if (!project.end_date) return null;
    const d = new Date(project.end_date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
    const dateStr = format(d, "dd MMM", { locale: ptBR });
    let rel: string;
    if (diffDays === 0) rel = "hoje";
    else if (diffDays === 1) rel = "amanhã";
    else if (diffDays === -1) rel = "ontem";
    else if (diffDays > 0) rel = `em ${diffDays} dias`;
    else rel = `há ${Math.abs(diffDays)} dias`;
    return { dateStr, rel, overdue: diffDays < 0 };
  })();

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Top stripe — Breadcrumb à esquerda · Ações à direita */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Breadcrumbs items={[
          { label: "Projetos", to: "/projetos" },
          { label: project.name },
        ]} />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMembersDialogOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Users className="w-3.5 h-3.5" /> Compartilhar
          </button>
          <button
            type="button"
            onClick={() => toast.info("IA em breve")}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <span className="text-[13px]">✨</span> IA
          </button>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => { setActiveView("kanban"); setPendingCreate(true); }}
          >
            <Plus className="w-3.5 h-3.5" /> Tarefa
          </Button>
        </div>
      </div>

      {/* View tabs — underline style: Lista · Quadro · Calendário · Documentos */}
      <div className="flex items-center gap-0 border-b border-border">
        {([
          { key: "list",     label: "Lista",      Icon: List },
          { key: "kanban",   label: "Quadro",     Icon: LayoutGrid },
          { key: "calendar", label: "Calendário", Icon: CalendarIcon },
          { key: "docs",     label: "Documentos", Icon: FileText },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveView(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors -mb-px border-b-2",
              activeView === key
                ? "text-foreground border-primary font-semibold"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => toast.info("Visualizações personalizadas em breve")}
          className="flex items-center gap-1.5 px-3 py-2 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors -mb-px border-b-2 border-transparent"
        >
          <Plus className="w-3 h-3" /> Visualização
        </button>
      </div>

      {/* Project header — OMNX-GT3 card */}
      <div className="bg-card rounded-[9px] shadow-[var(--shadow-sm)] p-5">
        <div className="flex items-start gap-3.5">
          {/* Icon block 44x44 com cor de status */}
          <div className={cn(
            "w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0",
            statusMeta.iconBlock
          )}>
            <FolderKanban className="w-[22px] h-[22px]" />
          </div>

          {/* Title block */}
          <div className="flex-1 min-w-0">
            <p className="text-[10.5px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
              {eyebrowLeft} · Projeto
            </p>
            <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight">{project.name}</h1>
            {project.description && (
              <p className="text-[13px] text-muted-foreground mt-1 max-w-3xl line-clamp-2">{project.description}</p>
            )}
          </div>

          {/* KPIs aligned right */}
          <div className="hidden lg:flex items-start gap-7 pt-1">
            <div>
              <p className="text-[10.5px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em]">Progresso</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-[100px] h-[5px] bg-secondary rounded-full overflow-hidden">
                  <div className={cn(
                    "h-full rounded-full transition-all",
                    statusKey === "active" && "bg-success",
                    statusKey === "planning" && "bg-info",
                    statusKey === "on_hold" && "bg-warning",
                    statusKey === "completed" && "bg-[hsl(var(--done))]",
                    statusKey === "cancelled" && "bg-danger",
                  )} style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[13px] font-semibold tabular-nums">{progress}%</span>
              </div>
            </div>
            {dueLabel && (
              <div>
                <p className="text-[10.5px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em]">Vence em</p>
                <p className={cn("text-[14px] font-semibold mt-1", dueLabel.overdue && "text-danger")}>
                  {dueLabel.dateStr} <span className="text-muted-foreground font-normal">· {dueLabel.rel}</span>
                </p>
              </div>
            )}
            <div>
              <p className="text-[10.5px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em]">Time</p>
              <div className="flex items-center gap-1 mt-1">
                <div className="flex -space-x-1.5">
                  {(project.members || []).slice(0, 4).map((m) => (
                    <AvatarBadge key={m.employee_id} name={m.full_name || "?"} avatarUrl={m.avatar_url} size="xs" className="ring-2 ring-card" />
                  ))}
                </div>
                {(project.members?.length || 0) > 4 && (
                  <span className="text-[10px] text-muted-foreground ml-1 tabular-nums">+{(project.members?.length || 0) - 4}</span>
                )}
                {canManageProjects && (
                  <button
                    onClick={() => setMembersDialogOpen(true)}
                    className="w-6 h-6 ml-0.5 rounded-full border-2 border-dashed border-border flex items-center justify-center hover:border-primary hover:text-primary transition-colors"
                    title="Gerenciar time"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Close */}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={() => navigate("/projetos")} title="Voltar">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Mobile KPIs */}
        <div className="lg:hidden grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
          <div>
            <p className="text-[10.5px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em]">Progresso</p>
            <div className="flex items-center gap-2 mt-1">
              <ProgressBar value={progress} size="sm" className="flex-1" />
              <span className="text-[13px] font-semibold tabular-nums">{progress}%</span>
            </div>
          </div>
          {dueLabel && (
            <div>
              <p className="text-[10.5px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em]">Vence em</p>
              <p className={cn("text-[14px] font-semibold mt-1 flex items-center gap-1", dueLabel.overdue && "text-danger")}>
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {dueLabel.dateStr} <span className="text-muted-foreground font-normal">· {dueLabel.rel}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar GT3 — Status · Responsável · Filtro · 🔍 · ⚙ */}
      {activeView !== "docs" && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px] transition-colors",
                  statusFilter ? "bg-secondary text-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                )}
              >
                <Filter className="w-3.5 h-3.5" /> Status {statusFilter && <span className="text-primary font-medium">· {statusFilter}</span>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Filtrar por status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(["todo", "doing", "review", "ajustes", "done", "backlog"] as const).map((s) => (
                <DropdownMenuItem key={s} onClick={() => { setStatusFilter(s); setActiveView("list"); }}>
                  {s}
                </DropdownMenuItem>
              ))}
              {statusFilter && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setStatusFilter(null)} className="text-muted-foreground">
                    <X className="w-3 h-3 mr-1.5" /> Limpar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px] transition-colors",
                  assigneeFilter ? "bg-secondary text-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                )}
              >
                <Filter className="w-3.5 h-3.5" /> Responsável {assigneeFilter && <span className="text-primary font-medium">·</span>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              <DropdownMenuLabel>Filtrar por responsável</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(project.members || []).map((m) => (
                <DropdownMenuItem key={m.employee_id} onClick={() => { setAssigneeFilter(m.employee_id); setActiveView("list"); }}>
                  <AvatarBadge name={m.full_name || "?"} avatarUrl={m.avatar_url} size="xs" className="mr-2" />
                  {m.full_name}
                </DropdownMenuItem>
              ))}
              {assigneeFilter && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setAssigneeFilter(null)} className="text-muted-foreground">
                    <X className="w-3 h-3 mr-1.5" /> Limpar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={() => toast.info("Filtros personalizados em breve")}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Filtro
          </button>

          {(statusFilter || assigneeFilter) && (
            <button
              type="button"
              onClick={() => { setStatusFilter(null); setAssigneeFilter(null); }}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            {searchOpen ? (
              <div className="relative animate-in fade-in slide-in-from-right-2 duration-150">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => { if (!search) setSearchOpen(false); }}
                  placeholder="Buscar tarefa..."
                  className="h-7 pl-8 pr-2 w-[220px] text-[13px]"
                />
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Buscar"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => toast.info("Configurações da view em breve")}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Configurações da view"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeView === "docs" ? (
          <ProjectDocuments projectId={id!} />
        ) : activeView === "list" ? (
          <ProjectTaskListGT3
            tasks={(tasks || []).filter((t) =>
              (!search || t.title?.toLowerCase().includes(search.toLowerCase())) &&
              (!statusFilter || t.status === statusFilter) &&
              (!assigneeFilter ||
                t.assignee_id === assigneeFilter ||
                (Array.isArray(t.assignees) && t.assignees.some((a: any) => a.employee_id === assigneeFilter)))
            )}
            onOpenTask={(taskId) => navigate(`/projetos/${id}?taskId=${taskId}`)}
          />
        ) : (
          <KanbanBoard
            projectId={id}
            showProjectFilter={false}
            showColumnManagement={false}
            showSearch={false}
            showKpiTabs
            showViewToggle={false}
            viewMode={activeView}
            onViewModeChange={(m) => setActiveView(m)}
            kpiFilter={kpiFilter}
            onKpiChange={setKpiFilter}
            openCreate={pendingCreate}
            onOpenCreateConsumed={() => setPendingCreate(false)}
            compact
          />
        )}
      </div>

      {/* Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Membros</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Membros atuais */}
            {(project.members?.length || 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Membros atuais</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {project.members?.map((m) => (
                    <div key={m.employee_id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <AvatarBadge name={m.full_name || "?"} avatarUrl={m.avatar_url} size="xs" />
                        <span className="text-sm">{m.full_name}</span>
                      </div>
                      {canManageProjects && (
                        <button onClick={() => handleRemoveMember(m.employee_id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Adicionar por Área */}
            {availableAreas.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Adicionar por Área</p>
                <div className="flex gap-2">
                  <Select value={addByAreaId} onValueChange={setAddByAreaId}>
                    <SelectTrigger className="flex-1 h-8 text-sm">
                      <SelectValue placeholder="Selecionar área..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAreas.map((a) => {
                        const count = activeEmployees.filter((e) => e.area_id === a.id && !project.members?.some((m) => m.employee_id === e.id)).length;
                        return (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}{count > 0 ? ` (${count})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8" disabled={!addByAreaId} onClick={() => addByAreaId && handleAddByArea(addByAreaId)}>
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Adicionar por Subárea */}
            {availableSubareas.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Adicionar por Subárea</p>
                <div className="flex gap-2">
                  <Select value={addBySubareaId} onValueChange={setAddBySubareaId}>
                    <SelectTrigger className="flex-1 h-8 text-sm">
                      <SelectValue placeholder="Selecionar subárea..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubareas.map((s) => {
                        const count = activeEmployees.filter((e) => e.subarea_id === s.id && !project.members?.some((m) => m.employee_id === e.id)).length;
                        return (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}{count > 0 ? ` (${count})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8" disabled={!addBySubareaId} onClick={() => addBySubareaId && handleAddBySubarea(addBySubareaId)}>
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Adicionar por Cargo */}
            {availablePositions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Adicionar por Cargo</p>
                <div className="flex gap-2">
                  <Select value={addByPositionId} onValueChange={setAddByPositionId}>
                    <SelectTrigger className="flex-1 h-8 text-sm">
                      <SelectValue placeholder="Selecionar cargo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePositions.map((pos) => {
                        const count = activeEmployees.filter((e) => e.position_id === pos.id && !project.members?.some((m) => m.employee_id === e.id)).length;
                        return (
                          <SelectItem key={pos.id} value={pos.id}>
                            {pos.title}{count > 0 ? ` (${count})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8" disabled={!addByPositionId} onClick={() => addByPositionId && handleAddByPosition(addByPositionId)}>
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Adicionar individualmente */}
            {availableEmployees.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Adicionar individualmente</p>
                <Input
                  placeholder="Buscar por nome..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="h-8 text-sm mb-2"
                />
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {availableEmployees
                    .filter((e) => !memberSearchQuery || e.full_name?.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                    .map((e) => (
                      <button
                        key={e.id}
                        onClick={() => handleAddMember(e.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-sm text-left"
                      >
                        <AvatarBadge name={e.full_name || "?"} avatarUrl={e.avatar_url} size="xs" />
                        <span className="truncate flex-1">{e.full_name}</span>
                        <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ════════════════════════════════════════════
   GT3 LIST VIEW — tarefas agrupadas por status
   como tabelas-cartão separadas
   ════════════════════════════════════════════ */

type GT3TaskStatus = "todo" | "doing" | "review" | "done" | "backlog" | "ajustes" | "arquivado";

const TASK_STATUS_META: Record<GT3TaskStatus, {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  chip: string;
  group: string;
  order: number;
}> = {
  doing:     { label: "Em execução",  Icon: CircleDashed, chip: "bg-success-light text-success", group: "bg-success-light text-success", order: 1 },
  todo:      { label: "Planejamento", Icon: Circle,        chip: "bg-info-light text-info",       group: "bg-info-light text-info",       order: 2 },
  review:    { label: "Em revisão",   Icon: CircleDot,     chip: "bg-warning-light text-warning", group: "bg-warning-light text-warning", order: 3 },
  ajustes:   { label: "Ajustes",      Icon: PauseCircle,   chip: "bg-warning-light text-warning", group: "bg-warning-light text-warning", order: 4 },
  done:      { label: "Concluído",    Icon: CircleCheck,   chip: "bg-[hsl(var(--done-bg))] text-[hsl(var(--done))]", group: "bg-[hsl(var(--done-bg))] text-[hsl(var(--done))]", order: 5 },
  backlog:   { label: "Backlog",      Icon: Circle,        chip: "bg-muted text-muted-foreground", group: "bg-muted text-muted-foreground", order: 6 },
  arquivado: { label: "Arquivado",    Icon: CircleX,       chip: "bg-muted text-muted-foreground", group: "bg-muted text-muted-foreground", order: 7 },
};

const TASK_PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-danger",
  high:   "text-warning",
  medium: "text-info",
  low:    "text-muted-foreground/60",
};

function ProjectTaskListGT3({
  tasks,
  onOpenTask,
}: {
  tasks: any[];
  onOpenTask: (taskId: string) => void;
}) {
  const groups = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const t of tasks) {
      const s = t.status || "todo";
      if (!m[s]) m[s] = [];
      m[s].push(t);
    }
    return Object.entries(m)
      .map(([status, items]) => ({ status: status as GT3TaskStatus, items, meta: TASK_STATUS_META[status as GT3TaskStatus] || TASK_STATUS_META.todo }))
      .sort((a, b) => (a.meta.order || 99) - (b.meta.order || 99));
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">
        Sem tarefas neste projeto.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ status, items, meta }) => {
        const GIcon = meta.Icon;
        return (
          <div key={status}>
            {/* Group header — chip 22x22 + label + count */}
            <div className="flex items-center gap-2.5 px-1 mb-2">
              <span className={cn(
                "inline-flex items-center justify-center w-[22px] h-[22px] rounded-[5px]",
                meta.group
              )}>
                <GIcon className="w-3.5 h-3.5" />
              </span>
              <span className="text-[13px] font-semibold text-foreground">{meta.label}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums px-1.5 py-0.5 bg-muted rounded">
                {items.length}
              </span>
            </div>

            {/* Mini-table */}
            <div className="bg-card rounded-[9px] shadow-[var(--shadow-sm)] overflow-hidden">
              {/* Header */}
              <div className="hidden md:grid grid-cols-[36px_minmax(0,1fr)_140px_70px_90px_32px_32px] gap-2 px-4 py-2 bg-secondary/60 text-[10.5px] font-mono font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                <span />
                <span>Nome</span>
                <span>Status</span>
                <span>Pri.</span>
                <span>Prazo</span>
                <span>Resp.</span>
                <span className="text-center"><MessageSquare className="w-3 h-3 inline" /></span>
              </div>

              {items.map((t, i) => {
                const dueDate = t.due_date ? new Date(t.due_date) : null;
                const overdue = dueDate && status !== "done" && dueDate.getTime() < Date.now();
                const priColor = TASK_PRIORITY_COLOR[t.priority || "medium"] || TASK_PRIORITY_COLOR.medium;

                return (
                  <div
                    key={t.id}
                    onClick={() => onOpenTask(t.id)}
                    className={cn(
                      "grid grid-cols-[28px_minmax(0,1fr)_28px] md:grid-cols-[36px_minmax(0,1fr)_140px_70px_90px_32px_32px] gap-2 px-4 py-2.5 items-center cursor-pointer hover:bg-muted/40 transition-colors",
                      i > 0 && "border-t border-border/40"
                    )}
                  >
                    <GIcon className={cn("w-[15px] h-[15px] justify-self-center", meta.chip.split(" ").find((c) => c.startsWith("text-")))} />
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-medium text-foreground truncate">{t.title}</span>
                    </div>
                    <div className="hidden md:flex">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold", meta.chip)}>
                        <GIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </div>
                    <span className={cn("hidden md:inline-flex items-center gap-1 text-[11.5px]", priColor)}>
                      <Flag className="w-3 h-3" />
                    </span>
                    <span className={cn("hidden md:inline text-[12px] tabular-nums", overdue ? "text-danger font-medium" : "text-muted-foreground")}>
                      {dueDate ? format(dueDate, "dd MMM", { locale: ptBR }) : "—"}
                    </span>
                    <div className="hidden md:flex justify-center">
                      {t.assignee_name ? (
                        <AvatarBadge name={t.assignee_name} avatarUrl={t.assignee_avatar} size="xs" />
                      ) : (
                        <span className="w-5 h-5 rounded-full border border-dashed border-border" />
                      )}
                    </div>
                    <span className="hidden md:flex justify-center text-[11px] text-muted-foreground tabular-nums">
                      {t.comments_count > 0 ? t.comments_count : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
