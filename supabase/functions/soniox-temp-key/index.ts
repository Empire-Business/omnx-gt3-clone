import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://t3.empirebusiness.com.br",
  "https://gt3.empirebusiness.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const SONIOX_API_KEY = Deno.env.get("SONIOX_API_KEY");
    if (!SONIOX_API_KEY) {
      return new Response(
        JSON.stringify({ error: "SONIOX_API_KEY not configured. Please add your Soniox API key in Supabase secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Request temporary API key from Soniox
    const response = await fetch("https://api.soniox.com/v1/auth/temporary-api-key", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SONIOX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        usage_type: "transcribe_websocket",
        expires_in_seconds: 3600,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Soniox API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Soniox API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("soniox-temp-key error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
