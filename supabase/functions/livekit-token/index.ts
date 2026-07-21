/**
 * livekit-token — v8.7.8
 * Gera JWT por role (host/guest/observer) para entrar numa sala LiveKit.
 * Valida JWT do Supabase e checa que o caller é membro da meeting/huddle.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.7.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_KEY = Deno.env.get("LIVEKIT_API_KEY")!;
const API_SECRET = Deno.env.get("LIVEKIT_API_SECRET")!;
const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Role = "host" | "guest" | "observer";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    const body = await req.json().catch(() => ({}));
    const roomName: string = body.roomName;
    const participantName: string = body.participantName || "Participante";
    const role: Role = (body.role as Role) || "guest";
    const metadata = body.metadata || {};

    if (!roomName) return json({ error: "roomName required" }, 400);

    // Service-role para validar membership
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve employee + tenant do caller
    const { data: emp } = await admin
      .from("employees")
      .select("id, tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!emp) return json({ error: "Employee not found" }, 403);

    // Permite acessar se a sala pertence a uma meeting do tenant OU a um huddle
    // do qual o employee é participante.
    const { data: meeting } = await admin
      .from("meetings")
      .select("id, tenant_id, created_by")
      .eq("livekit_room_name", roomName)
      .maybeSingle();

    let allowed = false;
    let isCreator = false;

    if (meeting) {
      if (meeting.tenant_id === emp.tenant_id) {
        allowed = true;
        if (meeting.created_by && meeting.created_by === userId) isCreator = true;
      }
    } else {
      const { data: huddle } = await admin
        .from("chat_huddles")
        .select("id, tenant_id, channel_id, started_by")
        .eq("room_name", roomName)
        .maybeSingle();

      if (huddle && huddle.tenant_id === emp.tenant_id) {
        const { data: member } = await admin
          .from("chat_channel_members")
          .select("id")
          .eq("channel_id", huddle.channel_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (member) {
          allowed = true;
          // started_by armazena auth.uid() conforme RLS policy
          if (huddle.started_by === userId) isCreator = true;
        }
      }
    }

    if (!allowed) {
      return json({ error: "Forbidden: not a member of this room" }, 403);
    }

    // Se o caller pediu host mas não é criador, downgrade para guest
    const finalRole: Role = role === "host" && !isCreator ? "guest" : role;

    const identity = `${finalRole}-${emp.id}-${Date.now()}`;
    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: participantName,
      metadata: JSON.stringify({ ...metadata, employee_id: emp.id, role: finalRole }),
    });

    if (finalRole === "host") {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: true,
        roomRecord: true,
      });
    } else if (finalRole === "observer") {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
        hidden: true,
      });
    } else {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
    }

    const jwt = await at.toJwt();
    return json({ token: jwt, url: LIVEKIT_URL, role: finalRole });
  } catch (err) {
    console.error("[livekit-token] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
