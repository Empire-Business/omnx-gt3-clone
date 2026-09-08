import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { usePermissions } from "./usePermissions";

/**
 * Inscrições em Eventos Internos (ficha opcional por evento).
 *
 * Tabela: `internal_event_registrations`
 * (migration `20260831190000_eventos_internos.sql`).
 *
 * ⚠️ Mesmo motivo de `useInternalEvents.ts`: `types.ts` é gerado e ainda não
 * conhece a tabela. Um único ponto de escape sem generics de schema, em vez de
 * `as any` espalhado.
 */
const db = supabase as unknown as SupabaseClient;

/* ════════════════════════════════════════════
   TIPOS
   ════════════════════════════════════════════ */

export type EventRegistrationStatus = "registered" | "cancelled";

/** Respostas da ficha: `{ "<field_id>": valor }` */
export type EventRegistrationAnswers = Record<string, string | number | boolean | null>;

export interface EventRegistrationEmployee {
  id: string;
  user_id: string | null;
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface EventRegistration {
  id: string;
  tenant_id: string;
  event_id: string;
  employee_id: string;
  status: EventRegistrationStatus;
  answers: EventRegistrationAnswers | null;
  created_at: string;
  /** Embed de `employees` + `profiles` */
  employee?: EventRegistrationEmployee | null;
}

export interface RegisterInput {
  eventId: string;
  answers?: EventRegistrationAnswers | null;
  /** Inscrever outra pessoa (admin/manager/organizador). Default: eu. */
  employeeId?: string;
}

/**
 * ⚠️ NÃO existe FK `employees → profiles` no banco (`employees.user_id`
 * aponta para `auth.users`, e `profiles` tem o `user_id` como chave). O embed
 * aninhado `employees(..., profiles(...))` era rejeitado pelo PostgREST com
 * `PGRST200` — HTTP 400 — e a aba "Inscritos" ficava vazia em produção.
 * O nome/avatar é resolvido em duas consultas extras, como já faz
 * `useEmployeeStatusHistory`.
 */
const REGISTRATION_SELECT = "*";

/** Anexa `employee` (id, user_id, profiles) às inscrições, sem embed. */
async function attachEmployees(
  rows: EventRegistration[]
): Promise<EventRegistration[]> {
  const employeeIds = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))];
  if (employeeIds.length === 0) return rows;

  const { data: employees, error: empError } = await db
    .from("employees")
    .select("id, user_id")
    .in("id", employeeIds);
  if (empError) throw empError;

  const empRows = (employees ?? []) as { id: string; user_id: string | null }[];
  const userIds = [...new Set(empRows.map((e) => e.user_id).filter(Boolean))] as string[];

  const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles, error: profError } = await db
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", userIds);
    if (profError) throw profError;
    for (const p of (profiles ?? []) as {
      user_id: string;
      full_name: string | null;
      avatar_url: string | null;
    }[]) {
      profileMap.set(p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url });
    }
  }

  const empMap = new Map<string, EventRegistrationEmployee>(
    empRows.map((e) => [
      e.id,
      {
        id: e.id,
        user_id: e.user_id,
        profiles: e.user_id ? profileMap.get(e.user_id) ?? null : null,
      },
    ])
  );

  return rows.map((r) => ({ ...r, employee: empMap.get(r.employee_id) ?? null }));
}

/* ════════════════════════════════════════════
   INSCRIÇÕES DE UM EVENTO
   ════════════════════════════════════════════ */

/**
 * Lista de inscritos de um evento + estado da minha própria inscrição.
 *
 * O que cada usuário enxerga é decidido pelo RLS
 * (`internal_event_registrations_select`): admin/manager e o organizador do
 * evento veem todos os inscritos; um colaborador comum vê só a própria linha.
 */
