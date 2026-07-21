import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ProcessComment = {
  id: string;
  process_id: string;
  tenant_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  author_avatar?: string | null;
};

export function useProcessComments(processId: string | undefined) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const queryKey = ["process_comments", tenantId, processId];

  const query = useQuery({
    queryKey,
    enabled: !!processId && !!tenantId,
    queryFn: async () => {
      if (!processId || !tenantId) return [] as ProcessComment[];
      const { data, error } = await supabase
        .from("process_comments" as any)
        .select("*")
        .eq("process_id", processId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const comments = (data || []) as ProcessComment[];
      // Hidrata nomes/avatares dos autores via profiles
      const authorIds = [...new Set(comments.map((c) => c.author_id))];
      if (authorIds.length === 0) return comments;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", authorIds);
      const map = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return comments.map((c) => {
        const p = map.get(c.author_id) as any;
        return { ...c, author_name: p?.full_name ?? null, author_avatar: p?.avatar_url ?? null };
      });
    },
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      if (!processId || !tenantId || !profile?.user_id) throw new Error("Sessão inválida");
      const { data, error } = await supabase
        .from("process_comments" as any)
        .insert({
          process_id: processId,
          tenant_id: tenantId,
          author_id: profile.user_id,
          content: content.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("process_comments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  return {
    comments: query.data || [],
    isLoading: query.isLoading,
    addComment,
    deleteComment,
  };
}
