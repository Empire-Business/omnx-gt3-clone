/**
 * livekit-guest-status — v8.7.0
 * Público. Convidado consulta o status do próprio pedido via guest_token.
 * Body: { request_id, guest_token }
 * Retorna apenas { status }.
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
    const request_id: string = body.request_id;
    const guest_token: string = body.guest_token;
    if (!request_id || !guest_token)
      return json({ error: "request_id and guest_token required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await admin
      .from("meeting_guest_requests")
      .select("status")
      .eq("id", request_id)
      .eq("guest_token", guest_token)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Pedido não encontrado" }, 404);

    return json({ status: data.status });
  } catch (err) {
    console.error("[livekit-guest-status]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
