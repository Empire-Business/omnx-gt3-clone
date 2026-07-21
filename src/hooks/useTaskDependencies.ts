/**
 * useTaskDependencies — v8.10.6
 * Dependências entre tasks: quem bloqueia quem ou quem está relacionada.
 * - blocks:     depends_on_task_id precisa estar concluída antes de task_id
 * - related_to: link sem semântica de bloqueio
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// types.ts será regenerado depois da migration; até lá usamos tipos manuais.
export type DependencyType = "blocks" | "related_to";

export interface TaskDep {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: DependencyType;
  tenant_id: string;
  created_by: string | null;
  created_at: string;
}

export interface DependencyWithTask extends TaskDep {
  task?: { id: string; title: string; status: string } | null;
}

export function useTaskDependencies(taskId: string | null | undefined) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  // Lista o que ESTA task depende (blocked_by) — task_id = taskId
  const blockedByQuery = useQuery({
    queryKey: ["task-deps", "blocked-by", tenantId, taskId],
    enabled: !!tenantId && !!taskId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<DependencyWithTask[]> => {
      const { data, error } = await (supabase.from("task_dependencies" as any) as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("task_id", taskId!);
      if (error) throw error;
      const rows = (data || []) as TaskDep[];
      const ids = [...new Set(rows.map((r) => r.depends_on_task_id))];
      if (ids.length === 0) return rows.map((r) => ({ ...r, task: null }));
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status")
        .in("id", ids);
      const map = new Map((tasks || []).map((t: any) => [t.id, t]));
      return rows.map((r) => ({ ...r, task: map.get(r.depends_on_task_id) ?? null }));
    },
  });

  // Lista o que ESTA task bloqueia — depends_on_task_id = taskId
  const blocksQuery = useQuery({
    queryKey: ["task-deps", "blocks", tenantId, taskId],
    enabled: !!tenantId && !!taskId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<DependencyWithTask[]> => {
      const { data, error } = await (supabase.from("task_dependencies" as any) as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("depends_on_task_id", taskId!);
      if (error) throw error;
      const rows = (data || []) as TaskDep[];
      const ids = [...new Set(rows.map((r) => r.task_id))];
      if (ids.length === 0) return rows.map((r) => ({ ...r, task: null }));
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status")
        .in("id", ids);
      const map = new Map((tasks || []).map((t: any) => [t.id, t]));
      return rows.map((r) => ({ ...r, task: map.get(r.task_id) ?? null }));
    },
  });

  const addDependency = useMutation({
    mutationFn: async (input: {
      task_id: string;
      depends_on_task_id: string;
      dependency_type: DependencyType;
    }) => {
      if (!tenantId) throw new Error("Tenant não disponível");
      if (input.task_id === input.depends_on_task_id) {
        throw new Error("Task não pode depender de si mesma");
      }
      const { error } = await (supabase.from("task_dependencies" as any) as any).insert({
        ...input,
        tenant_id: tenantId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-deps", "blocked-by", tenantId, taskId] });
      qc.invalidateQueries({ queryKey: ["task-deps", "blocks", tenantId, taskId] });
    },
  });

  const removeDependency = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("task_dependencies" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-deps", "blocked-by", tenantId, taskId] });
      qc.invalidateQueries({ queryKey: ["task-deps", "blocks", tenantId, taskId] });
    },
  });

  return {
    blockedBy: blockedByQuery.data || [],
    blocks: blocksQuery.data || [],
    isLoading: blockedByQuery.isLoading || blocksQuery.isLoading,
    addDependency,
    removeDependency,
  };
}
