import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { DashboardSkeleton } from "@/components/shared/SmartSkeleton";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Flag, Circle, CircleDot, CircleCheck, AlertTriangle, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { useEmployees } from "@/hooks/useEmployees";
import { useProjects } from "@/hooks/useProjects";
import { useTasks, type TaskWithDetails } from "@/hooks/useTasks";
import { useProcesses } from "@/hooks/useProcesses";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { BirthdayBoard } from "@/components/shared/BirthdayBoard";
import { parseDateSafe, isTaskOverdue } from "@/lib/date-utils";
import { format, isToday, isThisWeek, isValid, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ════════════════════════════════════════════
   FLAT MODERN — DASHBOARD
   100% fiel ao artboard "Dashboard / Início"
   ════════════════════════════════════════════ */

function Card({
  title, action, children, className, onMouseEnter, onMouseLeave,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      className={cn("bg-card rounded-md shadow-sm flex flex-col", className)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <h3 className="text-[13.5px] font-semibold">{title}</h3>
          {action}
        </div>
      )}
      <div className={cn("flex-1", title && "pt-1")}>{children}</div>
    </div>
  );
}

function PriorityFlag({ level }: { level: string | null }) {
  const colors: Record<string, string> = {
    urgent: "text-danger",
    high: "text-warning",
    medium: "text-info",
    low: "text-muted-foreground/60",
  };
  return <Flag className={cn("w-3.5 h-3.5 flex-shrink-0", colors[level || "medium"])} />;
}

