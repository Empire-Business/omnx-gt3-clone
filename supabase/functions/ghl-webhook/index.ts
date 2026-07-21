import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-webhook-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

function json(data: JsonRecord, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getNestedString(payload: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = key.split(".").reduce<unknown>((current, part) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as JsonRecord)[part];
    }, payload);

    if (typeof value === "string" && value.trim()) return value;
  }

  return null;
}

function sanitizeHeaders(headers: Headers) {
  const blocked = new Set(["authorization", "cookie", "x-ghl-webhook-token"]);
  const clean: Record<string, string> = {};

  headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    clean[normalized] = blocked.has(normalized) ? "[redacted]" : value;
  });

  return clean;
}

function queryParamsWithoutToken(url: URL) {
  const params: Record<string, string | string[]> = {};

  url.searchParams.forEach((value, key) => {
    if (key.toLowerCase() === "token") return;

    const existing = params[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (typeof existing === "string") {
      params[key] = [existing, value];
    } else {
      params[key] = value;
    }
  });

  return params;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
    if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

    const url = new URL(req.url);
    const token =
      url.searchParams.get("token") ||
      req.headers.get("x-ghl-webhook-token") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!token) {
      return json({ error: "Missing webhook token" }, 401);
    }

    const tokenHash = await sha256(token);
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: source, error: sourceError } = await adminClient
      .from("ghl_webhook_sources")
      .select("id, tenant_id, is_active")
      .eq("token_hash", tokenHash)
      .eq("is_active", true)
      .single();

    if (sourceError || !source) {
      return json({ error: "Invalid webhook token" }, 401);
    }

    const rawBody = await req.text();
    let payload: JsonRecord;

    try {
      const parsed = JSON.parse(rawBody) as unknown;
      payload = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as JsonRecord
        : { value: parsed };
    } catch {
      payload = { raw_body: rawBody };
    }

    const eventType = getNestedString(payload, [
      "type",
      "event",
      "eventType",
      "event_type",
      "triggerData.eventType",
      "workflow.eventType",
    ]);

    const ghlLocationId = getNestedString(payload, [
      "locationId",
      "location_id",
      "location.id",
      "location.id",
    ]);

    const event = {
      tenant_id: source.tenant_id,
      source_id: source.id,
      event_type: eventType,
      ghl_location_id: ghlLocationId,
      ghl_contact_id: getNestedString(payload, ["contactId", "contact_id", "contact.id", "contact.id"]),
      ghl_opportunity_id: getNestedString(payload, ["opportunityId", "opportunity_id", "opportunity.id"]),
      ghl_conversation_id: getNestedString(payload, ["conversationId", "conversation_id", "conversation.id"]),
      ghl_workflow_id: getNestedString(payload, ["workflowId", "workflow_id", "workflow.id"]),
      request_method: req.method,
      request_url: `${url.origin}${url.pathname}`,
      headers: sanitizeHeaders(req.headers),
      query_params: queryParamsWithoutToken(url),
      payload,
      raw_body: rawBody,
    };

    const { data: inserted, error: insertError } = await adminClient
      .from("ghl_webhook_events")
      .insert(event)
      .select("id, received_at")
      .single();

    if (insertError) {
      return json({ error: insertError.message }, 500);
    }

    await adminClient
      .from("ghl_webhook_sources")
      .update({ last_received_at: inserted.received_at })
      .eq("id", source.id);

    return json({
      success: true,
      event_id: inserted.id,
      received_at: inserted.received_at,
    });
  } catch (error: unknown) {
    return json({ error: (error as Error).message || "Internal error" }, 500);
  }
});
