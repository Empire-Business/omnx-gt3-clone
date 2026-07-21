import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface TaskRecurrence {
  id: string;
  task_id: string;
  tenant_id: string;
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "custom";
  interval_days: number | null;
  days_of_week: number[] | null;
  day_of_month: number | null;
  end_date: string | null;
  next_occurrence: string;
  is_active: boolean;
  created_at: string;
}

export function useTaskRecurrence(taskId?: string) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const recurrenceQuery = useQuery({
    queryKey: ["task-recurrence", tenantId, taskId],
    queryFn: async () => {
      // Guard extra (RLS depende disso)
      if (!tenantId || !taskId) return null;
      const { data, error } = await supabase
        .from("task_recurrence")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as TaskRecurrence | null;
    },
    enabled: !!tenantId && !!taskId,
  });

  const saveRecurrence = useMutation({
    mutationFn: async (payload: Omit<TaskRecurrence, "id" | "tenant_id" | "created_at">) => {
      // Upsert: delete existing then insert
      await supabase.from("task_recurrence").delete().eq("task_id", payload.task_id).eq("tenant_id", tenantId!);
      const { data, error } = await supabase
        .from("task_recurrence")
        .insert({ ...payload, tenant_id: tenantId! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-recurrence", tenantId, taskId] }),
  });

  const deleteRecurrence = useMutation({
    mutationFn: async (recurrenceId: string) => {
      const { error } = await supabase.from("task_recurrence").delete().eq("id", recurrenceId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-recurrence", tenantId, taskId] }),
  });

  return { ...recurrenceQuery, saveRecurrence, deleteRecurrence };
}
