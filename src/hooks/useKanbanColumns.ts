import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  statusKey: string; // maps to task_status enum
  sort_order: number;
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: "col-backlog", name: "Backlog", color: "bg-muted", statusKey: "backlog", sort_order: 0 },
  { id: "col-todo", name: "A Fazer", color: "bg-info-light", statusKey: "todo", sort_order: 1 },
  { id: "col-doing", name: "Em Andamento", color: "bg-warning-light", statusKey: "doing", sort_order: 2 },
  { id: "col-review", name: "Em Revisão", color: "bg-primary-light", statusKey: "review", sort_order: 3 },
  { id: "col-ajustes", name: "Ajustes", color: "bg-warning-light", statusKey: "ajustes", sort_order: 4 },
  { id: "col-done", name: "Concluído", color: "bg-success-light", statusKey: "done", sort_order: 5 },
  { id: "col-arquivado", name: "Arquivado", color: "bg-muted", statusKey: "arquivado", sort_order: 6 },
];

export function useKanbanColumns() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const columnsQuery = useQuery({
    queryKey: ["kanban-columns", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("settings")
        .eq("id", tenantId!)
        .single();
      if (error) throw error;
      const settings = data?.settings as Record<string, any> | null;
      const columns = settings?.kanban_columns as KanbanColumn[] | undefined;
      if (!columns || columns.length === 0) return DEFAULT_COLUMNS;

      // Auto-inject missing status columns (e.g. ajustes, arquivado added in v7.9)
      const sorted = columns.sort((a, b) => a.sort_order - b.sort_order);
      const existingKeys = new Set(sorted.map((c) => c.statusKey));
      const missing = DEFAULT_COLUMNS.filter((dc) => !existingKeys.has(dc.statusKey));
      if (missing.length > 0) {
        const merged = [...sorted, ...missing.map((m, i) => ({ ...m, sort_order: sorted.length + i }))];
        return merged;
      }
      return sorted;
    },
    enabled: !!tenantId,
  });

  const saveColumns = useMutation({
    mutationFn: async (columns: KanbanColumn[]) => {
      // Get current settings first
      const { data: tenant } = await supabase
        .from("tenants")
        .select("settings")
        .eq("id", tenantId!)
        .single();

      const currentSettings = (tenant?.settings as Record<string, any>) || {};
      const newSettings = { ...currentSettings, kanban_columns: columns } as any;

      const { error } = await supabase
        .from("tenants")
        .update({ settings: newSettings as any })
        .eq("id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kanban-columns", tenantId] }),
  });

  return { ...columnsQuery, saveColumns, DEFAULT_COLUMNS };
}
