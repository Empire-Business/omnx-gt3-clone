import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useEmployees } from "./useEmployees";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface Permissions {
  role: AppRole | null;
  isAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  isCeo: boolean;
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
  const { user } = useAuth();
  const { data: employees } = useEmployees();

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

  // Derive isCeo from already-loaded employees data (no extra query)
  const isCeo = !!employees?.find(
    (e) => e.user_id === user?.id && e.is_ceo === true
  );

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isMember = role === "member";

  return {
    role: role ?? null,
    isAdmin,
    isManager,
    isMember,
    isCeo,
    loading: isLoading,
    canManageStructure: isAdmin,
    canManageProjects: isAdmin || isManager,
    canManageProcesses: isAdmin || isManager,
    readOnly: isMember,
  };
}
