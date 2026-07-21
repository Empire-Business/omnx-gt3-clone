import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCallback, useEffect } from "react";

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
    queryKey: ["notifications", user?.id],
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
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const unreadCount = (notificationsQuery.data || []).filter((n) => !n.is_read).length;

  return { ...notificationsQuery, markAsRead, markAllAsRead, deleteNotification, unreadCount };
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
