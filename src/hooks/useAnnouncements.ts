import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AnnouncementType = "announcement" | "post";
export type AnnouncementStatus = "draft" | "published" | "archived";
export type VisibilityTargetType = "all" | "position" | "employee" | "area" | "subarea";

export interface VisibilityTarget {
  id?: string;
  target_type: VisibilityTargetType;
  target_id?: string | null;
  label?: string; // display name, not persisted
}

export interface Announcement {
  id: string;
  tenant_id: string;
  author_id: string;
  author_name?: string | null;
  author_avatar?: string | null;
  title: string;
  content: string;
  type: AnnouncementType;
  status: AnnouncementStatus;
  cover_url?: string | null;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  visibility: VisibilityTarget[];
}

export interface CreateAnnouncementPayload {
  title: string;
  content: string;
  type: AnnouncementType;
  status: AnnouncementStatus;
  cover_url?: string | null;
  tags?: string[];
  pinned?: boolean;
  visibility: VisibilityTarget[];
}

export function useAnnouncements(filters?: { tag?: string; type?: AnnouncementType }) {
  const { profile, user } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const announcementsQuery = useQuery({
    queryKey: ["announcements", tenantId, filters],
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      let query = supabase
        .from("announcements" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("status", "published")
        .order("pinned", { ascending: false })
        .order("published_at", { ascending: false });

      if (filters?.type) query = query.eq("type", filters.type);
      if (filters?.tag) query = query.contains("tags", [filters.tag]);

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) return [] as Announcement[];

      const annIds = (data as any[]).map((a) => a.id);
      const authorIds = [...new Set((data as any[]).map((a) => a.author_id))];

      const [visibilityResult, authorsResult] = await Promise.all([
        supabase
          .from("announcement_visibility" as any)
          .select("announcement_id, target_type, target_id, id")
          .in("announcement_id", annIds),
        supabase
          .from("organograma_view" as any)
          .select("employee_id, full_name, avatar_url")
          .in("employee_id", authorIds),
      ]);

      const visibilityMap = new Map<string, VisibilityTarget[]>();
      for (const v of (visibilityResult.data || []) as any[]) {
        if (!visibilityMap.has(v.announcement_id)) visibilityMap.set(v.announcement_id, []);
        visibilityMap.get(v.announcement_id)!.push({ id: v.id, target_type: v.target_type, target_id: v.target_id });
      }

      const authorMap = new Map(
        ((authorsResult.data || []) as any[]).map((a) => [a.employee_id, { name: a.full_name, avatar: a.avatar_url }])
      );

      return (data as any[]).map((a): Announcement => ({
        ...a,
        tags: a.tags || [],
        visibility: visibilityMap.get(a.id) || [{ target_type: "all" }],
        author_name: authorMap.get(a.author_id)?.name ?? null,
        author_avatar: authorMap.get(a.author_id)?.avatar ?? null,
      }));
    },
    enabled: !!tenantId,
  });

  const createAnnouncement = useMutation({
    mutationFn: async (payload: CreateAnnouncementPayload) => {
      if (!tenantId || !user?.id) throw new Error("Usuário não autenticado");

      // Resolve author_id from employees table
      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .single();
      if (!empData) throw new Error("Colaborador não encontrado");

      const { visibility, ...rest } = payload;
      const { data: ann, error } = await supabase
        .from("announcements" as any)
        .insert({
          ...rest,
          tenant_id: tenantId,
          author_id: empData.id,
          published_at: rest.status === "published" ? new Date().toISOString() : null,
          tags: rest.tags || [],
        })
        .select()
        .single();
      if (error) throw error;

      // Insert visibility targets
      const targets = visibility.length > 0 ? visibility : [{ target_type: "all" as VisibilityTargetType }];
      const visRows = targets.map((v) => ({
        announcement_id: (ann as any).id,
        tenant_id: tenantId,
        target_type: v.target_type,
        target_id: v.target_id || null,
      }));
      const { error: visErr } = await supabase.from("announcement_visibility" as any).insert(visRows);
      if (visErr) throw visErr;

      return ann;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements", tenantId] }),
  });

  const updateAnnouncement = useMutation({
    mutationFn: async ({ id, visibility, ...updates }: Partial<CreateAnnouncementPayload> & { id: string }) => {
      const { error } = await supabase
        .from("announcements" as any)
        .update({
          ...updates,
          published_at: updates.status === "published" ? new Date().toISOString() : undefined,
        })
        .eq("id", id);
      if (error) throw error;

      if (visibility) {
        await supabase.from("announcement_visibility" as any).delete().eq("announcement_id", id);
        const targets = visibility.length > 0 ? visibility : [{ target_type: "all" as VisibilityTargetType }];
        const visRows = targets.map((v) => ({
          announcement_id: id,
          tenant_id: tenantId!,
          target_type: v.target_type,
          target_id: v.target_id || null,
        }));
        await supabase.from("announcement_visibility" as any).insert(visRows);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements", tenantId] }),
  });

  const deleteAnnouncement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements", tenantId] }),
  });

  return {
    announcements: announcementsQuery.data || [],
    isLoading: announcementsQuery.isLoading,
    isError: announcementsQuery.isError,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
  };
}

export function useAllAnnouncementTags() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["announcement-tags", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements" as any)
        .select("tags")
        .eq("tenant_id", tenantId!)
        .eq("status", "published");
      if (error) throw error;
      const all = (data as any[]).flatMap((a) => a.tags || []);
      return [...new Set(all)] as string[];
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  });
}
