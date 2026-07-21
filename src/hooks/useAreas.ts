import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Area = Tables<"company_areas">;
type Subarea = Tables<"subareas">;
type Position = Tables<"positions">;

/* ════════════════════════════════════════════
   EXTENDED POSITION TYPE WITH HIERARCHY
   ════════════════════════════════════════════ */

export interface PositionWithHierarchy extends Position {
  reports_to_id: string | null;
  reports_to_title?: string | null;
}

export interface PositionHierarchyNode extends PositionWithHierarchy {
  children: PositionHierarchyNode[];
  employee_id?: string | null;
  employee_name?: string | null;
  employee_avatar_url?: string | null;
}

function compareHierarchyLevel(a: number | null | undefined, b: number | null | undefined) {
  if (a === b) return 0;
  if (a === 0) return -1;
  if (b === 0) return 1;
  return (b ?? -1) - (a ?? -1);
}

function isHigherHierarchyLevel(
  candidateLevel: number | null | undefined,
  nodeLevel: number | null | undefined
) {
  if (candidateLevel == null || nodeLevel == null) return false;
  if (nodeLevel === 0) return false;
  if (candidateLevel === 0) return true;
  return candidateLevel < nodeLevel; // lower number = higher in org chart (Director=1, Leader=2, Employee=3)
}

function getHierarchyDistance(
  candidateLevel: number | null | undefined,
  nodeLevel: number | null | undefined
) {
  if (candidateLevel == null || nodeLevel == null) return Number.POSITIVE_INFINITY;
  if (candidateLevel === 0) return Number.POSITIVE_INFINITY;
  return nodeLevel - candidateLevel; // positive: closer parent = smaller value
}

function resolveFallbackParentPosition(
  node: PositionHierarchyNode,
  allNodes: PositionHierarchyNode[]
): string | null {
  if (node.reports_to_id) return node.reports_to_id;
  if (node.level == null || node.level <= 0) return null;

  const candidates = allNodes.filter((candidate) => (
    candidate.id !== node.id &&
    isHigherHierarchyLevel(candidate.level, node.level) &&
    candidate.tenant_id === node.tenant_id
  ));

  if (candidates.length === 0) {
    // No higher-level candidate found — try same-level, same-subarea fallback.
    // The position with the lowest sort_order in the subarea acts as the leader.
    if (node.subarea_id) {
      const sameLevelSubareaPeers = allNodes.filter((candidate) => (
        candidate.id !== node.id &&
        candidate.subarea_id === node.subarea_id &&
        candidate.level === node.level &&
        candidate.tenant_id === node.tenant_id &&
        (candidate.sort_order ?? 999) < (node.sort_order ?? 999)
      ));
      if (sameLevelSubareaPeers.length > 0) {
        sameLevelSubareaPeers.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
        return sameLevelSubareaPeers[0].id;
      }
    }
    return null;
  }

  candidates.sort((a, b) => {
    const aSameSubarea = a.subarea_id && a.subarea_id === node.subarea_id ? 0 : 1;
    const bSameSubarea = b.subarea_id && b.subarea_id === node.subarea_id ? 0 : 1;
    if (aSameSubarea !== bSameSubarea) return aSameSubarea - bSameSubarea;

    const aSameArea = a.area_id && a.area_id === node.area_id ? 0 : 1;
    const bSameArea = b.area_id && b.area_id === node.area_id ? 0 : 1;
    if (aSameArea !== bSameArea) return aSameArea - bSameArea;

    const distanceDiff = getHierarchyDistance(a.level, node.level) - getHierarchyDistance(b.level, node.level);
    if (distanceDiff !== 0) return distanceDiff;

    if (a.level !== b.level) return compareHierarchyLevel(a.level, b.level);
    return (a.sort_order ?? 999) - (b.sort_order ?? 999);
  });

  return candidates[0]?.id ?? null;
}

/* ════════════════════════════════════════════
   REORDER HELPERS
   ════════════════════════════════════════════ */

async function reorderItems<T extends { id: string; sort_order: number }>(
  table: "company_areas" | "subareas" | "positions",
  items: T[]
): Promise<void> {
  // Update all items with their new sort_order
  const updates = items.map((item, index) => ({
    id: item.id,
    sort_order: index,
    updated_at: new Date().toISOString(),
  }));

  // Use upsert for batch update
  const { error } = await supabase.from(table).upsert(updates as any, { onConflict: "id" });
  if (error) throw error;
}

