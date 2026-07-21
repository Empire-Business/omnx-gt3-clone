import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar-initials";
import { useTaskHistory } from "@/hooks/useTaskHistory";
import { useEmployees } from "@/hooks/useEmployees";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD_LABEL: Record<string, string> = {
  status: "status",
  priority: "prioridade",
  assignee: "responsável",
  due_date: "prazo",
  title: "título",
  created: "criada",
};

function valueLabel(field: string, value: string | null, employeeMap?: Record<string, string>): string {
  if (!value) return "—";
  if (field === "assignee" && employeeMap) return employeeMap[value] ?? "Colaborador";
  if (field === "due_date") {
    try {
      return format(new Date(value), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return value;
    }
  }
  return value;
}

interface Props {
  taskId: string;
}

export function TaskHistoryTimeline({ taskId }: Props) {
  const { data, isLoading } = useTaskHistory(taskId);
  const { data: employees } = useEmployees();
  const employeeMap = (employees ?? []).reduce<Record<string, string>>((acc, e) => {
    if (e.id && e.full_name) acc[e.id] = e.full_name;
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground py-3">Carregando histórico…</div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-2 py-6 text-muted-foreground">
        <History className="w-6 h-6 opacity-50" />
        <p className="text-xs">Nenhuma alteração registrada ainda</p>
      </div>
    );
  }

  return (
    <ol className="relative pl-5 space-y-3">
      <span className="absolute left-2 top-1 bottom-1 w-px bg-border" aria-hidden />
      {data.map((row) => {
        const fieldLabel = FIELD_LABEL[row.field] ?? row.field;
        const author = row.author_name ?? "Sistema";
        const initials = getInitials(author);
        const old = valueLabel(row.field, row.old_value, employeeMap);
        const next = valueLabel(row.field, row.new_value, employeeMap);
        return (
          <li key={row.id} className="relative">
            <span className="absolute -left-[18px] top-0.5 inline-flex items-center justify-center w-3 h-3 rounded-full bg-card border-2 border-primary" />
            <div className="flex items-start gap-2">
              <Avatar className="w-6 h-6 ring-1 ring-border flex-shrink-0">
                <AvatarImage src={row.author_avatar ?? undefined} alt={author} />
                <AvatarFallback className="text-2xs bg-primary/10 text-primary font-semibold">
                  {initials || <UserIcon className="w-3 h-3" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-snug">
                  <span className="font-semibold text-foreground">{author}</span>{" "}
                  {row.field === "created" ? (
                    <>criou esta tarefa</>
                  ) : (
                    <>
                      alterou {fieldLabel} de{" "}
                      <span className="font-medium text-foreground/80">{old}</span>{" "}
                      para{" "}
                      <span className="font-medium text-foreground">{next}</span>
                    </>
                  )}
                </p>
                <p
                  className="text-2xs text-muted-foreground mt-0.5"
                  title={format(new Date(row.changed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                >
                  {formatDistanceToNow(new Date(row.changed_at), { locale: ptBR, addSuffix: true })}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
