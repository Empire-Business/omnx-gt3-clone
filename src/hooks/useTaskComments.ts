import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
}

export function useTaskComments(taskId?: string) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const commentsQuery = useQuery({
    queryKey: ["task-comments", tenantId, taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId!)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return [] as TaskComment[];

      const authorIds = [...new Set(data.map((c: any) => c.author_id))];

      // Busca user_id dos employees, depois os profiles correspondentes
      const { data: empRows } = await supabase
        .from("employees")
        .select("id, user_id")
        .in("id", authorIds);

      const userIds = (empRows || []).map((e: any) => e.user_id).filter(Boolean);
      const { data: profileRows } = userIds.length
        ? await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds)
        : { data: [] };

      const userIdToProfile = new Map(
        (profileRows || []).map((p: any) => [p.user_id, { name: p.full_name, avatar: p.avatar_url }])
      );
      const authorMap = new Map(
        (empRows || []).map((e: any) => [e.id, userIdToProfile.get(e.user_id) || { name: null, avatar: null }])
      );

      return data.map((c: any): TaskComment => ({
        ...c,
        author_name: authorMap.get(c.author_id)?.name || null,
        author_avatar: authorMap.get(c.author_id)?.avatar || null,
      }));
    },
    enabled: !!tenantId && !!taskId,
  });

  const addComment = useMutation({
    mutationFn: async ({ authorId, content }: { authorId: string; content: string }) => {
      const { error } = await supabase
        .from("task_comments")
        .insert({
          task_id: taskId!,
          tenant_id: tenantId!,
          author_id: authorId,
          content,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", tenantId, taskId] }),
  });

  const updateComment = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      const { error } = await supabase
        .from("task_comments")
        .update({ content })
        .eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", tenantId, taskId] }),
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from("task_comments")
        .delete()
        .eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", tenantId, taskId] }),
  });

  return {
    comments: commentsQuery.data || [],
    commentsLoading: commentsQuery.isLoading,
    addComment,
    updateComment,
    deleteComment,
  };
}
