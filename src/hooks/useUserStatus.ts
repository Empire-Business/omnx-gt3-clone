/**
 * useUserStatus — v8.5.0
 * Atualiza status_emoji + status_text + dnd_until em chat_presence.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useEmployees } from "./useEmployees";
import { toast } from "sonner";

export function useMyPresence() {
  const { user, profile } = useAuth();
  const { data: employees } = useEmployees();
  const tenantId = profile?.tenant_id;
  const myEmpId = employees?.find((e) => e.user_id === user?.id)?.id ?? null;

  return useQuery({
    queryKey: ["chat-my-presence", myEmpId],
    enabled: !!myEmpId && !!tenantId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("chat_presence")
        .select("status_emoji, status_text, dnd_until, is_online")
        .eq("employee_id", myEmpId)
        .maybeSingle();
      return data ?? null;
    },
  });
}

export function useSetUserStatus() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const { data: employees } = useEmployees();
  const tenantId = profile?.tenant_id;
  const myEmpId = employees?.find((e) => e.user_id === user?.id)?.id ?? null;

  return useMutation({
    mutationFn: async ({
      emoji,
      text,
      clearAfterHours,
    }: {
      emoji: string | null;
      text: string | null;
      clearAfterHours?: number | null;
    }) => {
      if (!myEmpId || !tenantId) throw new Error("no employee");
      const patch: Record<string, any> = {
        employee_id: myEmpId,
        tenant_id: tenantId,
        status_emoji: emoji,
        status_text: text,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from("chat_presence")
        .upsert(patch, { onConflict: "employee_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-my-presence", myEmpId] });
      qc.invalidateQueries({ queryKey: ["chat-presence", tenantId] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar status"),
  });
}

export function useSetDND() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const { data: employees } = useEmployees();
  const tenantId = profile?.tenant_id;
  const myEmpId = employees?.find((e) => e.user_id === user?.id)?.id ?? null;

  return useMutation({
    mutationFn: async (untilHours: number | null) => {
      if (!myEmpId || !tenantId) throw new Error("no employee");
      const dnd_until =
        untilHours === null ? null : new Date(Date.now() + untilHours * 60 * 60 * 1000).toISOString();
      const { error } = await (supabase as any)
        .from("chat_presence")
        .upsert(
          { employee_id: myEmpId, tenant_id: tenantId, dnd_until, updated_at: new Date().toISOString() },
          { onConflict: "employee_id" }
        );
      if (error) throw error;
    },
    onSuccess: (_, hours) => {
      qc.invalidateQueries({ queryKey: ["chat-my-presence", myEmpId] });
      toast.success(hours === null ? "Não perturbe desativado" : "Não perturbe ativado");
    },
  });
}
