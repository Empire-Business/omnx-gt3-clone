import { useState, useMemo, useRef, useEffect } from "react";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { useNavigate } from "react-router-dom";
import {
  Users, Plus, Search, Pencil, UserX, UserCheck,
  Mail, Phone, Calendar, Camera, Crown, UserCog,
  Filter, X, Circle, FolderKanban, CheckSquare, Download,
  Shield, ShieldOff, Clock, AlertTriangle, Copy, KeyRound,
} from "lucide-react";
import { exportAsCSV } from "@/lib/export-csv";
import { isTaskOverdue } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployees, uploadAvatar, type EmployeeWithDetails, type ChangeStatusPayload } from "@/hooks/useEmployees";
import { useSubareas, usePositions, useAreas, usePositionHierarchy } from "@/hooks/useAreas";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useHierarchyFilter } from "@/hooks/useHierarchyFilter";
import { PermissionGuard } from "@/components/permissions/PermissionGuard";
import { HierarchyFilter, HierarchyFilterBadges } from "@/components/shared/HierarchyFilter";
import { EmptyState, AvatarBadge, StatusBadge } from "@/components/shared/SharedComponents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListSkeleton } from "@/components/shared/SmartSkeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmployeeDetailModal } from "@/components/shared/EmployeeDetailModal";

export interface EmployeeProjectInfo {
  id: string;
  name: string;
  status: string;
  progress: number;
  role_in_project: string | null;
}

export type EmployeeProjectsMap = Record<string, EmployeeProjectInfo[]>;

/** Hook to fetch projects for all employees at once */
function useEmployeeProjects(employeeIds: string[]) {
  return useQuery({
    queryKey: ["employee-projects-map", employeeIds.sort().join(",")],
    staleTime: 1000 * 60 * 5,
    enabled: employeeIds.length > 0,
    queryFn: async () => {
      const { data: epData } = await supabase
        .from("employee_projects")
        .select("employee_id, project_id, role_in_project")
        .in("employee_id", employeeIds);

      if (!epData || epData.length === 0) return {} as EmployeeProjectsMap;

      const projectIds = [...new Set(epData.map(ep => ep.project_id))];
      const { data: projData } = await supabase
        .from("projects")
        .select("id, name, status, progress")
        .in("id", projectIds);

      const projMap = new Map((projData || []).map(p => [p.id, p]));
      const result: EmployeeProjectsMap = {};

      for (const ep of epData) {
        if (!result[ep.employee_id]) result[ep.employee_id] = [];
        const proj = projMap.get(ep.project_id);
        if (proj) {
          result[ep.employee_id].push({
            id: proj.id,
            name: proj.name,
            status: proj.status || "planning",
            progress: proj.progress || 0,
            role_in_project: ep.role_in_project,
          });
        }
      }
      return result;
    },
  });
}

/** Hook to fetch task counts per employee */
function useEmployeeTaskCounts(employeeIds: string[]) {
  return useQuery({
    queryKey: ["employee-task-counts", employeeIds.sort().join(",")],
    staleTime: 1000 * 60 * 5,
    enabled: employeeIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("assignee_id, status, due_date")
        .in("assignee_id", employeeIds)
        // Mesmo criterio do Kanban e da lista do colaborador: subtarefa nao
        // conta como tarefa propria, senao os numeros aqui ficam inflados e
        // divergem do que a pessoa ve no quadro.
        .is("parent_task_id", null);

      const result: Record<string, { doing: number; overdue: number; done: number; total: number }> = {};
      for (const t of data || []) {
        if (!t.assignee_id) continue;
        if (!result[t.assignee_id]) result[t.assignee_id] = { doing: 0, overdue: 0, done: 0, total: 0 };
        result[t.assignee_id].total++;
        if (t.status === "done") result[t.assignee_id].done++;
        if (t.status === "doing") result[t.assignee_id].doing++;
        if (t.due_date && isTaskOverdue(t.due_date) && t.status !== "done") result[t.assignee_id].overdue++;
      }
      return result;
    },
  });
}

