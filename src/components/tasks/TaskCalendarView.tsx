/**
 * TaskCalendarView — visualização em calendário mensal das tarefas com prazo.
 * Click no dia → cria tarefa nesse dia. Click na tarefa → abre detalhe.
 */
import { useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format,
  isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek,
  getDay, isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskWithDetails } from "@/hooks/useTasks";
import { parseDateSafe, isTaskOverdue } from "@/lib/date-utils";

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-info text-info-foreground",
  low: "bg-muted text-muted-foreground",
};

interface Props {
  tasks: TaskWithDetails[];
  onOpenTask: (task: TaskWithDetails) => void;
  onCreateTask?: (dateIso: string) => void;
}

export function TaskCalendarView({ tasks, onOpenTask, onCreateTask }: Props) {
  const [cursor, setCursor] = useState(() => new Date());

  const grid = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [cursor]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, TaskWithDetails[]> = {};
    for (const t of tasks) {
      if (!t.due_date) continue;
      const d = parseDateSafe(t.due_date);
      if (!d) continue;
      const key = format(d, "yyyy-MM-dd");
      (map[key] ??= []).push(t);
    }
    return map;
  }, [tasks]);

  const noDateTasks = useMemo(
    () => tasks.filter((t) => !t.due_date && t.status !== "arquivado").slice(0, 8),
    [tasks]
  );

  const weekDays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const todayKey = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCursor((c) => subMonths(c, 1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-headline-md min-w-[180px] text-center capitalize">
            {format(cursor, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 ml-1"
            onClick={() => setCursor(new Date())}
          >
            <CalendarIcon className="w-3.5 h-3.5" /> Hoje
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Calendar */}
        <div className="bg-card rounded-md border border-border overflow-hidden flex flex-col">
          {/* Week headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/30">
            {weekDays.map((d) => (
              <div
                key={d}
                className="text-label-caps py-2 text-center"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Days */}
          <div className="grid grid-cols-7 grid-rows-6 flex-1">
            {grid.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayTasks = tasksByDay[key] ?? [];
              const inMonth = isSameMonth(day, cursor);
              const todayCell = key === todayKey;
              return (
                <div
                  key={key}
                  className={cn(
                    "border-r border-b border-border last:border-r-0 p-1.5 flex flex-col gap-1 min-h-[88px] group",
                    !inMonth && "bg-muted/20 text-muted-foreground/60",
                    todayCell && "bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        todayCell &&
                          "inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground font-semibold"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {onCreateTask && inMonth && (
                      <button
                        onClick={() => onCreateTask(key)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 inline-flex items-center justify-center rounded hover:bg-accent text-muted-foreground"
                        aria-label="Nova tarefa neste dia"
                        title="Nova tarefa"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayTasks.slice(0, 3).map((t) => {
                      const overdue =
                        t.due_date && isTaskOverdue(t.due_date) && t.status !== "done";
                      return (
                        <button
                          key={t.id}
                          onClick={() => onOpenTask(t)}
                          className={cn(
                            "text-left text-2xs truncate px-1.5 py-0.5 rounded",
                            "hover:opacity-90 transition-opacity cursor-pointer",
                            PRIORITY_COLOR[t.priority || "medium"],
                            t.status === "done" && "line-through opacity-60",
                            overdue && "ring-1 ring-destructive"
                          )}
                          title={t.title}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                    {dayTasks.length > 3 && (
                      <span className="text-2xs text-muted-foreground px-1.5">
                        +{dayTasks.length - 3} mais
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* No-date sidebar */}
        <aside className="bg-card rounded-md border border-border overflow-hidden flex flex-col min-h-[200px]">
          <div className="px-3 py-2.5 border-b border-border bg-muted/30">
            <p className="text-label-caps">Sem prazo</p>
            <p className="text-2xs text-muted-foreground">
              {noDateTasks.length} tarefa{noDateTasks.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-2 flex flex-col gap-1.5 overflow-y-auto">
            {noDateTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-2 py-3 text-center">
                Tudo com prazo
              </p>
            ) : (
              noDateTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpenTask(t)}
                  className="text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full flex-shrink-0",
                      PRIORITY_COLOR[t.priority || "medium"]
                    )}
                  />
                  <span className="truncate">{t.title}</span>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