export function useEventRegistrations(eventId: string | undefined) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const tenantId = profile?.tenant_id;
  const { myEmployeeId } = usePermissions();

  const listKey = ["event-registrations", tenantId, eventId] as const;

  const registrationsQuery = useQuery({
    queryKey: listKey,
    enabled: !!tenantId && !!eventId,
    queryFn: async (): Promise<EventRegistration[]> => {
      const { data, error } = await db
        .from("internal_event_registrations")
        .select(REGISTRATION_SELECT)
        // RLS + filtro explícito de tenant (CLAUDE.md).
        .eq("tenant_id", tenantId as string)
        .eq("event_id", eventId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return attachEmployees((data ?? []) as EventRegistration[]);
    },
  });

  const registrations = useMemo(
    () => registrationsQuery.data ?? [],
    [registrationsQuery.data]
  );

  /** Só quem está de fato inscrito (exclui as inscrições canceladas). */
  const activeRegistrations = useMemo(
    () => registrations.filter((r) => r.status === "registered"),
    [registrations]
  );

  const myRegistration = useMemo(
    () => registrations.find((r) => r.employee_id === myEmployeeId) ?? null,
    [registrations, myEmployeeId]
  );

  const isRegistered = myRegistration?.status === "registered";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: listKey });
    qc.invalidateQueries({ queryKey: ["event-registration-counts", tenantId] });
    qc.invalidateQueries({ queryKey: ["my-event-registrations", tenantId, myEmployeeId] });
  };

  const register = useMutation({
    mutationFn: async (input: RegisterInput): Promise<EventRegistration> => {
      if (!tenantId) throw new Error("Sessão sem tenant — recarregue a página");
      const employeeId = input.employeeId ?? myEmployeeId;
      if (!employeeId) throw new Error("Seu usuário não está vinculado a um colaborador");

      // Upsert para permitir reinscrição depois de cancelar — a tabela tem
      // UNIQUE (event_id, employee_id), então um insert puro falharia.
      //
      // ⚠️ `answers` só entra no payload quando o chamador REALMENTE mandou
      // respostas. O upsert do PostgREST vira `ON CONFLICT DO UPDATE` das
      // colunas enviadas: mandar `answers: null` por padrão apagava a ficha
      // preenchida na inscrição anterior a cada reinscrição. Omitindo a coluna,
      // o insert usa o default (null) e o update preserva o que já existia.
      // Note que `{}` é truthy — por isso o teste é contra `undefined`, e não
      // uma checagem de veracidade: um objeto vazio é uma resposta legítima de
      // "limpar a ficha" e deve ser gravado.
      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        event_id: input.eventId,
        employee_id: employeeId,
        status: "registered",
      };
      if (input.answers !== undefined) payload.answers = input.answers;

      const { data, error } = await db
        .from("internal_event_registrations")
        .upsert(payload, { onConflict: "event_id,employee_id" })
        .select()
        .single();
      if (error) throw error;
      return data as EventRegistration;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Inscrição confirmada");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao se inscrever no evento");
    },
  });

  /** Cancela mantendo o histórico (status = 'cancelled'). */
  const cancelRegistration = useMutation({
    mutationFn: async (input?: { employeeId?: string }): Promise<void> => {
      if (!tenantId || !eventId) throw new Error("Sessão sem tenant — recarregue a página");
      const employeeId = input?.employeeId ?? myEmployeeId;
      if (!employeeId) throw new Error("Seu usuário não está vinculado a um colaborador");

      // `.select()` é obrigatório: o PostgREST devolve zero linhas SEM erro
      // quando o RLS bloqueia o UPDATE (ex.: tentar cancelar a inscrição de
      // outra pessoa sem gerenciar o evento). Sem esta checagem, a interface
      // dizia "Inscrição cancelada" com a inscrição intacta.
      const { data, error } = await db
        .from("internal_event_registrations")
        .update({ status: "cancelled" })
        .eq("tenant_id", tenantId)
        .eq("event_id", eventId)
        .eq("employee_id", employeeId)
        .select();
      if (error) throw error;

      if ((data ?? []).length === 0) {
        throw new Error(
          "Nenhuma inscrição foi cancelada: você não tem permissão para cancelar " +
            "esta inscrição, ou ela não existe mais. Atualize a página para conferir."
        );
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Inscrição cancelada");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao cancelar inscrição");
    },
  });

  /** Remove a linha de vez (organizador tirando alguém da lista). */
  const removeRegistration = useMutation({
    mutationFn: async (registrationId: string): Promise<string> => {
      if (!tenantId) throw new Error("Sessão sem tenant — recarregue a página");
      // Mesmo motivo do cancelamento: DELETE bloqueado pelo RLS volta como
      // 204 sem erro. Só há remoção de fato se alguma linha voltar no select.
      const { data, error } = await db
        .from("internal_event_registrations")
        .delete()
        .eq("id", registrationId)
        .eq("tenant_id", tenantId)
        .select();
      if (error) throw error;

      if ((data ?? []).length === 0) {
        throw new Error(
          "Nenhuma inscrição foi removida: você não tem permissão para remover " +
            "inscrições deste evento, ou ela já não existe mais. Atualize a página."
        );
      }
      return registrationId;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Inscrição removida");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao remover inscrição");
    },
  });

  return {
    /** Todas as linhas visíveis, inclusive canceladas. */
    registrations,
    /** Apenas `status = 'registered'`. */
    activeRegistrations,
    registeredCount: activeRegistrations.length,
    myRegistration,
    isRegistered,
    isLoading: registrationsQuery.isLoading,
    isError: registrationsQuery.isError,
    error: registrationsQuery.error as Error | null,
    refetch: registrationsQuery.refetch,

    register,
    cancelRegistration,
    removeRegistration,
  };
}

