/**
 * TaskTimerBadge — chip compacto pra exibir tempo registrado dentro do card.
 * Não dispara queries individuais (custaria N por board); apenas lê
 * uma cache global agregada via TanStack Query.
 */
import { useTaskTimerSummary } from "@/hooks/useTaskTimerSummary";
import { formatDuration } from "@/hooks/useTaskTimer";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string;
}

export function TaskTimerBadge({ taskId }: Props) {
  const { totalSeconds, isRunning } = useTaskTimerSummary(taskId);
  if (totalSeconds === 0 && !isRunning) return null;
  return (
    <span
      className={cn(
        "text-2xs inline-flex items-center gap-0.5",
        isRunning ? "text-primary font-semibold" : "text-muted-foreground"
      )}
      title={isRunning ? "Timer ativo" : "Tempo registrado"}
    >
      <Timer className={cn("w-3 h-3", isRunning && "animate-pulse")} />
      {formatDuration(totalSeconds)}
    </span>
  );
}
