import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://gt3.empirebusiness.com.br",
  "https://t3.empirebusiness.com.br",
  "http://localhost:8080",
  "http://localhost:5173",
];

function getCorsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente autenticado com o JWT do usuário — apenas para validar identidade
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Cliente admin com service_role — bypassa RLS para as operações de criação
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { type, name, description, area_id, participantIds, tenant_id } = body;

    if (!type || !tenant_id || !Array.isArray(participantIds)) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Busca o employee do usuário autenticado
    const { data: emp } = await admin
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!emp) {
      return new Response(JSON.stringify({ error: "Colaborador não encontrado" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Para DM: deduplica conversa existente
    if (type === "direct" && participantIds.length === 1) {
      const otherId = participantIds[0];
      const { data: existing } = await admin
        .from("chat_conversations")
        .select("id, participants:chat_participants(employee_id)")
        .eq("type", "direct")
        .eq("tenant_id", tenant_id);

      const found = (existing ?? []).find((c: any) => {
        const ids = c.participants.map((p: any) => p.employee_id).sort();
        return ids.length === 2 && ids.includes(emp.id) && ids.includes(otherId);
      });
      if (found) {
        return new Response(JSON.stringify({ id: found.id }), {
          status: 200, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    // Cria a conversa
    const { data: conv, error: convErr } = await admin
      .from("chat_conversations")
      .insert({ tenant_id, type, name: name ?? null, description: description ?? null, area_id: area_id ?? null, created_by: emp.id })
      .select("id")
      .single();

    if (convErr) throw convErr;

    // Adiciona participantes (criador + convidados)
    const allIds = [...new Set([emp.id, ...participantIds])];
    const participants = allIds.map((id) => ({
      conversation_id: conv.id,
      employee_id: id,
      role: id === emp.id ? "admin" : "member",
    }));
    const { error: partErr } = await admin.from("chat_participants").insert(participants);
    if (partErr) throw partErr;

    return new Response(JSON.stringify({ id: conv.id }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Erro interno" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
