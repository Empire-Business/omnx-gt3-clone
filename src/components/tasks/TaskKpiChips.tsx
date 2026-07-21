/**
 * TaskKpiChips — chips clicáveis no topo da página /tarefas
 * Estilo GT3 OMNX (Modern Corporate / ClickUp-like).
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Calendar, AlertTriangle, CalendarRange, CalendarOff, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskWithDetails } from "@/hooks/useTasks";
import { isTaskOverdue, parseDateSafe } from "@/lib/date-utils";
import { isToday, isWithinInterval, addDays, startOfDay } from "date-fns";

export type KpiKey = "all" | "today" | "overdue" | "week" | "noDate" | "mine";

interface Props {
  tasks: TaskWithDetails[];
  myEmployeeId: string | null;
  active: KpiKey;
  onChange: (k: KpiKey) => void;
}

export function TaskKpiChips({ tasks, myEmployeeId, active, onChange }: Props) {
  const counts = useMemo(() => {
    const today = startOfDay(new Date());
    const weekEnd = addDays(today, 7);
    let total = 0,
      todayN = 0,
      overdue = 0,
      week = 0,
      noDate = 0,
      mine = 0;
    for (const t of tasks) {
      if (t.status === "arquivado") continue;
      total++;
      if (!t.due_date) noDate++;
      else {
        const d = parseDateSafe(t.due_date);
        if (d) {
          if (isToday(d)) todayN++;
          if (isTaskOverdue(t.due_date) && t.status !== "done") overdue++;
          if (isWithinInterval(d, { start: today, end: weekEnd })) week++;
        }
      }
      if (myEmployeeId && (t.assignee_id === myEmployeeId ||
        (t as any).assignees?.some((a: any) => a.employee_id === myEmployeeId))) mine++;
    }
    return { total, today: todayN, overdue, week, noDate, mine };
  }, [tasks, myEmployeeId]);

  const items: Array<{
    key: KpiKey;
    label: string;
    count: number;
    icon: React.ElementType;
    tone: "neutral" | "danger" | "warning" | "info" | "primary";
  }> = [
    { key: "all", label: "Todas", count: counts.total, icon: CalendarRange, tone: "neutral" },
    { key: "today", label: "Hoje", count: counts.today, icon: Calendar, tone: "warning" },
    { key: "overdue", label: "Atrasadas", count: counts.overdue, icon: AlertTriangle, tone: "danger" },
    { key: "week", label: "Esta semana", count: counts.week, icon: CalendarRange, tone: "info" },
    { key: "noDate", label: "Sem prazo", count: counts.noDate, icon: CalendarOff, tone: "neutral" },
    { key: "mine", label: "Minhas", count: counts.mine, icon: User, tone: "primary" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map(({ key, label, count, icon: Icon, tone }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] font-medium",
              "transition-colors duration-100 cursor-pointer",
              isActive
                ? toneActive(tone)
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="w-3 h-3" />
            <span>{label}</span>
            <span
              className={cn(
                "tabular-nums text-[10px] font-semibold leading-none px-1 rounded",
                isActive ? "bg-current/15 text-current" : "text-muted-foreground/70"
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

function toneActive(tone: "neutral" | "danger" | "warning" | "info" | "primary") {
  switch (tone) {
    case "danger":
      return "bg-danger/10 text-danger";
    case "warning":
      return "bg-warning/15 text-warning";
    case "info":
      return "bg-info/10 text-info";
    case "primary":
      return "bg-primary/10 text-primary";
    default:
      return "bg-foreground/10 text-foreground";
  }
}
