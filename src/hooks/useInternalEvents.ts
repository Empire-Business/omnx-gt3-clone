import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { usePermissions } from "./usePermissions";
import { announceInternalEvent } from "@/lib/announce-event";

/**
 * Eventos Internos — camada de dados.
 *
 * Tabelas: `internal_events`, `internal_event_targets`
 * (migration `20260831190000_eventos_internos.sql`).
 *
 * ⚠️ `src/integrations/supabase/types.ts` é gerado e ainda NÃO conhece essas
 * tabelas. Em vez de espalhar `as any` pelo arquivo (proibido no CLAUDE.md),
 * usamos UM ponto de escape: um client sem generics de schema. O resultado é
 * tipado pelas interfaces abaixo, que refletem o schema real do banco.
 * Mesmo recurso já usado em `useMeetings.ts` para `meeting_ai_jobs`.
 */
const db = supabase as unknown as SupabaseClient;

/* ════════════════════════════════════════════
   TIPOS
   ════════════════════════════════════════════ */

/** `company` = empresa toda · `areas` = setores · `custom` = pessoas escolhidas */
export type InternalEventScope = "company" | "areas" | "custom";
export type InternalEventStatus = "draft" | "published" | "cancelled" | "done";

export type InternalEventFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox";

/** Uma pergunta da ficha de inscrição. */
export interface InternalEventFormField {
  id: string;
  label: string;
  type: InternalEventFieldType;
  required?: boolean;
  /** Somente para `type: "select"` */
  options?: string[];
  placeholder?: string;
}

/** Conteúdo de `internal_events.registration_form`. */
export interface InternalEventForm {
  fields: InternalEventFormField[];
}

export interface InternalEventTarget {
  id: string;
  tenant_id: string;
  event_id: string;
  /** referencia `company_areas.id` — NÃO existe tabela `areas` no banco */
  area_id: string | null;
  employee_id: string | null;
  created_at: string;
}

/** Reunião vinculada (aba de reuniões internas). */
export interface InternalEventMeeting {
  id: string;
  title: string;
  status: string;
  meeting_mode: string | null;
  livekit_room_name: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  /**
   * Quem criou a reuniao. E o que decide o papel na entrada da sala:
   * `livekit-token` so REBAIXA papel, nunca promove, entao pedir `guest`
   * entrega `guest` ate para o criador — e sem host o pipeline de
   * transcricao nao roda (a sala grava video e nao transcreve nada).
   * Sem este campo no embed, `EventMeetingPanel` teria de descobrir o
   * criador pela lista de reunioes, que nem sempre esta carregada.
   */
  created_by: string | null;
}

export interface InternalEvent {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  starts_at: string;
  ends_at: string | null;
  scope: InternalEventScope;
  meeting_id: string | null;
  status: InternalEventStatus;
  registration_required: boolean;
  registration_form: InternalEventForm | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Embed de `internal_event_targets` */
  targets?: InternalEventTarget[];
  /** Embed de `meetings` */
  meeting?: InternalEventMeeting | null;
}

export interface InternalEventFilters {
  /** ISO — `starts_at >= from` */
  from?: string | null;
  /** ISO — `starts_at <= to` */
  to?: string | null;
  status?: InternalEventStatus | InternalEventStatus[] | null;
  scope?: InternalEventScope | null;
}

export interface InternalEventInput {
  title: string;
  description?: string | null;
  cover_url?: string | null;
  starts_at: string;
  ends_at?: string | null;
  scope: InternalEventScope;
  meeting_id?: string | null;
  status?: InternalEventStatus;
  registration_required?: boolean;
  registration_form?: InternalEventForm | null;
  /** usado quando `scope === "areas"` — ids de `company_areas` */
  area_ids?: string[];
  /** usado quando `scope === "custom"` — ids de `employees` */
  employee_ids?: string[];
}

export type InternalEventUpdateInput = Partial<InternalEventInput>;

/* ════════════════════════════════════════════
   SELECT compartilhado
   ════════════════════════════════════════════ */

const EVENT_SELECT = `
  *,
  targets:internal_event_targets(id, tenant_id, event_id, area_id, employee_id, created_at),
  meeting:meetings(id, title, status, meeting_mode, livekit_room_name, scheduled_date, scheduled_time, created_by)
`;

