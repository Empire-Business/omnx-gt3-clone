/**
 * livekit-webhook — v8.38.0
 * Recebe eventos do LiveKit Cloud:
 *  - participant_joined: dispara Egress MP4 → R2 (idempotente) + registra presença
 *  - participant_left: fecha o segmento de presença (session_seconds)
 *  - egress_ended: salva recording_url (extrai roomName de egressInfo.roomName)
 *  - room_finished: marca meeting/huddle como concluído + fallback para resolver gravação
 * Audita TODOS os eventos em meeting_recording_events.
 *
 * BUGFIX v8.7.5: Em eventos egress_*, o LiveKit envia roomName em event.egressInfo.roomName
 * (não em event.room.name). Fallback adicional para egress_id → meeting via DB.
 *
 * v8.38.0: passa a gravar `meeting_participant_events` (entrada/saída/reconexão
 * com timestamp), fundação das métricas de comparecimento. A gravação de
 * presença é BEST-EFFORT e NUNCA pode derrubar o fluxo de Egress — ver a
 * REGRA DURA no bloco de presença abaixo.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  WebhookReceiver,
  EgressClient,
  EncodedFileType,
  EncodedFileOutput,
  S3Upload,
} from "https://esm.sh/livekit-server-sdk@2.7.0";

const API_KEY = Deno.env.get("LIVEKIT_API_KEY")!;
const API_SECRET = Deno.env.get("LIVEKIT_API_SECRET")!;
const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const S3_ACCESS_KEY = Deno.env.get("S3_ACCESS_KEY")!;
const S3_SECRET_KEY = Deno.env.get("S3_SECRET_KEY")!;
const S3_ENDPOINT = Deno.env.get("S3_ENDPOINT")!;
const S3_BUCKET = Deno.env.get("S3_BUCKET") || "meeting-recordings";
const S3_PUBLIC_URL = Deno.env.get("S3_PUBLIC_URL")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const receiver = new WebhookReceiver(API_KEY, API_SECRET);
const egressClient = new EgressClient(
  LIVEKIT_URL.replace("wss://", "https://"),
  API_KEY,
  API_SECRET,
);

interface RoomCtx {
  meeting_id: string | null;
  huddle_id: string | null;
  tenant_id: string;
}

async function resolveRoom(roomName: string): Promise<RoomCtx | null> {
  const { data: m } = await supabase
    .from("meetings")
    .select("id, tenant_id")
    .eq("livekit_room_name", roomName)
    .maybeSingle();
  if (m) return { meeting_id: m.id, huddle_id: null, tenant_id: m.tenant_id };

  const { data: h } = await supabase
    .from("chat_huddles")
    .select("id, tenant_id, meeting_id")
    .eq("livekit_room_name", roomName)
    .maybeSingle();
  if (h) return { meeting_id: h.meeting_id ?? null, huddle_id: h.id, tenant_id: h.tenant_id };

  return null;
}

async function logEvent(
  ctx: RoomCtx,
  eventType: string,
  participantIdentity: string | null,
  payload: unknown,
) {
  await supabase.from("meeting_recording_events").insert({
    tenant_id: ctx.tenant_id,
    meeting_id: ctx.meeting_id,
    huddle_id: ctx.huddle_id,
    event_type: eventType,
    participant_identity: participantIdentity,
    payload: payload ?? {},
  });
}

/**
 * Persiste em meeting_attendees todos que entraram na sala (host + convidados
 * autenticados). Sem isso, ao terminar a reunião só os pré-cadastrados aparecem
 * na lista de participantes — o host vira invisível.
 *
 * Estratégia: parseia o metadata do participant LiveKit (que carrega
 * employee_id e role gerados pelo livekit-token) e faz upsert idempotente
 * marcando attendance_status='attended'.
 */
