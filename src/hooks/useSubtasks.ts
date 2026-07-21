/**
 * useSubtasks — v8.10.6
 * Subtarefas reais (linhas em tasks com parent_task_id apontando pra mãe).
 * Apenas 1 nível: trigger no banco impede sub-subtarefas.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

// types.ts é regenerado; até lá, parent_task_id e source_meeting_id moram como any
type Task = Tables<"tasks"> & {
  parent_task_id?: string | null;
  source_meeting_id?: string | null;
};

export function useSubtasks(parentTaskId: string | null | undefined) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const subtasksQuery = useQuery({
    queryKey: ["subtasks", tenantId, parentTaskId],
    enabled: !!tenantId && !!parentTaskId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await (supabase.from("tasks") as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("parent_task_id", parentTaskId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  const createSubtask = useMutation({
    mutationFn: async (
      payload: Omit<TablesInsert<"tasks">, "tenant_id" | "parent_task_id"> & { parent_task_id?: string },
    ) => {
      if (!tenantId) throw new Error("Tenant não disponível");
      if (!parentTaskId && !payload.parent_task_id) throw new Error("parent_task_id obrigatório");
      const { data, error } = await (supabase.from("tasks") as any)
        .insert({
          ...payload,
          tenant_id: tenantId,
          parent_task_id: payload.parent_task_id || parentTaskId!,
          status: payload.status || "todo",
        })
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subtasks", tenantId, parentTaskId] });
      qc.invalidateQueries({ queryKey: ["tasks", tenantId] });
    },
  });

  const updateSubtask = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase.from("tasks") as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subtasks", tenantId, parentTaskId] });
      qc.invalidateQueries({ queryKey: ["tasks", tenantId] });
    },
  });

  const toggleSubtaskStatus = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: done ? "done" : "todo" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subtasks", tenantId, parentTaskId] });
      qc.invalidateQueries({ queryKey: ["tasks", tenantId] });
    },
  });

  const deleteSubtask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subtasks", tenantId, parentTaskId] });
      qc.invalidateQueries({ queryKey: ["tasks", tenantId] });
    },
  });

  const subtasks = subtasksQuery.data || [];
  const doneCount = subtasks.filter((s) => s.status === "done").length;
  const progress = subtasks.length > 0 ? (doneCount / subtasks.length) * 100 : 0;

  return {
    subtasks,
    isLoading: subtasksQuery.isLoading,
    doneCount,
    totalCount: subtasks.length,
    progress,
    createSubtask,
    updateSubtask,
    toggleSubtaskStatus,
    deleteSubtask,
  };
}
