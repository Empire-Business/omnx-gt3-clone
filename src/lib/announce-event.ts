/**
 * Divulgação de um evento interno no momento em que ele é publicado.
 *
 * Antes disso, "Publicar" apenas trocava `internal_events.status` para
 * `published`: nada aparecia no Feed, nada no chat e ninguém era notificado —
 * o evento só existia para quem entrasse na aba Eventos por conta própria.
 *
 * O que acontece agora, nesta ordem:
 *   1. Cria um post no Feed em nome de quem publicou. O trigger
 *      `trg_feed_post_broadcast_to_channels` (migration 20260601150000) espelha
 *      esse post no CANAL GERAL do chat quando a visibilidade é `all`, e nos
 *      canais das áreas quando é `specific` com alvos de área — ou seja, o
 *      "colocar no canal geral" sai de graça e sem mensagem duplicada.
 *   2. Cria uma notificação in-app por pessoa do público. O trigger de push
 *      (migration 20260601170000) transforma cada linha de `notifications` em
 *      Web Push.
 *
 * Nada aqui é silencioso: cada etapa devolve o que falhou, e quem chama avisa
 * o usuário. Um evento publicado sem divulgação é um problema que a pessoa
 * precisa saber para reenviar — jamais um "sucesso" mudo (§7 do CLAUDE.md).
 */
import { supabase } from "@/integrations/supabase/client";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { markdownToPlainText } from "@/lib/markdown-text";
import { absoluteAppUrl } from "@/lib/google-calendar";
import { resolveEventAudience, type EventAudienceScope } from "@/lib/event-audience";

/** Teto de linhas de notificação por publicação (uma empresa grande de uma vez). */
const NOTIFICATION_CAP = 500;

/** Quanto da descrição entra no post do Feed. */
const EXCERPT_LENGTH = 600;

export interface AnnounceEventInput {
  tenantId: string;
  event: {
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string | null;
    scope: EventAudienceScope;
    registration_required: boolean;
    targets?: { area_id: string | null; employee_id: string | null }[];
  };
  /** Colaborador que está publicando (autor do post no Feed). */
  authorEmployeeId: string | null;
  /** Usuário que está publicando — não recebe notificação de si mesmo. */
  authorUserId: string | null;
  /**
   * Canais de chat que devem receber a mensagem ALÉM do espelhamento
   * automático do Feed (o geral, quando a visibilidade é `all`, e os canais
   * das áreas alvo). Serve para o caso "o evento é da empresa toda, mas o time
   * de Entrega precisa ver no canal dele".
   */
  extraChannelIds?: string[];
}

export interface AnnounceEventResult {
  feedPosted: boolean;
  notified: number;
  /** Quantos canais de chat receberam a mensagem direta (fora o espelhamento). */
  channelsPosted: number;
  /** Preenchido quando alguma etapa não pôde ser concluída. */
  warning?: string;
}

function formatWhen(startsAt: string, endsAt: string | null): string {
  const start = parseISO(startsAt);
  if (!isValid(start)) return "";
  const startLabel = format(start, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR });
  const end = endsAt ? parseISO(endsAt) : null;
  if (end && isValid(end)) {
    const sameDay = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
    return sameDay
      ? `${startLabel} às ${format(end, "HH:mm")}`
      : `${startLabel} até ${format(end, "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}`;
  }
  return startLabel;
}