async function recordAttendance(
  ctx: RoomCtx,
  participant: { identity?: string; name?: string; metadata?: string } | undefined,
) {
  if (!ctx.meeting_id || !participant) return;
  // Ignora bots da própria gravação (Egress entra na sala como participante invisível)
  if (participant.identity?.startsWith("EG_")) return;

  let employeeId: string | null = null;
  let role: string = "required";
  if (participant.metadata) {
    try {
      const meta = JSON.parse(participant.metadata);
      employeeId = meta.employee_id ?? null;
      if (meta.role === "host") role = "organizer";
    } catch {
      /* metadata pode vir vazia */
    }
  }

  const displayName = participant.name?.trim() || participant.identity || "Participante";

  // Resolve email/full_name do employee se possível (chave única é meeting_id+email)
  let email: string | null = null;
  let resolvedName = displayName;
  if (employeeId) {
    const { data: emp } = await supabase
      .from("employees")
      .select("id, work_email, user_id")
      .eq("id", employeeId)
      .maybeSingle();
    if (emp?.work_email) email = emp.work_email;
    if (emp?.user_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", emp.user_id)
        .maybeSingle();
      if (prof?.full_name) resolvedName = prof.full_name;
    }
  }

  // ── Colaborador já convidado: ATUALIZA a linha dele ──────────────────────
  // O upsert abaixo casa por (meeting_id, email), mas o pré-cadastro pode ter
  // vindo por outro caminho — sincronização do público de um evento, importação
  // de membros de projeto, cadastro manual — com email nulo ou diferente do
  // work_email. Sem esta busca por employee_id, a entrada na sala criava uma
  // SEGUNDA linha e a pessoa aparecia duas vezes na lista: uma "pendente" e
  // outra "compareceu".
  if (employeeId) {
    const { data: existing } = await supabase
      .from("meeting_attendees")
      .select("id, role")
      .eq("meeting_id", ctx.meeting_id)
      .eq("employee_id", employeeId)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("meeting_attendees")
        .update({
          name: resolvedName,
          attendance_status: "attended",
          // `role` só é promovido a organizer; nunca rebaixa um papel já definido.
          ...(role === "organizer" ? { role } : {}),
          ...(email ? { email } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return;
    }
  }

  // Sem email, gera um sintético ESTÁVEL para satisfazer a UNIQUE.
  // Não pode usar a identity crua: `livekit-token` monta
  // `${role}-${employee_id}-${Date.now()}`, então cada reconexão traria um
  // email diferente e viraria uma linha nova por queda de rede.
  if (!email) {
    const stableKey = employeeId ||
      (participant.identity || displayName).replace(/-\d{10,}$/, "");
    email = `lk-${stableKey}@empire.local`;
  }

  await supabase
    .from("meeting_attendees")
    .upsert(
      {
        meeting_id: ctx.meeting_id,
        tenant_id: ctx.tenant_id,
        employee_id: employeeId,
        name: resolvedName,
        email,
        role,
        attendance_status: "attended",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "meeting_id,email" },
    );
}

/* ==========================================================================
 * PRESENÇA EM REUNIÃO — meeting_participant_events (v8.38.0)
 *
 * ⚠️ REGRA DURA — A GRAVAÇÃO DA REUNIÃO É MAIS IMPORTANTE QUE A MÉTRICA.
 * Nada aqui pode derrubar o fluxo de Egress. TODA a lógica de presença vive
 * dentro de um try/catch que só loga: se a tabela ainda não existir (a
 * migration é aplicada depois do deploy do código), se o insert falhar, se o
 * metadata vier corrompido — o handler segue e a gravação acontece do mesmo
 * jeito. Estas funções NUNCA lançam exceção. Não remova o try/catch.
 * ========================================================================== */

interface ParticipantIdent {
  participant_key: string;
  participant_kind: "member" | "guest" | "unknown";
  participant_role: "host" | "guest" | "observer" | "guest_external" | null;
  employee_id: string | null;
  guest_request_id: string | null;
  display_name: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a chave ESTÁVEL do participante.
 *
 * Por que não usar a identity direto: `livekit-token` monta
 * `${role}-${employee_id}-${Date.now()}`. O sufixo de timestamp muda a cada
 * reconexão — agrupar por identity contaria cada queda de rede como uma
 * pessoa nova, e "tempo de permanência" viraria lixo.
 *
 * Formatos possíveis:
 *   host-<employeeId>-<ts>      → membro autenticado, papel host
 *   guest-<employeeId>-<ts>     → membro autenticado com downgrade p/ guest
 *   observer-<employeeId>-<ts>  → membro autenticado, entra oculto
 *   guest-<guestRequestId>      → convidado EXTERNO (livekit-guest-token),
 *                                 identity de 5 segmentos (só o UUID)
 *   EG_...                      → bot de Egress, ignorado antes de chegar aqui
 */
function identifyParticipant(
  participant: { identity?: string; name?: string; metadata?: string } | undefined,
): ParticipantIdent | null {
  const identity = participant?.identity?.trim();
  if (!identity) return null;

  let meta: Record<string, unknown> = {};
  if (participant?.metadata) {
    try {
      meta = JSON.parse(participant.metadata) ?? {};
    } catch {
      /* metadata pode vir vazia/corrompida — segue com o parse da identity */
    }
  }

  const displayName = participant?.name?.trim() || null;
  const metaRole = typeof meta.role === "string" ? meta.role : null;
  const metaEmployeeId =
    typeof meta.employee_id === "string" && UUID_RE.test(meta.employee_id)
      ? meta.employee_id
      : null;
  const metaGuestId =
    typeof meta.guest_request_id === "string" && UUID_RE.test(meta.guest_request_id)
      ? meta.guest_request_id
      : null;

  const parts = identity.split("-");
  const prefix = parts[0];

  // Convidado EXTERNO: metadata explícito, ou identity `guest-<uuid>` exata
  // (a identity do membro tem o sufixo Date.now(), então sobra mais coisa).
  const identityIsExternalGuest =
    prefix === "guest" && UUID_RE.test(identity.slice("guest-".length));
  if (
    metaRole === "guest_external" ||
    (metaGuestId && !metaEmployeeId) ||
    identityIsExternalGuest
  ) {
    const guestId =
      metaGuestId ?? (identityIsExternalGuest ? identity.slice("guest-".length) : null);
    return {
      participant_key: guestId ? `guest:${guestId}` : `identity:${identity}`,
      participant_kind: guestId ? "guest" : "unknown",
      participant_role: "guest_external",
      employee_id: null,
      guest_request_id: guestId,
      display_name: displayName,
    };
  }

  // Membro autenticado: employee_id vem do metadata do token; a identity é o
  // fallback (`<role>-<uuid>-<ts>` → segmentos 1..5 formam o uuid).
  const identityEmployeeId = parts.length >= 7 ? parts.slice(1, 6).join("-") : null;
  const employeeId =
    metaEmployeeId ??
    (identityEmployeeId && UUID_RE.test(identityEmployeeId) ? identityEmployeeId : null);

  const role =
    metaRole === "host" || metaRole === "guest" || metaRole === "observer"
      ? metaRole
      : prefix === "host" || prefix === "guest" || prefix === "observer"
        ? (prefix as "host" | "guest" | "observer")
        : null;

  return {
    participant_key: employeeId ? `employee:${employeeId}` : `identity:${identity}`,
    participant_kind: employeeId ? "member" : "unknown",
    participant_role: role,
    employee_id: employeeId,
    guest_request_id: null,
    display_name: displayName,
  };
}

/**
 * Grava uma entrada ('joined'/'reconnected') ou saída ('left') de presença.
 *
 * Reconexão: conta quantos 'joined'/'reconnected' esta MESMA participant_key
 * já tem nesta sala. Se houver algum, este join é reconexão.
 * Permanência: em 'left', session_seconds é o intervalo desde o último join
 * (preferindo `participant.joinedAt` do LiveKit, que é a verdade do servidor).
 *
 * NUNCA lança — ver REGRA DURA no topo do bloco.
 */
async function recordPresence(
  ctx: RoomCtx,
  kind: "join" | "leave",
  participant:
    | { identity?: string; name?: string; metadata?: string; joinedAt?: unknown }
    | undefined,
  livekitEventId: string | null,
) {
  try {
    // Bot de gravação do LiveKit entra como participante invisível — não é gente.
    if (participant?.identity?.startsWith("EG_")) return;

    const ident = identifyParticipant(participant);
    if (!ident) return;

    const occurredAt = new Date();

    // Quantos joins anteriores esta pessoa já teve NESTA sala (meeting ou huddle).
    let priorQuery = supabase
      .from("meeting_participant_events")
      .select("id, occurred_at, reconnect_count")
      .eq("tenant_id", ctx.tenant_id)
      .eq("participant_key", ident.participant_key)
      .in("event_type", ["joined", "reconnected"]);
    priorQuery = ctx.meeting_id
      ? priorQuery.eq("meeting_id", ctx.meeting_id)
      : priorQuery.eq("huddle_id", ctx.huddle_id as string);

    const { data: priorJoins, error: priorErr } = await priorQuery
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (priorErr) {
      // Tabela ainda não existe (código sobe antes da migration) ou erro de
      // leitura. Loga e sai — o Egress segue intacto.
      console.warn("[livekit-webhook] presence lookup skipped:", priorErr.message);
      return;
    }

    const joinCount = priorJoins?.length ?? 0;
    const baseRow = {
      tenant_id: ctx.tenant_id,
      meeting_id: ctx.meeting_id,
      huddle_id: ctx.meeting_id ? null : ctx.huddle_id,
      participant_key: ident.participant_key,
      participant_kind: ident.participant_kind,
      participant_role: ident.participant_role,
      employee_id: ident.employee_id,
      guest_request_id: ident.guest_request_id,
      display_name: ident.display_name,
      participant_identity: participant?.identity ?? null,
      livekit_event_id: livekitEventId,
    };

    if (kind === "join") {
      const isReconnect = joinCount > 0;
      const { error } = await supabase.from("meeting_participant_events").insert({
        ...baseRow,
        event_type: isReconnect ? "reconnected" : "joined",
        occurred_at: occurredAt.toISOString(),
        // O primeiro join não conta como reconexão.
        reconnect_count: isReconnect ? joinCount : 0,
      });
      // 23505 = reentrega do mesmo evento pelo LiveKit; dedupe funcionando.
      if (error && (error as { code?: string }).code !== "23505") {
        console.warn("[livekit-webhook] presence join insert failed:", error.message);
      }
      return;
    }

    // kind === "leave" — sem join registrado não há intervalo a medir.
    if (joinCount === 0) return;

    // `joinedAt` do LiveKit vem em segundos epoch (number ou bigint no SDK).
    let joinedAtMs: number | null = null;
    const rawJoinedAt = participant?.joinedAt;
    const joinedAtNum =
      typeof rawJoinedAt === "bigint"
        ? Number(rawJoinedAt)
        : typeof rawJoinedAt === "number"
          ? rawJoinedAt
          : null;
    if (joinedAtNum && joinedAtNum > 0) joinedAtMs = joinedAtNum * 1000;
    if (!joinedAtMs && priorJoins?.[0]?.occurred_at) {
      joinedAtMs = new Date(priorJoins[0].occurred_at as string).getTime();
    }
    if (!joinedAtMs || Number.isNaN(joinedAtMs)) return;

    const sessionSeconds = Math.max(
      0,
      Math.round((occurredAt.getTime() - joinedAtMs) / 1000),
    );

    const { error } = await supabase.from("meeting_participant_events").insert({
      ...baseRow,
      event_type: "left",
      occurred_at: occurredAt.toISOString(),
      session_seconds: sessionSeconds,
      reconnect_count: Math.max(0, joinCount - 1),
    });
    if (error && (error as { code?: string }).code !== "23505") {
      console.warn("[livekit-webhook] presence left insert failed:", error.message);
    }
  } catch (err) {
    // Presença é métrica; gravação é o produto. Engolir a falha aqui é
    // intencional e obrigatório — ver REGRA DURA acima.
    console.error("[livekit-webhook] presence recording failed (ignorado)", err);
  }
}


Deno.serve(async (req: Request) => {
  const body = await req.text();
  const auth = req.headers.get("Authorization") || "";

  let event: any;
  try {
    event = await receiver.receive(body, auth);
  } catch (err) {
    console.error("[livekit-webhook] invalid signature", err);
    return new Response("Invalid signature", { status: 401 });
  }

  // BUGFIX: eventos egress_* podem vir sem event.room — usar egressInfo.roomName
  const roomName: string | undefined =
    event.room?.name || event.egressInfo?.roomName;
  const egressId: string | undefined = event.egressInfo?.egressId;
  // Id do evento entregue pelo LiveKit — usado só para dedupe de reentrega na
  // tabela de presença (índice único parcial). Ao contrário do omnx-meet, NÃO
  // existe gate global de dedupe aqui: abortar o handler inteiro numa
  // reentrega poderia matar o disparo do Egress, que é o que não pode falhar.
  const livekitEventId: string | null =
    typeof event.id === "string" && event.id ? event.id : null;
  console.log(
    `[livekit-webhook] ${event.event} room=${roomName ?? "?"} egress=${egressId ?? "?"}`,
  );

  // Resolve contexto: por roomName OU por egress_id (fallback p/ eventos egress sem room)
  let ctx: RoomCtx | null = null;
  if (roomName) {
    ctx = await resolveRoom(roomName);
  }
  if (!ctx && egressId) {
    const { data: m } = await supabase
      .from("meetings")
      .select("id, tenant_id")
      .eq("egress_id", egressId)
      .maybeSingle();
    if (m) ctx = { meeting_id: m.id, huddle_id: null, tenant_id: m.tenant_id };
  }

  if (!ctx) {
    console.warn(
      `[livekit-webhook] unknown context room=${roomName ?? "?"} egress=${egressId ?? "?"}`,
    );
    return new Response("OK");
  }

  try {
    if (event.event === "participant_joined") {
      if (!roomName) return new Response("OK");
      await logEvent(ctx, "participant_joined", event.participant?.identity ?? null, {
        participant: event.participant,
      });
      await recordAttendance(ctx, event.participant);

      // Inicia gravação somente p/ meetings (huddles não gravam por padrão)
      if (ctx.meeting_id) {
        const { data: m } = await supabase
          .from("meetings")
          .select("recording_status, egress_id")
          .eq("id", ctx.meeting_id)
          .maybeSingle();

        if (
          m &&
          m.recording_status !== "recording" &&
          m.recording_status !== "completed" &&
          !m.egress_id
        ) {
          const filename = `${roomName}-${Date.now()}.mp4`;
          try {
            const fileOutput = new EncodedFileOutput({
              fileType: EncodedFileType.MP4,
              filepath: filename,
              output: {
                case: "s3",
                value: new S3Upload({
                  accessKey: S3_ACCESS_KEY,
                  secret: S3_SECRET_KEY,
                  endpoint: S3_ENDPOINT,
                  bucket: S3_BUCKET,
                  region: "auto",
                  forcePathStyle: true,
                }),
              },
            });

            const egress = await egressClient.startRoomCompositeEgress(
              roomName,
              { file: fileOutput },
              { layout: "grid" },
            );

            await supabase
              .from("meetings")
              .update({
                recording_status: "recording",
                egress_id: egress.egressId,
                started_at: new Date().toISOString(),
              })
              .eq("id", ctx.meeting_id);

            await logEvent(ctx, "egress_started", null, { egress_id: egress.egressId, filename });
            console.log(`[livekit-webhook] egress started ${egress.egressId}`);
          } catch (err) {
            console.error("[livekit-webhook] egress failed", err);
            await supabase
              .from("meetings")
              .update({ recording_status: "failed" })
              .eq("id", ctx.meeting_id);
            await logEvent(ctx, "recording_failed", null, { error: String(err) });
          }
        }
      }

      // Presença por último, DEPOIS do Egress: mesmo sendo à prova de exceção,
      // não deve nem atrasar o início da gravação.
      await recordPresence(ctx, "join", event.participant, livekitEventId);
    } else if (event.event === "participant_left") {
      await logEvent(ctx, "participant_left", event.participant?.identity ?? null, {
        participant: event.participant,
      });
      await recordPresence(ctx, "leave", event.participant, livekitEventId);
    } else if (event.event === "egress_started" || event.event === "egress_updated") {
      await logEvent(ctx, "egress_updated", null, { egress: event.egressInfo });
    } else if (event.event === "egress_ended") {
      const file = event.egressInfo?.fileResults?.[0] || event.egressInfo?.file;
      const filename = file?.filename;
      if (filename && ctx.meeting_id) {
        const cleanName = String(filename).replace(/^\/+/, "");
        const publicUrl = `${S3_PUBLIC_URL.replace(/\/$/, "")}/${cleanName.split("/").pop()}`;
        await supabase
          .from("meetings")
          .update({
            recording_url: publicUrl,
            recording_status: "completed",
          })
          .eq("id", ctx.meeting_id);
        console.log(`[livekit-webhook] recording saved ${publicUrl}`);
      }
      await logEvent(ctx, "egress_ended", null, { egress: event.egressInfo });
    } else if (event.event === "room_started") {
      await logEvent(ctx, "room_started", null, { room: event.room });
    } else if (event.event === "room_finished") {
      await logEvent(ctx, "room_finished", null, { room: event.room });
      if (ctx.meeting_id) {
        // Fallback: se egress_ended não chegou, busca egress ativo e finaliza/poll
        const { data: m } = await supabase
          .from("meetings")
          .select("egress_id, recording_url, recording_status, transcript_raw, summary_markdown")
          .eq("id", ctx.meeting_id)
          .maybeSingle();

        const transcript = (m?.transcript_raw ?? "").trim();
        const willProcessAi = transcript.length > 0 && !m?.summary_markdown;

        // Se houver transcrição para processar, mantém como "processing" pra UI mostrar o spinner.
        // Caso contrário, marca como "completed" direto.
        await supabase
          .from("meetings")
          .update({
            status: willProcessAi ? "processing" : "completed",
            ended_at: new Date().toISOString(),
          })
          .eq("id", ctx.meeting_id);

        if (m?.egress_id && !m.recording_url) {
          try {
            const egresses = await egressClient.listEgress({ egressId: m.egress_id });
            const eg = egresses?.[0];
            const file = eg?.fileResults?.[0];
            if (file?.filename) {
              const cleanName = String(file.filename).replace(/^\/+/, "").split("/").pop();
              const publicUrl = `${S3_PUBLIC_URL.replace(/\/$/, "")}/${cleanName}`;
              await supabase
                .from("meetings")
                .update({ recording_url: publicUrl, recording_status: "completed" })
                .eq("id", ctx.meeting_id);
              await logEvent(ctx, "egress_resolved_via_poll", null, { egress: eg });
              console.log(`[livekit-webhook] recording resolved via poll ${publicUrl}`);
            } else {
              await supabase
                .from("meetings")
                .update({ recording_status: "pending" })
                .eq("id", ctx.meeting_id);
            }
          } catch (err) {
            console.error("[livekit-webhook] poll egress failed", err);
            await supabase
              .from("meetings")
              .update({ recording_status: "pending" })
              .eq("id", ctx.meeting_id);
          }
        }

        // Auto-trigger meeting-ai server-to-server (idempotente — função ignora se já processado).
        if (willProcessAi) {
          try {
            await supabase.functions.invoke("meeting-ai", {
              body: { meeting_id: ctx.meeting_id, transcript },
              headers: { "x-internal-invoke": SERVICE_KEY },
            });
            await logEvent(ctx, "meeting_ai_triggered", null, { source: "room_finished" });
            console.log(`[livekit-webhook] meeting-ai triggered for ${ctx.meeting_id}`);
          } catch (err) {
            console.error("[livekit-webhook] meeting-ai trigger failed", err);
            await logEvent(ctx, "meeting_ai_trigger_failed", null, { error: String(err) });
          }
        }
      }
      if (ctx.huddle_id) {
        await supabase
          .from("chat_huddles")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", ctx.huddle_id);
      }
    }
  } catch (err) {
    console.error("[livekit-webhook] error processing event", err);
  }

  return new Response("OK", { status: 200 });
});
