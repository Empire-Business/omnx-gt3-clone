import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { pushToSubscriptions, type VapidConfig } from "../_shared/webpush.ts";

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

// ── Handler principal ─────────────────────────────────────────
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  function json(data: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // BRECHA 6: exige usuário autenticado. Esta função é chamada pelo frontend
    // (useChat.ts) via supabase.functions.invoke, que já envia o JWT — então o
    // controle correto é validar o JWT (auth.getUser), NÃO um segredo interno
    // como em send-push (aquele é server-to-server). Sem isto, qualquer pessoa
    // na internet dispararia push spam a partir de um message_id.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: authUser }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authUser) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const vapid: VapidConfig = {
      publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
      privateKey: Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
      subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:suporte@gt3.com",
    };

    const body = await req.json();
    const { message_id } = body;
    if (!message_id) return json({ error: "message_id required" }, 400);

    // Busca a mensagem — modelo: channel_id + author_id (user_id)
    const { data: msg } = await supabase
      .from("chat_messages")
      .select("id, content, channel_id, author_id, tenant_id")
      .eq("id", message_id)
      .maybeSingle();

    if (!msg) return json({ error: "message not found" }, 404);

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", msg.author_id)
      .maybeSingle();
    const senderName = (senderProfile as any)?.full_name ?? "Alguém";

    const { data: channel } = await supabase
      .from("chat_channels")
      .select("name, is_dm")
      .eq("id", msg.channel_id)
      .maybeSingle();
    const channelName = (channel as any)?.name || "chat";
    const isDm = (channel as any)?.is_dm ?? false;

    const preview = ((msg.content as string) ?? "").slice(0, 120) || "[mídia]";

    // Membros do canal que devem receber (exceto remetente)
    const { data: members } = await supabase
      .from("chat_channel_members")
      .select("user_id")
      .eq("channel_id", msg.channel_id)
      .neq("user_id", msg.author_id);

    if (!members?.length) return json({ sent: 0 });

    const userIds = (members as any[]).map((m) => m.user_id);

    const { data: empRows } = await supabase
      .from("employees")
      .select("id, user_id")
      .in("user_id", userIds)
      .eq("tenant_id", msg.tenant_id);

    const empIds = [...new Set((empRows || []).map((e: any) => e.id))];
    if (!empIds.length) return json({ sent: 0 });

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys")
      .in("employee_id", empIds);

    if (!subs?.length || !vapid.publicKey || !vapid.privateKey) return json({ sent: 0 });

    const chatUrl = `${Deno.env.get("SITE_URL") ?? "https://gt3.omnx.pro"}/chat/${msg.channel_id}`;
    const title = isDm ? senderName : `${senderName} em #${channelName}`;
    const payload = {
      title,
      body: preview,
      icon: `${Deno.env.get("SITE_URL") ?? "https://gt3.omnx.pro"}/logo.png`,
      tag: `chat-${msg.channel_id}`,
      data: { url: chatUrl, channel_id: msg.channel_id },
    };

    console.log(`[push] message ${message_id}: ${subs.length} subscription(s) alvo`);

    const { sent, failed, deadEndpoints, results } = await pushToSubscriptions(
      subs as Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
      payload,
      vapid,
    );

    if (deadEndpoints.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
      console.log(`[push] removidas ${deadEndpoints.length} subscription(s) mortas`);
    }

    console.log(`[push] message ${message_id}: sent=${sent} failed=${failed}`, JSON.stringify(results));

    return json({ sent, failed, results });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
