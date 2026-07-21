/**
 * livekit-guest-token — v8.7.0
 * Público. Convidado autenticado via guest_token (UUID) recebe JWT LiveKit
 * com permissões mínimas (sem roomAdmin, sem record).
 * Body: { request_id, guest_token }
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.7.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_KEY = Deno.env.get("LIVEKIT_API_KEY")!;
const API_SECRET = Deno.env.get("LIVEKIT_API_SECRET")!;
const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const request_id: string = body.request_id;
    const guest_token: string = body.guest_token;
    if (!request_id || !guest_token)
      return json({ error: "request_id and guest_token required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: gr, error: grErr } = await admin
      .from("meeting_guest_requests")
      .select("id, livekit_room_name, guest_name, status, meeting_id")
      .eq("id", request_id)
      .eq("guest_token", guest_token)
      .maybeSingle();

    if (grErr) throw grErr;
    if (!gr) return json({ error: "Pedido inválido" }, 404);
    if (gr.status === "rejected") return json({ error: "Acesso recusado pelo host" }, 403);
    if (gr.status === "expired") return json({ error: "Pedido expirado" }, 410);
    if (gr.status === "pending") return json({ error: "Aguardando aprovação" }, 425);
    if (gr.status !== "approved") return json({ error: "Status inválido" }, 400);

    // Verifica se a sala ainda está ativa
    const { data: meeting } = await admin
      .from("meetings")
      .select("status, recording_status")
      .eq("id", gr.meeting_id)
      .maybeSingle();

    if (
      !meeting ||
      meeting.status === "completed" ||
      meeting.status === "cancelled"
    ) {
      return json({ error: "Reunião encerrada" }, 410);
    }

    const identity = `guest-${gr.id}`;
    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: gr.guest_name,
      metadata: JSON.stringify({ guest_request_id: gr.id, role: "guest_external" }),
    });
    at.addGrant({
      room: gr.livekit_room_name,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Sem roomAdmin, sem roomRecord
    });

    const jwt = await at.toJwt();
    return json({ token: jwt, url: LIVEKIT_URL, room_name: gr.livekit_room_name });
  } catch (err) {
    console.error("[livekit-guest-token]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
