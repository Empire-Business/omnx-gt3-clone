/**
 * livekit-start-huddle — v8.39.1
 * Inicia um huddle (chamada rápida) num canal do chat.
 * - Cria registro em `chat_huddles`
 * - Posta mensagem no chat com um attachment `type: "huddle"` (o `HuddleCard`
 *   do `src/pages/Chat.tsx` renderiza a partir dele)
 * - Retorna { huddle_id, room_name }
 *
 * ────────────────────────────────────────────────────────────────────────────
 * REESCRITA EM 2026-08-31 — esta função estava 100% quebrada em produção.
 *
 * Ela era escrita contra um schema que NÃO EXISTE neste banco. Seis
 * divergências, todas confirmadas por consulta ao banco real
 * (projeto opbdoulspzlabxzevffc) e não ao `types.ts`, que está defasado:
 *
 *   o código usava            │ a produção tem
 *   ──────────────────────────┼──────────────────────────────────────────────
 *   tabela chat_participants  │ chat_channel_members(channel_id, user_id, ...)
 *   chat_huddles.conversation_id │ chat_huddles.channel_id
 *   chat_huddles.livekit_room_name │ chat_huddles.room_name
 *   chat_huddles.status='active' │ não existe coluna status; ativo = ended_at IS NULL
 *   chat_messages.conversation_id │ chat_messages.channel_id
 *   chat_messages.employee_id / .type │ chat_messages.author_id (+ attachments jsonb)
 *
 * Ou seja: a primeira consulta já falhava e todo huddle morria em
 * "Not a participant of this conversation" (403). O frontend, curiosamente,
 * SEMPRE esteve certo — o `HuddleCard` lê `channel_id`/`ended_at`.
 *
 * Convenções confirmadas nos DADOS, porque os comentários do repo erravam:
 *   • chat_huddles.started_by  = auth.users.id  (14 de 14 linhas)
 *   • chat_messages.author_id  = auth.users.id  (17.983 de 17.983 linhas)
 * Um comentário em `system-bot-notify` afirma que "chat_messages usa
 * employee_id" — não usa.
 *
 * O parâmetro de entrada continua chamando-se `conversation_id` por
 * compatibilidade com `useStartHuddle` (src/hooks/useLiveKit.ts), mas o valor
 * é o id do CANAL. `channel_id` também é aceito.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    let userId: string;
    try {
      const { data: { user }, error: cErr } = await userClient.auth.getUser();
      if (cErr || !user?.id) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
    } catch {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const channelId: string | undefined = body?.channel_id || body?.conversation_id;
    if (!channelId) return json({ error: "channel_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: emp } = await admin
      .from("employees")
      .select("id, tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) return json({ error: "Employee not found" }, 403);

    // Membership do canal: a tabela é chat_channel_members e a chave é o
    // user_id do auth, não o employee_id.
    const { data: member, error: memberErr } = await admin
      .from("chat_channel_members")
      .select("channel_id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return json({ error: "Not a member of this channel" }, 403);

    // O canal precisa ser do mesmo tenant de quem está chamando — sem isso,
    // conhecer um id de canal de outro tenant abriria uma sala nele.
    const { data: channel } = await admin
      .from("chat_channels")
      .select("id, tenant_id, name")
      .eq("id", channelId)
      .maybeSingle();
    if (!channel || channel.tenant_id !== emp.tenant_id) {
      return json({ error: "Not a member of this channel" }, 403);
    }

    // Huddle ativo = ainda não encerrado. Não existe coluna `status`.
    const { data: existing } = await admin
      .from("chat_huddles")
      .select("id, room_name")
      .eq("channel_id", channelId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return json({
        huddle_id: existing.id,
        room_name: existing.room_name,
        reused: true,
      });
    }

    const roomName = `huddle-${crypto.randomUUID().slice(0, 8)}-${Date.now().toString(36)}`;

    const { data: huddle, error: hErr } = await admin
      .from("chat_huddles")
      .insert({
        tenant_id: emp.tenant_id,
        channel_id: channelId,
        room_name: roomName,
        started_by: userId,
      })
      .select("id, room_name")
      .single();
    if (hErr) throw hErr;

    // Mensagem no chat. O `HuddleCard` (Chat.tsx) lê `attachment.huddle_id`,
    // então o attachment é o contrato — não o texto.
    const { error: msgErr } = await admin.from("chat_messages").insert({
      channel_id: channelId,
      tenant_id: emp.tenant_id,
      author_id: userId,
      content: "Iniciou uma chamada",
      attachments: [{ type: "huddle", huddle_id: huddle.id, room_name: roomName }],
    });
    // A chamada já existe; falhar em anunciá-la no chat não pode desfazê-la.
    // Mas o erro precisa aparecer no log — foi o silêncio que escondeu os bugs
    // anteriores desta função.
    if (msgErr) {
      console.error("[livekit-start-huddle] huddle criado, mas a mensagem no chat falhou:", msgErr.message);
    }

    return json({ huddle_id: huddle.id, room_name: roomName, reused: false });
  } catch (err) {
    console.error("[livekit-start-huddle] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
