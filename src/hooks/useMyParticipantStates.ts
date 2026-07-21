/**
 * useMyParticipantStates — v8.5.1
 * Carrega o estado pessoal do usuário em todas as conversas
 * (pinned/muted/archived/unread_override + last_read_at).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useEmployees } from "./useEmployees";

export interface MyParticipantState {
  conversation_id: string;
  pinned_at: string | null;
  muted_until: string | null;
  archived_at: string | null;
  unread_override: boolean;
  last_read_at: string | null;
}

export function useMyParticipantStates() {
  const { user, profile } = useAuth();
  const { data: employees } = useEmployees();
  const tenantId = profile?.tenant_id;
  const myEmpId = employees?.find((e) => e.user_id === user?.id)?.id ?? null;

  return useQuery({
    queryKey: ["chat", "my-participant-states", tenantId, myEmpId],
    enabled: !!myEmpId && !!tenantId,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<Record<string, MyParticipantState>> => {
      const { data, error } = await (supabase as any)
        .from("chat_participants")
        .select("conversation_id, pinned_at, muted_until, archived_at, unread_override, last_read_at")
        .eq("employee_id", myEmpId);
      if (error) throw error;
      const map: Record<string, MyParticipantState> = {};
      for (const row of data ?? []) map[row.conversation_id] = row as MyParticipantState;
      return map;
    },
  });
}

export function isMuted(s?: MyParticipantState | null) {
  if (!s?.muted_until) return false;
  return new Date(s.muted_until).getTime() > Date.now();
}
