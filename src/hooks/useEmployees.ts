import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { normalizeSupabaseAssetUrl } from "@/integrations/supabase/config";
import { isSystemBotEmployee } from "@/lib/system-bots";

async function getValidToken(): Promise<string> {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed.session;
  }
  if (!session?.access_token) {
    throw new Error("Sessão expirada. Faça logout e entre novamente.");
  }
  return session.access_token;
}

type Employee = Tables<"employees">;

export interface EmployeeWithDetails extends Omit<Employee, 'is_ceo'> {
  position_id?: string | null;
  position_title?: string | null;
  subarea_id?: string | null;
  subarea_name?: string | null;
  area_id?: string | null;
  area_name?: string | null;
  area_type?: string | null;
  area_color?: string | null;
  subarea_color?: string | null;
  active_projects?: number | null;
  pending_tasks?: number | null;
  tasks_completed_this_week?: number | null;
  level?: number | null;
  full_name?: string | null;
  avatar_url?: string | null;
  is_ceo?: boolean | null;
  positions?: { position_id: string; title: string; is_primary: boolean }[];
}

export interface CreateEmployeePayload {
  full_name: string;
  email: string;
  password?: string;
  position_id?: string;
  phone?: string;
  work_email?: string;
  role?: "admin" | "manager" | "member";
  is_ceo?: boolean;
  /** true (padrão): envia convite por email para o colaborador definir a senha.
   * false: gera senha temporária para o admin repassar manualmente. */
  send_invite?: boolean;
}

export interface EmployeeFilters {
  area_id?: string | null;
  subarea_id?: string | null;
  position_id?: string | null;
  status?: 'active' | 'inactive' | 'on_leave' | null;
}

export interface ChangeStatusPayload {
  employeeId: string;
  newStatus: 'active' | 'inactive' | 'on_leave';
  reason: string;
  terminationDate?: string | null;
  banUser?: boolean;
}

export interface StatusHistoryEntry {
  id: string;
  employee_id: string;
  tenant_id: string;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  changed_by: string | null;
  changed_by_name?: string | null;
  created_at: string;
}

/* ════════════════════════════════════════════
   EMPLOYEES HOOK COM FILTROS HIERÁRQUICOS
   ════════════════════════════════════════════ */

