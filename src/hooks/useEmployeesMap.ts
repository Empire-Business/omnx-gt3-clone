import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface EmployeeMini {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export type EmployeesMap = Record<string, EmployeeMini>;

/**
 * Cache global de employees do tenant indexados por id.
 * Substitui chamadas redundantes a employees_hierarchy_view nos hooks de chat.
 */
export function useEmployeesMap() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["employees_map", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("employees_hierarchy_view")
        .select("employee_id, full_name, avatar_url")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      const map: EmployeesMap = {};
      for (const e of data ?? []) {
        if (!map[e.employee_id]) {
          map[e.employee_id] = {
            id: e.employee_id,
            full_name: e.full_name,
            avatar_url: e.avatar_url,
          };
        }
      }
      return map;
    },
  });
}
