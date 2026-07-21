import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface ReactorInfo {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  position_title?: string | null;
}

interface Props {
  reactors: ReactorInfo[];
  emptyLabel?: string;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

/**
 * Lista de pessoas que reagiram (avatar + nome + cargo).
 * Usado dentro de HoverCard/Popover ao passar sobre o botão da reação.
 */
export function ReactorList({ reactors, emptyLabel = "Ninguém ainda" }: Props) {
  if (!reactors.length) {
    return <p className="text-xs text-muted-foreground py-1">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-1.5 max-h-64 overflow-y-auto">
      {reactors.map((r) => (
        <li key={r.id} className="flex items-center gap-2">
          <Avatar className="w-6 h-6 flex-shrink-0">
            <AvatarImage src={r.avatar_url || undefined} />
            <AvatarFallback className="text-2xs bg-muted">
              {initials(r.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate leading-tight">
              {r.full_name || "Colaborador"}
            </p>
            {r.position_title && (
              <p className="text-2xs text-muted-foreground truncate leading-tight">
                {r.position_title}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
