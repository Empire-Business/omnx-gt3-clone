import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type Platform = {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  href: string;
  color: string;
  initial: string;
  order_index: number;
  thumbnail_url: string | null;
};

export type PlatformInput = Omit<Platform, "id" | "tenant_id">;

export async function uploadPlatformThumbnail(file: File, platformId: string): Promise<string> {
  const ext = file.name.split(".").pop();
  const path = `${platformId}.${ext}`;
  const { error } = await supabase.storage
    .from("platform-thumbnails")
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("platform-thumbnails").getPublicUrl(path);
  return data.publicUrl;
}

export function usePlatforms() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const { data: platforms = [], isLoading } = useQuery({
    queryKey: ["tenant_platforms", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_platforms")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("order_index");
      if (error) throw error;
      return data as Platform[];
    },
  });

  const updatePlatform = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<PlatformInput> }) => {
      const { error } = await supabase
        .from("tenant_platforms")
        .update(input)
        .eq("id", id)
        .eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_platforms", tenantId] });
      toast.success("Plataforma atualizada.");
    },
    onError: () => toast.error("Erro ao atualizar plataforma."),
  });

  const createPlatform = useMutation({
    mutationFn: async (input: PlatformInput) => {
      const { error } = await supabase
        .from("tenant_platforms")
        .insert({ ...input, tenant_id: tenantId! });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_platforms", tenantId] });
      toast.success("Plataforma adicionada.");
    },
    onError: () => toast.error("Erro ao adicionar plataforma."),
  });

  const deletePlatform = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tenant_platforms")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_platforms", tenantId] });
      toast.success("Plataforma removida.");
    },
    onError: () => toast.error("Erro ao remover plataforma."),
  });

  return { platforms, isLoading, updatePlatform, createPlatform, deletePlatform };
}