/* ════════════════════════════════════════════
   CONTAGEM POR EVENTO (listagem/cards)
   ════════════════════════════════════════════ */

/** Tamanho de página da varredura de contagem (teto do PostgREST é ~1000). */
const COUNT_PAGE_SIZE = 1000;
/** Trava de segurança: no máximo 50 páginas (~50 mil inscrições). */
const COUNT_MAX_PAGES = 50;

/**
 * `{ [event_id]: nº de inscritos ativos }` para vários eventos de uma vez —
 * evita N+1 na listagem.
 *
 * ⚠️ LIMITAÇÃO CONHECIDA — o número NÃO é confiável para todo mundo.
 *
 * A contagem é feita no client sobre as linhas que o RLS devolve, e a policy
 * `internal_event_registrations_select` só mostra a própria linha a quem não
 * gerencia o evento. Resultado: um colaborador comum abrindo a listagem vê
 * "0 inscritos" num evento que tem quarenta — um número falso, pior do que
 * nenhum número.
 *
 * Não há como corrigir o VALOR daqui: a informação simplesmente não chega ao
 * navegador. O que este hook faz é ser honesto sobre isso —
 * `isReliable` diz se os números podem ser exibidos, e `getCount()` devolve
 * `undefined` (não `0`) para evento sem nenhuma linha visível, para que a
 * interface consiga distinguir "zero inscritos" de "não sei".
 *
 * SOLUÇÃO DEFINITIVA (exige migration, fora do escopo desta correção): uma RPC
 * `SECURITY DEFINER` — algo como
 * `internal_event_registration_counts(p_event_ids uuid[])` — que conte no
 * servidor, filtrando por tenant do chamador e ignorando o RLS de leitura
 * linha a linha. Enquanto ela não existir, a listagem deve ESCONDER o número
 * para quem não gerencia, em vez de mostrar um valor falso.
 */
