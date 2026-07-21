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

const RESOURCES = ["employees", "projects", "tasks", "processes", "company_areas", "positions"] as const;
type Resource = (typeof RESOURCES)[number];

// --- Rate Limiting (in-memory, per-IP, 100 req/min) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  return {
    allowed: entry.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - entry.count),
    resetAt: entry.resetAt,
  };
}
// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 300_000);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Rate limit check
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const rl = checkRateLimit(clientIp);
  const rlHeaders = {
    "X-RateLimit-Limit": String(RATE_LIMIT),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };
  const h = { ...corsHeaders, ...rlHeaders };

  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Max 100 requests per minute." }), {
      status: 429,
      headers: { ...corsHeaders, ...rlHeaders, "Content-Type": "application/json", "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    const resource = pathParts[0] as Resource;
    const resourceId = pathParts[1];

    // GET /api → API documentation
    if (!resource) {
      return new Response(JSON.stringify({
        name: "GT3 API",
        version: "1.0.0",
        endpoints: RESOURCES.map(r => ({
          resource: r,
          list: `GET /api/${r}`,
          get: `GET /api/${r}/:id`,
          create: `POST /api/${r}`,
          update: `PATCH /api/${r}/:id`,
          delete: `DELETE /api/${r}/:id`,
        })),
        authentication: "Bearer token in Authorization header (Supabase JWT)",
        pagination: "?limit=N&offset=N (default: limit=50, offset=0)",
        filtering: "?status=active&priority=high (varies by resource)",
        rate_limiting: {
          limit: "100 requests per minute per IP",
          headers: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
        },
      }), {
        headers: { ...corsHeaders, ...rlHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESOURCES.includes(resource)) {
      return json({ error: `Unknown resource: ${resource}. Available: ${RESOURCES.join(", ")}` }, 404, h);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401, h);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await client.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401, h);

    // Fetch tenant_id once — required for all operations (defense-in-depth alongside RLS)
    const { data: profile } = await client.from("profiles").select("tenant_id").eq("user_id", user.id).single();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return json({ error: "Tenant not found" }, 403, h);

    const method = req.method;

    // GET (list or single)
    if (method === "GET") {
      if (resourceId) {
        const { data, error } = await client.from(resource).select("*").eq("id", resourceId).eq("tenant_id", tenantId).single();
        if (error) return json({ error: error.message }, 404, h);
        return json(data, 200, h);
      }

      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      let query = client.from(resource).select("*", { count: "exact" }).eq("tenant_id", tenantId);

      for (const [key, value] of url.searchParams.entries()) {
        if (["limit", "offset", "tenant_id"].includes(key)) continue;
        query = query.eq(key, value);
      }

      const { data, error, count } = await query.range(offset, offset + limit - 1).order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 400, h);
      return json({ data, total: count, limit, offset }, 200, h);
    }

    // POST (create)
    if (method === "POST") {
      const body = await req.json();
      const payload = { ...body, tenant_id: tenantId };
      const { data, error } = await client.from(resource).insert(payload).select().single();
      if (error) return json({ error: error.message }, 400, h);
      return json(data, 201, h);
    }

    // PATCH (update)
    if (method === "PATCH" && resourceId) {
      const body = await req.json();
      delete body.id;
      delete body.tenant_id;
      const { data, error } = await client.from(resource).update(body).eq("id", resourceId).eq("tenant_id", tenantId).select().single();
      if (error) return json({ error: error.message }, 400, h);
      return json(data, 200, h);
    }

    // DELETE
    if (method === "DELETE" && resourceId) {
      const { error } = await client.from(resource).delete().eq("id", resourceId).eq("tenant_id", tenantId);
      if (error) return json({ error: error.message }, 400, h);
      return json({ deleted: true }, 200, h);
    }

    return json({ error: "Method not allowed" }, 405, h);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...extraHeaders, "Content-Type": "application/json" },
  });
}
