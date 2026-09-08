import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  User, Mail, Phone, Calendar, Crown, Briefcase, CheckSquare,
  ChevronRight, X, ExternalLink, Clock, Target, Users,
  Maximize2, Minimize2, MapPin, Award, TrendingUp, History,
  UserCog,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { parseDateSafe, isTaskOverdue } from "@/lib/date-utils";
import { type EmployeeWithDetails, useEmployeeStatusHistory } from "@/hooks/useEmployees";
import { AvatarBadge, StatusBadge } from "@/components/shared/SharedComponents";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════ */

interface ProjectInfo {
  id: string;
  name: string;
  status: string;
  priority: string | null;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  role_in_project: string | null;
}

interface TaskInfo {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_name: string | null;
  project_id: string | null;
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */

interface EmployeeDetailModalProps {
  employee: EmployeeWithDetails | null;
  manager: EmployeeWithDetails | null;
  directReports: EmployeeWithDetails[];
  open: boolean;
  onClose: () => void;
  onSelectEmployee?: (emp: EmployeeWithDetails) => void;
  allEmployees?: EmployeeWithDetails[];
}

export function EmployeeDetailModal({
  employee,
  manager,
  directReports,
  open,
  onClose,
  onSelectEmployee,
  allEmployees,
}: EmployeeDetailModalProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  // Fetch status history
  const { data: statusHistory, isLoading: historyLoading } = useEmployeeStatusHistory(
    open && employee ? employee.id : undefined
  );

  // Fetch projects and tasks for this employee
  useEffect(() => {
    if (!employee || !open) return;

    const fetchData = async () => {
      setLoadingData(true);
      try {
        let epQuery = supabase
          .from("employee_projects")
          .select("project_id, role_in_project")
          .eq("employee_id", employee.id);
        if (tenantId) epQuery = epQuery.eq("tenant_id", tenantId);
        const { data: epData } = await epQuery;

        if (epData && epData.length > 0) {
          const projectIds = epData.map((ep) => ep.project_id);
          const { data: projData } = await supabase
            .from("projects")
            .select("id, name, status, priority, progress, start_date, end_date")
            .in("id", projectIds);

          const roleMap = new Map(epData.map((ep) => [ep.project_id, ep.role_in_project]));
          setProjects(
            (projData || []).map((p) => ({
              ...p,
              status: p.status || "planning",
              progress: p.progress || 0,
              role_in_project: roleMap.get(p.id) || null,
            }))
          );
        } else {
          setProjects([]);
        }

        const { data: taskData } = await supabase
          .from("tasks")
          .select("id, title, status, priority, due_date, project_id")
          .eq("assignee_id", employee.id)
          // Subtarefa nao e item de lista: ela pertence a tarefa-mae e e
          // exibida dentro dela (TaskDetailModal). Sem este filtro, uma tarefa
          // vinda de reuniao com 3 subtarefas aparecia aqui como 4 itens de
          // titulo parecido — que e o "tarefa duplicada" relatado. O Kanban
          // (useTasks) sempre filtrou; estas duas telas e que escaparam.
          .is("parent_task_id", null)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(20);

        if (taskData && taskData.length > 0) {
          const projIds = [...new Set(taskData.filter((t) => t.project_id).map((t) => t.project_id!))] as string[];
          let projNameMap = new Map<string, string>();
          if (projIds.length > 0) {
            const { data: pNames } = await supabase
              .from("projects")
              .select("id, name")
              .in("id", projIds);
            projNameMap = new Map((pNames || []).map((p) => [p.id, p.name]));
          }

          setTasks(
            taskData.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status || "backlog",
              priority: t.priority || "medium",
              due_date: t.due_date,
              project_name: t.project_id ? projNameMap.get(t.project_id) || null : null,
              project_id: t.project_id || null,
            }))
          );
        } else {
          setTasks([]);
        }
      } catch (err) {
        console.error("Error fetching employee details:", err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [employee?.id, open]);

  if (!employee) return null;

  const isCeo = employee.is_ceo === true;
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const inProgressTasks = tasks.filter((t) => t.status === "doing").length;
  const overdueTasks = tasks.filter(
    (t) => t.due_date && isTaskOverdue(t.due_date) && t.status !== "done"
  ).length;

  const handleNavigateToProject = (projectId: string) => {
    onClose();
    navigate(`/projetos/${projectId}`);
  };

  const handleNavigateToTasks = () => {
    onClose();
    navigate("/tarefas");
  };

  const handleSelectPerson = (emp: EmployeeWithDetails) => {
    if (onSelectEmployee) {
      onSelectEmployee(emp);
    }
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start gap-4 pb-4">
        <AvatarBadge
          name={employee.full_name || "?"}
          avatarUrl={employee.avatar_url}
          size="xl"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isCeo && <Crown className="w-4 h-4 text-warning flex-shrink-0" />}
            <h2 className="text-lg font-bold text-foreground truncate">
              {employee.full_name || "Sem nome"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {employee.position_title || (isCeo ? "CEO" : "Sem cargo")}
          </p>
          {employee.area_name && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {employee.area_name}
              {employee.subarea_name && employee.subarea_name !== "Diretoria" ? ` › ${employee.subarea_name}` : ""}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <StatusBadge status={employee.status || "active"} size="sm" />
            {employee.level && (
              <Badge variant="outline" className="text-2xs">
                Nível {employee.level}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setFullscreen(!fullscreen)}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <QuickStat
          icon={<Briefcase className="w-3.5 h-3.5 text-info" />}
          value={projects.length}
          label="Projetos"
          onClick={() => { }}
        />
        <QuickStat
          icon={<CheckSquare className="w-3.5 h-3.5 text-warning" />}
          value={tasks.length}
          label="Tarefas"
          onClick={handleNavigateToTasks}
        />
        <QuickStat
          icon={<Users className="w-3.5 h-3.5 text-success" />}
          value={directReports.length}
          label="Subordinados"
          onClick={() => { }}
        />
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto scrollbar-thin">
          <TabsList className="w-full inline-flex min-w-min">
            <TabsTrigger value="overview" className="text-xs whitespace-nowrap">Geral</TabsTrigger>
            <TabsTrigger value="projects" className="text-xs whitespace-nowrap">
              Projetos {projects.length > 0 && <span className="ml-1 text-2xs opacity-60">({projects.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs whitespace-nowrap">
              Tarefas {tasks.length > 0 && <span className="ml-1 text-2xs opacity-60">({tasks.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="team" className="text-xs whitespace-nowrap">Equipe</TabsTrigger>
            <TabsTrigger value="history" className="text-xs whitespace-nowrap">
              Histórico {(statusHistory?.length ?? 0) > 0 && <span className="ml-1 text-2xs opacity-60">({statusHistory?.length})</span>}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-4 mt-4 overflow-y-auto flex-1">
          <Section title="Contato">
            <ContactRow icon={<Mail className="w-4 h-4" />} label="Email" value={employee.work_email} href={employee.work_email ? `mailto:${employee.work_email}` : undefined} />
            <ContactRow icon={<Phone className="w-4 h-4" />} label="Telefone" value={employee.phone} href={employee.phone ? `tel:${employee.phone}` : undefined} />
            <ContactRow
              icon={<Calendar className="w-4 h-4" />}
              label="Admissão"
              value={employee.admission_date ? new Date(employee.admission_date).toLocaleDateString("pt-BR") : null}
            />
            {(employee as any).termination_date && (
              <ContactRow
                icon={<Calendar className="w-4 h-4" />}
                label="Desligamento"
                value={new Date((employee as any).termination_date).toLocaleDateString("pt-BR")}
              />
            )}
            {(employee as any).status_reason && (
              <InfoRow label="Motivo do status" value={(employee as any).status_reason} />
            )}
          </Section>

          <Section title="Cargo e Área">
            <InfoRow label="Cargo" value={employee.position_title || (isCeo ? "CEO" : null)} />
            <InfoRow label="Área" value={employee.area_name} />
            <InfoRow label="Subárea" value={employee.subarea_name} />
            {employee.level && <InfoRow label="Nível" value={String(employee.level)} />}
            {employee.positions && employee.positions.length > 1 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Cargos adicionais:</p>
                <div className="flex flex-wrap gap-1">
                  {employee.positions
                    .filter((p) => !p.is_primary)
                    .map((p) => (
                      <Badge key={p.position_id} variant="secondary" className="text-2xs">
                        {p.title}
                      </Badge>
                    ))}
                </div>
              </div>
            )}
          </Section>

          {manager && (
            <Section title="Gestor">
              <PersonRow
                employee={manager}
                subtitle={manager.position_title || "CEO"}
                onClick={() => handleSelectPerson(manager)}
              />
            </Section>
          )}

          {tasks.length > 0 && (
            <Section title="Resumo de Tarefas">
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Em andamento" value={inProgressTasks} color="text-info" />
                <MiniStat label="Concluídas" value={completedTasks} color="text-success" />
                <MiniStat label="Atrasadas" value={overdueTasks} color="text-danger" />
              </div>
            </Section>
          )}
        </TabsContent>

        {/* ── PROJECTS TAB ── */}
        <TabsContent value="projects" className="space-y-3 mt-4 overflow-y-auto flex-1">
          {loadingData ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum projeto atribuído</p>
            </div>
          ) : (
            projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => handleNavigateToProject(project.id)}
              />
            ))
          )}
        </TabsContent>

        {/* ── TASKS TAB ── */}
        <TabsContent value="tasks" className="space-y-2 mt-4 overflow-y-auto flex-1">
          {loadingData ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8">
              <CheckSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma tarefa atribuída</p>
            </div>
          ) : (
            <>
              {["doing", "todo", "review", "backlog", "done"].map((status) => {
                const statusTasks = tasks.filter((t) => t.status === status);
                if (statusTasks.length === 0) return null;
                return (
                  <div key={status}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {STATUS_LABELS[status] || status} ({statusTasks.length})
                    </h4>
                    <div className="space-y-1.5 mb-3">
                      {statusTasks.map((task) => (
                        <TaskRow key={task.id} task={task} onClick={() => { onClose(); navigate(task.project_id ? `/projetos/${task.project_id}` : "/tarefas"); }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </TabsContent>

        {/* ── TEAM TAB ── */}
        <TabsContent value="team" className="space-y-4 mt-4 overflow-y-auto flex-1">
          {manager && (
            <Section title="Gestor">
              <PersonRow
                employee={manager}
                subtitle={manager.position_title || "CEO"}
                onClick={() => handleSelectPerson(manager)}
              />
            </Section>
          )}

          <Section title={`Subordinados diretos (${directReports.length})`}>
            {directReports.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum subordinado direto.
              </p>
            ) : (
              <div className="space-y-1.5">
                {directReports.map((dr) => (
                  <PersonRow
                    key={dr.id}
                    employee={dr}
                    subtitle={dr.position_title || "Sem cargo"}
                    onClick={() => handleSelectPerson(dr)}
                    showStats
                  />
                ))}
              </div>
            )}
          </Section>
        </TabsContent>

        {/* ── HISTORY TAB ── */}
        <TabsContent value="history" className="space-y-3 mt-4 overflow-y-auto flex-1">
          {historyLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando histórico...</p>
          ) : !statusHistory || statusHistory.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma mudança de status registrada</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
              <div className="space-y-4">
                {statusHistory.map((entry, i) => {
                  const statusLabels: Record<string, string> = {
                    active: "Ativo",
                    inactive: "Inativo",
                    on_leave: "Afastado",
                  };
                  const statusColors: Record<string, string> = {
                    active: "bg-success",
                    inactive: "bg-danger",
                    on_leave: "bg-warning",
                  };
                  return (
                    <div key={entry.id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute left-2.5 top-1.5 w-3 h-3 rounded-full ring-2 ring-background",
                        statusColors[entry.new_status] || "bg-muted"
                      )} />
                      <div className="p-3 rounded-lg border border-border/50 bg-card">
                        <div className="flex items-center gap-2 mb-1">
                          {entry.old_status && (
                            <>
                              <Badge variant="outline" className="text-2xs">
                                {statusLabels[entry.old_status] || entry.old_status}
                              </Badge>
                              <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            </>
                          )}
                          <Badge variant="secondary" className="text-2xs">
                            {statusLabels[entry.new_status] || entry.new_status}
                          </Badge>
                        </div>
                        {entry.reason && (
                          <p className="text-sm text-foreground">{entry.reason}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 text-2xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(entry.created_at).toLocaleDateString("pt-BR")} às {new Date(entry.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</span>
                          {entry.changed_by_name && (
                            <>
                              <span>•</span>
                              <span>por {entry.changed_by_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  if (fullscreen) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setFullscreen(false); onClose(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:w-[420px] md:w-[480px] overflow-y-auto p-5">
        {content}
      </SheetContent>
    </Sheet>
  );
}

/* ════════════════════════════════════════════
   HELPER COMPONENTS
   ════════════════════════════════════════════ */

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "A Fazer",
  doing: "Em Andamento",
  review: "Em Revisão",
  done: "Concluído",
};

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-muted text-muted-foreground",
  active: "bg-info-light text-info",
  on_hold: "bg-warning-light text-warning",
  completed: "bg-success-light text-success",
  cancelled: "bg-danger-light text-danger",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-info",
  high: "text-warning",
  urgent: "text-danger",
};

function QuickStat({ icon, value, label, onClick }: { icon: React.ReactNode; value: number; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center p-2.5 rounded-lg bg-muted/50 border border-border/50 hover:bg-muted transition-colors"
    >
      {icon}
      <span className="text-lg font-bold text-foreground mt-0.5">{value}</span>
      <span className="text-2xs text-muted-foreground">{label}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ContactRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value?: string | null; href?: string }) {
  if (!value) return null;
  const content = (
    <div className={cn("flex items-center gap-2 text-sm p-2 rounded-lg", href && "hover:bg-muted cursor-pointer transition-colors")}>
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground text-xs">{label}:</span>
      <span className={cn("font-medium text-foreground truncate flex-1", href && "text-primary underline-offset-2 hover:underline")}>
        {value}
      </span>
      {href && <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
    </div>
  );

  if (href) {
    return <a href={href} target={href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer">{content}</a>;
  }
  return content;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground text-xs">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/30">
      <p className={cn("text-lg font-bold", color)}>{value}</p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  );
}

function PersonRow({
  employee,
  subtitle,
  onClick,
  showStats,
}: {
  employee: EmployeeWithDetails;
  subtitle: string;
  onClick?: () => void;
  showStats?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/30",
        onClick && "cursor-pointer hover:bg-muted transition-colors"
      )}
    >
      <AvatarBadge name={employee.full_name || "?"} avatarUrl={employee.avatar_url} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{employee.full_name}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      {showStats && (
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          {(employee.active_projects ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <Briefcase className="w-3 h-3" /> {employee.active_projects}
            </span>
          )}
          {(employee.pending_tasks ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <CheckSquare className="w-3 h-3" /> {employee.pending_tasks}
            </span>
          )}
        </div>
      )}
      <StatusBadge status={employee.status || "active"} size="sm" />
      {onClick && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
    </div>
  );
}

function ProjectCard({ project, onClick }: { project: ProjectInfo; onClick: () => void }) {
  const statusClass = STATUS_COLORS[project.status] || STATUS_COLORS.planning;
  const isOverdue = project.end_date && new Date(project.end_date) < new Date() && project.status !== "completed";

  return (
    <div
      onClick={onClick}
      className="p-3 rounded-lg border border-border bg-card hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {project.name}
          </h4>
          {project.role_in_project && (
            <span className="text-2xs text-muted-foreground capitalize">{project.role_in_project}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className={cn("text-2xs", statusClass)}>
            {project.status === "active" ? "Ativo" : project.status === "completed" ? "Concluído" : project.status === "on_hold" ? "Pausado" : project.status === "planning" ? "Planejamento" : project.status}
          </Badge>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Progress value={project.progress} className="flex-1 h-2" />
        <span className="text-xs font-semibold text-muted-foreground w-8 text-right">{project.progress}%</span>
      </div>

      {(project.start_date || project.end_date) && (
        <div className="flex items-center gap-2 mt-2 text-2xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {project.start_date && (
            <span>{new Date(project.start_date).toLocaleDateString("pt-BR")}</span>
          )}
          {project.start_date && project.end_date && <span>→</span>}
          {project.end_date && (
            <span className={cn(isOverdue && "text-danger font-semibold")}>
              {new Date(project.end_date).toLocaleDateString("pt-BR")}
              {isOverdue && " (Atrasado)"}
            </span>
          )}
        </div>
      )}

      {project.priority && (
        <div className="flex items-center gap-1 mt-1">
          <TrendingUp className={cn("w-3 h-3", PRIORITY_COLORS[project.priority] || "text-muted-foreground")} />
          <span className="text-2xs text-muted-foreground capitalize">{project.priority}</span>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onClick }: { task: TaskInfo; onClick?: () => void }) {
  const isOverdue = task.due_date && isTaskOverdue(task.due_date) && task.status !== "done";
  const priorityColor = PRIORITY_COLORS[task.priority] || "text-muted-foreground";

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg bg-card border border-border/50 hover:bg-muted/30 transition-colors",
        onClick && "cursor-pointer hover:shadow-sm"
      )}
    >
      <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", priorityColor.replace("text-", "bg-"))} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm text-foreground truncate", onClick && "group-hover:text-primary")}>{task.title}</p>
        {task.project_name && (
          <p className="text-2xs text-muted-foreground truncate">{task.project_name}</p>
        )}
      </div>
      {task.due_date && (
        <span className={cn("text-2xs flex-shrink-0", isOverdue ? "text-danger font-semibold" : "text-muted-foreground")}>
          {parseDateSafe(task.due_date).toLocaleDateString("pt-BR")}
        </span>
      )}
      <Badge variant="outline" className="text-2xs flex-shrink-0">
        {STATUS_LABELS[task.status] || task.status}
      </Badge>
      {onClick && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
    </div>
  );
}
