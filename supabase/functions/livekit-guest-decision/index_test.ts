/**
 * Testes de segurança — livekit-guest-decision (v8.7.1)
 * Garante que somente host/admin autenticados conseguem aprovar/recusar.
 */
import { loadSync } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

loadSync({ export: true, allowEmptyValues: true, examplePath: null });

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/livekit-guest-decision`;

async function callFn(
  body: unknown,
  authHeader?: string,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  if (authHeader) headers["Authorization"] = authHeader;
  const res = await fetch(FN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

Deno.test("livekit-guest-decision: sem Authorization → 401", async () => {
  const { status, json } = await callFn({
    request_id: "00000000-0000-0000-0000-000000000000",
    decision: "approved",
  });
  assertEquals(status, 401);
  assertExists(json.error);
});

Deno.test("livekit-guest-decision: token inválido → 401", async () => {
  const { status } = await callFn(
    {
      request_id: "00000000-0000-0000-0000-000000000000",
      decision: "approved",
    },
    "Bearer invalid-jwt",
  );
  assertEquals(status, 401);
});

Deno.test(
  "livekit-guest-decision: convidado externo nunca pode decidir (não tem JWT Supabase)",
  async () => {
    const fakeLivekitJwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJndWVzdC1leHQifQ.fake";
    const { status } = await callFn(
      {
        request_id: "00000000-0000-0000-0000-000000000000",
        decision: "approved",
      },
      `Bearer ${fakeLivekitJwt}`,
    );
    assertEquals(status, 401);
  },
);
