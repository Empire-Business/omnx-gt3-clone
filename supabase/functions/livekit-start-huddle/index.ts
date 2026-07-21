/**
 * livekit-start-huddle — v8.7.8
 * Inicia um huddle (chamada rápida) numa conversa do chat.
 * - Cria registro chat_huddles (status='active')
 * - Posta system message no chat com link clicável
 * - Retorna { huddle_id, room_name }
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const { conversation_id } = await req.json().catch(() => ({}));
    if (!conversation_id) return json({ error: "conversation_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: emp } = await admin
      .from("employees")
      .select("id, tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) return json({ error: "Employee not found" }, 403);

    // Garante que é participante da conversa
    const { data: part } = await admin
      .from("chat_participants")
      .select("id")
      .eq("conversation_id", conversation_id)
      .eq("employee_id", emp.id)
      .maybeSingle();
    if (!part) return json({ error: "Not a participant of this conversation" }, 403);

    // Reaproveita huddle ativo se já houver
    const { data: existing } = await admin
      .from("chat_huddles")
      .select("id, livekit_room_name")
      .eq("conversation_id", conversation_id)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      return json({
        huddle_id: existing.id,
        room_name: existing.livekit_room_name,
        reused: true,
      });
    }

    const roomName = `huddle-${crypto.randomUUID().slice(0, 8)}-${Date.now().toString(36)}`;

    const { data: huddle, error: hErr } = await admin
      .from("chat_huddles")
      .insert({
        tenant_id: emp.tenant_id,
        conversation_id,
        livekit_room_name: roomName,
        started_by: emp.id,
        status: "active",
      })
      .select("id, livekit_room_name")
      .single();
    if (hErr) throw hErr;

    // Posta system message
    await admin.from("chat_messages").insert({
      conversation_id,
      employee_id: emp.id,
      type: "huddle_started",
      content: JSON.stringify({ huddle_id: huddle.id, room_name: roomName }),
    });

    return json({ huddle_id: huddle.id, room_name: roomName, reused: false });
  } catch (err) {
    console.error("[livekit-start-huddle] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