/* ════════════════════════════════════════════
   AREAS
   ════════════════════════════════════════════ */

export function useAreas() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const queryClient = useQueryClient();

  const areasQuery = useQuery({
    queryKey: ["areas", tenantId],
    staleTime: 1000 * 60 * 5, // 5 minutes - cache areas data
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_areas")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("sort_order");
      if (error) throw error;
      return data as Area[];
    },
    enabled: !!tenantId,
  });

  const createArea = useMutation({
    mutationFn: async (area: Omit<TablesInsert<"company_areas">, "tenant_id">) => {
      const { data, error } = await supabase
        .from("company_areas")
        .insert({ ...area, tenant_id: tenantId! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["areas", tenantId] }),
  });

  const updateArea = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"company_areas"> & { id: string }) => {
      const { data, error } = await supabase
        .from("company_areas")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["areas", tenantId] }),
  });

  const deleteArea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["areas", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["subareas", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["positions", tenantId] });
    },
  });

  const reorderAreas = useMutation({
    mutationFn: async (areas: Area[]) => {
      await reorderItems("company_areas", areas);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["areas", tenantId] }),
  });

  return { ...areasQuery, createArea, updateArea, deleteArea, reorderAreas };
}

/* ════════════════════════════════════════════
   SUBAREAS
   ════════════════════════════════════════════ */

export function useSubareas(areaId?: string) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const queryClient = useQueryClient();

  const subareasQuery = useQuery({
    queryKey: ["subareas", tenantId, areaId],
    staleTime: 1000 * 60 * 5, // 5 minutes
    queryFn: async () => {
      let query = supabase.from("subareas").select("*").eq("tenant_id", tenantId!).order("sort_order");
      if (areaId) query = query.eq("area_id", areaId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Subarea[];
    },
    enabled: !!tenantId,
  });

  const createSubarea = useMutation({
    mutationFn: async (subarea: Omit<TablesInsert<"subareas">, "tenant_id">) => {
      const { data, error } = await supabase
        .from("subareas")
        .insert({ ...subarea, tenant_id: tenantId! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subareas", tenantId] }),
  });

  const updateSubarea = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"subareas"> & { id: string }) => {
      const { data, error } = await supabase
        .from("subareas")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subareas", tenantId] }),
  });

  const deleteSubarea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subareas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subareas"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
  });

  const reorderSubareas = useMutation({
    mutationFn: async (subareas: Subarea[]) => {
      await reorderItems("subareas", subareas);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subareas", tenantId] }),
  });

  return { ...subareasQuery, createSubarea, updateSubarea, deleteSubarea, reorderSubareas };
}

/* ════════════════════════════════════════════
   POSITIONS (CARGOS)
   ════════════════════════════════════════════ */

export function usePositions(subareaId?: string, areaId?: string) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const queryClient = useQueryClient();

  const positionsQuery = useQuery({
    queryKey: ["positions", tenantId, subareaId, areaId],
    staleTime: 1000 * 60 * 5, // 5 minutes
    queryFn: async () => {
      let query = supabase.from("positions").select("*").eq("tenant_id", tenantId!).order("sort_order");
      if (subareaId) query = query.eq("subarea_id", subareaId);
      if (areaId) query = query.eq("area_id", areaId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Position[];
    },
    enabled: !!tenantId,
  });

  const createPosition = useMutation({
    mutationFn: async (position: Omit<TablesInsert<"positions">, "tenant_id">) => {
      const { data, error } = await supabase
        .from("positions")
        .insert({ ...position, tenant_id: tenantId! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["positions", tenantId] }),
  });

  const updatePosition = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"positions"> & { id: string }) => {
      const { data, error } = await supabase
        .from("positions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["positions", tenantId] }),
  });

  const deletePosition = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["positions", tenantId] }),
  });

  const reorderPositions = useMutation({
    mutationFn: async (positions: Position[]) => {
      await reorderItems("positions", positions);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["positions", tenantId] }),
  });

  return { ...positionsQuery, createPosition, updatePosition, deletePosition, reorderPositions };
}

