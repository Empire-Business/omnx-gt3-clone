import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://gt3.empirebusiness.com.br",
  "https://t3.empirebusiness.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Auth obrigatória
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id, event, payload } = await req.json();
    if (!tenant_id || !event) throw new Error("Missing tenant_id or event");

    // Verifica que o user pertence ao tenant_id requisitado
    const { data: profile, error: profErr } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile || profile.tenant_id !== tenant_id) {
      return new Response(JSON.stringify({ error: "Forbidden: tenant mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch active webhooks for this tenant + event
    const { data: webhooks } = await adminClient
      .from("webhooks")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .contains("events", [event]);

    if (!webhooks?.length) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.allSettled(
      webhooks.map(async (wh) => {
        const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
        const headers: Record<string, string> = { "Content-Type": "application/json" };

        if (wh.secret) {
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw", encoder.encode(wh.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
          );
          const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
          headers["X-Webhook-Signature"] = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
        }

        try {
          const res = await fetch(wh.url, { method: "POST", headers, body });
          const resBody = await res.text().catch(() => "");

          await adminClient.from("webhook_logs").insert({
            webhook_id: wh.id,
            tenant_id: wh.tenant_id,
            event,
            payload,
            response_status: res.status,
            response_body: resBody.slice(0, 2000),
            success: res.ok,
          });

          return { webhook_id: wh.id, status: res.status, success: res.ok };
        } catch (fetchErr) {
          await adminClient.from("webhook_logs").insert({
            webhook_id: wh.id,
            tenant_id: wh.tenant_id,
            event,
            payload,
            response_status: 0,
            response_body: (fetchErr as Error).message,
            success: false,
          });
          return { webhook_id: wh.id, status: 0, success: false, error: (fetchErr as Error).message };
        }
      })
    );

    return new Response(JSON.stringify({ dispatched: webhooks.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
