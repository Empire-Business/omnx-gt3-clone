import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useEmployees } from "./useEmployees";
import { toast } from "sonner";

export interface AnnouncementComment {
  id: string;
  announcement_id: string;
  author_id: string;
  tenant_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  author_avatar?: string | null;
}

export interface AnnouncementReaction {
  id: string;
  announcement_id: string;
  employee_id: string;
  tenant_id: string;
  reaction: string;
  created_at: string;
}

// ── COMENTÁRIOS ─────────────────────────────────────────────

export function useAnnouncementComments(announcementId: string) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["announcement-comments", announcementId, tenantId],
    enabled: !!announcementId && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcement_comments" as any)
        .select("*")
        .eq("announcement_id", announcementId)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Enriquecer com dados do autor via organograma_view
      const comments = (data || []) as unknown as AnnouncementComment[];
      const authorIds = [...new Set(comments.map((c) => c.author_id))];

      if (authorIds.length === 0) return comments;

      const { data: authors } = await supabase
        .from("organograma_view")
        .select("employee_id, full_name, avatar_url")
        .in("employee_id", authorIds);

      const authorMap = new Map(
        (authors || []).map((a: any) => [a.employee_id, { name: a.full_name, avatar: a.avatar_url }])
      );

      return comments.map((c) => ({
        ...c,
        author_name: authorMap.get(c.author_id)?.name ?? null,
        author_avatar: authorMap.get(c.author_id)?.avatar ?? null,
      }));
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: employees } = useEmployees();

  return useMutation({
    mutationFn: async ({ announcementId, content }: { announcementId: string; content: string }) => {
      const employeeId = employees?.find((e) => e.user_id === profile?.user_id)?.id;
      if (!employeeId) throw new Error("Colaborador não encontrado");

      const { data, error } = await supabase
        .from("announcement_comments" as any)
        .insert({
          announcement_id: announcementId,
          author_id: employeeId,
          tenant_id: profile!.tenant_id,
          content: content.trim(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["announcement-comments", vars.announcementId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao comentar");
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, announcementId }: { commentId: string; announcementId: string }) => {
      const { error } = await supabase
        .from("announcement_comments" as any)
        .delete()
        .eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["announcement-comments", vars.announcementId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao excluir comentário");
    },
  });
}

// ── REAÇÕES ──────────────────────────────────────────────────

export function useAnnouncementReactions(announcementId: string) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["announcement-reactions", announcementId, tenantId],
    enabled: !!announcementId && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcement_reactions" as any)
        .select("*")
        .eq("announcement_id", announcementId)
        .eq("tenant_id", tenantId!);

      if (error) throw error;
      return (data || []) as unknown as AnnouncementReaction[];
    },
  });
}

export function useToggleReaction() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: employees } = useEmployees();

  return useMutation({
    mutationFn: async ({
      announcementId,
      reaction = "like",
      currentReactions,
    }: {
      announcementId: string;
      reaction?: string;
      currentReactions: AnnouncementReaction[];
    }) => {
      const employeeId = employees?.find((e) => e.user_id === profile?.user_id)?.id;
      if (!employeeId) throw new Error("Colaborador não encontrado");

      const existing = currentReactions.find(
        (r) => r.employee_id === employeeId && r.reaction === reaction
      );

      if (existing) {
        const { error } = await supabase
          .from("announcement_reactions" as any)
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("announcement_reactions" as any)
          .insert({
            announcement_id: announcementId,
            employee_id: employeeId,
            tenant_id: profile!.tenant_id,
            reaction,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["announcement-reactions", vars.announcementId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao reagir");
    },
  });
}
