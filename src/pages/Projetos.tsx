import { useState, useMemo } from "react";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { useNavigate } from "react-router-dom";
import { TaskDetailModal } from "@/components/shared/TaskDetailModal";
import {
  FolderKanban, Plus, Calendar, Users, CheckSquare, Search,
  Filter, MoreHorizontal, Pencil, Trash2, UserPlus, UserMinus,
  Circle, CircleDashed, CircleDot, CircleCheck, CircleX, PauseCircle,
  Download, LayoutGrid, List, ChevronDown, TrendingUp, PiggyBank,
  Flag,
} from "lucide-react";
import { formatBRL, parseBRLInput } from "@/lib/currency";
import { exportAsCSV } from "@/lib/export-csv";
import { useProjects, ProjectWithMembers } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { useEmployees, EmployeeWithDetails } from "@/hooks/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { useHierarchyFilter } from "@/hooks/useHierarchyFilter";
import { PermissionGuard } from "@/components/permissions/PermissionGuard";
import { HierarchyFilter, HierarchyFilterBadges } from "@/components/shared/HierarchyFilter";
import { EmptyState, StatusBadge, ProgressBar, AvatarBadge, getStatusLabel } from "@/components/shared/SharedComponents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/shared/SmartSkeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type ProjectStatus = Database["public"]["Enums"]["project_status"];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Planejamento" },
  { value: "active", label: "Em produção" },
  { value: "on_hold", label: "Em Espera" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Em produção" },
  { value: "completed", label: "Concluídos" },
  { value: "on_hold", label: "Pausados" },
  { value: "planning", label: "Planejando" },
];

