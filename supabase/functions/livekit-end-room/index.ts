/**
 * livekit-end-room — v8.7.8
 * Encerra uma sala LiveKit (host kicka todos). Aciona meeting-ai se for meeting.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "https://esm.sh/livekit-server-sdk@2.7.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_KEY = Deno.env.get("LIVEKIT_API_KEY")!;
const API_SECRET = Deno.env.get("LIVEKIT_API_SECRET")!;
const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL")!.replace("wss://", "https://");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const rs = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
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

    const { room_name } = await req.json().catch(() => ({}));
    if (!room_name) return json({ error: "room_name required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authorize: precisa ser criador da meeting OU started_by do huddle (ou admin)
    const { data: emp } = await admin
      .from("employees")
      .select("id, tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) return json({ error: "Employee not found" }, 403);

    const { data: meeting } = await admin
      .from("meetings")
      .select("id, created_by, tenant_id")
      .eq("livekit_room_name", room_name)
      .maybeSingle();

    let authorized = false;
    let meetingId: string | null = null;

    if (meeting && meeting.tenant_id === emp.tenant_id) {
      meetingId = meeting.id;
      if (meeting.created_by === userId) authorized = true;
    } else {
      const { data: huddle } = await admin
        .from("chat_huddles")
        .select("id, started_by, tenant_id")
        .eq("livekit_room_name", room_name)
        .maybeSingle();
      if (huddle && huddle.tenant_id === emp.tenant_id && huddle.started_by === emp.id) {
        authorized = true;
      }
    }

    // Admin sempre pode
    if (!authorized) {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (roleRow) authorized = true;
    }

    if (!authorized) return json({ error: "Forbidden" }, 403);

    try {
      await rs.deleteRoom(room_name);
    } catch (err) {
      // Sala pode já estar vazia / encerrada
      console.warn("[livekit-end-room] deleteRoom soft-fail", err);
    }

    // Marca huddle como encerrado para que o banner suma na UI imediatamente.
    try {
      await admin
        .from("chat_huddles")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("livekit_room_name", room_name)
        .eq("status", "active");
    } catch (err) {
      console.warn("[livekit-end-room] huddle status update soft-fail", err);
    }

    // Trigger meeting-ai best-effort se houver transcript_raw salvo (server-to-server idempotente).
    if (meetingId) {
      const { data: m } = await admin
        .from("meetings")
        .select("transcript_raw, summary_markdown")
        .eq("id", meetingId)
        .maybeSingle();
      if (m?.transcript_raw && (m.transcript_raw as string).trim().length > 0 && !m.summary_markdown) {
        // marca processing pra UI
        await admin
          .from("meetings")
          .update({ status: "processing", ended_at: new Date().toISOString() })
          .eq("id", meetingId);

        admin.functions
          .invoke("meeting-ai", {
            body: { meeting_id: meetingId, transcript: m.transcript_raw },
            headers: { "x-internal-invoke": SERVICE_KEY },
          })
          .catch((e) => console.error("[livekit-end-room] meeting-ai trigger failed", e));
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error("[livekit-end-room] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
