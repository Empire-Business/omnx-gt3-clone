import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ProcessTag {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  created_by: string | null;
  created_at: string | null;
}

export function useProcessTags() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const tagsQuery = useQuery({
    queryKey: ["process-tags", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_tags" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return data as unknown as ProcessTag[];
    },
    enabled: !!tenantId,
  });

  const createTag = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { data, error } = await supabase
        .from("process_tags" as any)
        .insert({
          tenant_id: tenantId!,
          name,
          color,
          created_by: profile?.user_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProcessTag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-tags", tenantId] }),
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: string }) => {
      const updates: Record<string, string> = {};
      if (name !== undefined) updates.name = name;
      if (color !== undefined) updates.color = color;
      const { data, error } = await supabase
        .from("process_tags" as any)
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProcessTag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-tags", tenantId] }),
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("process_tags" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-tags", tenantId] }),
  });

  const assignTag = useMutation({
    mutationFn: async ({ processId, tagId }: { processId: string; tagId: string }) => {
      const { data, error } = await supabase
        .from("process_tag_assignments" as any)
        .insert({
          process_id: processId,
          tag_id: tagId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  const removeTag = useMutation({
    mutationFn: async ({ processId, tagId }: { processId: string; tagId: string }) => {
      const { error } = await supabase
        .from("process_tag_assignments" as any)
        .delete()
        .eq("process_id", processId)
        .eq("tag_id", tagId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  return {
    ...tagsQuery,
    createTag,
    updateTag,
    deleteTag,
    assignTag,
    removeTag,
  };
}
