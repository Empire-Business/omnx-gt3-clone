/**
 * AssigneeMultiSelect — seleção de múltiplos responsáveis por tarefa.
 *
 * Usado em todos os pontos de CRIAÇÃO de tarefa (modal Nova Tarefa, quick-add
 * do Kanban e dialog do Chat), para que uma tarefa já nasça compartilhada entre
 * mais de uma pessoa — antes só o modal de detalhe permitia isso.
 *
 * Regra de RBAC: membro (`isMember`) só pode atribuir a si mesmo na criação,
 * então o seletor é substituído por um campo informativo.
 */
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface AssigneeOption {
  id: string;
  full_name: string | null;
  status?: string | null;
}

interface AssigneeMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  employees: AssigneeOption[];
  /** Membro comum: não pode atribuir a outras pessoas. */
  isMember?: boolean;
  /** Nome exibido no lugar do seletor quando `isMember`. */
  memberName?: string | null;
  placeholder?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export function AssigneeMultiSelect({
  value,
  onChange,
  employees,
  isMember = false,
  memberName,
  placeholder = "Adicionar responsável...",
  triggerClassName,
  disabled = false,
}: AssigneeMultiSelectProps) {
  if (isMember) {
    return (
      <div className="h-10 px-3 flex items-center rounded-md border border-input bg-muted/40 text-sm text-muted-foreground">
        {memberName ?? "Você"} · não pode atribuir a outros
      </div>
    );
  }

  const available = employees.filter((e) => e.status === "active" && !value.includes(e.id));

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => {
            const emp = employees.find((e) => e.id === id);
            return (
              <Badge
                key={id}
                variant="secondary"
                className="text-2xs gap-1 cursor-pointer hover:bg-destructive/10"
                onClick={() => !disabled && onChange(value.filter((v) => v !== id))}
              >
                {emp?.full_name || "?"}
                {!disabled && <X className="w-2.5 h-2.5" aria-hidden />}
                <span className="sr-only">Remover responsável</span>
              </Badge>
            );
          })}
        </div>
      )}
      <Select
        value=""
        disabled={disabled}
        onValueChange={(v) => {
          if (v && !value.includes(v)) onChange([...value, v]);
        }}
      >
        <SelectTrigger className={cn("h-10", triggerClassName)}>
          <SelectValue placeholder={value.length > 0 ? "Adicionar outro..." : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {available.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Nenhum colaborador disponível
            </div>
          ) : (
            available.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.full_name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