/**
 * Teto explícito da listagem.
 *
 * Sem `.limit()` a consulta fica sujeita ao teto padrão do PostgREST
 * (`db-max-rows`, tipicamente 1000) — que é aplicado em SILÊNCIO: a resposta
 * vem truncada sem erro nenhum, e o usuário simplesmente não vê os eventos que
 * ficaram de fora. Pior: a tela de detalhe hoje procura o evento DENTRO dessa
 * lista, então um evento cortado pelo teto vira um "evento não encontrado".
 *
 * O limite explícito não resolve o problema de fundo — apenas o torna
 * observável (avisamos no console quando o teto é atingido).
 *
 * TODO (outra frente): a tela de detalhe deve migrar para `useInternalEvent(id)`
 * (já implementado no fim deste arquivo e ainda não consumido), e a listagem
 * deve ganhar paginação real por `.range()` + filtro de período no servidor.
 */
const EVENTS_HARD_LIMIT = 1000;

/* ════════════════════════════════════════════
   ÁREAS DO USUÁRIO LOGADO
   ════════════════════════════════════════════ */

/**
 * Ids das áreas (`company_areas`) do colaborador logado.
 *
 * O banco NÃO tem `employees.area_id`: o vínculo é
 * `employee_positions → positions → COALESCE(subareas.area_id, positions.area_id)`
 * — mesmo caminho usado pela policy `meetings_select`.
 *
 * `employee_positions` não possui coluna `tenant_id` (confirmado no banco de
 * produção), por isso não há `.eq("tenant_id", ...)` aqui — o filtro por
 * `employee_id` já é intrinsecamente do tenant, e o RLS cobre o resto.
 */
export function useMyAreaIds() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const { myEmployeeId } = usePermissions();

  return useQuery({
    queryKey: ["my-area-ids", tenantId, myEmployeeId],
    enabled: !!tenantId && !!myEmployeeId,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await db
        .from("employee_positions")
        .select("position:positions(area_id, subarea:subareas(area_id))")
        .eq("employee_id", myEmployeeId as string);
      if (error) throw error;

      const ids = new Set<string>();
      for (const row of (data ?? []) as Array<{
        position: { area_id: string | null; subarea: { area_id: string | null } | null } | null;
      }>) {
        const areaId = row.position?.subarea?.area_id ?? row.position?.area_id ?? null;
        if (areaId) ids.add(areaId);
      }
      return Array.from(ids);
    },
  });
}

/* ════════════════════════════════════════════
   "ESTE EVENTO É PARA MIM?"
   ════════════════════════════════════════════ */

export interface EventAudienceContext {
  myEmployeeId: string | null;
  myAreaIds: string[];
  myUserId: string | null;
}

/**
 * Regra de audiência — a mesma que a policy `internal_events_select` aplica
 * no banco, reproduzida no client para poder derivar `meusEventos` sem uma
 * segunda ida ao servidor.
 */
export function isEventForMe(event: InternalEvent, ctx: EventAudienceContext): boolean {
  if (ctx.myUserId && event.created_by === ctx.myUserId) return true;
  if (event.scope === "company") return true;

  const targets = event.targets ?? [];
  if (ctx.myEmployeeId && targets.some((t) => t.employee_id === ctx.myEmployeeId)) return true;
  if (targets.some((t) => t.area_id && ctx.myAreaIds.includes(t.area_id))) return true;

  return false;
}

/* ════════════════════════════════════════════
   LISTA + MUTATIONS
   ════════════════════════════════════════════ */

/**
 * Pedido de divulgação: o evento e os canais de chat escolhidos à mão.
 * `string` puro continua aceito (equivale a "sem canais extras").
 */
export interface EventAnnounceRequest {
  id: string;
  /** Canais ALÉM do espelhamento automático do Feed (geral / canais de área). */
  channelIds?: string[];
}

function normalizeAnnounceRequest(
  request: EventAnnounceRequest | string
): { id: string; channelIds: string[] } {
  if (typeof request === "string") return { id: request, channelIds: [] };
  return { id: request.id, channelIds: request.channelIds ?? [] };
}

/** Frase única de resultado, usada nos toasts de publicar e de divulgar. */
function describeAnnouncement(result: {
  notified: number;
  channelsPosted: number;
}): string {
  const partes = [
    "aviso no Feed e no canal geral",
    result.channelsPosted > 0
      ? `mensagem em mais ${result.channelsPosted} canal${
          result.channelsPosted === 1 ? "" : "is"
        }`
      : null,
    `${result.notified} pessoa${result.notified === 1 ? "" : "s"} notificada${
      result.notified === 1 ? "" : "s"
    }`,
  ].filter(Boolean);
  return partes.join(", ");
}

