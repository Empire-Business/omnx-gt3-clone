/**
 * useTaskTimerSummary — uma única query global por tenant, com mapa
 * { taskId → totalSeconds, isRunning }. Cards do board usam este hook
 * via cache compartilhada (sem N+1 fetches).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface Entry {
  task_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

interface Summary {
  byTask: Record<string, { totalSeconds: number; isRunning: boolean; startedAt: string | null }>;
}

export function useTaskTimerData() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  // Tick global pra timers abertos
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime invalidation
  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel(`task_time_entries:${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_time_entries" },
        () => qc.invalidateQueries({ queryKey: ["task_time_entries_global", tenantId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenantId, qc]);

  const query = useQuery({
    queryKey: ["task_time_entries_global", tenantId],
    enabled: !!tenantId,
    staleTime: 15_000,
    queryFn: async (): Promise<Entry[]> => {
      const { data, error } = await (supabase as any)
        .from("task_time_entries")
        .select("task_id, started_at, ended_at, duration_seconds")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const summary = useMemo<Summary>(() => {
    const byTask: Summary["byTask"] = {};
    for (const e of query.data ?? []) {
      const cur = byTask[e.task_id] ?? { totalSeconds: 0, isRunning: false, startedAt: null };
      if (e.ended_at && e.duration_seconds) {
        cur.totalSeconds += e.duration_seconds;
      } else if (!e.ended_at) {
        cur.isRunning = true;
        cur.startedAt = e.started_at;
        const elapsed = Math.max(
          0,
          Math.floor((Date.now() - new Date(e.started_at).getTime()) / 1000)
        );
        cur.totalSeconds += elapsed;
      }
      byTask[e.task_id] = cur;
    }
    void tick; // re-render a cada segundo enquanto há timer aberto
    return { byTask };
  }, [query.data, tick]);

  return summary;
}

export function useTaskTimerSummary(taskId: string) {
  const summary = useTaskTimerData();
  const entry = summary.byTask[taskId];
  return {
    totalSeconds: entry?.totalSeconds ?? 0,
    isRunning: !!entry?.isRunning,
    startedAt: entry?.startedAt ?? null,
  };
}
