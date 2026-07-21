import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Process = Tables<"processes">;
type ProcessStep = Tables<"process_steps">;
type ProcessPosition = Tables<"process_positions">;

export interface ProcessTag {
  id: string;
  name: string;
  color: string;
}

export interface ProcessWithSteps extends Process {
  steps: ProcessStep[];
  tags: ProcessTag[];
  folder_id: string | null;
  position_title?: string | null;
  area_name?: string | null;
  area_color?: string | null;
  subarea_name?: string | null;
  linked_positions_count?: number;
}

export interface ProcessFilters {
  area_id?: string | null;
  subarea_id?: string | null;
  position_id?: string | null;
  status?: string | null;
  folder_id?: string | null;
}

/**
 * Hook para gerenciar processos com filtros hierárquicos
 * 
 * @param filters - Filtros opcionais por área, subárea e cargo
 * @example
 * const { data, isLoading } = useProcesses({ 
 *   area_id: 'uuid', 
 *   subarea_id: 'uuid',
 *   position_id: 'uuid'
 * });
 */
export function useProcesses(filters?: ProcessFilters, options?: { queryEnabled?: boolean }) {
  const { profile, user } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const processesQuery = useQuery({
    queryKey: ["processes", tenantId, filters],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      // Sempre usar a tabela processes diretamente (evita INNER JOIN da view
      // que exclui processos sem cargos vinculados)
      // Não buscar process_markdown e flow_data na lista — podem ser MBs de dados
      // e não são usados nos cards. São carregados somente na página de detalhe.
      let query = supabase
        .from("processes")
        .select("id, tenant_id, created_by, name, status, description, area_id, subarea_id, folder_id, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (filters?.area_id) {
        query = query.eq("area_id", filters.area_id);
      }
      if (filters?.subarea_id) {
        query = query.eq("subarea_id", filters.subarea_id);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status as "active" | "draft" | "archived");
      }

      // Filtro por cargo: pré-buscar IDs em process_positions
      if (filters?.position_id) {
        const { data: ppData } = await supabase
          .from("process_positions")
          .select("process_id")
          .eq("position_id", filters.position_id);
        const linkedIds = (ppData || []).map((pp) => pp.process_id);
        if (linkedIds.length === 0) return [] as ProcessWithSteps[];
        query = query.in("id", linkedIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const processIds = (data || []).map((p) => p.id);

      // Fetch steps, cargos vinculados e tags em paralelo
      const [stepsResult, positionsResult, tagsResult] = await Promise.all([
        // Buscar etapas
        processIds.length > 0
          ? supabase
              .from("process_steps")
              .select("*")
              .in("process_id", processIds)
              .order("sort_order")
          : Promise.resolve({ data: [] as ProcessStep[], error: null }),

        // Buscar cargos vinculados via process_positions
        processIds.length > 0
          ? supabase
              .from("process_positions")
              .select(`
                *,
                position:positions(id, title, subarea_id)
              `)
              .in("process_id", processIds)
          : Promise.resolve({ data: [] as any[], error: null }),

        // Buscar tags vinculadas via process_tag_assignments
        processIds.length > 0
          ? supabase
              .from("process_tag_assignments" as any)
              .select("process_id, tag:process_tags(id, name, color)")
              .in("process_id", processIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      // Mapear steps por processo
      const stepsMap: Record<string, ProcessStep[]> = {};
      for (const s of stepsResult.data || []) {
        if (!stepsMap[s.process_id]) stepsMap[s.process_id] = [];
        stepsMap[s.process_id].push(s);
      }

      // Mapear cargos vinculados por processo
      const positionsMap: Record<string, Array<{ id: string; title: string; is_primary: boolean }>> = {};
      for (const pp of positionsResult.data || []) {
        if (!positionsMap[pp.process_id]) positionsMap[pp.process_id] = [];
        positionsMap[pp.process_id].push({
          id: pp.position_id,
          title: pp.position?.title || 'Cargo desconhecido',
          is_primary: pp.is_primary,
        });
      }

      // Mapear tags por processo
      const tagsMap: Record<string, ProcessTag[]> = {};
      for (const ta of (tagsResult.data || []) as any[]) {
        const pid = ta.process_id;
        if (!tagsMap[pid]) tagsMap[pid] = [];
        if (ta.tag) {
          tagsMap[pid].push({
            id: ta.tag.id,
            name: ta.tag.name,
            color: ta.tag.color,
          });
        }
      }

      // Combinar dados
      return (data || []).map((p: any) => ({
        ...p,
        steps: stepsMap[p.id] || [],
        tags: tagsMap[p.id] || [],
        linked_positions: positionsMap[p.id] || [],
        linked_positions_count: positionsMap[p.id]?.length || 0,
      })) as ProcessWithSteps[];
    },
    enabled: !!tenantId && (options?.queryEnabled !== false),
  });

  // Criar processo
  const createProcess = useMutation({
    mutationFn: async (payload: Omit<TablesInsert<"processes">, "tenant_id" | "created_by">) => {
      if (!tenantId || !user?.id) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase
        .from("processes")
        .insert({ ...payload, tenant_id: tenantId, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  // Atualizar processo
  const updateProcess = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"processes"> & { id: string }) => {
      const { data, error } = await supabase
        .from("processes")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["processes", tenantId] });
      // Invalida a query de detalhe para que a UI reflita imediatamente as mudanças
      if (data?.id) {
        qc.invalidateQueries({ queryKey: ["process", data.id, tenantId] });
      }
    },
  });

  // Deletar processo
  const deleteProcess = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("processes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  // ========== MUTATIONS DE ETAPAS ==========

  const createStep = useMutation({
    mutationFn: async (payload: Omit<TablesInsert<"process_steps">, "tenant_id">) => {
      const { data, error } = await supabase
        .from("process_steps")
        .insert({ ...payload, tenant_id: tenantId! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  const updateStep = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"process_steps"> & { id: string }) => {
      const { data, error } = await supabase
        .from("process_steps")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("process_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  // ========== MUTATIONS DE VÍNCULO DE CARGOS (NOVO) ==========

  /**
   * Vincular um cargo a um processo
   */
  const linkPosition = useMutation({
    mutationFn: async ({ 
      processId, 
      positionId, 
      isPrimary = false 
    }: { 
      processId: string; 
      positionId: string; 
      isPrimary?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("process_positions")
        .insert({
          process_id: processId,
          position_id: positionId,
          is_primary: isPrimary,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  /**
   * Desvincular um cargo de um processo
   */
  const unlinkPosition = useMutation({
    mutationFn: async ({ 
      processId, 
      positionId 
    }: { 
      processId: string; 
      positionId: string;
    }) => {
      const { error } = await supabase
        .from("process_positions")
        .delete()
        .eq("process_id", processId)
        .eq("position_id", positionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  /**
   * Definir cargo principal de um processo
   */
  const setPrimaryPosition = useMutation({
    mutationFn: async ({ 
      processId, 
      positionId 
    }: { 
      processId: string; 
      positionId: string;
    }) => {
      // Primeiro, remover primary de todos os cargos do processo
      await supabase
        .from("process_positions")
        .update({ is_primary: false })
        .eq("process_id", processId);

      // Depois, definir o novo primary
      const { data, error } = await supabase
        .from("process_positions")
        .update({ is_primary: true })
        .eq("process_id", processId)
        .eq("position_id", positionId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  // Mover processo para pasta
  const moveToFolder = useMutation({
    mutationFn: async ({ processId, folderId }: { processId: string; folderId: string | null }) => {
      const { data, error } = await supabase
        .from("processes")
        .update({ folder_id: folderId } as any)
        .eq("id", processId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["processes", tenantId] }),
  });

  return {
    ...processesQuery,
    createProcess,
    updateProcess,
    deleteProcess,
    createStep,
    updateStep,
    deleteStep,
    moveToFolder,
    linkPosition,
    unlinkPosition,
    setPrimaryPosition,
  };
}

/**
 * Hook específico para buscar um processo por ID com todos os detalhes.
 * Usa placeholderData do cache da lista para mostrar nome/status imediatamente
 * enquanto o conteúdo completo (markdown, steps, linked_positions) carrega.
 * placeholderData sempre dispara refetch — sem risco de dados incompletos.
 */
export function useProcess(processId: string | undefined) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  return useQuery({
    queryKey: ["process", processId, tenantId],
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    enabled: !!processId && !!tenantId,
    // placeholderData: mostra dados parciais da lista imediatamente,
    // mas SEMPRE dispara o fetch completo em background (diferente de initialData)
    placeholderData: () => {
      const allCached = qc.getQueriesData<ProcessWithSteps[]>({ queryKey: ["processes", tenantId] });
      for (const [, list] of allCached) {
        const found = list?.find((p) => p.id === processId);
        if (found) return { ...found, steps: [], linked_positions: [] } as ProcessWithSteps;
      }
      return undefined;
    },
    queryFn: async () => {
      // Uma única query com todos os joins — elimina o waterfall de 3 round trips
      const { data, error } = await supabase
        .from("processes")
        .select(`
          *,
          steps:process_steps(*),
          linked_positions:process_positions(
            *,
            position:positions(
              id, title, subarea_id,
              subarea:subareas(id, name, area:company_areas(id, name, color))
            )
          )
        `)
        .eq("id", processId!)
        .order("sort_order", { referencedTable: "process_steps" })
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return data as unknown as ProcessWithSteps;
    },
  });
}
