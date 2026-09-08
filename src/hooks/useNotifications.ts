import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCallback, useEffect, useMemo } from "react";

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user, profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.id, tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!user?.id && !!tenantId,
    refetchInterval: 30000, // Poll every 30s
  });

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const target = (notificationsQuery.data ?? []).find((n) => n.id === id);
      let q = supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .eq("type", target?.type ?? "")
        .eq("is_read", false);
      q = target?.link != null ? q.eq("link", target.link) : q.is("link", null);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id, tenantId] }),
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id, tenantId] }),
  });

  const unreadCount = (notificationsQuery.data || []).filter((n) => !n.is_read).length;

  return { ...notificationsQuery, markAsRead, markAllAsRead, deleteNotification, unreadCount };
}

/**
 * Silenciamento de notificações por tipo (tabela `notification_mutes`).
 *
 * `kind = "all"` cobre todos os tipos — por isso `isMuted(k)` considera o
 * registro "all" além do específico. `expires_at = null` = até reativar.
 * O silenciamento vale para o alerta ATIVO (toast in-app, som e push); o
 * histórico do sininho continua sendo gravado normalmente.
 */
export type NotifMuteKind = "all" | "task" | "chat" | "feed";

export interface NotificationMute {
  kind: NotifMuteKind;
  expires_at: string | null;
}

const MUTE_KIND_LABEL: Record<NotifMuteKind, string> = {
  all: "Todas as notificações",
  task: "Notificações de tarefas",
  chat: "Notificações de mensagens",
  feed: "Notificações do feed",
};

export function useNotificationMutes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["notification_mutes", user?.id];

  const query = useQuery({
    queryKey,
    enabled: !!user?.id,
    refetchInterval: 60_000, // Re-checa expiração a cada minuto
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_mutes" as any)
        .select("kind, expires_at")
        .eq("user_id", user!.id);
      if (error) throw error;
      const now = Date.now();
      return ((data as any[]) || []).filter(
        (m) => !m.expires_at || new Date(m.expires_at).getTime() > now,
      ) as NotificationMute[];
    },
  });

  const mutes = useMemo(() => query.data ?? [], [query.data]);

  const isMuted = useCallback(
    (kind: NotifMuteKind) => mutes.some((m) => m.kind === "all" || m.kind === kind),
    [mutes],
  );

  /** Data de expiração do mute que está valendo para `kind` (null = até reativar). */
  const mutedUntil = useCallback(
    (kind: NotifMuteKind) => {
      const active = mutes.find((m) => m.kind === kind) ?? mutes.find((m) => m.kind === "all");
      return active?.expires_at ?? null;
    },
    [mutes],
  );

  const setMute = useMutation({
    mutationFn: async ({
      kind,
      durationHours,
    }: { kind: NotifMuteKind; durationHours?: number | null }) => {
      if (!user?.id) throw new Error("Sessão inválida");
      const expiresAt = durationHours
        ? new Date(Date.now() + durationHours * 3600 * 1000).toISOString()
        : null;
      const { error } = await supabase
        .from("notification_mutes" as any)
        .upsert(
          { user_id: user.id, kind, expires_at: expiresAt, updated_at: new Date().toISOString() },
          { onConflict: "user_id,kind" },
        );
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey });
      const lbl = vars.durationHours ? `por ${formatMuteDuration(vars.durationHours)}` : "até você reativar";
      toast.success(`${MUTE_KIND_LABEL[vars.kind]} silenciadas ${lbl}.`);
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao silenciar notificações"),
  });

  const clearMute = useMutation({
    mutationFn: async (kind: NotifMuteKind) => {
      if (!user?.id) throw new Error("Sessão inválida");
      // "all" reativa tudo. Um tipo específico também precisa remover o mute
      // global — senão o usuário clica em "Reativar tarefas" e nada acontece
      // porque o registro "all" continua valendo.
      let q = supabase.from("notification_mutes" as any).delete().eq("user_id", user.id);
      if (kind !== "all") q = q.in("kind", ["all", kind]);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Notificações reativadas.");
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao reativar notificações"),
  });

  return { ...query, mutes, isMuted, mutedUntil, setMute, clearMute };
}

export function formatMuteDuration(hours: number): string {
  if (hours === 1) return "1 hora";
  if (hours === 24) return "24 horas";
  if (hours % 24 === 0) return `${hours / 24} dias`;
  return `${hours} horas`;
}

/**
 * Badge de "não-lidas" do menu Tarefas: conta notificações de nova atribuição
 * (`type='task_assigned'`) ainda não lidas. Reusa os triggers que já criam essas
 * notificações no banco. `markRead()` é chamado ao abrir a página Tarefas.
 */
export function useTasksUnreadCount() {
  const { user, profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const { data: count = 0 } = useQuery({
    queryKey: ["tasks_unread", user?.id],
    enabled: !!user?.id && !!tenantId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .eq("type", "task_assigned")
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const markRead = useCallback(async () => {
    if (!user?.id || !tenantId) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .eq("type", "task_assigned")
      .eq("is_read", false);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["tasks_unread", user.id] });
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  }, [user?.id, tenantId, qc]);

  return { count, markRead };
}