/** Texto do post no Feed. O Feed exibe texto puro — nada de Markdown aqui. */
function buildFeedContent(event: AnnounceEventInput["event"]): string {
  const when = formatWhen(event.starts_at, event.ends_at);
  const description = markdownToPlainText(event.description);
  const excerpt =
    description.length > EXCERPT_LENGTH
      ? `${description.slice(0, EXCERPT_LENGTH).trimEnd()}…`
      : description;

  return [
    `🎉 Novo evento: ${event.title}`,
    when ? `🗓️ ${when}` : null,
    event.registration_required ? "📋 Este evento pede inscrição." : null,
    excerpt || null,
    // URL absoluta: no Feed e no chat o link só vira clicável com o domínio.
    `👉 Detalhes e inscrição: ${absoluteAppUrl(`/eventos?evento=${event.id}`)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Texto da mensagem de chat. Diferente do Feed, o chat renderiza Markdown. */
function buildChatContent(event: AnnounceEventInput["event"], url: string): string {
  const when = formatWhen(event.starts_at, event.ends_at);
  const description = markdownToPlainText(event.description);
  const excerpt =
    description.length > 400 ? `${description.slice(0, 400).trimEnd()}…` : description;

  return [
    `🎉 **Novo evento: ${event.title}**`,
    when ? `🗓️ ${when}` : null,
    event.registration_required ? "📋 Este evento pede inscrição." : null,
    excerpt || null,
    `👉 ${url}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function announceInternalEvent(
  input: AnnounceEventInput
): Promise<AnnounceEventResult> {
  const { tenantId, event, authorEmployeeId, authorUserId } = input;
  const link = `/eventos?evento=${event.id}`;
  const warnings: string[] = [];

  // Os alvos podem não ter vindo no objeto (a linha devolvida pelo UPDATE não
  // traz o embed). Buscar aqui evita publicar um evento de setor avisando a
  // empresa inteira — ou, pior, ninguém.
  let targets = event.targets;
  if (!targets && event.scope !== "company") {
    const { data, error } = await supabase
      .from("internal_event_targets" as never)
      .select("area_id, employee_id")
      .eq("event_id", event.id)
      .eq("tenant_id", tenantId);
    if (error) {
      return {
        feedPosted: false,
        notified: 0,
        channelsPosted: 0,
        warning: `não deu para ler o público do evento (${error.message})`,
      };
    }
    targets = (data ?? []) as { area_id: string | null; employee_id: string | null }[];
  }

  const areaIds = (targets ?? [])
    .map((t) => t.area_id)
    .filter((id): id is string => !!id);
  const employeeIds = (targets ?? [])
    .map((t) => t.employee_id)
    .filter((id): id is string => !!id);

  // ── 1. Post no Feed (espelhado no canal geral / de área pelo trigger) ──
  let feedPosted = false;
  if (!authorEmployeeId) {
    warnings.push(
      "seu usuário não está vinculado a um colaborador, então o aviso não foi ao Feed"
    );
  } else {
    const visibilityTargets =
      event.scope === "areas"
        ? areaIds.map((id) => ({ type: "area" as const, id }))
        : event.scope === "custom"
          ? employeeIds.map((id) => ({ type: "employee" as const, id }))
          : [];

    const { error: feedError } = await supabase.from("feed_posts" as never).insert({
      tenant_id: tenantId,
      employee_id: authorEmployeeId,
      content: buildFeedContent(event),
      visibility_type: event.scope === "company" ? "all" : "specific",
      visibility_targets: visibilityTargets,
      tags: ["evento"],
      attachments: [],
    } as never);
    if (feedError) {
      warnings.push(`o aviso no Feed falhou (${feedError.message})`);
    } else {
      feedPosted = true;
    }
  }

  // ── 2. Notificação in-app (vira Web Push pelo trigger existente) ──
  let notified = 0;
  try {
    const audience = await resolveEventAudience({
      tenantId,
      scope: event.scope,
      areaIds,
      employeeIds,
    });

    const userIds = [
      ...new Set(
        audience
          .map((m) => m.user_id)
          .filter((id): id is string => !!id && id !== authorUserId)
      ),
    ];

    if (userIds.length === 0) {
      warnings.push("nenhuma pessoa do público tem conta de acesso para receber o aviso");
    } else {
      const capped = userIds.slice(0, NOTIFICATION_CAP);
      if (userIds.length > NOTIFICATION_CAP) {
        warnings.push(
          `o público tem ${userIds.length} pessoas — avisamos as ${NOTIFICATION_CAP} primeiras`
        );
      }

      const when = formatWhen(event.starts_at, event.ends_at);
      const rows = capped.map((userId) => ({
        tenant_id: tenantId,
        user_id: userId,
        type: "internal_event_published",
        title: `Novo evento: ${event.title}`,
        body: when || "Confira os detalhes na aba Eventos.",
        link,
        source_id: event.id,
      }));

      const { error: notifError } = await supabase
        .from("notifications")
        .insert(rows as never);
      if (notifError) {
        warnings.push(`as notificações falharam (${notifError.message})`);
      } else {
        notified = rows.length;
      }
    }
  } catch (err) {
    warnings.push(
      `não deu para resolver o público do evento (${(err as Error).message})`
    );
  }

  // ── 3. Canais de chat escolhidos à mão (além do espelhamento do Feed) ──
  let channelsPosted = 0;
  const extraChannelIds = [...new Set(input.extraChannelIds ?? [])];
  if (extraChannelIds.length > 0) {
    if (!authorUserId) {
      warnings.push("sem usuário identificado, as mensagens nos canais não foram enviadas");
    } else {
      const chatContent = buildChatContent(event, absoluteAppUrl(link));
      const rows = extraChannelIds.map((channelId) => ({
        channel_id: channelId,
        tenant_id: tenantId,
        author_id: authorUserId,
        content: chatContent,
        attachments: [
          {
            type: "link",
            name: `Evento: ${event.title}`,
            url: absoluteAppUrl(link),
          },
        ],
      }));

      const { data: inserted, error: chatError } = await supabase
        .from("chat_messages" as never)
        .insert(rows as never)
        .select("id");
      if (chatError) {
        warnings.push(`a mensagem nos canais falhou (${chatError.message})`);
      } else {
        channelsPosted = (inserted ?? []).length;
        // Push do chat, no mesmo caminho de uma mensagem normal.
        for (const row of (inserted ?? []) as { id: string }[]) {
          supabase.functions
            .invoke("send-chat-notification", { body: { message_id: row.id } })
            .catch(() => undefined);
        }
      }
    }
  }

  return {
    feedPosted,
    notified,
    channelsPosted,
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}
