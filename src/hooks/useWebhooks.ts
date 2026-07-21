import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Webhook {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  tenant_id: string;
  event_type: string;
  payload: any;
  response_status: number | null;
  response_body: string | null;
  success: boolean;
  duration_ms: number | null;
  created_at: string;
}

const WEBHOOK_EVENTS = [
  "employee.created",
  "employee.updated",
  "employee.deleted",
  "project.created",
  "project.updated",
  "project.deleted",
  "task.created",
  "task.updated",
  "task.moved",
  "task.deleted",
  "process.created",
  "process.updated",
  "process.deleted",
] as const;

export { WEBHOOK_EVENTS };

export function useWebhooks() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const webhooksQuery = useQuery({
    queryKey: ["webhooks", tenantId],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhooks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Webhook[];
    },
    enabled: !!tenantId,
  });

  const createWebhook = useMutation({
    mutationFn: async (payload: { name: string; url: string; secret?: string; events: string[] }) => {
      const { data, error } = await supabase
        .from("webhooks")
        .insert({ ...payload, tenant_id: tenantId! } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const updateWebhook = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Webhook> & { id: string }) => {
      const { data, error } = await supabase
        .from("webhooks")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const logsQuery = useQuery({
    queryKey: ["webhook-logs", tenantId],
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as WebhookLog[];
    },
    enabled: !!tenantId,
  });

  return {
    webhooks: webhooksQuery.data || [],
    isLoading: webhooksQuery.isLoading,
    logs: logsQuery.data || [],
    logsLoading: logsQuery.isLoading,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    refetchLogs: logsQuery.refetch,
  };
}

/**
 * Hook específico para buscar logs de um webhook
 */
export function useWebhookLogs(webhookId?: string, limit: number = 50) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["webhook-logs", webhookId, tenantId, limit],
    staleTime: 1000 * 30, // 30 segundos
    queryFn: async () => {
      let query = supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (webhookId) {
        query = query.eq("webhook_id", webhookId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as WebhookLog[];
    },
    enabled: !!tenantId,
  });
}

/**
 * Hook para disparar webhook de teste
 */
export function useTestWebhook() {
  return async (webhookId: string) => {
    const { data, error } = await supabase.functions.invoke("dispatch-webhook", {
      body: { 
        webhookId, 
        test: true,
        event: "webhook.test",
        payload: {
          message: "Este é um evento de teste",
          timestamp: new Date().toISOString(),
        }
      },
    });
    
    if (error) throw error;
    return data;
  };
}