export function useEventRegistrationCounts(eventIds: string[]) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const { isAdmin, isManager } = usePermissions();
  const ids = useMemo(() => [...eventIds].sort(), [eventIds]);

  /**
   * Quem gerencia enxerga todas as linhas pelo RLS, então a soma bate. Note
   * que o organizador de um evento específico também enxerga tudo daquele
   * evento, mas isso não é decidível aqui sem carregar os eventos — por
   * segurança, tratamos como não confiável (erra para menos, nunca mostrando
   * um número falso como se fosse verdadeiro).
   */
  const isReliable = isAdmin || isManager;

  const query = useQuery({
    queryKey: ["event-registration-counts", tenantId, ids],
    enabled: !!tenantId && ids.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const counts: Record<string, number> = {};

      // Paginação explícita: sem `.range()` a consulta batia no teto padrão de
      // linhas do PostgREST em SILÊNCIO e as contagens saíam menores que a
      // realidade, sem erro nenhum para denunciar o corte.
      for (let page = 0; page < COUNT_MAX_PAGES; page++) {
        const from = page * COUNT_PAGE_SIZE;
        const { data, error } = await db
          .from("internal_event_registrations")
          .select("event_id")
          .eq("tenant_id", tenantId as string)
          .eq("status", "registered")
          .in("event_id", ids)
          .order("event_id", { ascending: true })
          .range(from, from + COUNT_PAGE_SIZE - 1);
        if (error) throw error;

        const rows = (data ?? []) as Array<{ event_id: string }>;
        for (const row of rows) {
          counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
        }

        if (rows.length < COUNT_PAGE_SIZE) return counts;

        if (page === COUNT_MAX_PAGES - 1) {
          console.warn(
            "[useEventRegistrationCounts] Limite de paginação atingido — as contagens " +
              "podem estar incompletas. Migrar para uma RPC SECURITY DEFINER de contagem."
          );
        }
      }

      return counts;
    },
  });

  const counts = query.data ?? {};

  return {
    ...query,
    /** `{ [event_id]: nº }` — só contém eventos com pelo menos uma linha visível. */
    counts,
    /**
     * `false` quando o usuário não gerencia: os números refletem apenas o que o
     * RLS liberou e NÃO devem ser exibidos. A interface deve esconder o
     * contador nesse caso.
     */
    isReliable,
    /** `undefined` = não sei (sem linha visível). Nunca devolve `0` por omissão. */
    getCount: (eventId: string): number | undefined => counts[eventId],
  };
}

/* ════════════════════════════════════════════
   MINHAS INSCRIÇÕES
   ════════════════════════════════════════════ */

/**
 * Todas as inscrições ativas do colaborador logado no tenant.
 *
 * É o hook certo para a LISTAGEM marcar "Inscrito" sem abrir cada evento: uma
 * consulta só, e sem depender do RLS de terceiros (o colaborador sempre enxerga
 * as próprias linhas). Por isso devolve, além dos registros, o conjunto de ids
 * de eventos e o helper `isRegisteredIn(eventId)`.
 *
 * A queryKey é completa e restrita — `["my-event-registrations", tenantId,
 * myEmployeeId]` — e é exatamente a que `register`/`cancelRegistration`/
 * `removeRegistration` e `deleteEvent` invalidam.
 */
export function useMyEventRegistrations() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const { myEmployeeId } = usePermissions();

  const query = useQuery({
    queryKey: ["my-event-registrations", tenantId, myEmployeeId],
    enabled: !!tenantId && !!myEmployeeId,
    queryFn: async (): Promise<EventRegistration[]> => {
      const { data, error } = await db
        .from("internal_event_registrations")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .eq("employee_id", myEmployeeId as string)
        .eq("status", "registered")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventRegistration[];
    },
  });

  const registrations = useMemo(() => query.data ?? [], [query.data]);

  const registeredEventIds = useMemo(
    () => new Set(registrations.map((r) => r.event_id)),
    [registrations]
  );

  return {
    ...query,
    /** Minhas inscrições ativas (status `registered`). */
    registrations,
    /** Ids dos eventos em que estou inscrito — pronto para lookup O(1). */
    registeredEventIds,
    /** `true` se estou inscrito neste evento. Use para o selo "Inscrito". */
    isRegisteredIn: (eventId: string): boolean => registeredEventIds.has(eventId),
  };
}
