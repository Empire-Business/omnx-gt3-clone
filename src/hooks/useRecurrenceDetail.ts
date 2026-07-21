import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface RecurrenceComment {
  id: string;
  recurrence_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
}

export interface RecurrenceCompletion {
  id: string;
  recurrence_id: string;
  completed_by: string;
  completion_date: string;
  notes: string | null;
  created_at: string;
  completed_by_name: string | null;
}

export function useRecurrenceDetail(recurrenceId?: string) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  // Fetch task details for the recurrence
  const taskQuery = useQuery({
    queryKey: ["recurrence-task", tenantId, recurrenceId],
    queryFn: async () => {
      const { data: rec } = await supabase
        .from("task_recurrence")
        .select("task_id")
        .eq("id", recurrenceId!)
        .single();
      if (!rec) return null;

      const { data: task } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", rec.task_id)
        .single();
      return task;
    },
    enabled: !!tenantId && !!recurrenceId,
  });

  // Comments
  const commentsQuery = useQuery({
    queryKey: ["recurrence-comments", tenantId, recurrenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_recurrence_comments")
        .select("*")
        .eq("recurrence_id", recurrenceId!)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return [] as RecurrenceComment[];

      const authorIds = [...new Set(data.map((c) => c.author_id))];
      const { data: authors } = await supabase
        .from("organograma_view")
        .select("employee_id, full_name, avatar_url")
        .in("employee_id", authorIds);

      const authorMap = new Map(
        (authors || []).map((a) => [a.employee_id, { name: a.full_name, avatar: a.avatar_url }])
      );

      return data.map((c): RecurrenceComment => ({
        ...c,
        author_name: authorMap.get(c.author_id)?.name || null,
        author_avatar: authorMap.get(c.author_id)?.avatar || null,
      }));
    },
    enabled: !!tenantId && !!recurrenceId,
  });

  // Completions
  const completionsQuery = useQuery({
    queryKey: ["recurrence-completions", tenantId, recurrenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_recurrence_completions")
        .select("*")
        .eq("recurrence_id", recurrenceId!)
        .eq("tenant_id", tenantId!)
        .order("completion_date", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) return [] as RecurrenceCompletion[];

      const empIds = [...new Set(data.map((c) => c.completed_by))];
      const { data: emps } = await supabase
        .from("organograma_view")
        .select("employee_id, full_name")
        .in("employee_id", empIds);

      const empMap = new Map((emps || []).map((e) => [e.employee_id, e.full_name]));

      return data.map((c): RecurrenceCompletion => ({
        ...c,
        completed_by_name: empMap.get(c.completed_by) || null,
      }));
    },
    enabled: !!tenantId && !!recurrenceId,
  });

  // Add comment
  const addComment = useMutation({
    mutationFn: async ({ authorId, content }: { authorId: string; content: string }) => {
      const { error } = await supabase
        .from("task_recurrence_comments")
        .insert({
          recurrence_id: recurrenceId!,
          tenant_id: tenantId!,
          author_id: authorId,
          content,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurrence-comments", tenantId, recurrenceId] }),
  });

  // Delete comment
  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from("task_recurrence_comments")
        .delete()
        .eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurrence-comments", tenantId, recurrenceId] }),
  });

  // Toggle completion for a date
  const toggleCompletion = useMutation({
    mutationFn: async ({ employeeId, date, notes }: { employeeId: string; date: string; notes?: string }) => {
      // Check if already completed
      const { data: existing } = await supabase
        .from("task_recurrence_completions")
        .select("id")
        .eq("recurrence_id", recurrenceId!)
        .eq("completion_date", date)
        .maybeSingle();

      if (existing) {
        // Remove completion
        const { error } = await supabase
          .from("task_recurrence_completions")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        return { action: "removed" as const };
      } else {
        // Add completion
        const { error } = await supabase
          .from("task_recurrence_completions")
          .insert({
            recurrence_id: recurrenceId!,
            tenant_id: tenantId!,
            completed_by: employeeId,
            completion_date: date,
            notes: notes || null,
          });
        if (error) throw error;
        return { action: "completed" as const };
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurrence-completions", tenantId, recurrenceId] }),
  });

  return {
    task: taskQuery.data,
    taskLoading: taskQuery.isLoading,
    comments: commentsQuery.data || [],
    commentsLoading: commentsQuery.isLoading,
    completions: completionsQuery.data || [],
    completionsLoading: completionsQuery.isLoading,
    addComment,
    deleteComment,
    toggleCompletion,
  };
}
