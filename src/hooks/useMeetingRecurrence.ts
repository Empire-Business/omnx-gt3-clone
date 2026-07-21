/**
 * useMeetingRecurrence — v8.12.0
 * CRUD de reuniões recorrentes (campos `is_recurring`, `recurrence_pattern`,
 * `reminder_minutes_before`, `next_occurrence_at`).
 *
 * O cálculo de `next_occurrence_at` é feito pelo trigger
 * `meetings_recurrence_recompute_trg` no banco — o cliente apenas envia o
 * padrão. Re-notificações em adiamento são automáticas: o trigger zera
 * `last_reminder_sent_at` quando o horário muda.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface RecurrencePattern {
  freq: "daily" | "weekly";
  byday: Weekday[];
  time: string; // HH:MM (24h)
  tz: string; // IANA timezone
  end_date?: string | null; // YYYY-MM-DD
}

export interface RecurringMeeting {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes_before: number;
  next_occurrence_at: string | null;
  livekit_room_name: string | null;
  created_by: string | null;
  area_id: string | null;
  host_name?: string | null;
}

export const DEFAULT_RECURRENCE: RecurrencePattern = {
  freq: "weekly",
  byday: ["MO", "TU", "WE", "TH", "FR"],
  time: "09:30",
  tz: "America/Sao_Paulo",
  end_date: null,
};

export function useRecurringMeetings() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["meetings", "recurring", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<RecurringMeeting[]> => {
      const { data, error } = await (supabase as any)
        .from("meetings")
        .select(
          "id, tenant_id, title, description, is_recurring, recurrence_pattern, reminder_minutes_before, next_occurrence_at, livekit_room_name, created_by, area_id",
        )
        .eq("tenant_id", tenantId!)
        .eq("is_recurring", true)
        .order("next_occurrence_at", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as RecurringMeeting[];
      // Resolve nome do host em uma query (para badge no calendário)
      const hostIds = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean) as string[]));
      if (hostIds.length > 0) {
        const { data: profs } = await (supabase as any)
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", hostIds);
        const byId = new Map<string, string>(
          (profs ?? []).map((p: any) => [p.user_id, p.full_name as string]),
        );
        rows.forEach((r) => {
          if (r.created_by) r.host_name = byId.get(r.created_by) ?? null;
        });
      }
      return rows;
    },
  });
}

export function useCreateRecurringMeeting() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      pattern: RecurrencePattern;
      reminder_minutes_before?: number;
      area_id?: string | null;
    }) => {
      if (!tenantId) throw new Error("Tenant não identificado");
      const { data, error } = await (supabase as any)
        .from("meetings")
        .insert({
          tenant_id: tenantId,
          title: input.title,
          description: input.description ?? null,
          status: "scheduled",
          is_recurring: true,
          recurrence_pattern: input.pattern,
          reminder_minutes_before: input.reminder_minutes_before ?? 5,
          meeting_mode: "livekit",
          livekit_room_name: "rec-" + crypto.randomUUID().slice(0, 8),
          created_by: profile?.user_id, // host: pode editar/adiar
          area_id: input.area_id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", "recurring", tenantId] });
      qc.invalidateQueries({ queryKey: ["meetings", "list", tenantId] });
      toast.success("Reunião recorrente criada");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao criar reunião recorrente");
    },
  });
}

export function useUpdateRecurringMeeting() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<{
        title: string;
        description: string | null;
        recurrence_pattern: RecurrencePattern;
        reminder_minutes_before: number;
        is_recurring: boolean;
        area_id: string | null;
      }>;
    }) => {
      const { error } = await (supabase as any)
        .from("meetings")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", "recurring", tenantId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar reunião");
    },
  });
}

export function useDeleteRecurringMeeting() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("meetings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", "recurring", tenantId] });
      toast.success("Reunião removida");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao remover");
    },
  });
}
