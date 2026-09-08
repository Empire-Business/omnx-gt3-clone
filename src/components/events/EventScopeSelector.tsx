/**
 * EventScopeSelector — define o público do evento:
 * empresa toda, setores específicos (company_areas) ou pessoas específicas (employees).
 */
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { AlertCircle, Building2, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAreas } from "@/hooks/useAreas";
import { useEmployees } from "@/hooks/useEmployees";
import { InternalEventScope, SCOPE_LABELS } from "./events-api";

interface Props {
  scope: InternalEventScope;
  areaIds: string[];
  employeeIds: string[];
  onScopeChange: (scope: InternalEventScope) => void;
  onAreaIdsChange: (ids: string[]) => void;
  onEmployeeIdsChange: (ids: string[]) => void;
  disabled?: boolean;
}

const SCOPE_OPTIONS: { value: InternalEventScope; description: string }[] = [
  { value: "company", description: "Todos os colaboradores ativos veem o evento." },
  { value: "areas", description: "Somente os setores selecionados." },
  { value: "custom", description: "Somente as pessoas selecionadas." },
];

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function EventScopeSelector({
  scope,
  areaIds,
  employeeIds,
  onScopeChange,
  onAreaIdsChange,
  onEmployeeIdsChange,
  disabled,
}: Props) {
  const [search, setSearch] = useState("");
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Setas/Home/End navegam e já selecionam, como manda o padrão de radiogroup. */
  const handleScopeKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const total = SCOPE_OPTIONS.length;
    let next: number | null = null;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % total;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + total) % total;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = total - 1;

    if (next === null) return;
    e.preventDefault();
    onScopeChange(SCOPE_OPTIONS[next].value);
    optionRefs.current[next]?.focus();
  };

  const areasQuery = useAreas();
  const employeesQuery = useEmployees({ status: "active" });

  const areas = areasQuery.data ?? [];

  const filteredEmployees = useMemo(() => {
    const employees = employeesQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((e) => (e.full_name ?? "").toLowerCase().includes(term));
  }, [employeesQuery.data, search]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label id="event-scope-label">Público do evento</Label>
        {/*
          As três opções são mutuamente exclusivas: um grupo de rádio, não três
          alternadores independentes. O visual é o mesmo de antes; muda só a
          semântica e a navegação por setas (padrão de roving tabindex).
        */}
        <div
          role="radiogroup"
          aria-labelledby="event-scope-label"
          className="grid gap-2 sm:grid-cols-3"
        >
          {SCOPE_OPTIONS.map((opt, index) => {
            const active = scope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                disabled={disabled}
                onClick={() => onScopeChange(opt.value)}
                onKeyDown={(e) => handleScopeKeyDown(e, index)}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-foreground/15",
                  disabled && "opacity-60 cursor-not-allowed",
                )}
              >
                <span className="block text-[13px] font-semibold text-foreground">
                  {SCOPE_LABELS[opt.value]}
                </span>
                <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {scope === "areas" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
              Setores
            </Label>
            <Badge variant="secondary" className="text-[10px]">
              {areaIds.length} selecionado{areaIds.length === 1 ? "" : "s"}
            </Badge>
          </div>

          {areasQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : areasQuery.isError ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <p className="text-xs">Erro ao carregar os setores. Tente novamente.</p>
            </div>
          ) : areas.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border px-3 py-4 text-center">
              Nenhum setor cadastrado. Cadastre em Áreas e Cargos.
            </p>
          ) : (
            <ScrollArea className="h-44 rounded-md border border-border">
              <div className="p-2 space-y-0.5">
                {areas.map((area) => (
                  <label
                    key={area.id}
                    className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-muted/60 cursor-pointer"
                  >
                    <Checkbox
                      checked={areaIds.includes(area.id)}
                      disabled={disabled}
                      onCheckedChange={() => onAreaIdsChange(toggle(areaIds, area.id))}
                      aria-label={`Selecionar setor ${area.name}`}
                    />
                    <span className="text-sm text-foreground">{area.name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {scope === "custom" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              Colaboradores
            </Label>
            <Badge variant="secondary" className="text-[10px]">
              {employeeIds.length} selecionado{employeeIds.length === 1 ? "" : "s"}
            </Badge>
          </div>

          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar colaborador"
              className="pl-8"
              disabled={disabled}
              aria-label="Buscar colaborador"
            />
          </div>

          {employeesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : employeesQuery.isError ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <p className="text-xs">Erro ao carregar os colaboradores. Tente novamente.</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border px-3 py-4 text-center">
              Nenhum colaborador encontrado.
            </p>
          ) : (
            <ScrollArea className="h-52 rounded-md border border-border">
              <div className="p-2 space-y-0.5">
                {filteredEmployees.map((emp) => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-muted/60 cursor-pointer"
                  >
                    <Checkbox
                      checked={employeeIds.includes(emp.id)}
                      disabled={disabled}
                      onCheckedChange={() => onEmployeeIdsChange(toggle(employeeIds, emp.id))}
                      aria-label={`Selecionar ${emp.full_name ?? "colaborador"}`}
                    />
                    <AvatarBadge
                      name={emp.full_name ?? "—"}
                      avatarUrl={emp.avatar_url ?? undefined}
                      size="sm"
                    />
                    <span className="text-sm text-foreground truncate">
                      {emp.full_name ?? "—"}
                    </span>
                    {emp.area_name && (
                      <span className="ml-auto text-[11px] text-muted-foreground truncate">
                        {emp.area_name}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
