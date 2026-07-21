import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ProcessFolder {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string | null;
}

export function useProcessFolders() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: ["process-folders", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_folders" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("sort_order");
      if (error) throw error;
      return data as unknown as ProcessFolder[];
    },
    enabled: !!tenantId,
  });

  const createFolder = useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId?: string | null }) => {
      const { data, error } = await supabase
        .from("process_folders" as any)
        .insert({
          tenant_id: tenantId!,
          name,
          parent_id: parentId ?? null,
          created_by: profile?.user_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProcessFolder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-folders", tenantId] }),
  });

  const renameFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase
        .from("process_folders" as any)
        .update({ name })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProcessFolder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-folders", tenantId] }),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("process_folders" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-folders", tenantId] }),
  });

  const moveFolder = useMutation({
    mutationFn: async ({ id, parentId }: { id: string; parentId: string | null }) => {
      const { data, error } = await supabase
        .from("process_folders" as any)
        .update({ parent_id: parentId })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProcessFolder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-folders", tenantId] }),
  });

  return {
    ...foldersQuery,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
  };
}
