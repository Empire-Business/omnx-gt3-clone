import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { syncProjectLabel } from "@/lib/task-project-labels";
import type { Tables, TablesInsert, TablesUpdate, Database } from "@/integrations/supabase/types";

type Task = Tables<"tasks">;
type TaskStatus = Database["public"]["Enums"]["task_status"];

export interface TaskAssignee {
  employee_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface TaskWithDetails extends Task {
  assignee_name?: string | null;
  assignee_avatar?: string | null;
  project_name?: string | null;
  assignees?: TaskAssignee[];
  has_recurrence?: boolean;
  recurrence_frequency?: string | null;
}

export function useTasks(projectId?: string) {
  const { user, profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const resolveTaskLabels = async ({
    taskId,
    project_id,
    labels,
  }: {
    taskId?: string;
    project_id?: string | null;
    labels?: unknown;
  }) => {
    if (!tenantId) {
      return Array.isArray(labels) ? labels : [];
    }

    const shouldSyncProjectLabel = typeof project_id !== "undefined" || typeof labels !== "undefined";
    if (!shouldSyncProjectLabel) {
      return labels;
    }

    const [projectsResult, currentTaskResult] = await Promise.all([
      supabase.from("projects").select("id, name").eq("tenant_id", tenantId),
      taskId
        ? supabase.from("tasks").select("labels").eq("id", taskId).single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (projectsResult.error) {
      throw projectsResult.error;
    }

    const projectOptions = (projectsResult.data || []).map((project) => ({
      id: project.id,
      name: project.name,
    }));

    const currentLabels =
      typeof labels !== "undefined"
        ? (Array.isArray(labels) ? labels : [])
        : (Array.isArray((currentTaskResult.data as { labels?: unknown[] } | null)?.labels)
            ? (currentTaskResult.data as { labels?: unknown[] }).labels
            : []);

    const selectedProject =
      project_id
        ? projectOptions.find((project) => project.id === project_id) || null
        : null;

    return syncProjectLabel(
      currentLabels as { text: string; color: string }[],
      selectedProject,
      projectOptions
    );
  };

  const tasksQuery = useQuery({
    queryKey: ["tasks", tenantId, projectId],
    staleTime: 1000 * 60 * 5,
    // Mantém os dados anteriores durante refetch/troca de chave (ex: profile/tenant_id
    // oscilando para null em refresh de token). Impede que `tasks` volte a `undefined`,
    // o que desmontava o KanbanBoard e apagava o formulário "Nova Tarefa" em digitação.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Exclui subtarefas (parent_task_id IS NOT NULL) das listagens principais.
      // Subtarefas são acessadas pelo hook useSubtasks dentro do TaskDetailModal.
      let query = (supabase.from("tasks") as any)
        .select("*")
        .is("parent_task_id", null)
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (projectId) query = query.eq("project_id", projectId);

      const { data, error } = await query;
      if (error) throw error;

      const assigneeIds = [...new Set((data || []).map((t) => t.assignee_id).filter(Boolean))] as string[];
      const projIds = [...new Set((data || []).map((t) => t.project_id).filter(Boolean))] as string[];

      // Fetch task_assignees for multi-assignee support
      const taskIds = (data || []).map((t) => t.id);

      // Helper para buscar `in (...)` em batches de 100 (evita URL gigante / HTTP 400)
      const BATCH = 100;
      const chunks = <T,>(arr: T[], n: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
      };
      const inBatches = async <T,>(
        ids: string[],
        fn: (batch: string[]) => Promise<{ data: T[] | null; error: any }>
      ): Promise<{ data: T[]; error: any }> => {
        if (ids.length === 0) return { data: [], error: null };
        const results = await Promise.all(chunks(ids, BATCH).map(fn));
        const errs = results.find((r) => r.error)?.error ?? null;
        const merged = results.flatMap((r) => r.data ?? []);
        return { data: merged, error: errs };
      };

      // Fetch assignee info, project names, multi-assignees, AND recurrences IN PARALLEL (com batching)
      const [assigneeResult, projResult, multiAssigneeResult, recurrenceResult] = await Promise.all([
        inBatches<any>(assigneeIds, (b) =>
          supabase.from("organograma_view").select("employee_id, full_name, avatar_url").in("employee_id", b)
        ),
        inBatches<any>(projIds, (b) =>
          supabase.from("projects").select("id, name").in("id", b)
        ),
        inBatches<any>(taskIds, (b) =>
          supabase.from("task_assignees").select("task_id, employee_id").in("task_id", b)
        ),
        inBatches<any>(taskIds, (b) =>
          supabase.from("task_recurrence").select("task_id, frequency, is_active").in("task_id", b).eq("is_active", true)
        ),
      ]);

      const assigneeMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      for (const o of assigneeResult.data || []) {
        if (o.employee_id) assigneeMap[o.employee_id] = { full_name: o.full_name, avatar_url: o.avatar_url };
      }

      const projMap: Record<string, string> = {};
      for (const p of projResult.data || []) {
        projMap[p.id] = p.name;
      }

      // Build multi-assignee map: task_id -> employee_id[]
      const multiAssigneeMap: Record<string, string[]> = {};
      for (const ma of multiAssigneeResult.data || []) {
        if (!multiAssigneeMap[ma.task_id]) multiAssigneeMap[ma.task_id] = [];
        multiAssigneeMap[ma.task_id].push(ma.employee_id);
      }

      // Fetch all unique multi-assignee employee info
      const allMultiIds = [...new Set(Object.values(multiAssigneeMap).flat())];
      const missingIds = allMultiIds.filter((id) => !assigneeMap[id]);
      if (missingIds.length > 0) {
        const { data: extraAssignees } = await inBatches<any>(missingIds, (b) =>
          supabase.from("organograma_view").select("employee_id, full_name, avatar_url").in("employee_id", b)
        );
        for (const o of extraAssignees || []) {
          if (o.employee_id) assigneeMap[o.employee_id] = { full_name: o.full_name, avatar_url: o.avatar_url };
        }
      }

      // Build recurrence map: task_id -> frequency
      const recurrenceMap: Record<string, string> = {};
      for (const r of recurrenceResult.data || []) {
        if (r.task_id) recurrenceMap[r.task_id] = r.frequency;
      }

      return (data || []).map((t) => {
        const multiIds = multiAssigneeMap[t.id] || [];
        const assignees: TaskAssignee[] = multiIds.map((eid) => ({
          employee_id: eid,
          full_name: assigneeMap[eid]?.full_name || null,
          avatar_url: assigneeMap[eid]?.avatar_url || null,
        }));
        return {
          ...t,
          assignee_name: t.assignee_id ? assigneeMap[t.assignee_id]?.full_name : null,
          assignee_avatar: t.assignee_id ? assigneeMap[t.assignee_id]?.avatar_url : null,
          project_name: t.project_id ? projMap[t.project_id] : null,
          assignees,
          has_recurrence: !!recurrenceMap[t.id],
          recurrence_frequency: recurrenceMap[t.id] || null,
        };
      }) as TaskWithDetails[];
    },
    enabled: !!tenantId,
  });

  const createTask = useMutation({
    // `assignee_ids` é opcional: quando informado, a tarefa nasce com múltiplos
    // responsáveis (task_assignees). `assignee_id` continua sendo gravado com o
    // primeiro da lista para manter compatibilidade com o campo legado.
    mutationFn: async ({
      assignee_ids,
      ...payload
    }: Omit<TablesInsert<"tasks">, "tenant_id"> & { assignee_ids?: string[] }) => {
      const labels = await resolveTaskLabels({
        project_id: payload.project_id,
        labels: payload.labels,
      });

      const employeeIds = [
        ...new Set([...(assignee_ids ?? []), payload.assignee_id].filter(Boolean) as string[]),
      ];

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          ...payload,
          assignee_id: employeeIds[0] ?? null,
          tenant_id: tenantId!,
          created_by: user?.id ?? null,
          labels,
        })
        .select()
        .single();
      if (error) throw error;

      if (data?.id && employeeIds.length > 0) {
        const { error: assigneeError } = await supabase.from("task_assignees").insert(
          employeeIds.map((eid) => ({ task_id: data.id, employee_id: eid, tenant_id: tenantId! }))
        );
        if (assigneeError) throw assigneeError;
      }

      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", tenantId] }),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"tasks"> & { id: string }) => {
      const labels = await resolveTaskLabels({
        taskId: id,
        project_id: typeof updates.project_id === "undefined" ? undefined : updates.project_id,
        labels: updates.labels,
      });

      const nextUpdates =
        typeof labels !== "undefined"
          ? { ...updates, labels }
          : updates;

      const { data, error } = await supabase
        .from("tasks")
        .update(nextUpdates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", tenantId] }),
  });

  const moveTask = useMutation({
    mutationFn: async ({ id, status, sort_order }: { id: string; status: TaskStatus; sort_order: number }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status, sort_order })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", tenantId] }),
  });

  const batchUpdateSortOrder = useMutation({
    mutationFn: async (updates: { id: string; status: TaskStatus; sort_order: number }[]) => {
      await Promise.all(
        updates.map(({ id, status, sort_order }) =>
          supabase.from("tasks").update({ status, sort_order }).eq("id", id)
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", tenantId] }),
  });

  const batchUpdate = useMutation({
    mutationFn: async (updates: { ids: string[]; changes: Partial<TablesUpdate<"tasks">> }) => {
      await Promise.all(
        updates.ids.map((id) =>
          supabase.from("tasks").update(updates.changes).eq("id", id)
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", tenantId] }),
  });

  const batchDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => supabase.from("tasks").delete().eq("id", id))
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", tenantId] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", tenantId] }),
  });

  const syncAssignees = useMutation({
    mutationFn: async ({ taskId, employeeIds }: { taskId: string; employeeIds: string[] }) => {
      // Delete existing assignees
      await supabase.from("task_assignees").delete().eq("task_id", taskId);
      // Insert new ones
      if (employeeIds.length > 0) {
        const { error } = await supabase.from("task_assignees").insert(
          employeeIds.map((eid) => ({ task_id: taskId, employee_id: eid, tenant_id: tenantId! }))
        );
        if (error) throw error;
      }
      // Also update the legacy assignee_id field with the first assignee
      await supabase.from("tasks").update({ assignee_id: employeeIds[0] || null }).eq("id", taskId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", tenantId] }),
  });

  return { ...tasksQuery, createTask, updateTask, moveTask, deleteTask, batchUpdateSortOrder, batchUpdate, batchDelete, syncAssignees };
}
