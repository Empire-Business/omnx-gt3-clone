import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useEmployees } from "./useEmployees";
import { toast } from "sonner";

export interface TaskTimeEntry {
  id: string;
  task_id: string;
  employee_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  note: string | null;
}

export function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return "0m";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 1) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m >= 1) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function useTaskTimer(taskId: string | undefined) {
  const { user, profile } = useAuth();
  const { data: employees } = useEmployees();
  const myEmployeeId = useMemo(
    () => employees?.find((e) => e.user_id === user?.id)?.id ?? null,
    [employees, user]
  );
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const entriesQuery = useQuery({
    queryKey: ["task_time_entries", taskId],
    enabled: !!taskId,
    staleTime: 5_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("task_time_entries")
        .select("*")
        .eq("task_id", taskId!)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaskTimeEntry[];
    },
  });

  // tick a cada 1s para timer aberto
  const [tick, setTick] = useState(0);
  const openEntry = (entriesQuery.data ?? []).find((e) => !e.ended_at) ?? null;
  const myOpenEntry = openEntry && openEntry.employee_id === myEmployeeId ? openEntry : null;
  useEffect(() => {
    if (!openEntry) return;
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [openEntry?.id]);

  const totalSeconds = useMemo(() => {
    let total = 0;
    for (const e of entriesQuery.data ?? []) {
      if (e.ended_at && e.duration_seconds) total += e.duration_seconds;
    }
    if (openEntry) {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(openEntry.started_at).getTime()) / 1000));
      total += elapsed;
    }
    // touch tick to invalidate memo each second
    void tick;
    return total;
  }, [entriesQuery.data, openEntry, tick]);

  const start = useMutation({
    mutationFn: async (note?: string) => {
      if (!taskId || !myEmployeeId || !tenantId) throw new Error("Sem contexto de usuário");
      // Fecha qualquer outro timer aberto desse usuário (em qualquer task)
      await (supabase as any)
        .from("task_time_entries")
        .update({ ended_at: new Date().toISOString() })
        .eq("employee_id", myEmployeeId)
        .is("ended_at", null);
      const { error } = await (supabase as any)
        .from("task_time_entries")
        .insert({
          tenant_id: tenantId,
          task_id: taskId,
          employee_id: myEmployeeId,
          started_at: new Date().toISOString(),
          note: note ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_time_entries", taskId] });
      qc.invalidateQueries({ queryKey: ["task_time_entries"] });
    },
    onError: (err: any) => toast.error(err.message ?? "Não foi possível iniciar o timer"),
  });

  const stop = useMutation({
    mutationFn: async () => {
      if (!myOpenEntry) throw new Error("Nenhum timer ativo seu");
      const { error } = await (supabase as any)
        .from("task_time_entries")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", myOpenEntry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_time_entries", taskId] });
    },
    onError: (err: any) => toast.error(err.message ?? "Não foi possível parar o timer"),
  });

  return {
    entries: entriesQuery.data ?? [],
    isLoading: entriesQuery.isLoading,
    totalSeconds,
    isRunning: !!myOpenEntry,
    runningStartedAt: myOpenEntry?.started_at ?? null,
    isAnotherRunning: !!openEntry && !myOpenEntry,
    runningEmployeeId: openEntry?.employee_id ?? null,
    start,
    stop,
  };
}
