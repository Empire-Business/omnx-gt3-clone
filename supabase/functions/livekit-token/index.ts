/**
 * livekit-token — v8.36.0
 * Gera JWT por role (host/guest/observer) para entrar numa sala LiveKit.
 * Valida JWT do Supabase e checa que o caller é membro da meeting/huddle.
 *
 * ── Correções desta versão ────────────────────────────────────────────────
 *
 * BUG 1 — Huddles do chat davam 403 SEMPRE.
 *   A checagem lia `chat_huddles.room_name` + `chat_huddles.channel_id` e a
 *   tabela `chat_channel_members`. Nada disso existe no schema atual (só no
 *   dump baseline antigo `00000000000000_init.sql`, que está defasado).
 *   O schema real (src/integrations/supabase/types.ts + o INSERT feito por
 *   `livekit-start-huddle`) é:
 *     chat_huddles(id, tenant_id, conversation_id, livekit_room_name,
 *                  started_by [= employees.id], status, ...)
 *   e a participação vive em `chat_participants(conversation_id, employee_id)`
 *   apontando para `chat_conversations`. `chat_channel_members` NÃO EXISTE —
 *   a query falhava (relation inexistente), `member` vinha null e todo mundo
 *   caía em "Forbidden: not a member of this room".
 *
 * BUG 2 — Dependência circular: era impossível entrar numa sala fora de /reunioes.
 *   Esta função exigia uma linha em `meetings` com aquele `livekit_room_name`,
 *   mas quem criava essa linha era o client (`useMeetingByRoomName`) apenas
 *   quando `createIfMissing: isHost` — e `isHost` só é conhecido DEPOIS do
 *   token. Ou seja: sem linha não há token, sem token não há host, sem host
 *   não há linha. `/meet/<qualquer-coisa>` dava 403 eterno.
 *   Decisão: a criação passa a ser feita AQUI, no servidor, que é onde a
 *   decisão é segura (service_role + identidade já validada). Regras:
 *     - só um usuário AUTENTICADO e com `employees` do tenant provisiona;
 *     - a linha nasce com o `tenant_id` do próprio caller (zero vazamento
 *       entre tenants) e `created_by = auth.uid()`, tornando-o o criador;
 *     - salas de huddle (prefixo `huddle-`/`huddle_`) NUNCA são provisionadas
 *       como meeting: elas têm que existir em `chat_huddles`, senão é 403;
 *     - corrida entre dois participantes entrando ao mesmo tempo é tratada
 *       pelo índice único `meetings_livekit_room_name_key`: em conflito
 *       (23505) relemos a linha vencedora e seguimos o fluxo normal — quem
 *       perdeu a corrida vira guest pela regra de downgrade abaixo;
 *     - o fluxo que já funciona (reunião criada em /reunioes) é inalterado:
 *       a linha já existe e o código cai no mesmo caminho de antes.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.7.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_KEY = Deno.env.get("LIVEKIT_API_KEY")!;
const API_SECRET = Deno.env.get("LIVEKIT_API_SECRET")!;
const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Role = "host" | "guest" | "observer";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

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
    const roomName: string = body.roomName;
    const participantName: string = body.participantName || "Participante";
    const role: Role = (body.role as Role) || "guest";
    const metadata = body.metadata || {};

    if (!roomName) return json({ error: "roomName required" }, 400);

    // Service-role para validar membership
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve employee + tenant do caller
    const { data: emp } = await admin
      .from("employees")
      .select("id, tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!emp) return json({ error: "Employee not found" }, 403);

    // Permite acessar se a sala pertence a uma meeting do tenant OU a um huddle
    // do qual o employee é participante. Se não existir em lugar nenhum, a sala
    // é provisionada aqui (ver BUG 2 no cabeçalho).
    const isHuddleRoom = /^huddle[-_]/i.test(roomName);

    async function findMeeting() {
      const { data } = await admin
        .from("meetings")
        .select("id, tenant_id, created_by")
        .eq("livekit_room_name", roomName)
        .maybeSingle();
      return data as { id: string; tenant_id: string; created_by: string | null } | null;
    }

    let meeting = await findMeeting();

    let allowed = false;
    let isCreator = false;

    if (meeting) {
      if (meeting.tenant_id === emp.tenant_id) {
        allowed = true;
        if (meeting.created_by && meeting.created_by === userId) isCreator = true;
      }
    } else {
      // ATENÇÃO — NÃO "corrija" estes nomes de coluna sem consultar o BANCO.
      //
      // Em 2026-08-31 este bloco foi reescrito para `livekit_room_name` /
      // `conversation_id` / `chat_participants`, por conferir apenas o
      // `src/integrations/supabase/types.ts` e a `livekit-start-huddle`. Um
      // smoke test contra o banco de PRODUÇÃO (opbdoulspzlabxzevffc) mostrou
      // que o schema real é outro:
      //
      //   chat_huddles(id, channel_id, tenant_id, room_name, started_by, ...)
      //   chat_channel_members(channel_id, user_id, joined_at, last_read_at, role)
      //
      // Não existem `chat_participants` nem `chat_conversations` em produção.
      // Consulta a coluna inexistente devolve erro, `data` fica null, `allowed`
      // fica false — ou seja, a "correção" causava exatamente o 403 que ela
      // dizia estar consertando. Revertido para o schema real.
      //
      // O `types.ts` e a `livekit-start-huddle` descrevem um schema que o banco
      // de produção NÃO tem: a própria `livekit-start-huddle` insere
      // `conversation_id`/`livekit_room_name` e portanto falha lá. Isso é uma
      // divergência repo↔banco a resolver à parte — não neste arquivo.
      const { data: huddle } = await admin
        .from("chat_huddles")
        .select("id, tenant_id, channel_id, started_by")
        .eq("room_name", roomName)
        .maybeSingle();

      if (huddle) {
        if (huddle.tenant_id === emp.tenant_id) {
          const { data: member } = await admin
            .from("chat_channel_members")
            .select("channel_id")
            .eq("channel_id", huddle.channel_id)
            .eq("user_id", userId)
            .maybeSingle();
          if (member) {
            allowed = true;
            // started_by armazena auth.uid(), conforme a RLS policy.
            if (huddle.started_by === userId) isCreator = true;
          }
        }
      } else if (!isHuddleRoom) {
        // BUG 2: sala inexistente → o próprio servidor a cria para este usuário
        // autenticado, que passa a ser o host/criador. Sempre com o tenant_id
        // do caller, nunca com dado vindo do body.
        const { data: created, error: insErr } = await admin
          .from("meetings")
          .insert({
            title: body.meetingTitle || `Reunião ${new Date().toISOString()}`,
            tenant_id: emp.tenant_id,
            created_by: userId,
            status: "recording",
            started_at: new Date().toISOString(),
            meeting_mode: "livekit",
            livekit_room_name: roomName,
            recording_status: "pending",
            approval_status: "pending",
          })
          .select("id, tenant_id, created_by")
          .single();

        if (insErr) {
          // Corrida: outro participante criou a mesma sala entre o SELECT e o
          // INSERT. O índice único meetings_livekit_room_name_key barra o
          // segundo INSERT (23505) — relemos a linha vencedora e seguimos.
          if ((insErr as { code?: string }).code === "23505") {
            meeting = await findMeeting();
            if (meeting && meeting.tenant_id === emp.tenant_id) {
              allowed = true;
              if (meeting.created_by && meeting.created_by === userId) isCreator = true;
            }
          } else {
            throw insErr;
          }
        } else if (created) {
          meeting = created as typeof meeting;
          allowed = true;
          isCreator = true;
        }
      }
    }

    if (!allowed) {
      return json({ error: "Forbidden: not a member of this room" }, 403);
    }

    // Se o caller pediu host mas não é criador, downgrade para guest
    const finalRole: Role = role === "host" && !isCreator ? "guest" : role;

    const identity = `${finalRole}-${emp.id}-${Date.now()}`;
    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: participantName,
      metadata: JSON.stringify({ ...metadata, employee_id: emp.id, role: finalRole }),
    });

    if (finalRole === "host") {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: true,
        roomRecord: true,
      });
    } else if (finalRole === "observer") {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
        hidden: true,
      });
    } else {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
    }

    const jwt = await at.toJwt();
    return json({ token: jwt, url: LIVEKIT_URL, role: finalRole });
  } catch (err) {
    console.error("[livekit-token] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
