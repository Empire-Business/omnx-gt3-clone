/**
 * TaskTimer — botão de iniciar/parar timer + total acumulado.
 * Para uso dentro do TaskDetailModal e em qualquer outro contexto.
 */
import { Button } from "@/components/ui/button";
import { Timer, Play, Square, Loader2 } from "lucide-react";
import { useTaskTimer, formatDuration } from "@/hooks/useTaskTimer";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string;
  compact?: boolean;
}

export function TaskTimer({ taskId, compact }: Props) {
  const t = useTaskTimer(taskId);

  if (compact) {
    if (t.totalSeconds === 0 && !t.isRunning) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-2xs",
          t.isRunning ? "text-primary font-semibold" : "text-muted-foreground"
        )}
        title={t.isRunning ? "Timer rodando" : "Tempo acumulado"}
      >
        <Timer className={cn("w-3 h-3", t.isRunning && "animate-pulse")} />
        {formatDuration(t.totalSeconds)}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-md border border-border bg-muted/30">
      <div className="flex items-center gap-2 min-w-0">
        <Timer
          className={cn(
            "w-4 h-4 flex-shrink-0",
            t.isRunning ? "text-primary animate-pulse" : "text-muted-foreground"
          )}
        />
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
            Tempo registrado
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {formatDuration(t.totalSeconds)}
          </span>
        </div>
      </div>
      {t.isAnotherRunning ? (
        <Button size="sm" variant="outline" disabled className="h-7 text-xs gap-1">
          Em uso por outro
        </Button>
      ) : t.isRunning ? (
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-xs gap-1"
          onClick={() => t.stop.mutate()}
          disabled={t.stop.isPending}
        >
          {t.stop.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Square className="w-3 h-3 fill-current" />
          )}
          Parar
        </Button>
      ) : (
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => t.start.mutate(undefined)}
          disabled={t.start.isPending}
        >
          {t.start.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3 fill-current" />
          )}
          Iniciar
        </Button>
      )}
    </div>
  );
}