/* ════════════════════════════════════════════
   STATUS CHANGE DIALOG
   ════════════════════════════════════════════ */

const STATUS_REASON_OPTIONS: Record<string, string[]> = {
  inactive: ["Demissão voluntária", "Demissão sem justa causa", "Demissão por justa causa", "Término de contrato", "Aposentadoria", "Outro"],
  on_leave: ["Licença médica", "Licença maternidade/paternidade", "Férias", "Afastamento temporário", "Licença não remunerada", "Outro"],
  active: ["Retorno de licença", "Reativação", "Recontratação", "Fim de afastamento", "Outro"],
};

function StatusChangeDialog({
  open,
  onOpenChange,
  employee,
  onConfirm,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: EmployeeWithDetails | null;
  onConfirm: (payload: ChangeStatusPayload) => void;
  isLoading: boolean;
}) {
  const [newStatus, setNewStatus] = useState<'active' | 'inactive' | 'on_leave'>('inactive');
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [terminationDate, setTerminationDate] = useState("");
  const [banUser, setBanUser] = useState(false);

  useEffect(() => {
    if (open && employee) {
      const currentStatus = employee.status || 'active';
      // Default to opposite of current
      if (currentStatus === 'active') setNewStatus('inactive');
      else setNewStatus('active');
      setReason("");
      setCustomReason("");
      setTerminationDate(new Date().toISOString().split("T")[0]);
      setBanUser(false);
    }
  }, [open, employee]);

  if (!employee) return null;

  const currentStatus = employee.status || 'active';
  const finalReason = reason === "Outro" ? customReason : reason;
  const canSubmit = newStatus && finalReason.trim().length > 0 && newStatus !== currentStatus;
  const reasonOptions = STATUS_REASON_OPTIONS[newStatus] || [];

  const statusLabels: Record<string, string> = {
    active: "Ativo",
    inactive: "Inativo",
    on_leave: "Afastado",
  };

  const statusColors: Record<string, string> = {
    active: "text-success",
    inactive: "text-danger",
    on_leave: "text-warning",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Alterar Status do Colaborador
          </DialogTitle>
          <DialogDescription>
            Altere o status de <strong>{employee.full_name}</strong>. Status atual:{" "}
            <span className={cn("font-semibold", statusColors[currentStatus])}>
              {statusLabels[currentStatus]}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* New Status */}
          <div>
            <Label>Novo status *</Label>
            <Select value={newStatus} onValueChange={(v) => { setNewStatus(v as any); setReason(""); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currentStatus !== 'active' && <SelectItem value="active">✅ Ativo (Reativar)</SelectItem>}
                {currentStatus !== 'inactive' && <SelectItem value="inactive">🚫 Inativo (Desligar)</SelectItem>}
                {currentStatus !== 'on_leave' && <SelectItem value="on_leave">⏸️ Afastado</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div>
            <Label>Motivo *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {reasonOptions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === "Outro" && (
            <div>
              <Label>Descreva o motivo *</Label>
              <Textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Descreva o motivo da mudança..."
                rows={2}
              />
            </div>
          )}

          {/* Termination date (only when inactivating) */}
          {newStatus === 'inactive' && (
            <div>
              <Label>Data de desligamento</Label>
              <Input
                type="date"
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
              />
            </div>
          )}

          {/* Ban/Unban toggle */}
          {employee.user_id && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
              <div className="flex items-center gap-2">
                {newStatus === 'active' ? (
                  <ShieldOff className="w-4 h-4 text-success" />
                ) : (
                  <Shield className="w-4 h-4 text-danger" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {newStatus === 'active' ? "Desbloquear login" : "Bloquear login"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {newStatus === 'active'
                      ? "Permitir que o colaborador faça login novamente"
                      : "Impedir que o colaborador acesse o sistema"}
                  </p>
                </div>
              </div>
              <Switch checked={banUser} onCheckedChange={setBanUser} />
            </div>
          )}

          {/* Consequences summary */}
          <div className="p-3 rounded-lg border border-warning/30 bg-warning/5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Consequências desta ação:</p>
                <ul className="list-disc pl-3 space-y-0.5">
                  <li>Status será alterado para <strong className={statusColors[newStatus]}>{statusLabels[newStatus]}</strong></li>
                  {newStatus === 'inactive' && terminationDate && (
                    <li>Data de desligamento: {new Date(terminationDate).toLocaleDateString("pt-BR")}</li>
                  )}
                  {newStatus === 'active' && <li>Data de desligamento será removida</li>}
                  {banUser && (
                    <li className="text-danger font-medium">
                      {newStatus === 'active' ? "Login será desbloqueado" : "Login será bloqueado imediatamente"}
                    </li>
                  )}
                  <li>Registro será adicionado ao histórico de auditoria</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => onConfirm({
              employeeId: employee.id,
              newStatus,
              reason: finalReason,
              terminationDate: newStatus === 'inactive' ? terminationDate : null,
              banUser,
            })}
            disabled={!canSubmit || isLoading}
            variant={newStatus === 'inactive' ? 'destructive' : 'default'}
          >
            {isLoading ? "Processando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════════════════════════
   BULK STATUS DIALOG
   ════════════════════════════════════════════ */

function BulkStatusDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedCount: number;
  onConfirm: (newStatus: 'active' | 'inactive' | 'on_leave', reason: string, banUser: boolean) => void;
  isLoading: boolean;
}) {
  const [newStatus, setNewStatus] = useState<'active' | 'inactive' | 'on_leave'>('inactive');
  const [reason, setReason] = useState("");
  const [banUser, setBanUser] = useState(false);

  useEffect(() => {
    if (open) { setNewStatus('inactive'); setReason(""); setBanUser(false); }
  }, [open]);

  const reasonOptions = STATUS_REASON_OPTIONS[newStatus] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Status em Lote</DialogTitle>
          <DialogDescription>
            Alterar status de <strong>{selectedCount}</strong> colaborador{selectedCount !== 1 ? 'es' : ''}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div>
            <Label>Novo status *</Label>
            <Select value={newStatus} onValueChange={(v) => { setNewStatus(v as any); setReason(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">✅ Ativo</SelectItem>
                <SelectItem value="inactive">🚫 Inativo</SelectItem>
                <SelectItem value="on_leave">⏸️ Afastado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motivo *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
              <SelectContent>
                {reasonOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
            <div>
              <p className="text-sm font-medium">{newStatus === 'active' ? "Desbloquear logins" : "Bloquear logins"}</p>
              <p className="text-xs text-muted-foreground">Para todos os selecionados</p>
            </div>
            <Switch checked={banUser} onCheckedChange={setBanUser} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(newStatus, reason, banUser)}
            disabled={!reason || isLoading}
            variant={newStatus === 'inactive' ? 'destructive' : 'default'}
          >
            {isLoading ? "Processando..." : `Alterar ${selectedCount} colaborador${selectedCount !== 1 ? 'es' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════ */

export default function Colaboradores() {
  const { canManageStructure } = usePermissions();
  
  const {
    filters,
    setArea,
    setSubarea,
    setPosition,
    clearFilters,
    hasActiveFilters,
  } = useHierarchyFilter();

  const {
    data: employees,
    isLoading,
    isFetching,
    isError,
    changeEmployeeStatus,
    bulkChangeStatus,
  } = useEmployees({
    area_id: filters.area_id,
    subarea_id: filters.subarea_id,
    position_id: filters.position_id,
  });
  const { data: positionHierarchy } = usePositionHierarchy();

  const employeeIds = useMemo(() => (employees || []).map(e => e.id), [employees]);
  const { data: employeeProjectsMap } = useEmployeeProjects(employeeIds);
  const { data: employeeTaskCounts } = useEmployeeTaskCounts(employeeIds);

  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithDetails | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithDetails | null>(null);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Status change dialog
  const [statusChangeEmployee, setStatusChangeEmployee] = useState<EmployeeWithDetails | null>(null);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedManager = useMemo(() => {
    if (!selectedEmployee?.position_id || !employees || !positionHierarchy?.map) return null;
    const position = positionHierarchy.map.get(selectedEmployee.position_id);
    if (!position?.reports_to_id) return null;
    return employees.find((e) => e.position_id === position.reports_to_id) || null;
  }, [selectedEmployee, employees, positionHierarchy]);

  const selectedDirectReports = useMemo(() => {
    if (!selectedEmployee?.position_id || !employees || !positionHierarchy?.map) return [];
    const directReportPositionIds = new Set<string>();
    for (const [positionId, position] of positionHierarchy.map) {
      if (position.reports_to_id === selectedEmployee.position_id) {
        directReportPositionIds.add(positionId);
      }
    }
    return employees.filter((e) => e.position_id && directReportPositionIds.has(e.position_id));
  }, [selectedEmployee, employees, positionHierarchy]);

  // Status counts
  const statusCounts = useMemo(() => {
    if (!employees) return { active: 0, inactive: 0, on_leave: 0 };
    return {
      active: employees.filter(e => e.status === 'active').length,
      inactive: employees.filter(e => e.status === 'inactive').length,
      on_leave: employees.filter(e => e.status === 'on_leave').length,
    };
  }, [employees]);

  const filtered = useMemo(() => {
    if (!employees) return [];
    return employees.filter((e) => {
      const matchSearch =
        !search ||
        e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        e.position_title?.toLowerCase().includes(search.toLowerCase()) ||
        e.work_email?.toLowerCase().includes(search.toLowerCase()) ||
        e.area_name?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === "all" || e.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [employees, search, filterStatus]);

  if (isLoading || employees === undefined) {
    return <ListSkeleton columns={3} count={6} />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={<AlertTriangle className="w-8 h-8 text-danger" />}
        title="Erro ao carregar colaboradores"
        description="Não foi possível buscar os dados. Tente recarregar a página."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h1 font-bold text-foreground">Colaboradores</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} colaborador{filtered.length !== 1 ? 'es' : ''} 
            {hasActiveFilters && ' (filtrado)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Status counter badges */}
          <div className="hidden sm:flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs gap-1 border-success/30 text-success cursor-pointer" onClick={() => setFilterStatus(filterStatus === 'active' ? 'all' : 'active')}>
              <Circle className="w-2 h-2 fill-current" /> {statusCounts.active} ativos
            </Badge>
            {statusCounts.inactive > 0 && (
              <Badge variant="outline" className="text-xs gap-1 border-danger/30 text-danger cursor-pointer" onClick={() => setFilterStatus(filterStatus === 'inactive' ? 'all' : 'inactive')}>
                <Circle className="w-2 h-2 fill-current" /> {statusCounts.inactive} inativos
              </Badge>
            )}
            {statusCounts.on_leave > 0 && (
              <Badge variant="outline" className="text-xs gap-1 border-warning/30 text-warning cursor-pointer" onClick={() => setFilterStatus(filterStatus === 'on_leave' ? 'all' : 'on_leave')}>
                <Circle className="w-2 h-2 fill-current" /> {statusCounts.on_leave} afastados
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => {
            exportAsCSV(filtered, [
              { key: "full_name", label: "Nome" },
              { key: "position_title", label: "Cargo" },
              { key: "area_name", label: "Área" },
              { key: "work_email", label: "Email" },
              { key: "status", label: "Status" },
            ], "colaboradores");
          }}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <PermissionGuard allow={["admin"]}>
            <Button onClick={() => { setEditingEmployee(null); setShowForm(true); }} className="gap-2">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline"> Novo Colaborador</span>
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, cargo ou departamento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
              <SelectItem value="on_leave">Afastados</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "bg-accent")}
          >
            <Filter className="w-4 h-4" />
          </Button>
        </div>

        {hasActiveFilters && !showFilters && (
          <HierarchyFilterBadges
            areaId={filters.area_id}
            subareaId={filters.subarea_id}
            positionId={filters.position_id}
            onClear={clearFilters}
          />
        )}

        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <CollapsibleContent>
            <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
              <HierarchyFilter
                areaId={filters.area_id}
                subareaId={filters.subarea_id}
                positionId={filters.position_id}
                onAreaChange={setArea}
                onSubareaChange={setSubarea}
                onPositionChange={setPosition}
                onClear={clearFilters}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 flex items-center justify-between px-4 py-3 rounded-lg bg-primary text-primary-foreground shadow-lg animate-fade-in">
          <span className="text-sm font-medium">
            {selectedIds.size} colaborador{selectedIds.size !== 1 ? 'es' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowBulkDialog(true)}>
              <UserCog className="w-4 h-4 mr-1" /> Alterar Status
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} className="text-primary-foreground hover:text-primary-foreground/80">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Grid */}
      {!employees || employees.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8 text-muted-foreground" />}
          title="Nenhum colaborador cadastrado"
          description="Cadastre colaboradores para visualizá-los aqui."
          action={
            <Button onClick={() => { setEditingEmployee(null); setShowForm(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Cadastrar Colaborador
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="w-8 h-8 text-muted-foreground" />}
          title="Nenhum resultado encontrado"
          description={hasActiveFilters ? "Tente ajustar os filtros ou limpar a busca." : "Nenhum colaborador corresponde aos critérios."}
        />
      ) : (
        <AnimatedList className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((emp) => (
            <EmployeeCard
              key={emp.id}
              employee={emp}
              projects={employeeProjectsMap?.[emp.id] || []}
              taskCounts={employeeTaskCounts?.[emp.id]}
              onEdit={() => { setEditingEmployee(emp); setShowForm(true); }}
              onClick={() => setSelectedEmployee(emp)}
              onChangeStatus={() => setStatusChangeEmployee(emp)}
              isSelected={selectedIds.has(emp.id)}
              onToggleSelect={() => toggleSelect(emp.id)}
              showSelection={selectedIds.size > 0}
            />
          ))}
        </AnimatedList>
      )}

      {/* Form Dialog */}
      <EmployeeFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        existing={editingEmployee}
      />

      {/* Detail Modal */}
      <EmployeeDetailModal
        employee={selectedEmployee}
        manager={selectedManager}
        directReports={selectedDirectReports}
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        onSelectEmployee={setSelectedEmployee}
        allEmployees={employees}
      />

      {/* Status Change Dialog */}
      <StatusChangeDialog
        open={!!statusChangeEmployee}
        onOpenChange={(v) => { if (!v) setStatusChangeEmployee(null); }}
        employee={statusChangeEmployee}
        onConfirm={async (payload) => {
          try {
            await changeEmployeeStatus.mutateAsync(payload);
            toast.success(`Status alterado para ${payload.newStatus === 'active' ? 'Ativo' : payload.newStatus === 'inactive' ? 'Inativo' : 'Afastado'}`);
            setStatusChangeEmployee(null);
          } catch (err: any) {
            toast.error(err.message || "Erro ao alterar status");
          }
        }}
        isLoading={changeEmployeeStatus.isPending}
      />

      {/* Bulk Status Dialog */}
      <BulkStatusDialog
        open={showBulkDialog}
        onOpenChange={setShowBulkDialog}
        selectedCount={selectedIds.size}
        onConfirm={async (newStatus, reason, banUser) => {
          try {
            await bulkChangeStatus.mutateAsync({
              employeeIds: Array.from(selectedIds),
              newStatus,
              reason,
              banUser,
            });
            toast.success(`${selectedIds.size} colaborador${selectedIds.size !== 1 ? 'es' : ''} atualizado${selectedIds.size !== 1 ? 's' : ''}`);
            setShowBulkDialog(false);
            clearSelection();
          } catch (err: any) {
            toast.error(err.message || "Erro ao alterar status em lote");
          }
        }}
        isLoading={bulkChangeStatus.isPending}
      />
    </div>
  );
}

/* ════════════════════════════════════════════
   EMPLOYEE CARD - Aprimorado com métricas
   ════════════════════════════════════════════ */

function EmployeeCard({ employee, projects, taskCounts, onEdit, onClick, onChangeStatus, isSelected, onToggleSelect, showSelection }: { 
  employee: EmployeeWithDetails; 
  projects?: EmployeeProjectInfo[];
  taskCounts?: { doing: number; overdue: number; done: number; total: number };
  onEdit: () => void; 
  onClick: () => void;
  onChangeStatus: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  showSelection: boolean;
}) {
  const { canManageStructure } = usePermissions();
  const isActive = employee.status === "active";
  const isCeo = employee.is_ceo === true;

  const avatarColorClass = employee.area_type === "acquisition"
    ? "bg-area-acquisition"
    : employee.area_type === "delivery"
    ? "bg-area-delivery"
    : employee.area_type === "operation"
    ? "bg-area-operation"
    : "bg-primary";

  const workload = (employee.pending_tasks || 0);
  const workloadColor = workload > 10 ? "bg-danger" : workload > 5 ? "bg-warning" : "bg-success";
  const topProjects = (projects || []).slice(0, 3);
  const tc = taskCounts;

  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-5 border border-border/60 rounded-xl entity-card-hover group cursor-pointer bg-card relative",
        !isActive && "opacity-50",
        isSelected && "ring-2 ring-primary border-primary"
      )}
    >
      {/* Selection checkbox */}
      {(showSelection || canManageStructure) && (
        <div className={cn(
          "absolute top-2 left-2 transition-opacity",
          showSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect()}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4"
          />
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {employee.avatar_url ? (
            <img
              src={employee.avatar_url}
              alt={employee.full_name || ""}
              className="w-12 h-12 rounded-full object-cover ring-2 ring-border/30"
            />
          ) : (
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-border/20",
              avatarColorClass
            )}>
              {(employee.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          )}
          {isCeo && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-warning flex items-center justify-center">
              <Crown className="w-3 h-3 text-warning-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground truncate">
            {employee.full_name || "Sem nome"}
          </h3>

          {employee.position_title && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {employee.position_title}
            </p>
          )}

          {employee.area_name && (
            <div className="mt-2 flex items-center gap-1.5">
              <Circle 
                className="w-2 h-2 fill-current" 
                style={{ color: employee.area_color || 'hsl(var(--primary))' }} 
              />
              <span className="text-xs text-muted-foreground">
                {employee.subarea_name || employee.area_name}
              </span>
            </div>
          )}

          {/* Status badge for non-active */}
          {employee.status !== 'active' && (
            <div className="mt-1.5">
              <StatusBadge status={employee.status || "active"} size="sm" />
            </div>
          )}

          {tc && tc.total > 0 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {tc.overdue > 0 && (
                <Badge variant="outline" className="text-2xs border-danger/30 text-danger gap-1 px-1.5 py-0">
                  {tc.overdue} atrasada{tc.overdue !== 1 ? 's' : ''}
                </Badge>
              )}
              {tc.doing > 0 && (
                <Badge variant="outline" className="text-2xs border-info/30 text-info gap-1 px-1.5 py-0">
                  {tc.doing} em progresso
                </Badge>
              )}
              <Badge variant="outline" className="text-2xs border-success/30 text-success gap-1 px-1.5 py-0">
                {tc.done}/{tc.total} concluídas
              </Badge>
            </div>
          )}

          {topProjects.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {topProjects.map(proj => {
                const statusColor = proj.status === 'completed' ? 'text-success' 
                  : proj.status === 'active' ? 'text-info' 
                  : proj.status === 'on_hold' ? 'text-warning' 
                  : 'text-muted-foreground';
                return (
                  <div key={proj.id} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-2xs text-muted-foreground truncate max-w-[140px]" title={proj.name}>
                        {proj.name}
                      </span>
                      <span className={cn("text-2xs font-medium", statusColor)}>
                        {proj.progress}%
                      </span>
                    </div>
                    <Progress value={proj.progress} className="h-1" />
                  </div>
                );
              })}
              {(projects || []).length > 3 && (
                <span className="text-2xs text-muted-foreground">
                  +{(projects || []).length - 3} projeto{(projects || []).length - 3 !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {topProjects.length === 0 && workload > 0 && (
            <div className="mt-3 flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", workloadColor)} />
              <span className="text-xs text-muted-foreground">
                {workload} tarefa{workload !== 1 ? 's' : ''} pendente{workload !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Admin actions */}
        {canManageStructure && (
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => { e.stopPropagation(); onChangeStatus(); }}
              title="Alterar status"
            >
              <UserCog className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════
   EMPLOYEE FORM DIALOG
   ════════════════════════════════════════════ */

function EmployeeFormDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: EmployeeWithDetails | null;
}) {
  const { canManageStructure } = usePermissions();
  const { createEmployee, updateEmployee, setEmployeePosition } = useEmployees();
  const { data: areas } = useAreas();
  const { data: allSubareas } = useSubareas();
  const { data: allPositions } = usePositions();

  const isEditing = !!existing;

  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [positionId, setPositionId] = useState<string>("");
  const [selectedAreaType, setSelectedAreaType] = useState<string>("");
  const [selectedSubareaId, setSelectedSubareaId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("member");
  const [isCeo, setIsCeo] = useState<boolean>(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && existing) {
      setFullName(existing.full_name || "");
      setWorkEmail(existing.work_email || "");
      setPhone(existing.phone || "");
      setPositionId(existing.position_id || "");
      setSelectedAreaType(existing.area_type || "");
      if (existing.position_id && allPositions) {
        const pos = allPositions.find((p) => p.id === existing.position_id);
        setSelectedSubareaId(pos?.subarea_id || "");
      } else {
        setSelectedSubareaId("");
      }
      setAvatarPreview(existing.avatar_url || null);
      setAvatarFile(null);
      setSelectedRole("member");
      setIsCeo(existing.is_ceo === true);
    } else if (open && !existing) {
      setFullName(""); setWorkEmail(""); setPhone(""); setPositionId("");
      setSelectedAreaType(""); setSelectedSubareaId("");
      setSelectedRole("member"); setIsCeo(false); setAvatarPreview(null); setAvatarFile(null);
      setInviteSent(false);
      setTempPassword(null);
    }
  }, [open, existing, allPositions]);

  const filteredSubareas = allSubareas?.filter((s) => {
    if (!selectedAreaType) return true;
    const area = areas?.find((a) => a.type === selectedAreaType);
    return area ? s.area_id === area.id : true;
  }) || [];

  const filteredPositions = useMemo(() => {
    if (!allPositions) return [];
    
    // If a subarea is selected, show only positions for that subarea
    if (selectedSubareaId) {
      return allPositions.filter((p) => p.subarea_id === selectedSubareaId);
    }
    
    // If an area type is selected, show only positions for that area (including director)
    if (selectedAreaType) {
      const area = areas?.find((a) => a.type === selectedAreaType);
      if (area) {
        return allPositions.filter((p) => p.area_id === area.id);
      }
      // If area not found, return empty array (don't show all positions)
      return [];
    }
    
    // No filter selected - return empty to avoid confusion
    return [];
  }, [allPositions, selectedSubareaId, selectedAreaType, areas]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("A imagem deve ter no máximo 2MB"); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!isEditing && !workEmail.trim()) { toast.error("E-mail é obrigatório"); return; }
    setSaving(true);
    try {
      if (isEditing) {
        await updateEmployee.mutateAsync({
          id: existing.id,
          work_email: workEmail.trim() || null,
          phone: phone.trim() || null,
          is_ceo: isCeo as any,
        });
        const newPosId = positionId || null;
        if (newPosId !== existing.position_id) {
          await setEmployeePosition.mutateAsync({ employeeId: existing.id, positionId: newPosId });
        }
        if (avatarFile) {
          const url = await uploadAvatar(avatarFile, existing.id);
          await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", existing.user_id!);
        }
        await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("user_id", existing.user_id!);
        toast.success("Colaborador atualizado!");
      } else {
        const result = await createEmployee.mutateAsync({
          full_name: fullName.trim(),
          email: workEmail.trim(),
          position_id: positionId || undefined,
          phone: phone.trim() || undefined,
          work_email: workEmail.trim(),
          role: selectedRole as "admin" | "manager" | "member",
          is_ceo: isCeo || undefined,
        });
        if (result?.temp_password) {
          setTempPassword(result.temp_password);
          setInviteSent(!!result.invite_sent);
        }
        toast.success(
          result?.invite_sent
            ? "Colaborador criado! Senha temporária enviada por email."
            : "Colaborador criado com senha temporária"
        );
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (!canManageStructure) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
              {avatarPreview ? (
                <img src={avatarPreview} className="w-16 h-16 rounded-full object-cover" alt="Avatar" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <div className="flex-1">
              <Label>Nome completo *</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome do colaborador" />
            </div>
          </div>

          {!isEditing && (
            <div>
              <Label>E-mail (login) *</Label>
              <Input type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} placeholder="email@empresa.com" />
            </div>
          )}

          {isEditing && (
            <div>
              <Label>E-mail profissional</Label>
              <Input type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} placeholder="email@empresa.com" />
            </div>
          )}

          <div>
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Área</Label>
              <Select value={selectedAreaType} onValueChange={(v) => { setSelectedAreaType(v); setSelectedSubareaId(""); setPositionId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {(areas || []).map((a) => (
                    <SelectItem key={a.id} value={a.type}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subárea</Label>
              <Select value={selectedSubareaId} onValueChange={(v) => { setSelectedSubareaId(v); setPositionId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {filteredSubareas.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Cargo</Label>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger><SelectValue placeholder="Selecionar cargo" /></SelectTrigger>
              <SelectContent>
                {filteredPositions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                    {p.area_id && !p.subarea_id && <span className="text-xs text-muted-foreground ml-1">(Diretor)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedAreaType && !selectedSubareaId && (
              <p className="text-xs text-muted-foreground mt-1">
                Selecione uma área para ver os cargos disponíveis
              </p>
            )}
          </div>

          {!isEditing && (
            <div>
              <Label>Papel de acesso</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="member">Membro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {!isEditing && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Uma <strong className="text-foreground">senha temporária</strong> será gerada e exibida
                para você repassar. O colaborador também recebe por email a senha, o endereço da
                plataforma e o aviso de trocá-la assim que entrar.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id="is-ceo" checked={isCeo} onChange={(e) => setIsCeo(e.target.checked)} className="rounded" />
            <Label htmlFor="is-ceo" className="cursor-pointer">Marcar como CEO</Label>
          </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tempPassword} onOpenChange={(nextOpen) => { if (!nextOpen) setTempPassword(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Senha temporária
            </DialogTitle>
            <DialogDescription>
              {inviteSent
                ? "Já enviamos esta senha por email ao colaborador, junto com o link da plataforma. Guarde-a também para repassar caso o email não chegue."
                : "O email não pôde ser enviado — repasse esta senha ao colaborador manualmente."}
              {" "}Ele pode trocá-la assim que entrar.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="mb-1 text-xs text-muted-foreground">Senha gerada</p>
            <p className="break-all font-mono text-base">{tempPassword}</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!tempPassword) return;
                await navigator.clipboard.writeText(tempPassword);
                toast.success("Senha temporária copiada");
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar senha
            </Button>
            <Button type="button" onClick={() => setTempPassword(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
