/**
 * livekit-guest-request — v8.7.0
 * Endpoint público (sem auth) — convidado externo solicita entrada numa sala.
 * Cria pedido em meeting_guest_requests com status='pending'.
 * Retorna {request_id, guest_token} que o cliente usa pra fazer polling.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const room_name: string = (body.room_name || "").toString().trim();
    const guest_name: string = (body.guest_name || "").toString().trim().slice(0, 80);

    if (!room_name) return json({ error: "room_name required" }, 400);
    if (!guest_name || guest_name.length < 2)
      return json({ error: "guest_name must be at least 2 chars" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Busca a meeting pela sala — só permite request se a sala estiver ativa
    const { data: meeting, error: mErr } = await admin
      .from("meetings")
      .select("id, tenant_id, status, recording_status, livekit_room_name")
      .eq("livekit_room_name", room_name)
      .maybeSingle();

    if (mErr) throw mErr;
    if (!meeting) return json({ error: "Sala não encontrada" }, 404);

    // Aceita pedido se a sala estiver agendada ou gravando (ao vivo)
    const ok =
      meeting.status === "scheduled" ||
      meeting.status === "recording" ||
      meeting.recording_status === "recording";
    if (!ok) return json({ error: "Reunião encerrada — não é possível entrar" }, 410);

    const { data: inserted, error: iErr } = await admin
      .from("meeting_guest_requests")
      .insert({
        meeting_id: meeting.id,
        livekit_room_name: room_name,
        guest_name,
        tenant_id: meeting.tenant_id,
        status: "pending",
      })
      .select("id, guest_token")
      .single();

    if (iErr) throw iErr;

    return json({ request_id: inserted.id, guest_token: inserted.guest_token });
  } catch (err) {
    console.error("[livekit-guest-request]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