export default function Projetos() {
  const navigate = useNavigate();
  const { canManageProjects, isAdmin } = usePermissions();

  // Filtros hierárquicos
  const {
    filters,
    setArea,
    setSubarea,
    setPosition,
    clearFilters,
    hasActiveFilters,
    selectedAreaName,
  } = useHierarchyFilter();

  // Buscar projetos com filtros
  const {
    data: projects,
    isLoading,
    isFetching,
    createProject,
    updateProject,
    deleteProject,
    addMember,
    removeMember
  } = useProjects({
    area_id: filters.area_id,
    subarea_id: filters.subarea_id,
    position_id: filters.position_id,
  });

  const { data: employees } = useEmployees();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithMembers | null>(null);
  const [managingProject, setManagingProject] = useState<ProjectWithMembers | null>(null);
  const [addByPositionId, setAddByPositionId] = useState<string>("");
  const [addByAreaId, setAddByAreaId] = useState<string>("");
  const [addBySubareaId, setAddBySubareaId] = useState<string>("");
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>("");

  // Cargos únicos dos colaboradores ativos (para "adicionar por cargo")
  const availablePositions = useMemo(() => {
    const seen = new Set<string>();
    const positions: { id: string; title: string }[] = [];
    for (const e of employees || []) {
      if (e.status === "active" && e.position_id && !seen.has(e.position_id)) {
        seen.add(e.position_id);
        positions.push({ id: e.position_id, title: e.position_title || e.position_id });
      }
    }
    return positions.sort((a, b) => a.title.localeCompare(b.title));
  }, [employees]);

  // Áreas e subáreas únicas dos colaboradores ativos
  const availableAreas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of employees || []) {
      if (e.status === "active" && e.area_id && e.area_name) seen.set(e.area_id, e.area_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const availableSubareas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of employees || []) {
      if (e.status === "active" && e.subarea_id && e.subarea_name) seen.set(e.subarea_id, e.subarea_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const [form, setForm] = useState({
    name: "",
    description: "",
    priority: "medium",
    status: "planning" as ProjectStatus,
    start_date: "",
    end_date: "",
    owner_id: "",
    potential_revenue: "",
    potential_savings: "",
  });
  const resetForm = () =>
    setForm({
      name: "",
      description: "",
      priority: "medium",
      status: "planning",
      start_date: "",
      end_date: "",
      owner_id: "",
      potential_revenue: "",
      potential_savings: "",
    });
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [collapsedStatus, setCollapsedStatus] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // Filtragem local por busca e status
  const filtered = (projects || []).filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (dateFrom && p.start_date && p.start_date < dateFrom) return false;
    if (dateTo && p.end_date && p.end_date > dateTo) return false;
    if (dateFrom && !p.start_date) return false;
    return true;
  });

  const hasDateFilters = !!dateFrom || !!dateTo;
  const clearDateFilters = () => { setDateFrom(""); setDateTo(""); };

  // Count per status for tabs
  const statusCounts: Record<string, number> = { all: (projects || []).length };
  for (const p of projects || []) {
    statusCounts[p.status || "planning"] = (statusCounts[p.status || "planning"] || 0) + 1;
  }

  const handleOpenCreate = () => { resetForm(); setEditingProject(null); setDialogOpen(true); };
  const handleOpenEdit = (p: ProjectWithMembers) => {
    setForm({
      name: p.name,
      description: p.description || "",
      priority: p.priority || "medium",
      status: (p.status || "planning") as ProjectStatus,
      start_date: p.start_date || "",
      end_date: p.end_date || "",
      owner_id: (p as any).owner_id || "",
      potential_revenue: (p as any).potential_revenue != null ? String((p as any).potential_revenue) : "",
      potential_savings: (p as any).potential_savings != null ? String((p as any).potential_savings) : "",
    });
    setEditingProject(p); setDialogOpen(true);
  };
  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      status: form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      owner_id: form.owner_id || null,
      potential_revenue: parseBRLInput(form.potential_revenue),
      potential_savings: parseBRLInput(form.potential_savings),
    } as any;
    try {
      if (editingProject) {
        await updateProject.mutateAsync({ id: editingProject.id, ...payload });
        toast.success("Projeto atualizado!");
      } else {
        await createProject.mutateAsync(payload);
        toast.success("Projeto criado!");
      }
      setDialogOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const confirmDeleteProject = async () => {
    if (!deleteTarget) return;
    try { await deleteProject.mutateAsync(deleteTarget); toast.success("Projeto excluído!"); } catch (e: any) { toast.error(e.message); } finally { setDeleteTarget(null); }
  };
  const handleAddMember = async (employeeId: string) => {
    if (!managingProject) return;
    try { await addMember.mutateAsync({ project_id: managingProject.id, employee_id: employeeId }); toast.success("Membro adicionado!"); } catch (e: any) { toast.error(e.message); }
  };
  const handleRemoveMember = async (employeeId: string) => {
    if (!managingProject) return;
    try { await removeMember.mutateAsync({ project_id: managingProject.id, employee_id: employeeId }); toast.success("Membro removido!"); } catch (e: any) { toast.error(e.message); }
  };

  const handleAddByPosition = async (positionId: string) => {
    if (!managingProject || !positionId) return;
    const toAdd = (employees || []).filter(
      e => e.status === "active" &&
           e.position_id === positionId &&
           !managingProject.members?.some(m => m.employee_id === e.id)
    );
    if (toAdd.length === 0) { toast.info("Todos os colaboradores deste cargo já são membros"); return; }
    try {
      await Promise.all(toAdd.map(e => addMember.mutateAsync({ project_id: managingProject.id, employee_id: e.id })));
      toast.success(`${toAdd.length} membro${toAdd.length > 1 ? "s" : ""} adicionado${toAdd.length > 1 ? "s" : ""}!`);
      setAddByPositionId("");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddByArea = async (areaId: string) => {
    if (!managingProject || !areaId) return;
    const toAdd = (employees || []).filter(
      e => e.status === "active" && e.area_id === areaId && !managingProject.members?.some(m => m.employee_id === e.id)
    );
    if (toAdd.length === 0) { toast.info("Todos os colaboradores desta área já são membros"); return; }
    try {
      await Promise.all(toAdd.map(e => addMember.mutateAsync({ project_id: managingProject.id, employee_id: e.id })));
      toast.success(`${toAdd.length} membro${toAdd.length > 1 ? "s" : ""} adicionado${toAdd.length > 1 ? "s" : ""}!`);
      setAddByAreaId("");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddBySubarea = async (subareaId: string) => {
    if (!managingProject || !subareaId) return;
    const toAdd = (employees || []).filter(
      e => e.status === "active" && e.subarea_id === subareaId && !managingProject.members?.some(m => m.employee_id === e.id)
    );
    if (toAdd.length === 0) { toast.info("Todos os colaboradores desta subárea já são membros"); return; }
    try {
      await Promise.all(toAdd.map(e => addMember.mutateAsync({ project_id: managingProject.id, employee_id: e.id })));
      toast.success(`${toAdd.length} membro${toAdd.length > 1 ? "s" : ""} adicionado${toAdd.length > 1 ? "s" : ""}!`);
      setAddBySubareaId("");
    } catch (e: any) { toast.error(e.message); }
  };

  const getProgress = (p: ProjectWithMembers) => {
    if (!p.task_count || p.task_count === 0) return p.progress || 0;
    return Math.round(((p.done_task_count || 0) / p.task_count) * 100);
  };

  if (isLoading || projects === undefined) {
    return <ListSkeleton columns={2} count={4} />;
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] mb-1">Gestão</p>
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight">Projetos</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {filtered.length} projeto{filtered.length !== 1 ? 's' : ''}
            {(hasActiveFilters || hasDateFilters) && ' (filtrado)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => {
            exportAsCSV(filtered, [
              { key: "name", label: "Nome" },
              { key: "status", label: "Status" },
              { key: "priority", label: "Prioridade" },
              { key: "progress", label: "Progresso (%)" },
              { key: "start_date", label: "Início" },
              { key: "end_date", label: "Fim" },
              { key: "potential_revenue" as any, label: "Potencial Receita (R$)" },
              { key: "potential_savings" as any, label: "Potencial Economia (R$)" },
            ], "projetos");
          }}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <PermissionGuard can="canManageProjects">
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">Novo Projeto</span>
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar projetos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle Lista / Grade */}
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "px-2.5 py-1.5 transition-colors cursor-pointer",
                  viewMode === "list"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Visualização em lista"
                aria-label="Lista"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "px-2.5 py-1.5 transition-colors cursor-pointer border-l border-border",
                  viewMode === "grid"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Visualização em cards"
                aria-label="Grade"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(showFilters && "bg-accent")}
            >
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Status Tabs (GT3 — subtle chips) */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 h-7 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-[11px] tabular-nums",
                  isActive ? "text-muted-foreground" : "text-muted-foreground/70"
                )}>
                  {statusCounts[tab.value] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Badges de filtros hierárquicos */}
        {hasActiveFilters && !showFilters && (
          <HierarchyFilterBadges
            areaId={filters.area_id}
            subareaId={filters.subarea_id}
            positionId={filters.position_id}
            onClear={clearFilters}
          />
        )}

        {/* Collapsible com filtros completos */}
        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <CollapsibleContent>
            <div className="p-4 bg-muted/30 rounded-lg border border-border/50 flex flex-col gap-4">
              <HierarchyFilter
                areaId={filters.area_id}
                subareaId={filters.subarea_id}
                positionId={filters.position_id}
                onAreaChange={setArea}
                onSubareaChange={setSubarea}
                onPositionChange={setPosition}
                onClear={clearFilters}
              />
              <div className="border-t border-border/50 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Período</p>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                  <div className="flex-1 min-w-[140px]">
                    <Label className="text-xs text-muted-foreground">De</Label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1" />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <Label className="text-xs text-muted-foreground">Até</Label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1" />
                  </div>
                  {hasDateFilters && (
                    <Button variant="ghost" size="sm" onClick={clearDateFilters} className="text-muted-foreground">
                      Limpar datas
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="w-8 h-8 text-muted-foreground" />}
          title={hasActiveFilters ? "Nenhum projeto encontrado com estes filtros" : "Nenhum projeto encontrado"}
          description={hasActiveFilters ? "Tente ajustar os filtros ou limpar a busca." : canManageProjects ? "Crie seu primeiro projeto." : "Nenhum projeto com tarefas atribuídas a você."}
          action={canManageProjects && !hasActiveFilters ? <Button onClick={handleOpenCreate} className="gap-2"><Plus className="w-4 h-4" /> Criar Projeto</Button> : undefined}
        />
      ) : viewMode === "list" ? (
        <ProjectsListView
          projects={filtered}
          collapsed={collapsedStatus}
          onToggleStatus={(s) => setCollapsedStatus((p) => ({ ...p, [s]: !p[s] }))}
          onOpen={(id) => navigate(`/projetos/${id}`)}
          onEdit={handleOpenEdit}
          onDelete={(id) => setDeleteTarget(id)}
          canEdit={canManageProjects}
          canDelete={isAdmin}
          employees={employees || []}
          getProgress={getProgress}
          expandedProjects={expandedProjects}
          onToggleExpand={(id) => setExpandedProjects((p) => ({ ...p, [id]: !p[id] }))}
        />
      ) : (
        <AnimatedList className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              progress={getProgress(p)}
              onEdit={() => handleOpenEdit(p)}
              onDelete={() => setDeleteTarget(p.id)}
              onManageMembers={() => { setManagingProject(p); setMembersDialogOpen(true); }}
              canEdit={canManageProjects}
              canDelete={isAdmin}
              employees={employees || []}
            />
          ))}
        </AnimatedList>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Editar Projeto" : "Novo Projeto"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do projeto" /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descreva o projeto..." rows={3} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Prioridade</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Data Início</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>Data Fim</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div>
              <Label>Responsável pelo Projeto</Label>
              <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar responsável..." /></SelectTrigger>
                <SelectContent>
                  {(employees || []).filter(e => e.status === "active").map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name} {e.position_title ? `— ${e.position_title}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Potencial financeiro */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/40">
              <div>
                <Label className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-success" />
                  Potencial de Receita (R$)
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.potential_revenue}
                  onChange={(e) => setForm({ ...form, potential_revenue: e.target.value })}
                />
                <p className="text-2xs text-muted-foreground mt-1">Estimativa de geração de receita</p>
              </div>
              <div>
                <Label className="flex items-center gap-1.5">
                  <PiggyBank className="w-3.5 h-3.5 text-warning" />
                  Potencial de Economia (R$)
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.potential_savings}
                  onChange={(e) => setForm({ ...form, potential_savings: e.target.value })}
                />
                <p className="text-2xs text-muted-foreground mt-1">Estimativa de economia gerada</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createProject.isPending || updateProject.isPending}>{editingProject ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={(open) => {
        setMembersDialogOpen(open);
        if (!open) { setAddByPositionId(""); setAddByAreaId(""); setAddBySubareaId(""); setMemberSearchQuery(""); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Membros — {managingProject?.name}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-4 max-h-[500px] overflow-y-auto">
            {/* Membros atuais */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Membros atuais</p>
              {(managingProject?.members || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum membro.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {managingProject?.members?.map((m) => (
                    <div key={m.employee_id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <AvatarBadge name={m.full_name || "?"} avatarUrl={m.avatar_url} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{m.full_name}</p>
                          <p className="text-2xs text-muted-foreground">{m.position_title}</p>
                        </div>
                      </div>
                      <PermissionGuard can="canManageProjects">
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(m.employee_id)}><UserMinus className="w-4 h-4 text-danger" /></Button>
                      </PermissionGuard>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <PermissionGuard can="canManageProjects">
              {/* Adicionar por Área */}
              <div className="border-t border-border/50 pt-3">
                <p className="text-sm font-medium text-muted-foreground mb-2">Adicionar por Área</p>
                <div className="flex gap-2">
                  <Select value={addByAreaId} onValueChange={setAddByAreaId}>
                    <SelectTrigger className="flex-1 h-8 text-sm"><SelectValue placeholder="Selecionar área..." /></SelectTrigger>
                    <SelectContent>
                      {availableAreas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8" onClick={() => handleAddByArea(addByAreaId)} disabled={!addByAreaId || addMember.isPending}>
                    <UserPlus className="w-3.5 h-3.5 mr-1" />Adicionar
                  </Button>
                </div>
                {addByAreaId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(employees || []).filter(e => e.status === "active" && e.area_id === addByAreaId && !managingProject?.members?.some(m => m.employee_id === e.id)).length} colaborador(es) a adicionar
                  </p>
                )}
              </div>

              {/* Adicionar por Subárea */}
              <div className="border-t border-border/50 pt-3">
                <p className="text-sm font-medium text-muted-foreground mb-2">Adicionar por Subárea</p>
                <div className="flex gap-2">
                  <Select value={addBySubareaId} onValueChange={setAddBySubareaId}>
                    <SelectTrigger className="flex-1 h-8 text-sm"><SelectValue placeholder="Selecionar subárea..." /></SelectTrigger>
                    <SelectContent>
                      {availableSubareas.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8" onClick={() => handleAddBySubarea(addBySubareaId)} disabled={!addBySubareaId || addMember.isPending}>
                    <UserPlus className="w-3.5 h-3.5 mr-1" />Adicionar
                  </Button>
                </div>
                {addBySubareaId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(employees || []).filter(e => e.status === "active" && e.subarea_id === addBySubareaId && !managingProject?.members?.some(m => m.employee_id === e.id)).length} colaborador(es) a adicionar
                  </p>
                )}
              </div>

              {/* Adicionar por Cargo */}
              <div className="border-t border-border/50 pt-3">
                <p className="text-sm font-medium text-muted-foreground mb-2">Adicionar por Cargo</p>
                <div className="flex gap-2">
                  <Select value={addByPositionId} onValueChange={setAddByPositionId}>
                    <SelectTrigger className="flex-1 h-8 text-sm">
                      <SelectValue placeholder="Selecionar cargo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePositions.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={() => handleAddByPosition(addByPositionId)}
                    disabled={!addByPositionId || addMember.isPending}
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {addByPositionId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(employees || []).filter(e =>
                      e.status === "active" &&
                      e.position_id === addByPositionId &&
                      !managingProject?.members?.some(m => m.employee_id === e.id)
                    ).length} colaborador(es) a adicionar
                  </p>
                )}
              </div>

              {/* Adicionar individualmente */}
              <div className="border-t border-border/50 pt-3">
                <p className="text-sm font-medium text-muted-foreground mb-2">Adicionar individualmente</p>
                <Input
                  placeholder="Pesquisar por nome..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="h-8 text-sm mb-2"
                />
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                  {(employees || [])
                    .filter(e =>
                      e.status === "active" &&
                      !managingProject?.members?.some(m => m.employee_id === e.id) &&
                      (memberSearchQuery === "" || (e.full_name || "").toLowerCase().includes(memberSearchQuery.toLowerCase()))
                    )
                    .map((e) => (
                      <div key={e.id} className="flex items-center justify-between bg-card rounded-lg px-3 py-2 border border-border/50">
                        <div className="flex items-center gap-2">
                          <AvatarBadge name={e.full_name || "?"} avatarUrl={e.avatar_url} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{e.full_name}</p>
                            <p className="text-2xs text-muted-foreground">{e.position_title}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleAddMember(e.id)}><UserPlus className="w-4 h-4 text-success" /></Button>
                      </div>
                    ))}
                </div>
              </div>
            </PermissionGuard>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O projeto e todas as associações de membros serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ════════════════════════════════════════════
   PROJECT CARD - Com badges de estrutura
   ════════════════════════════════════════════ */

function ProjectCard({
  project, progress, onEdit, onDelete, onManageMembers, canEdit, canDelete, employees,
}: {
  project: ProjectWithMembers;
  progress: number;
  onEdit: () => void;
  onDelete: () => void;
  onManageMembers: () => void;
  canEdit: boolean;
  canDelete: boolean;
  employees: EmployeeWithDetails[];
}) {
  const navigate = useNavigate();

  // Find owner or creator name
  const ownerId = (project as any).owner_id;
  const owner = ownerId ? employees.find((e) => e.id === ownerId) : null;
  const creator = !owner ? employees.find((e) => e.user_id === project.created_by) : null;

  // Obter áreas únicas dos membros para badges
  const memberAreas = [...new Set(project.members?.map(m => m.area_id).filter(Boolean))];
  const areaBadges = memberAreas.slice(0, 3).map(areaId => {
    const member = project.members?.find(m => m.area_id === areaId);
    return {
      id: areaId,
      name: member?.position_title?.split(' - ')[0] || 'Área',
    };
  });

  const statusKey = (project.status || "planning") as StatusKey;
  const statusMeta = STATUS_META[statusKey] ?? STATUS_META.planning;

  return (
    <div
      className="group bg-card rounded-[9px] p-4 sm:p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-px transition-all duration-150 flex flex-col gap-3 cursor-pointer relative overflow-hidden"
      onClick={() => navigate(`/projetos/${project.id}`)}
    >
      {/* Title + Status chip */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className={cn(
            "shrink-0 w-7 h-7 rounded-md inline-flex items-center justify-center",
            statusMeta.group
          )}>
            <statusMeta.Icon className="w-4 h-4" />
          </span>
          <h3 className="text-[15px] font-semibold text-foreground tracking-tight flex-1 min-w-0 truncate">{project.name}</h3>
        </div>
        <StatusChip status={statusKey} size="sm" />
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil className="w-4 h-4 mr-2" /> Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onManageMembers(); }}><Users className="w-4 h-4 mr-2" /> Membros</DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Excluir</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
      )}

      {/* Potencial financeiro */}
      {((project as any).potential_revenue || (project as any).potential_savings) && (
        <div className="flex flex-wrap items-center gap-2">
          {(project as any).potential_revenue ? (
            <Badge variant="outline" className="text-2xs gap-1 bg-success/5 border-success/30 text-success">
              <TrendingUp className="w-2.5 h-2.5" />
              Receita {formatBRL((project as any).potential_revenue, { compact: true })}
            </Badge>
          ) : null}
          {(project as any).potential_savings ? (
            <Badge variant="outline" className="text-2xs gap-1 bg-warning/5 border-warning/30 text-warning-foreground">
              <PiggyBank className="w-2.5 h-2.5" />
              Economia {formatBRL((project as any).potential_savings, { compact: true })}
            </Badge>
          ) : null}
        </div>
      )}

      {/* Badges de área (se houver) */}
      {areaBadges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {areaBadges.map((area, idx) => (
            <Badge key={idx} variant="secondary" className="text-xs flex items-center gap-1">
              <Circle className="w-2 h-2 fill-current" />
              {area.name}
            </Badge>
          ))}
          {(project.members?.length || 0) > 3 && (
            <Badge variant="outline" className="text-xs">
              +{project.members!.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Progresso</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <ProgressBar value={progress} size="sm" />
      </div>

      {/* Footer: members count + creator + date */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <div className="flex items-center gap-3">
          {/* Membros */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            <span>{project.members_count || project.members?.length || 0}</span>
          </div>
          {/* Tarefas — clicável: leva ao Kanban de tarefas filtrado por este projeto */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/tarefas?projectId=${project.id}`); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Ver tarefas deste projeto"
          >
            <CheckSquare className="w-3 h-3" />
            <span>{project.done_task_count || 0}/{project.task_count || 0}</span>
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {(owner || creator) && (
            <div className="flex items-center gap-1.5">
              <AvatarBadge name={(owner || creator)!.full_name || "?"} avatarUrl={(owner || creator)!.avatar_url} size="xs" />
              <span className="text-2xs text-muted-foreground">{owner ? "Responsável" : "Criador"}</span>
            </div>
          )}
          {project.end_date && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>{format(new Date(project.end_date), "dd/MM/yy")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   PROJECTS LIST VIEW — estilo ClickUp,
   agrupado por status, expansível
   ════════════════════════════════════════════ */

type StatusKey = "active" | "planning" | "on_hold" | "completed" | "cancelled";

const STATUS_META: Record<StatusKey, {
  label: string;
  groupLabel: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** chip bg + text */
  chip: string;
  /** group chip (22x22) bg + text */
  group: string;
}> = {
  active:    { label: "Em execução",  groupLabel: "Em execução",  Icon: CircleDashed, chip: "bg-success-light text-success",    group: "bg-success-light text-success" },
  planning:  { label: "Planejamento", groupLabel: "Planejamento", Icon: Circle,        chip: "bg-info-light text-info",          group: "bg-info-light text-info" },
  on_hold:   { label: "Pausado",      groupLabel: "Pausado",      Icon: PauseCircle,   chip: "bg-warning-light text-warning",    group: "bg-warning-light text-warning" },
  completed: { label: "Concluído",    groupLabel: "Concluído",    Icon: CircleCheck,   chip: "bg-[hsl(var(--done-bg))] text-[hsl(var(--done))]", group: "bg-[hsl(var(--done-bg))] text-[hsl(var(--done))]" },
  cancelled: { label: "Cancelado",    groupLabel: "Cancelado",    Icon: CircleX,       chip: "bg-danger-light text-danger",      group: "bg-danger-light text-danger" },
};

function StatusChip({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const meta = STATUS_META[(status as StatusKey)] ?? STATUS_META.planning;
  const { Icon } = meta;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-md font-semibold whitespace-nowrap",
      size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
      meta.chip
    )}>
      <Icon className={cn(size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5")} />
      {meta.label}
    </span>
  );
}

const STATUS_ORDER: StatusKey[] = ["active", "planning", "on_hold", "completed", "cancelled"];

function ProjectsListView({
  projects, collapsed, onToggleStatus, onOpen, onEdit, onDelete,
  canEdit, canDelete, employees, getProgress,
  expandedProjects, onToggleExpand,
}: {
  projects: ProjectWithMembers[];
  collapsed: Record<string, boolean>;
  onToggleStatus: (status: string) => void;
  onOpen: (id: string) => void;
  onEdit: (p: ProjectWithMembers) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
  canDelete: boolean;
  employees: EmployeeWithDetails[];
  getProgress: (p: ProjectWithMembers) => number;
  expandedProjects: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
}) {
  const { data: allTasks, updateTask, deleteTask, syncAssignees } = useTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const tasksByProject = useMemo(() => {
    const m: Record<string, typeof allTasks> = {};
    for (const t of allTasks || []) {
      if (!t.project_id) continue;
      if (!m[t.project_id]) m[t.project_id] = [] as any;
      (m[t.project_id] as any).push(t);
    }
    return m;
  }, [allTasks]);

  const groups = useMemo(() => {
    const m: Record<string, ProjectWithMembers[]> = {};
    for (const p of projects) {
      const s = p.status || "planning";
      if (!m[s]) m[s] = [];
      m[s].push(p);
    }
    return STATUS_ORDER
      .filter((s) => m[s] && m[s].length > 0)
      .map((s) => ({ status: s, items: m[s] }));
  }, [projects]);

  return (
    <div className="bg-card rounded-[12px] shadow-[var(--shadow-sm)] overflow-hidden">
      {groups.map((group, idx) => {
        const isCollapsed = !!collapsed[group.status];
        const meta = STATUS_META[(group.status as StatusKey)] ?? STATUS_META.planning;
        const GroupIcon = meta.Icon;
        return (
          <div key={group.status} className={cn(idx > 0 && "border-t border-border")}>
            {/* Group header — GT3: chip 22x22 + label 13/600 + count chip */}
            <button
              onClick={() => onToggleStatus(group.status)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left cursor-pointer"
            >
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform duration-150",
                  isCollapsed && "-rotate-90"
                )}
              />
              <span className={cn(
                "inline-flex items-center justify-center w-[22px] h-[22px] rounded-[5px]",
                meta.group
              )}>
                <GroupIcon className="w-3.5 h-3.5" />
              </span>
              <span className="text-[13px] font-semibold text-foreground">
                {meta.groupLabel}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums px-1.5 py-0.5 bg-muted rounded">
                {group.items.length}
              </span>
            </button>

            {!isCollapsed && (
              <>
                {/* Column headers */}
                <div className="hidden md:grid grid-cols-[minmax(220px,1fr)_140px_120px_90px_120px_40px] gap-3 px-4 py-2 border-b border-border/40 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                  <div>Projeto</div>
                  <div>Progresso</div>
                  <div>Status</div>
                  <div>Prazo</div>
                  <div>Time</div>
                  <div></div>
                </div>

                {/* Rows */}
                {group.items.map((p) => {
                  const ownerId = (p as any).owner_id;
                  const owner = ownerId ? employees.find((e) => e.id === ownerId) : null;
                  const creator = !owner ? employees.find((e) => e.user_id === p.created_by) : null;
                  const responsible = owner || creator;
                  const progress = getProgress(p);
                  const revenue = (p as any).potential_revenue;
                  const savings = (p as any).potential_savings;
                  const isExpanded = !!expandedProjects[p.id];
                  const projectTasks = (tasksByProject[p.id] || []) as any[];

                  // Quem fez a última alteração (proxy: assignee da tarefa mais recentemente atualizada)
                  const lastToucherId: string | null = (() => {
                    if (projectTasks.length === 0) return null;
                    const sorted = [...projectTasks].sort(
                      (a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
                    );
                    return sorted[0]?.assignee_id ?? null;
                  })();
                  // Stack ordenado: último a alterar primeiro, depois resto dos membros
                  const orderedMembers = (() => {
                    const members = p.members || [];
                    if (!lastToucherId) return members;
                    const front = members.find((m) => m.employee_id === lastToucherId);
                    if (!front) return members;
                    return [front, ...members.filter((m) => m.employee_id !== lastToucherId)];
                  })();
                  return (
                    <div key={p.id} className="border-b border-border/40 last:border-b-0">
                    <div
                      onClick={(e) => {
                        // Click no row = abrir projeto. Chevron tem stopPropagation pra expandir.
                        if ((e.target as HTMLElement).closest("[data-toggle-expand]")) return;
                        onOpen(p.id);
                      }}
                      className="group grid grid-cols-[minmax(0,1fr)_60px] md:grid-cols-[minmax(220px,1fr)_140px_120px_90px_120px_40px] gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer items-center"
                    >
                      {/* PROJETO — chevron · cor · nome · X/Y tarefas */}
                      <div className="min-w-0 flex items-center gap-2.5">
                        <button
                          data-toggle-expand
                          onClick={(e) => { e.stopPropagation(); onToggleExpand(p.id); }}
                          className="flex-shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground/70 hover:text-foreground transition-colors"
                          aria-label={isExpanded ? "Recolher tarefas" : "Expandir tarefas"}
                        >
                          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", !isExpanded && "-rotate-90")} />
                        </button>
                        <meta.Icon className={cn(
                          "w-[15px] h-[15px] flex-shrink-0",
                          group.status === "active" && "text-success",
                          group.status === "planning" && "text-info",
                          group.status === "on_hold" && "text-warning",
                          group.status === "completed" && "text-[hsl(var(--done))]",
                          group.status === "cancelled" && "text-danger",
                        )} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                          {p.description && (
                            <p className="text-2xs text-muted-foreground truncate md:hidden">{p.description}</p>
                          )}
                        </div>
                        {(() => {
                          const total = projectTasks.length;
                          const done = projectTasks.filter((t) => t.status === "done").length;
                          if (total === 0) return null;
                          return (
                            <span className="hidden md:inline text-2xs text-muted-foreground tabular-nums whitespace-nowrap">
                              {done}/{total} tarefas
                            </span>
                          );
                        })()}
                      </div>

                      {/* PROGRESSO — barra + % */}
                      <div className="hidden md:flex items-center gap-2">
                        <div className="flex-1">
                          <ProgressBar value={progress} size="sm" />
                        </div>
                        <span className="text-2xs text-muted-foreground tabular-nums w-8 text-right">
                          {progress}%
                        </span>
                      </div>

                      {/* STATUS — chip GT3 com ícone */}
                      <div className="hidden md:flex items-center">
                        <StatusChip status={group.status} size="sm" />
                      </div>

                      {/* PRAZO */}
                      <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                        {p.end_date ? (
                          <>
                            <Calendar className="w-3 h-3" />
                            <span className="tabular-nums">{format(new Date(p.end_date), "dd MMM", { locale: ptBR })}</span>
                          </>
                        ) : (
                          <span className="italic">—</span>
                        )}
                      </div>

                      {/* TIME — avatares */}
                      <div className="hidden md:flex items-center gap-1.5 min-w-0">
                        {orderedMembers.length > 0 ? (
                          <>
                            <div className="flex -space-x-1.5">
                              {orderedMembers.slice(0, 4).map((m) => (
                                <AvatarBadge
                                  key={m.employee_id}
                                  name={m.full_name || "?"}
                                  avatarUrl={m.avatar_url}
                                  size="xs"
                                  className="ring-2 ring-card"
                                />
                              ))}
                            </div>
                            {orderedMembers.length > 4 && (
                              <span className="text-2xs text-muted-foreground tabular-nums ml-0.5">
                                +{orderedMembers.length - 4}
                              </span>
                            )}
                          </>
                        ) : responsible ? (
                          <AvatarBadge
                            name={responsible.full_name || "?"}
                            avatarUrl={responsible.avatar_url}
                            size="xs"
                          />
                        ) : (
                          <span className="text-2xs text-muted-foreground italic">—</span>
                        )}
                        {(revenue || savings) && (
                          <div className="ml-2 hidden xl:flex flex-col text-2xs leading-tight">
                            {revenue ? (
                              <span className="text-success flex items-center gap-1">
                                <TrendingUp className="w-2.5 h-2.5" />
                                {formatBRL(revenue, { compact: true })}
                              </span>
                            ) : null}
                            {savings ? (
                              <span className="text-warning flex items-center gap-1">
                                <PiggyBank className="w-2.5 h-2.5" />
                                {formatBRL(savings, { compact: true })}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end">
                        {canEdit && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Ações"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(p); }}>
                                <Pencil className="w-3.5 h-3.5 mr-2" /> Editar
                              </DropdownMenuItem>
                              {canDelete && (
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {/* Tarefas inline (expansível) */}
                    {isExpanded && (
                      <div className="bg-muted/40 px-3 py-3">
                        {projectTasks.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic px-2 py-3 text-center">Sem tarefas neste projeto.</p>
                        ) : (
                          <div className="bg-card rounded-md shadow-sm overflow-hidden">
                            {/* Header */}
                            <div className="hidden md:grid grid-cols-[20px_minmax(0,1fr)_120px_70px_80px_28px] gap-3 px-4 py-2 bg-secondary/50 text-[10px] font-mono font-medium uppercase tracking-[0.06em] text-muted-foreground">
                              <span />
                              <span>Tarefa</span>
                              <span>Status</span>
                              <span>Prioridade</span>
                              <span>Prazo</span>
                              <span>Resp.</span>
                            </div>
                            {projectTasks.slice(0, 8).map((t, ti) => {
                              const TASK_DOT: Record<string, string> = {
                                todo: "bg-info",
                                doing: "bg-warning",
                                review: "bg-primary",
                                done: "bg-success",
                                backlog: "bg-muted-foreground/40",
                              };
                              const statusDot = TASK_DOT[t.status as string] || "bg-muted-foreground/40";
                              const dueIso = t.due_date as string | null;
                              const dueDate = dueIso ? new Date(dueIso) : null;
                              const overdue = dueDate && t.status !== "done" && dueDate.getTime() < Date.now();
                              const priorityColor =
                                t.priority === "urgent" ? "text-danger" :
                                t.priority === "high" ? "text-warning" :
                                t.priority === "medium" ? "text-info" :
                                "text-muted-foreground/60";
                              return (
                                <div
                                  key={t.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); setSelectedTaskId(t.id); }}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setSelectedTaskId(t.id); } }}
                                  className={cn(
                                    "grid grid-cols-[20px_minmax(0,1fr)_70px_80px_28px] md:grid-cols-[20px_minmax(0,1fr)_120px_70px_80px_28px] gap-3 px-4 py-2 hover:bg-muted/40 transition-colors cursor-pointer items-center no-underline text-foreground",
                                    ti > 0 && "border-t border-border/40"
                                  )}
                                >
                                  <span className={cn("w-2 h-2 rounded-full justify-self-center", statusDot)} />
                                  <span className="text-[13px] font-medium truncate">{t.title}</span>
                                  <div className="hidden md:block">
                                    <StatusBadge status={t.status} size="sm" />
                                  </div>
                                  <span className={cn("inline-flex items-center gap-1 text-[11.5px]", priorityColor)}>
                                    <Flag className="w-3 h-3" />
                                    <span className="capitalize">{getStatusLabel(t.priority || "medium")}</span>
                                  </span>
                                  <span className={cn("text-[11.5px] tabular-nums", overdue ? "text-danger font-medium" : "text-muted-foreground")}>
                                    {dueDate ? format(dueDate, "dd/MM") : "—"}
                                  </span>
                                  {t.assignee_name ? (
                                    <AvatarBadge name={t.assignee_name} avatarUrl={t.assignee_avatar} size="xs" />
                                  ) : (
                                    <span className="w-5 h-5" />
                                  )}
                                </div>
                              );
                            })}
                            {projectTasks.length > 8 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onOpen(p.id); }}
                                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 border-t border-border/40 text-[12px] font-medium text-primary hover:bg-primary/5 transition-colors"
                              >
                                Ver todas as {projectTasks.length} tarefas
                                <ChevronDown className="w-3 h-3 -rotate-90" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}

      <TaskDetailModal
        task={(allTasks || []).find((t) => t.id === selectedTaskId) ?? null}
        open={!!selectedTaskId}
        onOpenChange={(o) => { if (!o) setSelectedTaskId(null); }}
        onSave={async (id, updates) => { await updateTask.mutateAsync({ id, ...updates }); }}
        onDelete={(id) => { deleteTask.mutate(id); setSelectedTaskId(null); }}
        onSyncAssignees={(taskId, employeeIds) => { syncAssignees.mutate({ taskId, employeeIds }); }}
        employees={employees}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        canEdit={canEdit}
      />
    </div>
  );
}
