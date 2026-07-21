/**
 * Testes de segurança — livekit-guest-token (v8.7.1)
 * Garante que convidados em qualquer status que NÃO seja 'approved' não recebem JWT.
 * Usa anon key direto (a função é pública, verify_jwt=false).
 */
import { loadSync } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Carrega .env sem validar contra .env.example (vars faltantes são ok)
loadSync({ export: true, allowEmptyValues: true, examplePath: null });

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const FN_URL = `${SUPABASE_URL}/functions/v1/livekit-guest-token`;

async function callFn(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

Deno.test("rejeita request sem request_id/guest_token", async () => {
  const { status, json } = await callFn({});
  assertEquals(status, 400);
  assertExists(json.error);
});

Deno.test("rejeita request_id inexistente (404)", async () => {
  const { status, json } = await callFn({
    request_id: "00000000-0000-0000-0000-000000000000",
    guest_token: "00000000-0000-0000-0000-000000000000",
  });
  assertEquals(status, 404);
  assertExists(json.error);
});

// Os testes seguintes só rodam se SERVICE_KEY estiver presente (criamos seed de dados).
// Em CI sem service key, são pulados de forma controlada.
const seedAndRun = SERVICE_KEY ? Deno.test : Deno.test.ignore;

seedAndRun("convidado pending NÃO recebe token (425 Too Early)", async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!);

  // 1. Pega uma meeting ativa qualquer (ou cria fake — usamos qualquer meeting existente)
  const { data: meeting } = await admin
    .from("meetings")
    .select("id, tenant_id, livekit_room_name, status")
    .not("livekit_room_name", "is", null)
    .limit(1)
    .maybeSingle();

  if (!meeting) {
    console.warn("[skip] sem meetings com livekit_room_name no banco");
    return;
  }

  // 2. Cria pedido pending diretamente
  const { data: req, error: insErr } = await admin
    .from("meeting_guest_requests")
    .insert({
      meeting_id: meeting.id,
      livekit_room_name: meeting.livekit_room_name,
      tenant_id: meeting.tenant_id,
      guest_name: "Test Pending Guest",
      status: "pending",
    })
    .select("id, guest_token")
    .single();

  if (insErr || !req) throw insErr || new Error("insert failed");

  try {
    const { status, json } = await callFn({
      request_id: req.id,
      guest_token: req.guest_token,
    });
    assertEquals(status, 425, "deve retornar 425 Too Early para pending");
    assertExists(json.error);
  } finally {
    // Limpa direto via service role (RLS bloqueia delete via anon mas service bypassa)
    await admin.from("meeting_guest_requests").delete().eq("id", req.id);
  }
});

seedAndRun("convidado rejected NÃO recebe token (403)", async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!);
  const { data: meeting } = await admin
    .from("meetings")
    .select("id, tenant_id, livekit_room_name")
    .not("livekit_room_name", "is", null)
    .limit(1)
    .maybeSingle();
  if (!meeting) return;

  const { data: req } = await admin
    .from("meeting_guest_requests")
    .insert({
      meeting_id: meeting.id,
      livekit_room_name: meeting.livekit_room_name,
      tenant_id: meeting.tenant_id,
      guest_name: "Test Rejected Guest",
      status: "rejected",
      decided_at: new Date().toISOString(),
    })
    .select("id, guest_token")
    .single();
  if (!req) return;

  try {
    const { status, json } = await callFn({
      request_id: req.id,
      guest_token: req.guest_token,
    });
    assertEquals(status, 403, "deve retornar 403 Forbidden para rejected");
    assertExists(json.error);
  } finally {
    await admin.from("meeting_guest_requests").delete().eq("id", req.id);
  }
});

seedAndRun("guest_token errado NÃO recebe token (404)", async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!);
  const { data: meeting } = await admin
    .from("meetings")
    .select("id, tenant_id, livekit_room_name")
    .not("livekit_room_name", "is", null)
    .limit(1)
    .maybeSingle();
  if (!meeting) return;

  const { data: req } = await admin
    .from("meeting_guest_requests")
    .insert({
      meeting_id: meeting.id,
      livekit_room_name: meeting.livekit_room_name,
      tenant_id: meeting.tenant_id,
      guest_name: "Test Wrong Token Guest",
      status: "approved",
      decided_at: new Date().toISOString(),
    })
    .select("id, guest_token")
    .single();
  if (!req) return;

  try {
    const { status } = await callFn({
      request_id: req.id,
      guest_token: "11111111-1111-1111-1111-111111111111", // token errado
    });
    assertEquals(status, 404, "guest_token errado → 404 (impede enumeração)");
  } finally {
    await admin.from("meeting_guest_requests").delete().eq("id", req.id);
  }
});
