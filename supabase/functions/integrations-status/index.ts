// ─── integrations-status ───────────────────────────────────────────────────
// Central de Integrações — reporta o STATUS de cada integração externa do clone.
// SÓ LEITURA: nunca escreve nada e NUNCA devolve o valor de nenhum segredo.
//
// Duas camadas:
//   1. `available` (barato, para QUALQUER usuário autenticado): a chave existe
//      nos secrets deste clone? É o que dirige o gate de UI (menu/rotas). Não
//      faz nenhuma chamada externa — só checa presença de env.
//   2. `probe` (só admin, quando ?probe=1): valida a chave de verdade com um
//      ping leve (OpenRouter/Resend). Usado pelos badges do painel de admin.
//
// Se a função não existir/deployar num clone, o front cai em fail-open (mostra
// tudo), então a produção atual — que tem todas as chaves — nunca é afetada.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://t3.empirebusiness.com.br",
  "https://gt3.empirebusiness.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

type Health = "ok" | "missing" | "invalid" | "error" | "unknown";

// Cada feature acende com este conjunto de secrets. `env` = leitura direta;
// no futuro (fase 2) o helper getSecret resolverá Vault → env.
const FEATURES: Record<string, string[]> = {
  meetings: ["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_URL"],
  ai: ["OPENROUTER_API_KEY"],
  recording: ["S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_ENDPOINT", "S3_BUCKET"],
  email: ["RESEND_API_KEY", "EMAIL_FROM"],
  push: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
};

// Presença: todas as env vars da feature existem?
function isPresent(keys: string[]): boolean {
  return keys.every((k) => {
    const v = Deno.env.get(k);
    return typeof v === "string" && v.trim().length > 0;
  });
}

// Ping leve com timeout curto — só para serviços com endpoint de validação barato.
async function ping(url: string, apiKey: string): Promise<Health> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.status === 401 || res.status === 403) return "invalid";
    if (!res.ok) return "error";
    return "ok";
  } catch {
    return "error";
  }
}

async function probeFeature(feature: string): Promise<Health> {
  if (!isPresent(FEATURES[feature])) return "missing";
  switch (feature) {
    case "ai": {
      const k = Deno.env.get("OPENROUTER_API_KEY")!;
      return await ping("https://openrouter.ai/api/v1/models", k);
    }
    case "email": {
      const k = Deno.env.get("RESEND_API_KEY")!;
      return await ping("https://api.resend.com/domains", k);
    }
    // LiveKit/S3/VAPID não têm endpoint de validação barato/sem assinatura —
    // presença já basta; validade real aparece no primeiro uso.
    default:
      return "ok";
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const wantsProbe = url.searchParams.get("probe") === "1";

    // Probe (ping real) é restrito a admin — evita chamadas externas por usuário comum.
    let isAdmin = false;
    if (wantsProbe) {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      isAdmin = roleRow?.role === "admin";
    }

    const features: Record<string, { available: boolean; health: Health; missing: string[] }> = {};

    for (const [feature, keys] of Object.entries(FEATURES)) {
      const present = isPresent(keys);
      const missing = present ? [] : keys.filter((k) => !Deno.env.get(k)?.trim());
      let health: Health = present ? "ok" : "missing";
      if (wantsProbe && isAdmin && present) {
        health = await probeFeature(feature);
      } else if (!wantsProbe && present) {
        // Sem probe, só sabemos presença — não afirmamos validade.
        health = "unknown";
      }
      features[feature] = { available: present, health, missing };
    }

    return new Response(JSON.stringify({ features, probed: wantsProbe && isAdmin }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("integrations-status error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
