import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface Permissions {
  role: AppRole | null;
  isAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  isCeo: boolean;
  /** id do colaborador (employees.id) do usuário logado — evita varrer a lista inteira */
  myEmployeeId: string | null;
  loading: boolean;
  /** Can edit areas, subareas, positions, employees */
  canManageStructure: boolean;
  /** Can create/edit projects and assign people */
  canManageProjects: boolean;
  canManageProcesses: boolean;
  /** Can only view — no editing */
  readOnly: boolean;
}

export function usePermissions(): Permissions {
  const { user, profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data: role, isLoading } = useQuery({
    queryKey: ["user-role", user?.id],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .single();
      if (error) return null;
      return data.role as AppRole;
    },
    enabled: !!user?.id,
  });

  // PERF (mesmo erro da v8.35.0): antes isso vinha de `useEmployees()`, que baixa a
  // LISTA INTEIRA de colaboradores do tenant (organograma_view + joins de cargo/área/
  // perfil + employee_positions + títulos dos cargos) só para achar UMA linha — a do
  // próprio usuário — e ler `is_ceo`. Como `usePermissions()` é chamado em quase todo
  // componente do app, essa query cara virava efetivamente global: montava junto com
  // qualquer tela, em qualquer dispositivo.
  // Agora busca só a própria linha. O valor é idêntico: `organograma_view` (fonte da
  // lista antiga) filtra `WHERE e.status = 'active'`, por isso o `.eq("status","active")`
  // abaixo — sem ele, um colaborador inativo marcado como CEO passaria a retornar
  // `true`, o que não acontecia antes.
  const { data: myEmployee } = useQuery({
    queryKey: ["my-employee", tenantId, user?.id],
    staleTime: 1000 * 60 * 5,
    enabled: !!user?.id && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, is_ceo")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isCeo = myEmployee?.is_ceo === true;

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isMember = role === "member";

  return {
    role: role ?? null,
    isAdmin,
    isManager,
    isMember,
    isCeo,
    myEmployeeId: myEmployee?.id ?? null,
    loading: isLoading,
    canManageStructure: isAdmin,
    canManageProjects: isAdmin || isManager,
    canManageProcesses: isAdmin || isManager,
    readOnly: isMember,
  };
}
