/**
 * livekit-guest-decision — v8.7.0
 * Host autenticado aprova ou recusa um pedido de convidado.
 * Body: { request_id, decision: 'approved' | 'rejected' }
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    let userId: string;
    try {
      const { data: { user }, error: cErr } = await userClient.auth.getUser();
      if (cErr || !user?.id) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
    } catch {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const request_id: string = body.request_id;
    const decision: "approved" | "rejected" = body.decision;
    if (!request_id || !["approved", "rejected"].includes(decision))
      return json({ error: "request_id and decision required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: gr, error: grErr } = await admin
      .from("meeting_guest_requests")
      .select("id, meeting_id, status")
      .eq("id", request_id)
      .maybeSingle();
    if (grErr) throw grErr;
    if (!gr) return json({ error: "Pedido não encontrado" }, 404);
    if (gr.status !== "pending") return json({ error: "Pedido já foi decidido" }, 409);

    // Verifica se o caller é host da reunião
    const { data: meeting } = await admin
      .from("meetings")
      .select("id, created_by")
      .eq("id", gr.meeting_id)
      .maybeSingle();

    let isHost = !!(meeting && meeting.created_by === userId);
    if (!isHost) {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (roleRow) isHost = true;
    }
    if (!isHost) return json({ error: "Forbidden" }, 403);

    const { error: uErr } = await admin
      .from("meeting_guest_requests")
      .update({
        status: decision,
        decided_at: new Date().toISOString(),
        decided_by: userId,
      })
      .eq("id", request_id);
    if (uErr) throw uErr;

    return json({ success: true, decision });
  } catch (err) {
    console.error("[livekit-guest-decision]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