export function useEmployees(filters?: EmployeeFilters) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const queryClient = useQueryClient();

  const hasActiveFilters = filters?.area_id || filters?.subarea_id || filters?.position_id;

  const employeesQuery = useQuery({
    queryKey: ["employees", tenantId, filters],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      let query;

      if (hasActiveFilters) {
        query = supabase
          .from("employees_hierarchy_view" as any)
          .select("*")
          .order("full_name");

        if (filters?.area_id) query = query.eq("area_id", filters.area_id);
        if (filters?.subarea_id) query = query.eq("subarea_id", filters.subarea_id);
        if (filters?.position_id) query = query.eq("primary_position_id", filters.position_id);
        if (filters?.status) query = query.eq("status", filters.status);
      } else {
        query = supabase
          .from("organograma_view")
          .select("*")
          .order("full_name");

        if (filters?.status) query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      const ids = (data || []).map((r) => r.employee_id).filter(Boolean) as string[];
      if (ids.length === 0) return [] as EmployeeWithDetails[];

      const [empResult, posResult] = await Promise.all([
        supabase
          .from("employees")
          .select("id, work_email, phone, admission_date, is_ceo, status, termination_date, status_reason")
          .in("id", ids),
        (supabase
          .from("employee_positions" as any)
          .select("employee_id, position_id, is_primary")
          .in("employee_id", ids)) as any,
      ]);

      const empMap: Record<string, { work_email: string | null; phone: string | null; admission_date: string | null; is_ceo: boolean; termination_date: string | null; status_reason: string | null; position_id: string | null }> = {};
      if (empResult.data) {
        for (const e of empResult.data as any[]) {
          empMap[e.id] = { work_email: e.work_email, phone: e.phone, admission_date: e.admission_date, is_ceo: e.is_ceo || false, termination_date: e.termination_date, status_reason: e.status_reason, position_id: e.position_id ?? null };
        }
      }

      let positionsMap: Record<string, { position_id: string; title: string; is_primary: boolean }[]> = {};
      if (posResult.data && (posResult.data as any[]).length > 0) {
        const posIds = [...new Set((posResult.data as any[]).map((p: any) => p.position_id))] as string[];
        let titleMap = new Map<string, string>();
        if (posIds.length > 0) {
          const { data: titlesData } = await supabase
            .from("positions")
            .select("id, title")
            .in("id", posIds);
          titleMap = new Map((titlesData || []).map(p => [p.id, p.title]));
        }

        for (const p of posResult.data as any[]) {
          if (!positionsMap[p.employee_id]) positionsMap[p.employee_id] = [];
          positionsMap[p.employee_id].push({
            position_id: p.position_id,
            title: titleMap.get(p.position_id) || "",
            is_primary: p.is_primary
          });
        }
      }

      const seenIds = new Set<string>();
      const result: EmployeeWithDetails[] = [];
      for (const row of (data || []) as any[]) {
        const empId = row.employee_id!;
        if (seenIds.has(empId)) continue;
        seenIds.add(empId);
        const primaryPos = positionsMap[empId]?.find(p => p.is_primary);
        result.push({
          id: empId,
          tenant_id: row.tenant_id!,
          user_id: row.user_id,
          position_id: primaryPos?.position_id ?? row.primary_position_id ?? empMap[empId]?.position_id ?? null,
          subarea_id: row.subarea_id ?? null,
          area_id: row.area_id ?? null,
          manager_id: row.manager_id,
          status: row.status,
          admission_date: empMap[empId]?.admission_date ?? null,
          termination_date: empMap[empId]?.termination_date ?? null,
          status_reason: empMap[empId]?.status_reason ?? null,
          phone: empMap[empId]?.phone ?? null,
          work_email: empMap[empId]?.work_email ?? null,
          created_at: null,
          updated_at: null,
          position_title: row.position_title,
          subarea_name: row.subarea_name,
          subarea_color: row.subarea_color,
          area_name: row.area_name,
          area_type: row.area_type,
          area_color: row.area_color,
          full_name: row.full_name,
          avatar_url: normalizeSupabaseAssetUrl(row.avatar_url),
          active_projects: row.active_projects ?? 0,
          pending_tasks: row.pending_tasks ?? 0,
          tasks_completed_this_week: row.tasks_completed_this_week ?? 0,
          level: row.level,
          is_ceo: empMap[empId]?.is_ceo ?? false,
          is_test: row.is_test ?? false,
          positions: positionsMap[empId] || [],
        });
      }
      // Bots de sistema (Empire Bot, OMNX Bot) nunca aparecem em listagens de
      // colaboradores / pickers de seleção.
      return result.filter((e) => !isSystemBotEmployee(e));
    },
    enabled: !!tenantId,
  });

  const createEmployee = useMutation({
    mutationFn: async (payload: CreateEmployeePayload) => {
      const token = await getValidToken();
      const { data, error } = await supabase.functions.invoke("create-employee", {
        body: payload,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        // In @supabase/functions-js@2.x, data is null on error.
        // The actual error body is in error.context (the Response object).
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) throw new Error(body.error);
        } catch (parseErr) {
          if ((parseErr as Error).message && (parseErr as Error).message !== "body used already") {
            throw parseErr;
          }
        }
        throw new Error(error.message || "Erro ao criar colaborador");
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees", tenantId] }),
  });

  const updateEmployee = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"employees"> & { id: string }) => {
      const { data, error } = await supabase
        .from("employees")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees", tenantId] }),
  });

  const deleteEmployee = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees", tenantId] }),
  });

  const setEmployeePosition = useMutation({
    mutationFn: async ({ employeeId, positionId }: { employeeId: string; positionId: string | null }) => {
      await (supabase
        .from("employee_positions" as any)
        .delete()
        .eq("employee_id", employeeId)
        .eq("is_primary", true) as any);

      if (positionId) {
        const { error } = await (supabase
          .from("employee_positions" as any)
          .insert({ employee_id: employeeId, position_id: positionId, is_primary: true }) as any);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees", tenantId] }),
  });

  /** Change employee status with reason, audit trail, and optional ban/unban */
  const changeEmployeeStatus = useMutation({
    mutationFn: async (payload: ChangeStatusPayload) => {
      const { employeeId, newStatus, reason, terminationDate, banUser } = payload;

      // 1. Get current employee status
      const { data: emp, error: empErr } = await supabase
        .from("employees")
        .select("status, user_id, tenant_id")
        .eq("id", employeeId)
        .single();
      if (empErr) throw empErr;

      const oldStatus = emp.status;

      // 2. Update employee record
      const updates: any = {
        status: newStatus,
        status_reason: reason,
      };
      if (newStatus === 'inactive' && terminationDate) {
        updates.termination_date = terminationDate;
      }
      if (newStatus === 'active') {
        updates.termination_date = null;
      }

      const { error: updateErr } = await supabase
        .from("employees")
        .update(updates)
        .eq("id", employeeId);
      if (updateErr) throw updateErr;

      // 3. Insert status history
      const { error: histErr } = await supabase
        .from("employee_status_history" as any)
        .insert({
          employee_id: employeeId,
          tenant_id: emp.tenant_id,
          old_status: oldStatus,
          new_status: newStatus,
          reason,
          changed_by: profile?.user_id || null,
        } as any);
      if (histErr) throw new Error(`Failed to insert status history: ${histErr.message}`);

      // 4. Optionally ban/unban user via manage-access
      if (banUser && emp.user_id) {
        const action = newStatus === 'active' ? 'unban' : 'ban';
        const token = await getValidToken();
        await supabase.functions.invoke("manage-access", {
          body: { user_id: emp.user_id, action },
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      return { oldStatus, newStatus };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["employee-status-history"] });
    },
  });

  /** Bulk change status for multiple employees */
  const bulkChangeStatus = useMutation({
    mutationFn: async (payload: { employeeIds: string[]; newStatus: 'active' | 'inactive' | 'on_leave'; reason: string; banUser?: boolean }) => {
      const results = [];
      for (const id of payload.employeeIds) {
        const result = await changeEmployeeStatus.mutateAsync({
          employeeId: id,
          newStatus: payload.newStatus,
          reason: payload.reason,
          banUser: payload.banUser,
        });
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["employee-status-history"] });
    },
  });

  /** Reset user password - sends password reset email via Edge Function */
  const resetUserPassword = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getValidToken();
      const { data, error } = await supabase.functions.invoke("manage-access", {
        body: { target_user_id: userId, action: "reset_password" },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });

  /** Gera uma senha temporária e retorna na resposta (admin entrega ao colaborador) */
  const generateTempPassword = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getValidToken();
      const { data, error } = await supabase.functions.invoke("manage-access", {
        body: { target_user_id: userId, action: "generate_temp_password" },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      return data as { temp_password: string };
    },
  });

  /** Delete user - soft delete by default, hard delete if specified */
  const deleteUser = useMutation({
    mutationFn: async ({ userId, hardDelete }: { userId: string; hardDelete?: boolean }) => {
      const token = await getValidToken();
      const { data, error } = await supabase.functions.invoke("manage-access", {
        body: { target_user_id: userId, action: "delete_user", hard_delete: hardDelete || false },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees", tenantId] });
    },
  });

  /** Update user role */
  const updateUserRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "manager" | "member" }) => {
      const token = await getValidToken();
      const { data, error } = await supabase.functions.invoke("manage-access", {
        body: { target_user_id: userId, action: "update_role", role },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees", tenantId] });
    },
  });

  /** Get user info including last login and ban status */
  const getUserInfo = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getValidToken();
      const { data, error } = await supabase.functions.invoke("manage-access", {
        body: { target_user_id: userId, action: "get_user_info" },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });

  return {
    ...employeesQuery,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    setEmployeePosition,
    changeEmployeeStatus,
    bulkChangeStatus,
    resetUserPassword,
    generateTempPassword,
    deleteUser,
    updateUserRole,
    getUserInfo,
  };
}

