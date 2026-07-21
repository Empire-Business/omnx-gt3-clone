import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Project = Tables<"projects">;

export interface ProjectMember {
  employee_id: string;
  role_in_project: string | null;
  full_name: string | null;
  avatar_url: string | null;
  position_title: string | null;
  area_id?: string | null;
  subarea_id?: string | null;
}

export interface ProjectWithMembers extends Project {
  members?: ProjectMember[];
  task_count?: number;
  done_task_count?: number;
  members_count?: number;
}

export interface ProjectFilters {
  area_id?: string | null;
  subarea_id?: string | null;
  position_id?: string | null;
  status?: string | null;
  priority?: string | null;
}

/**
 * Hook para gerenciar projetos com filtros hierárquicos e permissão de member
 * 
 * Regras de visibilidade para member:
 * - Ver projetos da sua área
 * - Ver projetos do seu gestor/diretor
 * - Ver projetos dos quais é membro
 * 
 * @param filters - Filtros opcionais por área, subárea, cargo, status e prioridade
 * @example
 * const { data, isLoading } = useProjects({ 
 *   area_id: 'uuid', 
 *   status: 'active',
 *   priority: 'high'
 * });
 */
export function useProjects(filters?: ProjectFilters) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const hasActiveFilters = filters?.area_id || filters?.subarea_id || filters?.position_id;

  const projectsQuery = useQuery({
    queryKey: ["projects", tenantId, filters],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!tenantId) return [] as ProjectWithMembers[];

      // O RLS do banco já controla visibilidade por role (admin vê tudo,
      // manager/member veem apenas os seus). Aqui só buscamos e montamos.
      const { data: allProjects, error } = await supabase
        .from("projects")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!allProjects || allProjects.length === 0) return [] as ProjectWithMembers[];

      const projectIds = allProjects.map((p) => p.id);

      // Membros e contagem de tarefas em paralelo
      const [epResult, taskResult] = await Promise.all([
        supabase.from("employee_projects").select("employee_id, project_id, role_in_project").in("project_id", projectIds),
        supabase.from("tasks").select("project_id, status").in("project_id", projectIds),
      ]);

      let membersMap: Record<string, ProjectMember[]> = {};
      let projectAreaMap: Record<string, { area_ids: string[]; subarea_ids: string[]; position_ids: string[] }> = {};

      if (epResult.data && epResult.data.length > 0) {
        const empIds = [...new Set(epResult.data.map((ep) => ep.employee_id))];

        const { data: orgData } = await supabase
          .from("organograma_view")
          .select("employee_id, full_name, avatar_url, position_title");

        const { data: empPositions } = await (supabase
          .from("employee_positions" as any)
          .select(`
            employee_id,
            position_id,
            position:positions(id, subarea_id, subarea:subareas(id, area_id))
          `)
          .in("employee_id", empIds) as any);

        const empHierarchyMap: Record<string, { position_id: string; subarea_id: string; area_id: string }> = {};
        for (const ep of empPositions || []) {
          empHierarchyMap[ep.employee_id] = {
            position_id: ep.position_id,
            subarea_id: ep.position?.subarea_id,
            area_id: ep.position?.subarea?.area_id,
          };
        }

        const empMap: Record<string, { full_name: string | null; avatar_url: string | null; position_title: string | null }> = {};
        for (const o of orgData || []) {
          if (o.employee_id) empMap[o.employee_id] = {
            full_name: o.full_name,
            avatar_url: o.avatar_url,
            position_title: o.position_title,
          };
        }

        for (const ep of epResult.data) {
          if (!membersMap[ep.project_id]) {
            membersMap[ep.project_id] = [];
            projectAreaMap[ep.project_id] = { area_ids: [], subarea_ids: [], position_ids: [] };
          }
          const hierarchy = empHierarchyMap[ep.employee_id];
          membersMap[ep.project_id]!.push({
            employee_id: ep.employee_id,
            role_in_project: ep.role_in_project,
            ...(empMap[ep.employee_id] || { full_name: null, avatar_url: null, position_title: null }),
            area_id: hierarchy?.area_id,
            subarea_id: hierarchy?.subarea_id,
          });
          if (hierarchy?.area_id && !projectAreaMap[ep.project_id].area_ids.includes(hierarchy.area_id)) {
            projectAreaMap[ep.project_id].area_ids.push(hierarchy.area_id);
          }
          if (hierarchy?.subarea_id && !projectAreaMap[ep.project_id].subarea_ids.includes(hierarchy.subarea_id)) {
            projectAreaMap[ep.project_id].subarea_ids.push(hierarchy.subarea_id);
          }
          if (hierarchy?.position_id && !projectAreaMap[ep.project_id].position_ids.includes(hierarchy.position_id)) {
            projectAreaMap[ep.project_id].position_ids.push(hierarchy.position_id);
          }
        }
      }

      let taskMap: Record<string, { total: number; done: number }> = {};
      for (const t of taskResult.data || []) {
        if (!t.project_id) continue;
        if (!taskMap[t.project_id]) taskMap[t.project_id] = { total: 0, done: 0 };
        taskMap[t.project_id].total++;
        if (t.status === "done") taskMap[t.project_id].done++;
      }

      let result = allProjects.map((p) => ({
        ...p,
        members: membersMap[p.id] || [],
        task_count: taskMap[p.id]?.total || 0,
        done_task_count: taskMap[p.id]?.done || 0,
        members_count: membersMap[p.id]?.length || 0,
      })) as ProjectWithMembers[];

      // Filtros de UI opcionais (área/subárea/cargo) aplicados sobre o resultado do RLS
      if (hasActiveFilters) {
        result = result.filter((p) => {
          const areas = projectAreaMap[p.id]?.area_ids || [];
          const subareas = projectAreaMap[p.id]?.subarea_ids || [];
          const positions = projectAreaMap[p.id]?.position_ids || [];
          if (filters?.area_id && !areas.includes(filters.area_id)) return false;
          if (filters?.subarea_id && !subareas.includes(filters.subarea_id)) return false;
          if (filters?.position_id && !positions.includes(filters.position_id)) return false;
          return true;
        });
      }

      return result;
    },
    enabled: !!tenantId,
  });

  const createProject = useMutation({
    mutationFn: async (payload: Omit<TablesInsert<"projects">, "tenant_id">) => {
      const { data, error } = await supabase
        .from("projects")
        .insert({ ...payload, tenant_id: tenantId! })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", tenantId] }),
  });

  const updateProject = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"projects"> & { id: string }) => {
      const { data, error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", tenantId] }),
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", tenantId] }),
  });

  const addMember = useMutation({
    mutationFn: async ({ project_id, employee_id, role_in_project }: { project_id: string; employee_id: string; role_in_project?: string }) => {
      const { error } = await supabase
        .from("employee_projects")
        .insert({ project_id, employee_id, tenant_id: tenantId!, role_in_project: role_in_project || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", tenantId] }),
  });

  const removeMember = useMutation({
    mutationFn: async ({ project_id, employee_id }: { project_id: string; employee_id: string }) => {
      const { error } = await supabase
        .from("employee_projects")
        .delete()
        .eq("project_id", project_id)
        .eq("employee_id", employee_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", tenantId] }),
  });

  return { ...projectsQuery, createProject, updateProject, deleteProject, addMember, removeMember };
}

/**
 * Hook específico para buscar um projeto por ID com todos os detalhes
 */
export function useProject(projectId: string | undefined) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["project", projectId, tenantId],
    staleTime: 1000 * 60 * 5,
    enabled: !!projectId && !!tenantId,
    queryFn: async () => {
      const { data: project, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId!)
        .eq("tenant_id", tenantId!)
        .single();

      if (error) throw error;

      // Buscar membros
      const { data: members } = await supabase
        .from("employee_projects")
        .select(`
          employee_id,
          role_in_project,
          employee:employees(id, profiles:profiles(full_name, avatar_url))
        `)
        .eq("project_id", projectId);

      // Buscar tarefas
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, status")
        .eq("project_id", projectId);

      return {
        ...project,
        members: members || [],
        task_count: tasks?.length || 0,
        done_task_count: tasks?.filter(t => t.status === 'done').length || 0,
      } as unknown as ProjectWithMembers;
    },
  });
}
