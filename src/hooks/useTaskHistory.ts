import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaskHistoryRow {
  id: string;
  task_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
  /** join derivado: nome do autor */
  author_name?: string | null;
  author_avatar?: string | null;
}

export function useTaskHistory(taskId: string | undefined) {
  return useQuery({
    queryKey: ["task_history", taskId],
    enabled: !!taskId,
    staleTime: 30_000,
    queryFn: async (): Promise<TaskHistoryRow[]> => {
      const { data, error } = await (supabase as any)
        .from("task_history")
        .select("*")
        .eq("task_id", taskId!)
        .order("changed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as TaskHistoryRow[];
      const userIds = [
        ...new Set(rows.map((r) => r.changed_by).filter(Boolean) as string[]),
      ];
      if (userIds.length) {
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);
        const map: Record<string, { name: string | null; avatar: string | null }> = {};
        for (const p of profiles ?? []) {
          map[p.user_id] = { name: p.full_name, avatar: p.avatar_url };
        }
        return rows.map((r) => ({
          ...r,
          author_name: r.changed_by ? map[r.changed_by]?.name ?? null : null,
          author_avatar: r.changed_by ? map[r.changed_by]?.avatar ?? null : null,
        }));
      }
      return rows;
    },
  });
}