/**
 * Hook específico para buscar um colaborador por ID com todos os detalhes
 */
export function useEmployee(employeeId: string | undefined) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["employee", employeeId, tenantId],
    staleTime: 1000 * 60 * 5,
    enabled: !!employeeId && !!tenantId,
    queryFn: async () => {
      const { data: row, error } = await (supabase
        .from("employees_hierarchy_view" as any)
        .select("*")
        .eq("employee_id", employeeId)
        .eq("tenant_id", tenantId!)
        .single()) as any;

      if (error) throw error;

      const { data: empData } = await supabase
        .from("employees")
        .select("work_email, phone, admission_date, is_ceo, status, manager_id, termination_date, status_reason")
        .eq("id", employeeId!)
        .eq("tenant_id", tenantId!)
        .single();

      const { data: positionsData } = await (supabase
        .from("employee_positions" as any)
        .select(`
          position_id,
          is_primary,
          position:positions(id, title, subarea_id, subarea:subareas(id, name, area:company_areas(id, name, color)))
        `)
        .eq("employee_id", employeeId) as any);

      return {
        id: row.employee_id,
        tenant_id: row.tenant_id,
        user_id: row.user_id,
        position_id: row.primary_position_id,
        subarea_id: row.subarea_id,
        area_id: row.area_id,
        manager_id: empData?.manager_id,
        status: row.status,
        admission_date: empData?.admission_date,
        termination_date: (empData as any)?.termination_date,
        status_reason: (empData as any)?.status_reason,
        phone: empData?.phone,
        work_email: empData?.work_email,
        position_title: row.position_title,
        subarea_name: row.subarea_name,
        area_name: row.area_name,
        area_color: row.area_color,
        full_name: row.full_name,
        avatar_url: normalizeSupabaseAssetUrl(row.avatar_url),
        active_projects: row.active_projects ?? 0,
        pending_tasks: row.pending_tasks ?? 0,
        tasks_completed_this_week: row.tasks_completed_this_week ?? 0,
        is_ceo: empData?.is_ceo ?? false,
        positions: positionsData || [],
      } as EmployeeWithDetails;
    },
  });
}

/**
 * Hook para buscar histórico de status de um colaborador
 */
export function useEmployeeStatusHistory(employeeId: string | undefined) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  return useQuery({
    queryKey: ["employee-status-history", employeeId, tenantId],
    staleTime: 1000 * 60 * 2,
    enabled: !!employeeId && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_status_history" as any)
        .select("*")
        .eq("employee_id", employeeId)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false }) as any;

      if (error) throw error;
      const entries = (data || []) as StatusHistoryEntry[];

      // Fetch names for changed_by
      const changerIds = [...new Set(entries.filter(e => e.changed_by).map(e => e.changed_by!))] as string[];
      if (changerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", changerIds);
        const nameMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
        for (const entry of entries) {
          if (entry.changed_by) {
            entry.changed_by_name = nameMap.get(entry.changed_by) || null;
          }
        }
      }

      return entries;
    },
  });
}

/* ════════════════════════════════════════════
   AVATAR UPLOAD
   ════════════════════════════════════════════ */

export async function uploadAvatar(file: File, employeeId: string): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${employeeId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
