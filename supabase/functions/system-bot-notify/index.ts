/**
 * system-bot-notify — v8.12.0
 * Bot de sistema genérico que envia notificações in-app + DM via chat.
 *
 * Tipos suportados (campo `type`):
 *  - meeting_reminder: lembretes de reuniões dentro da janela
 *    `reminder_minutes_before`. Quando chamado sem `meeting_id`, faz varredura
 *    em todos os tenants (uso pelo pg_cron).
 *  - task_expiring: tarefas próximas do prazo (extensível).
 *
 * Disparado por:
 *  - pg_cron (1min) → POST { type: 'meeting_reminder' }
 *  - Hooks frontend → invoke('system-bot-notify', { type, ... })
 *
 * Segurança: aceita SERVICE_ROLE Bearer (cron) ou JWT autenticado de admin.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://t3.empirebusiness.com.br",
  "https://gt3.empirebusiness.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
];

function corsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

interface MeetingDue {
  id: string;
  tenant_id: string;
  title: string;
  next_occurrence_at: string;
  reminder_minutes_before: number;
  livekit_room_name: string | null;
  participants: any;
  area_id: string | null;
}

async function dispatchMeetingReminders(svc: ReturnType<typeof createClient>) {
  // Seleciona meetings cuja próxima ocorrência cai dentro da janela
  // [now, now + reminder_minutes_before * 1 min] e que ainda não foram avisados.
  const { data: due, error } = await svc.rpc("meetings_due_for_reminder").select() as
    | { data: MeetingDue[]; error: any }
    | { data: null; error: any };

  // Fallback se a RPC não existir: query direta
  let meetings: MeetingDue[] = [];
  if (error || !due) {
    const { data: directData, error: directErr } = await svc
      .from("meetings")
      .select(
        "id, tenant_id, title, next_occurrence_at, reminder_minutes_before, livekit_room_name, participants, area_id",
      )
      .not("next_occurrence_at", "is", null)
      .or("last_reminder_sent_at.is.null,last_reminder_sent_at.lt.next_occurrence_at")
      .lte(
        "next_occurrence_at",
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      )
      .gte("next_occurrence_at", new Date().toISOString());
    if (directErr) throw directErr;
    meetings = (directData || []).filter((m: any) => {
      const eta = new Date(m.next_occurrence_at).getTime() - Date.now();
      return eta <= m.reminder_minutes_before * 60 * 1000 && eta > -60 * 1000;
    }) as MeetingDue[];
  } else {
    meetings = due;
  }

  let sent = 0;
  for (const m of meetings) {
    // Garante bot do tenant
    const { data: botId } = await svc.rpc("ensure_system_bot", {
      p_tenant_id: m.tenant_id,
    });
    if (!botId) continue;

    // Lista user_ids dos participantes
    const userIds: string[] = Array.isArray(m.participants)
      ? (m.participants as any[])
          .map((p) => p?.user_id)
          .filter(Boolean)
      : [];

    if (userIds.length === 0) continue;

    const minutesUntil = Math.max(
      1,
      Math.round(
        (new Date(m.next_occurrence_at).getTime() - Date.now()) / 60000,
      ),
    );
    const meetUrl =
      m.livekit_room_name ? `/meet/${m.livekit_room_name}` : `/reunioes`;
    const body = `🔔 A reunião **${m.title}** começa em ${minutesUntil} minuto(s). [Entrar](${meetUrl})`;

    for (const uid of userIds) {
      // 1) Notificação in-app
      await svc.from("notifications").insert({
        tenant_id: m.tenant_id,
        user_id: uid,
        type: "meeting_reminder",
        title: `Reunião em ${minutesUntil} min`,
        body: m.title,
        link: meetUrl,
        source: "system-bot",
        metadata: { meeting_id: m.id },
      });

      // 2) DM do bot via chat
      const { data: conv } = await svc.rpc("ensure_dm_conversation", {
        p_tenant_id: m.tenant_id,
        p_user_a: botId,
        p_user_b: uid,
      });
      if (conv) {
        // Resolve employee_id do bot (chat_messages usa employee_id)
        const { data: botEmp } = await svc
          .from("employees")
          .select("id")
          .eq("tenant_id", m.tenant_id)
          .eq("user_id", botId as string)
          .maybeSingle();
        if (botEmp?.id) {
          await svc.from("chat_messages").insert({
            conversation_id: conv,
            employee_id: botEmp.id,
            content: body,
            type: "text",
          });
        }
      }
      sent++;
    }

    // 3) Mensagem no canal da área (se houver)
    if (m.area_id) {
      const { data: areaChannel } = await svc
        .from("chat_channels")
        .select("id")
        .eq("tenant_id", m.tenant_id)
        .eq("area_id", m.area_id)
        .eq("is_dm", false)
        .maybeSingle();
      if (areaChannel?.id) {
        await svc.from("chat_messages").insert({
          channel_id: areaChannel.id,
          tenant_id: m.tenant_id,
          author_id: botId,
          content: body,
          attachments: [
            {
              type: "meeting_invite",
              meeting_id: m.id,
              room_name: m.livekit_room_name,
              title: m.title,
              host_name: "Bot do sistema",
              scheduled_at: m.next_occurrence_at,
            },
          ],
        });
      }
    }

    // Marca enviada
    await svc
      .from("meetings")
      .update({ last_reminder_sent_at: new Date().toISOString() })
      .eq("id", m.id);
  }

  return sent;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const headers = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers });

  try {
    const auth = req.headers.get("Authorization") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isCron = auth === `Bearer ${serviceRole}`;

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole);

    if (!isCron) {
      // Em invocações de usuário, exigir admin
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
      const {
        data: { user },
      } = await userClient.auth.getUser();
      if (!user)
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers,
        });
    }

    const payload = await req.json().catch(() => ({}));
    const type = payload.type || "meeting_reminder";

    if (type === "meeting_reminder") {
      const sent = await dispatchMeetingReminders(svc);
      return new Response(JSON.stringify({ ok: true, sent }), { headers });
    }

    return new Response(JSON.stringify({ error: "unknown type" }), {
      status: 400,
      headers,
    });
  } catch (err) {
    console.error("[system-bot-notify]", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "internal error" }),
      { status: 500, headers },
    );
  }
});