export function useInternalEvents(filters?: InternalEventFilters) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const tenantId = profile?.tenant_id;
  const userId = profile?.user_id ?? null;
  const { myEmployeeId, isAdmin } = usePermissions();
  const { data: myAreaIds } = useMyAreaIds();

  const listKey = ["internal-events", tenantId] as const;

  const eventsQuery = useQuery({
    queryKey: ["internal-events", tenantId, filters ?? null],
    enabled: !!tenantId,
    queryFn: async (): Promise<InternalEvent[]> => {
      let query = db
        .from("internal_events")
        .select(EVENT_SELECT)
        // RLS é a 1ª linha de defesa; o filtro explícito é a 2ª (CLAUDE.md).
        .eq("tenant_id", tenantId as string)
        .order("starts_at", { ascending: true })
        .limit(EVENTS_HARD_LIMIT);

      if (filters?.from) query = query.gte("starts_at", filters.from);
      if (filters?.to) query = query.lte("starts_at", filters.to);
      if (filters?.scope) query = query.eq("scope", filters.scope);
      if (filters?.status) {
        query = Array.isArray(filters.status)
          ? query.in("status", filters.status)
          : query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as InternalEvent[];
      if (rows.length >= EVENTS_HARD_LIMIT) {
        // Chegou no teto: quase certamente existem eventos que NÃO vieram.
        // Enquanto não houver paginação real, ao menos deixamos rastro.
        console.warn(
          `[useInternalEvents] A listagem atingiu o limite de ${EVENTS_HARD_LIMIT} eventos — ` +
            `pode haver eventos não carregados. É preciso paginar a consulta (.range()) ` +
            `e migrar a tela de detalhe para useInternalEvent(id).`
        );
      }
      return rows;
    },
  });

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  /**
   * Eventos direcionados ao usuário logado. Admin continua vendo tudo em
   * `events`; `meusEventos` é sempre a audiência real, inclusive para admin.
   */
  const meusEventos = useMemo(() => {
    const ctx: EventAudienceContext = {
      myEmployeeId,
      myAreaIds: myAreaIds ?? [],
      myUserId: userId,
    };
    return events.filter((e) => isEventForMe(e, ctx));
  }, [events, myEmployeeId, myAreaIds, userId]);

  const invalidate = (eventId?: string) => {
    qc.invalidateQueries({ queryKey: listKey });
    if (eventId) qc.invalidateQueries({ queryKey: ["internal-event", tenantId, eventId] });
  };

  /**
   * Reescreve os alvos do evento (replace-all) conforme o escopo.
   *
   * ⚠️ Não existe transação aqui: o DELETE e o INSERT são duas viagens ao
   * PostgREST, cada uma com seu próprio commit. Se o INSERT falhar depois do
   * DELETE, o evento fica SEM público nenhum — e, com `scope != 'company'`,
   * um evento sem alvos é invisível para todo mundo que não seja admin ou
   * criador. Como não podemos contar com uma RPC transacional, reduzimos a
   * janela de dano em três passos:
   *
   *   1. montar e validar as linhas ANTES de apagar (erro de payload nunca
   *      chega a destruir o público existente);
   *   2. ler os alvos atuais antes do DELETE, para poder restaurá-los;
   *   3. se o INSERT falhar, tentar restaurar o público anterior — e, se nem
   *      isso der certo, dizer ao usuário, com todas as letras, que o evento
   *      ficou sem público e precisa ser redefinido.
   *
   * A solução definitiva é uma RPC `SECURITY DEFINER` que faça delete+insert
   * numa única transação.
   */
  const syncTargets = async (
    eventId: string,
    scope: InternalEventScope,
    areaIds?: string[],
    employeeIds?: string[]
  ) => {
    if (!tenantId) throw new Error("Sessão sem tenant — recarregue a página");

    /* 1) Monta e valida as linhas ANTES de tocar no banco. */
    const rows =
      scope === "company"
        ? []
        : [
            ...(scope === "areas" ? (areaIds ?? []) : []).map((areaId) => ({
              tenant_id: tenantId,
              event_id: eventId,
              area_id: areaId,
              employee_id: null as string | null,
            })),
            ...(scope === "custom" ? (employeeIds ?? []) : []).map((employeeId) => ({
              tenant_id: tenantId,
              event_id: eventId,
              area_id: null as string | null,
              employee_id: employeeId,
            })),
          ];

    if (rows.some((r) => !r.area_id && !r.employee_id)) {
      throw new Error(
        "Público inválido: há um setor ou colaborador sem identificador. " +
          "Refaça a seleção do público — nada foi alterado."
      );
    }

    /* 2) Guarda o público atual para eventual restauração. */
    const { data: previous, error: readError } = await db
      .from("internal_event_targets")
      .select("area_id, employee_id")
      .eq("tenant_id", tenantId)
      .eq("event_id", eventId);
    if (readError) throw readError;

    const previousRows = (
      (previous ?? []) as Array<{ area_id: string | null; employee_id: string | null }>
    ).map((t) => ({
      tenant_id: tenantId,
      event_id: eventId,
      area_id: t.area_id,
      employee_id: t.employee_id,
    }));

    /* 3) Apaga. `.select()` é obrigatório: sem ele o PostgREST devolve zero
       linhas SEM erro quando o RLS bloqueia, e reportaríamos sucesso falso. */
    const { data: deleted, error: delError } = await db
      .from("internal_event_targets")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("event_id", eventId)
      .select();
    if (delError) throw delError;

    if (previousRows.length > 0 && (deleted ?? []).length === 0) {
      throw new Error(
        "O público do evento não pôde ser alterado: você não tem permissão para " +
          "modificar os destinatários deste evento. Nada foi alterado."
      );
    }

    if (rows.length === 0) return;

    const { error: insertError } = await db.from("internal_event_targets").insert(rows);
    if (!insertError) return;

    // O novo público falhou. Tenta devolver o evento ao estado anterior.
    if (previousRows.length === 0) {
      throw new Error(
        `Não foi possível gravar o público do evento (${insertError.message}). ` +
          "O evento continua sem público definido."
      );
    }

    const { error: restoreError } = await db
      .from("internal_event_targets")
      .insert(previousRows);
    if (restoreError) {
      throw new Error(
        `Não foi possível gravar o novo público (${insertError.message}) e a tentativa de ` +
          `restaurar o público anterior também falhou (${restoreError.message}). ` +
          "ATENÇÃO: o evento ficou SEM NENHUM público e, por isso, invisível para os " +
          "colaboradores. Edite o evento e redefina o público imediatamente."
      );
    }

    throw new Error(
      `Não foi possível gravar o novo público (${insertError.message}). ` +
        "O público anterior foi restaurado — nada mudou."
    );
  };

  const createEvent = useMutation({
    mutationFn: async (input: InternalEventInput): Promise<InternalEvent> => {
      if (!tenantId || !userId) throw new Error("Sessão sem tenant — recarregue a página");

      const { data, error } = await db
        .from("internal_events")
        .insert({
          tenant_id: tenantId,
          created_by: userId,
          title: input.title,
          description: input.description ?? null,
          cover_url: input.cover_url ?? null,
          starts_at: input.starts_at,
          ends_at: input.ends_at ?? null,
          scope: input.scope,
          meeting_id: input.meeting_id ?? null,
          status: input.status ?? "draft",
          registration_required: input.registration_required ?? false,
          registration_form: input.registration_form ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      const created = data as InternalEvent;

      /**
       * O INSERT acima já está commitado. Se a gravação do público falhar,
       * sobra um evento com `scope != 'company'` e ZERO alvos — invisível para
       * todos menos admin e criador — enquanto o usuário vê apenas um toast de
       * erro e cria outro evento por cima. Sem RPC transacional disponível, a
       * saída é COMPENSAÇÃO: desfazer o insert antes de propagar o erro.
       *
       * Atenção: a policy de DELETE de `internal_events` exige `is_admin()`,
       * então a compensação pode falhar justamente para um manager. Nesse caso
       * a mensagem precisa entregar o id do evento órfão para limpeza manual.
       */
      try {
        await syncTargets(created.id, input.scope, input.area_ids, input.employee_ids);
      } catch (targetsError) {
        const motivo =
          targetsError instanceof Error ? targetsError.message : String(targetsError);

        const { data: removed, error: rollbackError } = await db
          .from("internal_events")
          .delete()
          .eq("id", created.id)
          .eq("tenant_id", tenantId)
          .select();

        if (rollbackError || (removed ?? []).length === 0) {
          throw new Error(
            `Não foi possível definir o público do evento (${motivo}). ` +
              "Além disso, o evento recém-criado NÃO pôde ser removido automaticamente " +
              "(a exclusão é restrita a administradores), então ele pode ter ficado salvo " +
              `e invisível na listagem — id ${created.id}. ` +
              "Peça a um administrador para excluí-lo antes de criar o evento novamente."
          );
        }

        throw new Error(
          `Não foi possível definir o público do evento (${motivo}). ` +
            "Nada foi salvo — ajuste o público e tente novamente."
        );
      }

      return created;
    },
    onSuccess: (created) => {
      invalidate(created.id);
      toast.success("Evento criado com sucesso");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao criar evento");
    },
  });

  const updateEvent = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: InternalEventUpdateInput;
    }): Promise<InternalEvent> => {
      if (!tenantId) throw new Error("Sessão sem tenant — recarregue a página");

      const { area_ids, employee_ids, ...fields } = updates;

      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) payload[key] = value;
      }

      let updated: InternalEvent | null = null;
      if (Object.keys(payload).length > 0) {
        const { data, error } = await db
          .from("internal_events")
          .update(payload)
          .eq("id", id)
          .eq("tenant_id", tenantId)
          .select()
          .single();
        if (error) throw error;
        updated = data as InternalEvent;
      }

      const mustSyncTargets =
        area_ids !== undefined || employee_ids !== undefined || updates.scope !== undefined;

      if (mustSyncTargets) {
        /**
         * Resolver o escopo com `?? "company"` era perigoso: a lista `events`
         * é truncada/filtrada, e um evento que não estivesse nela fazia o
         * `syncTargets` rodar como "empresa toda" — apagando TODOS os alvos de
         * um evento que na verdade era de setores ou de pessoas escolhidas.
         * Nunca assumimos `company`: se o escopo não veio no update e o evento
         * não está na lista carregada, buscamos o valor real no banco.
         */
        let scope = updates.scope ?? events.find((e) => e.id === id)?.scope;

        if (!scope) {
          const { data: scopeRow, error: scopeError } = await db
            .from("internal_events")
            .select("scope")
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .maybeSingle();
          if (scopeError) throw scopeError;
          if (!scopeRow) {
            throw new Error(
              "Não foi possível identificar o público atual do evento: ele não foi " +
                "encontrado ou você não tem permissão para acessá-lo. " +
                "O público NÃO foi alterado."
            );
          }
          scope = (scopeRow as { scope: InternalEventScope }).scope;
        }

        await syncTargets(id, scope, area_ids, employee_ids);
      }

      if (updated) return updated;

      const { data, error } = await db
        .from("internal_events")
        .select(EVENT_SELECT)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      if (error) throw error;
      return data as InternalEvent;
    },
    onSuccess: (updated) => {
      invalidate(updated.id);
      toast.success("Evento atualizado");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao atualizar evento");
    },
  });

  const setStatus = async (id: string, status: InternalEventStatus) => {
    if (!tenantId) throw new Error("Sessão sem tenant — recarregue a página");
    const { data, error } = await db
      .from("internal_events")
      .update({ status })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();
    if (error) throw error;
    return data as InternalEvent;
  };

  /**
   * Publicar = tornar visível E divulgar.
   *
   * Só mudar o status deixava o evento invisível na prática: não ia ao Feed,
   * não ia ao canal geral do chat e ninguém recebia notificação — as pessoas
   * só o veriam se entrassem na aba Eventos por conta própria. A divulgação
   * (Feed → espelhado no chat pelo trigger + notificação/push) acontece aqui.
   *
   * A falha da divulgação NÃO desfaz a publicação (o evento já está público),
   * mas é reportada como aviso — nunca como sucesso mudo.
   */
  const publishEvent = useMutation({
    mutationFn: async (request: EventAnnounceRequest | string) => {
      const { id, channelIds } = normalizeAnnounceRequest(request);
      const updated = await setStatus(id, "published");
      const announcement = await announceInternalEvent({
        tenantId: tenantId as string,
        event: {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          starts_at: updated.starts_at,
          ends_at: updated.ends_at,
          scope: updated.scope,
          registration_required: updated.registration_required,
          // `setStatus` devolve a linha sem o embed. Quando a lista em memória
          // tem os alvos, aproveitamos; senão `announceInternalEvent` os busca.
          targets: events.find((e) => e.id === id)?.targets,
        },
        authorEmployeeId: myEmployeeId,
        authorUserId: userId,
        extraChannelIds: channelIds,
      });
      return { updated, announcement };
    },
    onSuccess: ({ updated, announcement }) => {
      invalidate(updated.id);
      // O Feed espelha no chat por trigger; a contagem de avisos é o sinal de
      // que as pessoas foram alcançadas de fato.
      qc.invalidateQueries({ queryKey: ["feed_posts", tenantId] });

      if (announcement.warning) {
        toast.warning(
          `Evento publicado, mas a divulgação ficou incompleta: ${announcement.warning}.`
        );
        return;
      }
      toast.success(
        `Evento publicado — ${describeAnnouncement(announcement)}.`
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao publicar evento");
    },
  });

  /**
   * Divulgar de novo um evento JÁ publicado.
   *
   * Existe porque "Publicar" só aparece em rascunho: eventos publicados antes
   * da v8.47.0 (quando publicar não avisava ninguém) ficariam sem divulgação
   * para sempre. Também serve para reforçar o aviso na véspera.
   */
  const announceEvent = useMutation({
    mutationFn: async (request: EventAnnounceRequest | string) => {
      const { id, channelIds } = normalizeAnnounceRequest(request);
      if (!tenantId) throw new Error("Sessão sem tenant — recarregue a página");
      const event = events.find((e) => e.id === id);
      if (!event) throw new Error("Evento não encontrado na lista — atualize a página");
      return announceInternalEvent({
        tenantId,
        event: {
          id: event.id,
          title: event.title,
          description: event.description,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          scope: event.scope,
          registration_required: event.registration_required,
          targets: event.targets,
        },
        authorEmployeeId: myEmployeeId,
        authorUserId: userId,
        extraChannelIds: channelIds,
      });
    },
    onSuccess: (announcement) => {
      qc.invalidateQueries({ queryKey: ["feed_posts", tenantId] });
      if (announcement.warning) {
        toast.warning(`Divulgação incompleta: ${announcement.warning}.`);
        return;
      }
      toast.success(`Evento divulgado — ${describeAnnouncement(announcement)}.`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao divulgar o evento");
    },
  });

  const cancelEvent = useMutation({
    mutationFn: (id: string) => setStatus(id, "cancelled"),
    onSuccess: (updated) => {
      invalidate(updated.id);
      toast.success("Evento cancelado");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao cancelar evento");
    },
  });

  const concludeEvent = useMutation({
    mutationFn: (id: string) => setStatus(id, "done"),
    onSuccess: (updated) => {
      invalidate(updated.id);
      toast.success("Evento concluído");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao concluir evento");
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Sessão sem tenant — recarregue a página");

      // `.select()` é obrigatório: sem ele o PostgREST responde 204 sem erro
      // mesmo quando o RLS não deixou apagar nada (a policy de DELETE exige
      // `is_admin()`), e a interface exibia "Evento removido" com o evento
      // ainda lá — o sucesso falso proibido pela §7 do CLAUDE.md.
      const { data: removed, error } = await db
        .from("internal_events")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select();
      if (error) throw error;

      if ((removed ?? []).length === 0) {
        throw new Error(
          "Nenhum evento foi removido: a exclusão é restrita a administradores, " +
            "ou o evento já não existe mais. Atualize a página para conferir."
        );
      }
      return id;
    },
    onSuccess: (id) => {
      invalidate(id);
      qc.invalidateQueries({ queryKey: ["event-registrations", tenantId, id] });
      // O evento sumiu: as contagens da listagem e as minhas inscrições também
      // mudaram e precisam ser refeitas (queryKeys completas e restritas).
      qc.invalidateQueries({ queryKey: ["event-registration-counts", tenantId] });
      qc.invalidateQueries({ queryKey: ["my-event-registrations", tenantId, myEmployeeId] });
      toast.success("Evento removido");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao remover evento");
    },
  });

  return {
    /** Tudo que o RLS deixa o usuário ver (admin vê o tenant inteiro). */
    events,
    /** Só os eventos direcionados a mim (empresa toda, minha área ou eu). */
    meusEventos,
    myAreaIds: myAreaIds ?? [],
    isAdmin,
    isLoading: eventsQuery.isLoading,
    isError: eventsQuery.isError,
    error: eventsQuery.error as Error | null,
    refetch: eventsQuery.refetch,

    createEvent,
    updateEvent,
    publishEvent,
    announceEvent,
    cancelEvent,
    concludeEvent,
    deleteEvent,
  };
}

/* ════════════════════════════════════════════
   DETALHE
   ════════════════════════════════════════════ */

export function useInternalEvent(id: string | undefined) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["internal-event", tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<InternalEvent | null> => {
      const { data, error } = await db
        .from("internal_events")
        .select(EVENT_SELECT)
        .eq("id", id as string)
        .eq("tenant_id", tenantId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as InternalEvent | null) ?? null;
    },
  });
}