function StatusIcon({ status }: { status: string | null }) {
  const map: Record<string, { Icon: any; color: string }> = {
    backlog: { Icon: Circle, color: "text-muted-foreground/60" },
    todo: { Icon: Circle, color: "text-info" },
    doing: { Icon: CircleDot, color: "text-warning" },
    review: { Icon: CircleDot, color: "text-primary" },
    done: { Icon: CircleCheck, color: "text-success" },
  };
  const cfg = map[status || "todo"] || map.todo;
  const Ico = cfg.Icon;
  return <Ico className={cn("w-3.5 h-3.5 flex-shrink-0", cfg.color)} />;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { isAdmin, isManager } = usePermissions();
  const { data: employees, isLoading: loadingEmp } = useEmployees();
  const { data: projects, isLoading: loadingProj } = useProjects();
  const { data: tasks, isLoading: loadingTasks } = useTasks();
  const { data: processesData, isLoading: loadingProc } = useProcesses();
  const [projectsPage, setProjectsPage] = useState(0);
  const PROJECTS_PER_PAGE = 3;
  const ITEMS_PER_PAGE = 5;
  // Carrossel meta-seção: rotaciona entre Atividade · Carga · Atrasadas
  const [sectionIndex, setSectionIndex] = useState(0);
  const [sectionPaused, setSectionPaused] = useState(false);
  const AUTO_ADVANCE_MS = 7000;

  const myEmployeeId = useMemo(
    () => employees?.find((e) => e.user_id === user?.id)?.id ?? null,
    [employees, user]
  );

  const stats = useMemo(() => {
    const projs = projects || [];
    const tks = tasks || [];

    // Definir escopo primeiro — admin/manager vêem tudo; membro vê só o que é dele
    const canSeeAll = isAdmin || isManager;
    const isMine = (t: TaskWithDetails) => {
      if (!myEmployeeId) return false;
      const single = t.assignee_id === myEmployeeId;
      const multi = Array.isArray(t.assignees) && t.assignees.some((a) => a.employee_id === myEmployeeId);
      return single || multi;
    };

    // Tarefas no escopo do usuário (usadas nos KPIs e demais cálculos)
    const scopedTasks = canSeeAll ? tks : tks.filter(isMine);

    // KPIs — activeProjs usa projs direto (já filtrado pelo RLS por role)
    const activeProjs = projs.filter((p) => p.status === "active").length;
    const inProgressTasks = scopedTasks.filter((t) => t.status === "doing" || t.status === "todo").length;
    const overdueTasks = scopedTasks.filter((t) => t.due_date && isTaskOverdue(t.due_date) && t.status !== "done").length;
    const oneWeekAgo = Date.now() - 7 * 86400000;
    const doneThisWeek = scopedTasks.filter((t) => {
      if (t.status !== "done") return false;
      const d = parseDateSafe(t.updated_at as any);
      return isValid(d) && d.getTime() >= oneWeekAgo;
    }).length;

    // Em foco hoje: minhas tarefas pendentes ordenadas por due_date
    const inFocus = tks
      .filter((t) => {
        if (!myEmployeeId) return false;
        if (t.status === "done" || (t.status as any) === "arquivado") return false;
        const single = t.assignee_id === myEmployeeId;
        const multi = Array.isArray(t.assignees) && t.assignees.some((a) => a.employee_id === myEmployeeId);
        return single || multi;
      })
      .sort((a, b) => {
        const da = a.due_date ? parseDateSafe(a.due_date).getTime() : Infinity;
        const db = b.due_date ? parseDateSafe(b.due_date).getTime() : Infinity;
        return da - db;
      })
      .slice(0, 6);

    // Atividade recente: admin/manager vê todas; membro vê só as dele
    const activity = [...tks]
      .filter((t) => t.updated_at)
      .filter((t) => canSeeAll || isMine(t))
      .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
      .slice(0, 25);

    // Projetos em andamento — usa projs direto (já filtrado pelo RLS por role)
    // Ordenados por nº de tarefas do escopo do usuário (mais → menos)
    const taskCountByProject = ((): Record<string, number> => {
      const m: Record<string, number> = {};
      for (const t of scopedTasks) {
        if (!t.project_id) continue;
        m[t.project_id] = (m[t.project_id] || 0) + 1;
      }
      return m;
    })();
    const ongoingProjects = projs
      .filter((p) => p.status === "active" || p.status === "planning")
      .sort((a, b) => {
        const ca = taskCountByProject[a.id] || 0;
        const cb = taskCountByProject[b.id] || 0;
        if (cb !== ca) return cb - ca;
        return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
      });

    // Atrasadas — admin/manager: todas; membro: só as dele
    const overdueList = tks
      .filter((t) => t.due_date && isTaskOverdue(t.due_date) && t.status !== "done" && (t.status as any) !== "arquivado")
      .filter((t) => canSeeAll || isMine(t))
      .sort((a, b) => parseDateSafe(a.due_date!).getTime() - parseDateSafe(b.due_date!).getTime());

    // Carga de trabalho — admin/manager: todos; membro: apenas ele mesmo (evita vazar outros usuários)
    const tasksByPerson: Record<string, { id: string; name: string; avatar: string | null; count: number }> = {};
    for (const t of scopedTasks.filter((t) => t.status !== "done" && (t.status as any) !== "arquivado")) {
      const ids: string[] = [];
      if (canSeeAll) {
        if (t.assignee_id) ids.push(t.assignee_id);
        if (Array.isArray(t.assignees)) {
          for (const a of t.assignees) if (a.employee_id && !ids.includes(a.employee_id)) ids.push(a.employee_id);
        }
      } else if (myEmployeeId) {
        ids.push(myEmployeeId);
      }
      for (const id of ids) {
        if (!tasksByPerson[id]) {
          const fromTask =
            t.assignee_id === id
              ? { name: t.assignee_name || "?", avatar: t.assignee_avatar || null }
              : (Array.isArray(t.assignees) ? t.assignees.find((a) => a.employee_id === id) : null) || { name: "?", avatar: null };
          tasksByPerson[id] = { id, name: (fromTask as any).full_name || (fromTask as any).name || "?", avatar: (fromTask as any).avatar_url ?? (fromTask as any).avatar ?? null, count: 0 };
        }
        tasksByPerson[id].count++;
      }
    }
    const workload = Object.values(tasksByPerson).sort((a, b) => b.count - a.count);

    return { activeProjs, inProgressTasks, overdueTasks, doneThisWeek, inFocus, activity, ongoingProjects, overdueList, workload };
  }, [projects, tasks, myEmployeeId, isAdmin, isManager]);

  // Auto-advance do carrossel de seções (Atividade · Carga · Atrasadas)
  useEffect(() => {
    if (sectionPaused) return;
    const id = setInterval(() => {
      setSectionIndex((p) => p + 1);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [sectionPaused]);

  // Trata "data ainda undefined" como loading — evita render vazio quando
  // useAuth/tenantId ainda não resolveu na volta pra essa página
  const isLoading =
    loadingEmp || loadingProj || loadingTasks || loadingProc ||
    !profile?.tenant_id ||
    employees === undefined || projects === undefined || tasks === undefined || processesData === undefined;


  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  const firstName = profile?.full_name?.split(" ")[0] || "Usuário";
  const todayLabel = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  if (isLoading) return <DashboardSkeleton />;

  // Helpers de tarefa
  const taskProjectName = (t: TaskWithDetails) => t.project_name || "—";
  const taskAssigneeName = (t: TaskWithDetails) =>
    (Array.isArray(t.assignees) && t.assignees[0]?.full_name) || t.assignee_name || null;
  const taskAssigneeAvatar = (t: TaskWithDetails) =>
    (Array.isArray(t.assignees) && t.assignees[0]?.avatar_url) || t.assignee_avatar || null;
  const formatDue = (iso: string | null) => {
    if (!iso) return "—";
    const d = parseDateSafe(iso);
    if (!isValid(d)) return "—";
    if (isToday(d)) return "hoje";
    if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEE", { locale: ptBR });
    return format(d, "dd/MM", { locale: ptBR });
  };

  const activityVerb = (t: TaskWithDetails) => {
    if (t.status === "done") return "concluiu";
    if (t.status === "review") return "enviou para revisão";
    if (t.status === "doing") return "atualizou";
    return "criou";
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Greeting */}
      <div>
        <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] mb-1">{todayLabel}</p>
        <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight">{greeting}, {firstName}.</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          {stats.overdueTasks > 0
            ? `Você tem ${stats.overdueTasks} tarefa${stats.overdueTasks > 1 ? "s" : ""} atrasada${stats.overdueTasks > 1 ? "s" : ""} e ${stats.inProgressTasks} em execução.`
            : `Você tem ${stats.inProgressTasks} tarefas em execução.`}
        </p>
      </div>

      {/* Quadro de aniversariantes — só aparece quando há alguém hoje ou nos
          próximos 7 dias; fora disso não ocupa espaço nenhum. */}
      <BirthdayBoard />

      {/* Stats — 4 KPI cards flat */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          onClick={() => navigate("/projetos")}
          className="bg-card rounded-md shadow-sm px-3 sm:px-4 py-3 sm:py-3.5 text-left hover:shadow-md transition-shadow active:scale-[0.98]"
        >
          <p className="text-[9px] sm:text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] leading-tight">Projetos<br className="sm:hidden" /> ativos</p>
          <div className="flex items-baseline gap-2 mt-1.5 sm:mt-2">
            <span className="text-[24px] sm:text-[26px] font-semibold tracking-tight leading-none">{stats.activeProjs}</span>
          </div>
        </button>
        <button
          onClick={() => navigate("/tarefas")}
          className="bg-card rounded-md shadow-sm px-3 sm:px-4 py-3 sm:py-3.5 text-left hover:shadow-md transition-shadow active:scale-[0.98]"
        >
          <p className="text-[9px] sm:text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] leading-tight">Em<br className="sm:hidden" /> execução</p>
          <div className="flex items-baseline gap-2 mt-1.5 sm:mt-2">
            <span className="text-[24px] sm:text-[26px] font-semibold tracking-tight leading-none">{stats.inProgressTasks}</span>
          </div>
        </button>
        <button
          onClick={() => navigate("/tarefas")}
          className="bg-card rounded-md shadow-sm px-3 sm:px-4 py-3 sm:py-3.5 text-left hover:shadow-md transition-shadow active:scale-[0.98]"
        >
          <p className="text-[9px] sm:text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] leading-tight">Atrasadas</p>
          <div className="flex items-baseline gap-2 mt-1.5 sm:mt-2">
            <span className={cn("text-[24px] sm:text-[26px] font-semibold tracking-tight leading-none", stats.overdueTasks > 0 && "text-danger")}>
              {stats.overdueTasks}
            </span>
          </div>
        </button>
        <button
          onClick={() => navigate("/tarefas")}
          className="bg-card rounded-md shadow-sm px-3 sm:px-4 py-3 sm:py-3.5 text-left hover:shadow-md transition-shadow active:scale-[0.98]"
        >
          <p className="text-[9px] sm:text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] leading-tight">Concluídas<br className="sm:hidden" /> (sem.)</p>
          <div className="flex items-baseline gap-2 mt-1.5 sm:mt-2">
            <span className="text-[24px] sm:text-[26px] font-semibold tracking-tight leading-none">{stats.doneThisWeek}</span>
            <span className="text-xs text-success font-semibold hidden sm:inline">semana</span>
          </div>
        </button>
      </div>

      {/* Em foco hoje + Highlights (carrossel: Atividade · Carga · Atrasadas) — 1fr/1fr */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          title="Em foco hoje"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate("/tarefas")} className="h-7 gap-1.5 text-xs">
              Ver minhas tarefas <ArrowRight className="w-3 h-3" />
            </Button>
          }
        >
          <div>
            {stats.inFocus.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nada na sua mira agora.</p>
            ) : (
              stats.inFocus.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/tarefas?taskId=${t.id}`)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 h-[52px] text-left hover:bg-muted/40 transition-colors",
                    i > 0 && "border-t border-border"
                  )}
                >
                  <PriorityFlag level={t.priority || "medium"} />
                  <StatusIcon status={t.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{t.title}</div>
                    <div className="text-[11.5px] text-muted-foreground/80 truncate mt-px">{taskProjectName(t)}</div>
                  </div>
                  <span className={cn(
                    "text-[11.5px] tabular-nums",
                    t.due_date && isTaskOverdue(t.due_date) && t.status !== "done" ? "text-danger font-medium" : "text-muted-foreground"
                  )}>
                    {formatDue(t.due_date)}
                  </span>
                  {taskAssigneeName(t) && (
                    <AvatarBadge name={taskAssigneeName(t) || "?"} avatarUrl={taskAssigneeAvatar(t)} size="xs" />
                  )}
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Card carrossel: Atividade · Carga · Atrasadas (rotação automática) */}
        {(() => {
          const sections = [
            { key: "activity", title: "Atividade recente", count: stats.activity.length },
            { key: "workload", title: "Carga de trabalho", count: stats.workload.length },
            ...(stats.overdueList.length > 0
              ? [{ key: "overdue", title: "Atrasadas", count: stats.overdueList.length }]
              : []),
          ];
          const safeIdx = sectionIndex % sections.length;
          const current = sections[safeIdx];
          const topCount = stats.workload[0]?.count || 1;
          return (
            <Card
              title={current.title}
              onMouseEnter={() => setSectionPaused(true)}
              onMouseLeave={() => setSectionPaused(false)}
              action={
                <div className="flex items-center gap-1">
                  {/* Indicador (dots) das seções */}
                  <div className="flex items-center gap-1 mr-2">
                    {sections.map((s, i) => (
                      <button
                        key={s.key}
                        onClick={() => setSectionIndex(i)}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          i === safeIdx ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                        )}
                        aria-label={s.title}
                        title={s.title}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setSectionIndex((p) => (p - 1 + sections.length) % sections.length)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSectionIndex((p) => (p + 1) % sections.length)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Próxima"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              }
            >
              <div className="min-h-[260px]">
                {/* Atividade */}
                {current.key === "activity" && (
                  stats.activity.length === 0 ? (
                    <p className="px-4 py-12 text-sm text-muted-foreground text-center">Sem atividade recente.</p>
                  ) : (
                    stats.activity.slice(0, ITEMS_PER_PAGE).map((t, i) => {
                      const author = taskAssigneeName(t) || "Alguém";
                      const firstNameAuthor = author.split(" ")[0];
                      const updated = parseDateSafe(t.updated_at as any);
                      const when = isValid(updated)
                        ? formatDistanceToNow(updated, { locale: ptBR, addSuffix: false })
                        : "—";
                      return (
                        <button
                          key={t.id}
                          onClick={() => navigate(`/tarefas?taskId=${t.id}`)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-4 h-[52px] text-left hover:bg-muted/40 transition-colors",
                            i > 0 && "border-t border-border"
                          )}
                        >
                          <AvatarBadge name={author} avatarUrl={taskAssigneeAvatar(t)} size="xs" />
                          <div className="flex-1 min-w-0 text-[12.5px] leading-[1.3]">
                            <div className="truncate">
                              <span className="font-semibold">{firstNameAuthor}</span>{" "}
                              <span className="text-muted-foreground">{activityVerb(t)}</span>{" "}
                              <span className="font-medium">{t.title}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground/80 mt-px">{when} atrás</div>
                          </div>
                        </button>
                      );
                    })
                  )
                )}

                {/* Carga de trabalho */}
                {current.key === "workload" && (
                  stats.workload.length === 0 ? (
                    <p className="px-4 py-12 text-sm text-muted-foreground text-center">Sem tarefas atribuídas.</p>
                  ) : (
                    stats.workload.slice(0, ITEMS_PER_PAGE).map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => navigate("/colaboradores")}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-4 h-[52px] text-left hover:bg-muted/40 transition-colors",
                          i > 0 && "border-t border-border"
                        )}
                      >
                        <AvatarBadge name={p.name} avatarUrl={p.avatar} size="xs" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-medium truncate">{p.name}</p>
                          <div className="h-1 mt-1 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.round((p.count / topCount) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[12px] font-semibold tabular-nums text-muted-foreground flex-shrink-0">
                          {p.count}
                        </span>
                      </button>
                    ))
                  )
                )}

                {/* Atrasadas */}
                {current.key === "overdue" && (
                  stats.overdueList.slice(0, ITEMS_PER_PAGE).map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/tarefas?taskId=${t.id}`)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-4 h-[52px] text-left hover:bg-muted/40 transition-colors",
                        i > 0 && "border-t border-border"
                      )}
                    >
                      <PriorityFlag level={t.priority || "medium"} />
                      <StatusIcon status={t.status} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{t.title}</div>
                        <div className="text-[11.5px] text-muted-foreground/80 truncate mt-px">{taskProjectName(t)}</div>
                      </div>
                      <span className="text-[11.5px] tabular-nums text-danger font-medium">
                        {formatDue(t.due_date)}
                      </span>
                      {taskAssigneeName(t) && (
                        <AvatarBadge name={taskAssigneeName(t) || "?"} avatarUrl={taskAssigneeAvatar(t)} size="xs" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </Card>
          );
        })()}
      </div>

      {/* Projetos em andamento */}
      {(() => {
        const totalProjPages = Math.max(1, Math.ceil(stats.ongoingProjects.length / PROJECTS_PER_PAGE));
        const safeProjPage = Math.min(projectsPage, totalProjPages - 1);
        const projStart = safeProjPage * PROJECTS_PER_PAGE;
        const visibleProjects = stats.ongoingProjects.slice(projStart, projStart + PROJECTS_PER_PAGE);
        return (
          <Card
            title="Projetos em andamento"
            action={
              <div className="flex items-center gap-1">
                {stats.ongoingProjects.length > PROJECTS_PER_PAGE && (
                  <>
                    <button
                      onClick={() => setProjectsPage((p) => Math.max(0, p - 1))}
                      disabled={safeProjPage === 0}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label="Anteriores"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground px-1">
                      {safeProjPage + 1}/{totalProjPages}
                    </span>
                    <button
                      onClick={() => setProjectsPage((p) => Math.min(totalProjPages - 1, p + 1))}
                      disabled={safeProjPage >= totalProjPages - 1}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label="Próximos"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-px h-4 bg-border mx-1" />
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => navigate("/projetos")} className="h-7 gap-1.5 text-xs">
                  Ver todos <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            }
          >
            {stats.ongoingProjects.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nenhum projeto em andamento.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3">
                {visibleProjects.map((p, i) => {
                  const taskList = (tasks || []).filter((t) => t.project_id === p.id);
                  const done = taskList.filter((t) => t.status === "done").length;
                  const total = taskList.length;
                  const progress = total > 0 ? done / total : (p.progress || 0) / 100;
                  const dueLabel = (p as any).end_date ? formatDue((p as any).end_date) : "—";
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/projetos/${p.id}`)}
                      className={cn(
                        "px-4 py-3.5 text-left hover:bg-muted/30 transition-colors",
                        i > 0 && "md:border-l border-t md:border-t-0 border-border"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-sm bg-primary flex-shrink-0" />
                        <span className="text-[13.5px] font-semibold truncate flex-1">{p.name}</span>
                      </div>
                      <div className="text-[11.5px] text-muted-foreground/80 mb-2">
                        {done} / {total} tarefas{(p as any).end_date && ` · vence ${dueLabel}`}
                      </div>
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.round(progress * 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round(progress * 100)}%</span>
                        <span className="text-[10px] font-mono font-medium uppercase tracking-[0.06em] text-muted-foreground">
                          {p.status === "active" ? "Em produção" : p.status === "planning" ? "Planejamento" : p.status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })()}

    </div>
  );
}
