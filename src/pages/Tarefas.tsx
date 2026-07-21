import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Download, AlertCircle, Plus } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { useEmployees } from "@/hooks/useEmployees";
import { useAuth } from "@/hooks/useAuth";
import { useTasksUnreadCount } from "@/hooks/useNotifications";
import { EmptyState } from "@/components/shared/SharedComponents";
import { KanbanBoard } from "@/components/shared/KanbanBoard";
import { Button } from "@/components/ui/button";
import { KanbanSkeleton } from "@/components/shared/SmartSkeleton";
import { exportAsCSV } from "@/lib/export-csv";
import { TaskKpiChips, type KpiKey } from "@/components/tasks/TaskKpiChips";
import { isTaskOverdue, parseDateSafe } from "@/lib/date-utils";
import { isToday, isWithinInterval, addDays, startOfDay } from "date-fns";

export default function Tarefas() {
  const { data: tasks, isLoading, isError, error } = useTasks();
  const { data: employees } = useEmployees();
  const { user } = useAuth();
  const { markRead: markTasksRead } = useTasksUnreadCount();

  // Zera o badge de "novas atribuições" ao abrir/voltar para a página de Tarefas.
  useEffect(() => {
    markTasksRead();
  }, [markTasksRead, tasks?.length]);

  const myEmployeeId = useMemo(
    () => employees?.find((e) => e.user_id === user?.id)?.id ?? null,
    [employees, user]
  );

  const [kpi, setKpi] = useState<KpiKey>("all");

  // Atalhos de teclado: N (nova), / (busca), J/K (navega), E (editar foco)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;
      if (inField) return;

      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-task-card='true']")
      );
      const focusedIdx = cards.findIndex((c) => c === document.activeElement);

      if (e.key === "n" || e.key === "N") {
        const btn = document.querySelector<HTMLButtonElement>(
          "button[data-action='nova-tarefa']"
        );
        btn?.click();
        e.preventDefault();
      } else if (e.key === "/") {
        const inp = document.querySelector<HTMLInputElement>(
          "input[placeholder*='Buscar tarefa']"
        );
        if (inp) {
          inp.focus();
          e.preventDefault();
        }
      } else if (e.key === "j" || e.key === "J") {
        if (cards.length === 0) return;
        const next = focusedIdx < 0 ? 0 : Math.min(cards.length - 1, focusedIdx + 1);
        cards[next]?.focus();
        e.preventDefault();
      } else if (e.key === "k" || e.key === "K") {
        if (cards.length === 0) return;
        const prev = focusedIdx <= 0 ? 0 : focusedIdx - 1;
        cards[prev]?.focus();
        e.preventDefault();
      } else if (e.key === "e" || e.key === "E") {
        if (focusedIdx >= 0) {
          (cards[focusedIdx] as HTMLElement)?.click();
          e.preventDefault();
        }
      } else if (e.key === "Enter" && focusedIdx >= 0) {
        (cards[focusedIdx] as HTMLElement)?.click();
        e.preventDefault();
      } else if (/^[1-9]$/.test(e.key) && focusedIdx >= 0) {
        const idx = parseInt(e.key, 10) - 1;
        const focusedCard = cards[focusedIdx];
        const taskId = focusedCard?.getAttribute("data-task-id");
        if (taskId) {
          window.dispatchEvent(
            new CustomEvent("task:move-to-column", { detail: { taskId, columnIndex: idx } })
          );
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isLoading || tasks === undefined) {
    return <KanbanSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-md border border-destructive/30 bg-destructive/5 text-destructive">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="text-sm">Erro ao carregar tarefas: {(error as Error)?.message ?? "Tente novamente."}</p>
      </div>
    );
  }

  // Aplica filtro KPI antes de passar pro KanbanBoard via window? Não — precisamos
  // que o board receba a lista filtrada. Como o board lê via useTasks() próprio,
  // expomos o filtro via URL searchParams ou contexto. Por simplicidade, mostramos
  // o EmptyState quando KPI zera o resultado, e o board mostra tudo (gerencia
  // seus próprios filtros internos). Mantemos o KPI como visão informativa +
  // atalho que aplica filtros equivalentes via querystring quando aplicável.
  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);
  const filteredByKpi = (tasks || []).filter((t) => {
    if (t.status === "arquivado") return false;
    switch (kpi) {
      case "all":
        return true;
      case "today":
        if (!t.due_date) return false;
        const d1 = parseDateSafe(t.due_date);
        return d1 ? isToday(d1) : false;
      case "overdue":
        return !!t.due_date && isTaskOverdue(t.due_date) && t.status !== "done";
      case "week":
        if (!t.due_date) return false;
        const d2 = parseDateSafe(t.due_date);
        return d2 ? isWithinInterval(d2, { start: today, end: weekEnd }) : false;
      case "noDate":
        return !t.due_date;
      case "mine":
        return (
          (myEmployeeId && t.assignee_id === myEmployeeId) ||
          (myEmployeeId &&
            Array.isArray((t as any).assignees) &&
            (t as any).assignees.some((a: any) => a.employee_id === myEmployeeId))
        );
      default:
        return true;
    }
  });

  const taskCount = (tasks || []).length;
  const visibleCount = filteredByKpi.length;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header — estilo mockup: título à esquerda, exportar discreto à direita */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <CheckSquare className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-none">Tarefas</h1>
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {visibleCount} de {taskCount}
            {kpi !== "all" && " · filtrada"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            exportAsCSV(
              filteredByKpi,
              [
                { key: "title", label: "Título" },
                { key: "status", label: "Status" },
                { key: "priority", label: "Prioridade" },
                { key: "assignee_name", label: "Responsável" },
                { key: "project_name", label: "Projeto" },
                { key: "due_date", label: "Prazo" },
              ],
              `tarefas-${kpi}`
            );
          }}
        >
          <Download className="w-3 h-3" /> CSV
        </Button>
      </div>

      <KanbanBoard
        showProjectFilter
        showColumnManagement
        showSearch
        showHierarchyFilter
        kpiFilter={kpi}
        onKpiChange={setKpi}
        myEmployeeId={myEmployeeId}
      />
      {taskCount > 0 && visibleCount === 0 && (
        <EmptyState
          icon={<CheckSquare className="w-8 h-8 text-muted-foreground" />}
          title="Nenhuma tarefa com este filtro"
          description="Altere o chip de visão acima para ver outras tarefas."
          action={
            <Button variant="outline" onClick={() => setKpi("all")} size="sm">
              Mostrar todas
            </Button>
          }
        />
      )}
    </div>
  );
}