/* ════════════════════════════════════════════
   ALL POSITIONS FOR SELECTOR (with hierarchy)
   ════════════════════════════════════════════ */

export function useAllPositions() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["all-positions", tenantId],
    staleTime: 1000 * 60 * 5, // 5 minutes
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select(`
          id,
          title,
          level,
          reports_to_id,
          subarea_id,
          area_id,
          tenant_id,
          sort_order
        `)
        .order("level")
        .order("title");
      if (error) throw error;
      return data as PositionWithHierarchy[];
    },
    enabled: !!tenantId,
  });
}

/* ════════════════════════════════════════════
   POSITION HIERARCHY TREE
   ════════════════════════════════════════════ */

export function usePositionHierarchy() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["position-hierarchy", tenantId],
    staleTime: 1000 * 60 * 5, // 5 minutes
    queryFn: async () => {
      // Fetch all positions with their hierarchy info from the view
      const { data, error } = await supabase
        .from("position_hierarchy_view" as any)
        .select("*")
        .order("level")
        .order("position_title");
      if (error) throw error;

      // Build tree structure
      const positionMap = new Map<string, PositionHierarchyNode>();
      const rootNodes: PositionHierarchyNode[] = [];

      // First pass: create all nodes
      for (const row of (data || []) as any[]) {
        const node: PositionHierarchyNode = {
          id: row.position_id,
          tenant_id: row.tenant_id,
          title: row.position_title,
          description: row.description,
          level: row.level,
          subarea_id: row.subarea_id,
          area_id: row.area_id,
          sort_order: row.sort_order,
          reports_to_id: row.reports_to_id,
          reports_to_title: row.reports_to_title,
          area_type: row.area_type ?? null,
          area_name: row.area_name ?? null,
          children: [],
          employee_id: row.employee_id,
          employee_name: row.employee_name,
          employee_avatar_url: row.employee_avatar_url,
        } as any;
        positionMap.set(row.position_id, node);
      }

      const allNodes = [...positionMap.values()];

      // Second pass: build tree. If a position has no explicit parent, fall back
      // to the closest higher-level position in the same subarea/area.
      for (const node of allNodes) {
        const explicitParent = node.reports_to_id ? positionMap.get(node.reports_to_id) : null;
        // A cross-subarea reports_to is only valid when the parent is area/org level (no subarea)
        const explicitParentValid = explicitParent && (
          !explicitParent.subarea_id || explicitParent.subarea_id === node.subarea_id
        );
        const parentId = (explicitParentValid && node.reports_to_id && positionMap.has(node.reports_to_id))
          ? node.reports_to_id
          : resolveFallbackParentPosition(node, allNodes);

        if (parentId && positionMap.has(parentId)) {
          node.reports_to_id = parentId;
          positionMap.get(parentId)!.children.push(node);
        } else {
          rootNodes.push(node);
        }
      }

      // Reorganize: among siblings sharing the same subarea and level,
      // the one with the lowest sort_order becomes parent of the rest.
      const promoteSameLevelLeader = (nodes: PositionHierarchyNode[]) => {
        for (const node of nodes) {
          if (node.children.length > 1) {
            const groups = new Map<string, PositionHierarchyNode[]>();
            for (const child of node.children) {
              if (child.subarea_id && child.level != null) {
                const key = `${child.subarea_id}:${child.level}`;
                const g = groups.get(key) || [];
                g.push(child);
                groups.set(key, g);
              }
            }
            for (const group of groups.values()) {
              if (group.length <= 1) continue;
              group.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
              const leader = group[0];
              const followers = group.slice(1);
              node.children = node.children.filter(c => !followers.includes(c));
              leader.children.push(...followers);
            }
          }
          promoteSameLevelLeader(node.children);
        }
      };
      promoteSameLevelLeader(rootNodes);

      // Sort children by level then title
      const sortChildren = (nodes: PositionHierarchyNode[]) => {
        nodes.sort((a, b) => {
          if (a.level !== b.level) return compareHierarchyLevel(a.level, b.level);
          return (a.title || "").localeCompare(b.title || "");
        });
        nodes.forEach(n => sortChildren(n.children));
      };
      sortChildren(rootNodes);

return { flat: (data || []) as any[], tree: rootNodes, map: positionMap };
    },
    enabled: !!tenantId,
  });
}
