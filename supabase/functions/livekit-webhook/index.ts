/**
 * livekit-webhook — v8.7.5
 * Recebe eventos do LiveKit Cloud:
 *  - participant_joined: dispara Egress MP4 → R2 (idempotente)
 *  - egress_ended: salva recording_url (extrai roomName de egressInfo.roomName)
 *  - room_finished: marca meeting/huddle como concluído + fallback para resolver gravação
 * Audita TODOS os eventos em meeting_recording_events.
 *
 * BUGFIX v8.7.5: Em eventos egress_*, o LiveKit envia roomName em event.egressInfo.roomName
 * (não em event.room.name). Fallback adicional para egress_id → meeting via DB.
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
  // Sem email, gera um sintético estável para satisfazer a UNIQUE
  if (!email) email = `lk-${participant.identity || displayName}@empire.local`;

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
    } else if (event.event === "participant_left") {
      await logEvent(ctx, "participant_left", event.participant?.identity ?? null, {
        participant: event.participant,
      });
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
