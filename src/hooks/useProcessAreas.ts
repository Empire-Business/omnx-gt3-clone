import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProcessArea {
  id: string;
  process_id: string;
  area_id: string;
  subarea_id: string | null;
  is_primary: boolean;
  created_at: string;
  area_name?: string;
  area_color?: string;
  subarea_name?: string;
}

/**
 * Hook to manage process-area N:N associations
 */
export function useProcessAreas(processId?: string) {
  const qc = useQueryClient();

  const processAreasQuery = useQuery({
    queryKey: ["process-areas", processId],
    enabled: !!processId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_areas")
        .select(`
          *,
          area:company_areas(id, name, color, type),
          subarea:subareas(id, name)
        `)
        .eq("process_id", processId!);
      if (error) throw error;
      return (data || []).map((pa: any) => ({
        ...pa,
        area_name: pa.area?.name,
        area_color: pa.area?.color,
        area_type: pa.area?.type,
        subarea_name: pa.subarea?.name,
      })) as ProcessArea[];
    },
  });

  const linkArea = useMutation({
    mutationFn: async ({ processId, areaId, subareaId, isPrimary = false }: {
      processId: string; areaId: string; subareaId?: string | null; isPrimary?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("process_areas")
        .insert({
          process_id: processId,
          area_id: areaId,
          subarea_id: subareaId || null,
          is_primary: isPrimary,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["process-areas"] });
      qc.invalidateQueries({ queryKey: ["processes"] });
    },
  });

  const unlinkArea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("process_areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["process-areas"] });
      qc.invalidateQueries({ queryKey: ["processes"] });
    },
  });

  return {
    ...processAreasQuery,
    linkArea,
    unlinkArea,
  };
}
