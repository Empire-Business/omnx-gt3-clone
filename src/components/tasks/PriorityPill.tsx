/**
 * PriorityPill — pílula GT3 OMNX 10px/800/uppercase para prioridade.
 * Substitui StatusBadge nos cards de tarefa.
 */
import { cn } from "@/lib/utils";

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const PRIORITY_CLASS: Record<string, string> = {
  urgent: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-warning/15 text-warning-foreground border-warning/40",
  medium: "bg-info/15 text-info border-info/30",
  low: "bg-muted text-muted-foreground border-border",
};

interface Props {
  priority: string | null | undefined;
  className?: string;
}

export function PriorityPill({ priority, className }: Props) {
  const key = (priority || "medium").toLowerCase();
  const label = PRIORITY_LABEL[key] ?? key;
  const cls = PRIORITY_CLASS[key] ?? PRIORITY_CLASS.medium;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-px rounded border",
        "text-[10px] font-extrabold uppercase tracking-wide leading-[12px]",
        cls,
        className
      )}
    >
      {label}
    </span>
  );
}
