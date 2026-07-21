/**
 * TaskDependenciesSection — v8.10.6
 * Mostra "Bloqueada por" e "Bloqueia" + "Relacionada a".
 * Permite adicionar/remover dependências entre tasks do mesmo tenant.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Lock, Unlock, X, Plus, Loader2 } from "lucide-react";
import { useTaskDependencies, type DependencyType } from "@/hooks/useTaskDependencies";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

interface TaskDependenciesSectionProps {
  taskId: string;
  canEdit: boolean;
  onOpenTask?: (id: string) => void;
}

export function TaskDependenciesSection({
  taskId, canEdit, onOpenTask,
}: TaskDependenciesSectionProps) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks-picker", tenantId],
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as { id: string; title: string; status: string }[];
    },
  });
  const { blockedBy, blocks, isLoading, addDependency, removeDependency } = useTaskDependencies(taskId);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<DependencyType>("blocks");

  const candidates = useMemo(() => {
    const linkedIds = new Set([
      ...blockedBy.map((b) => b.depends_on_task_id),
      ...blocks.map((b) => b.task_id),
    ]);
    const q = search.trim().toLowerCase();
    return allTasks
      .filter((t) => t.id !== taskId && !linkedIds.has(t.id))
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .slice(0, 12);
  }, [allTasks, blockedBy, blocks, search, taskId]);

  const handleAdd = async (otherId: string) => {
    try {
      // type=blocks → outra task bloqueia esta (esta depends_on outra)
      // type=related_to → link simples
      await addDependency.mutateAsync({
        task_id: taskId,
        depends_on_task_id: otherId,
        dependency_type: type,
      });
      setSearch("");
      setSearchOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao vincular tarefa");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Carregando dependências...
      </div>
    );
  }

  const blockedByActive = blockedBy.filter((d) => d.dependency_type === "blocks");
  const relatedFromHere = blockedBy.filter((d) => d.dependency_type === "related_to");
  const blocksActive = blocks.filter((d) => d.dependency_type === "blocks");

  const hasAny =
    blockedByActive.length + blocksActive.length + relatedFromHere.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-2xs font-mono font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Dependências
          </span>
          {hasAny && (
            <span className="text-2xs font-mono text-muted-foreground/70 tabular-nums">
              · {blockedByActive.length + blocksActive.length + relatedFromHere.length}
            </span>
          )}
        </div>
        {canEdit && (
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Vincular
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="space-y-2">
                <Select value={type} onValueChange={(v) => setType(v as DependencyType)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blocks">Bloqueada por (precisa terminar antes)</SelectItem>
                    <SelectItem value="related_to">Relacionada a</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tarefa..."
                  className="h-8 text-xs"
                />
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {candidates.length === 0 ? (
                    <p className="text-2xs text-muted-foreground px-2 py-1">
                      Nenhuma tarefa disponível
                    </p>
                  ) : (
                    candidates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleAdd(t.id)}
                        className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted truncate"
                      >
                        {t.title}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {!hasAny ? (
        <p className="text-xs text-muted-foreground">Nenhuma dependência.</p>
      ) : (
        <div className="space-y-3">
          {blockedByActive.length > 0 && (
            <DependencyGroup
              icon={<Lock className="w-3 h-3 text-warning" />}
              label="Bloqueada por"
              items={blockedByActive}
              relatedField="task"
              canEdit={canEdit}
              onOpen={onOpenTask}
              onRemove={(id) => removeDependency.mutate(id)}
            />
          )}
          {blocksActive.length > 0 && (
            <DependencyGroup
              icon={<Unlock className="w-3 h-3 text-info" />}
              label="Bloqueia"
              items={blocksActive}
              relatedField="task"
              canEdit={canEdit}
              onOpen={onOpenTask}
              onRemove={(id) => removeDependency.mutate(id)}
            />
          )}
          {relatedFromHere.length > 0 && (
            <DependencyGroup
              icon={<Link2 className="w-3 h-3 text-muted-foreground" />}
              label="Relacionada a"
              items={relatedFromHere}
              relatedField="task"
              canEdit={canEdit}
              onOpen={onOpenTask}
              onRemove={(id) => removeDependency.mutate(id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface DepGroupItem {
  id: string;
  task?: { id: string; title: string; status: string } | null;
}

function DependencyGroup({
  icon, label, items, canEdit, onOpen, onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  items: DepGroupItem[];
  relatedField: "task";
  canEdit: boolean;
  onOpen?: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="space-y-0.5">
        {items.map((dep) => {
          const t = dep.task;
          const done = t?.status === "done";
          return (
            <div
              key={dep.id}
              className="flex items-center gap-2 group py-0.5 px-1 rounded hover:bg-muted/50"
            >
              <button
                type="button"
                onClick={() => t && onOpen?.(t.id)}
                disabled={!t}
                className={`text-sm flex-1 text-left truncate hover:underline ${
                  done ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                {t?.title || "Tarefa removida"}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onRemove(dep.id)}
                  className="opacity-0 group-hover:opacity-100"
                  aria-label="Remover vínculo"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-danger" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
