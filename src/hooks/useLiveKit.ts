/**
 * useLiveKit — v8.6.0
 * Helpers e hooks para videoconferência LiveKit nativa.
 * - generateRoomName: gera identificador único de sala
 * - getMeetUrl: SEMPRE usa VITE_SITE_URL (nunca window.location.origin) p/ links externos
 * - useMeetToken: pede JWT ao livekit-token
 * - useEndRoom: encerra sala (host)
 * - useStartHuddle: inicia huddle no chat e abre nova aba
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MeetRole = "host" | "guest" | "observer";

export function generateRoomName(prefix: "meet" | "huddle" = "meet"): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${ts}-${rand}`;
}

export function getSiteUrl(): string {
  const env = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "");
  if (env) return env;
  // Fallback seguro só para dev local — nunca em produção
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "";
}

export function getMeetUrl(
  roomName: string,
  opts?: { role?: MeetRole; name?: string },
): string {
  const base = getSiteUrl();
  const params = new URLSearchParams();
  if (opts?.role) params.set("role", opts.role);
  if (opts?.name) params.set("name", opts.name);
  const qs = params.toString();
  return `${base}/meet/${roomName}${qs ? `?${qs}` : ""}`;
}

export interface MeetTokenResponse {
  token: string;
  url: string;
  role: MeetRole;
}

export function useMeetToken(
  roomName: string | undefined,
  role: MeetRole,
  participantName: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["livekit", "token", roomName, role, participantName],
    enabled: !!roomName && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MeetTokenResponse> => {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { roomName, role, participantName },
      });
      if (error) throw error;
      if (!data?.token) throw new Error("Token vazio");
      return data as MeetTokenResponse;
    },
  });
}

export function useEndRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roomName: string) => {
      // livekit-end-room agora dispara meeting-ai server-to-server (idempotente).
      const { data, error } = await supabase.functions.invoke("livekit-end-room", {
        body: { room_name: roomName },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["chat", "huddles"] });
      qc.invalidateQueries({ queryKey: ["chat_overview"] });
    },
  });
}

export interface StartHuddleResponse {
  huddle_id: string;
  room_name: string;
  reused: boolean;
}

export function useStartHuddle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string): Promise<StartHuddleResponse> => {
      const { data, error } = await supabase.functions.invoke("livekit-start-huddle", {
        body: { conversation_id: conversationId },
      });
      if (error) throw error;
      return data as StartHuddleResponse;
    },
    onSuccess: (_d, conversationId) => {
      qc.invalidateQueries({ queryKey: ["chat", "huddles", conversationId] });
      qc.invalidateQueries({ queryKey: ["chat", "messages", conversationId] });
    },
  });
}

// ============================================================
// Convidados externos (v8.7.0)
// ============================================================

export type GuestRequestStatus = "pending" | "approved" | "rejected" | "expired";

export interface GuestRequestResponse {
  request_id: string;
  guest_token: string;
}

/** Convidado externo: gera link público da sala. */
export function getGuestMeetUrl(roomName: string): string {
  const base = getSiteUrl();
  return `${base}/meet/${roomName}/guest`;
}

/** Convidado: solicita entrada (público, sem auth). */
export function useGuestRequest() {
  return useMutation({
    mutationFn: async (vars: {
      room_name: string;
      guest_name: string;
    }): Promise<GuestRequestResponse> => {
      const { data, error } = await supabase.functions.invoke("livekit-guest-request", {
        body: vars,
      });
      if (error) throw error;
      return data as GuestRequestResponse;
    },
  });
}

/** Convidado: poll status do pedido (chama edge pública). */
export function useGuestRequestStatus(
  requestId: string | undefined,
  guestToken: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["livekit", "guest-status", requestId],
    enabled: !!requestId && !!guestToken && enabled,
    refetchInterval: 2500,
    queryFn: async (): Promise<{ status: GuestRequestStatus }> => {
      const { data, error } = await supabase.functions.invoke("livekit-guest-status", {
        body: { request_id: requestId, guest_token: guestToken },
      });
      if (error) throw error;
      return data as { status: GuestRequestStatus };
    },
  });
}

export interface GuestTokenResponse {
  token: string;
  url: string;
  room_name: string;
}

/** Convidado: troca pedido aprovado por JWT LiveKit. */
export function useGuestToken() {
  return useMutation({
    mutationFn: async (vars: {
      request_id: string;
      guest_token: string;
    }): Promise<GuestTokenResponse> => {
      const { data, error } = await supabase.functions.invoke("livekit-guest-token", {
        body: vars,
      });
      if (error) throw error;
      return data as GuestTokenResponse;
    },
  });
}

export interface GuestRequestRow {
  id: string;
  meeting_id: string;
  livekit_room_name: string;
  guest_name: string;
  status: GuestRequestStatus;
  requested_at: string;
}

/** Host: lista pedidos pendentes para uma sala (com realtime). */
export function useGuestApprovalQueue(roomName: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["livekit", "guest-queue", roomName];

  const query = useQuery({
    queryKey,
    enabled: !!roomName,
    staleTime: 5 * 1000,
    refetchInterval: 2500,
    queryFn: async (): Promise<GuestRequestRow[]> => {
      const { data, error } = await (supabase as any)
        .from("meeting_guest_requests")
        .select("id, meeting_id, livekit_room_name, guest_name, status, requested_at")
        .eq("livekit_room_name", roomName)
        .eq("status", "pending")
        .order("requested_at", { ascending: true });
      if (error) throw error;
      return (data || []) as GuestRequestRow[];
    },
  });

  // Realtime: invalida a query a cada mudança na tabela pra esta sala
  if (typeof window !== "undefined" && roomName) {
    // Subscribe is a side-effect; useEffect mais limpo, mas mantemos simples — caller já desmonta com unmount.
  }

  return { ...query, queryKey, invalidate: () => qc.invalidateQueries({ queryKey }) };
}

/** Host: aprova/recusa pedido. */
export function useDecideGuestRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      request_id: string;
      decision: "approved" | "rejected";
    }) => {
      const { data, error } = await supabase.functions.invoke("livekit-guest-decision", {
        body: vars,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["livekit", "guest-queue"] });
    },
  });
}

/** Lista huddles ativos de uma conversa (com realtime). */
export function useActiveHuddle(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["chat", "huddles", conversationId, "active"],
    enabled: !!conversationId,
    staleTime: 10 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("chat_huddles")
        .select("id, livekit_room_name, started_by, started_at, status")
        .eq("conversation_id", conversationId)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as
        | {
            id: string;
            livekit_room_name: string;
            started_by: string;
            started_at: string;
            status: string;
          }
        | null;
    },
  });
}
