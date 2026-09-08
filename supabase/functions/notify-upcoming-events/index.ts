/**
 * notify-upcoming-events — lembretes de eventos internos próximos.
 *
 * Roda no pg_cron (1 min, mesmo padrão de `meeting_reminder_dispatch` e
 * `email-unread-chat`). Para cada `internal_events` com status='published'
 * cujo `starts_at` cai numa das janelas de aviso, resolve o público do evento
 * e entrega:
 *   1) notificação in-app (tabela `notifications`);
 *   2) Web Push, delegado à função `send-push` (que já cuida de VAPID, do
 *      payload sem `icon` absoluto e da limpeza de endpoints mortos).
 *
 * Janelas de aviso (ver JANELAS abaixo):
 *   - 't24h'  → 24h antes (aviso de agenda / prazo para se inscrever)
 *   - 't15m'  → 15 min antes (aviso de "começa agora")
 *
 * Idempotência: `internal_event_notifications` com UNIQUE
 * (event_id, employee_id, window_key). A função RESERVA os destinatários com
 * INSERT ... ON CONFLICT DO NOTHING RETURNING e só notifica quem foi
 * efetivamente reservado. Rodar de novo devolve zero linhas → zero reenvios.
 * Se a entrega in-app falhar, a reserva daquele LOTE é desfeita para a
 * próxima rodada tentar de novo.
 *
 * Entrega em LOTES (reserva→insere→próximo lote), nunca "reserva tudo e
 * entrega depois": reservar o público inteiro de antemão significa que um
 * worker morto no meio deixa todo o resto reservado (logo, invisível para as
 * próximas rodadas) e sem notificação nenhuma — perda permanente.
 *
 * Segurança: `verify_jwt = false` (chamada pelo pg_net, sem JWT). Exige
 * `x-cron-secret` == env CRON_SECRET OU `Authorization: Bearer <service_role>`.
 * Sem nenhum dos dois → 401. Sem CRON_SECRET configurada, só o Bearer vale.
 *
 * Envs obrigatórias: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Envs opcionais:    CRON_SECRET, INTERNAL_PUSH_SECRET (sem ela, só in-app).
 *
 * ATENÇÃO — validado contra o banco de produção (não contra types.ts):
 *   - `notifications` NÃO tem coluna `metadata`. Colunas reais:
 *     tenant_id, user_id, type, title, body, link, is_read, source, source_id.
 *   - `push_subscriptions` é indexada por `employee_id` (não por user_id).
 *   - `employees` NÃO tem `area_id`. O vínculo colaborador→área é
 *     employee_positions → positions.area_id, ou positions.subarea_id →
 *     subareas.area_id.
 *   - `employee_positions` e `notification_mutes` NÃO têm `tenant_id` — por
 *     isso o filtro explícito de tenant do CLAUDE.md §2 não aparece nessas
 *     duas queries (nas demais, aparece).
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

// ── Janelas de aviso ──────────────────────────────────────────
// 24h: tempo hábil para reorganizar a agenda (e para se inscrever, quando o
// evento exige inscrição). 15min: o empurrão para largar o que está fazendo e
// entrar — mesma ordem de grandeza do lembrete de reunião que já existe.
// Nada entre as duas de propósito: mais avisos viram ruído e as pessoas
// desligam a notificação inteira.
const JANELAS = [
  { key: "t24h", leadMinutes: 24 * 60 },
  { key: "t15m", leadMinutes: 15 },
] as const;

type WindowKey = (typeof JANELAS)[number]["key"];

// Se o evento começa em menos de 1h, o aviso 't24h' não faz mais sentido
// (evento publicado em cima da hora) — 't15m' cobre. Sem isso, quem publica
// um evento para daqui a 20 min dispara dois avisos com 5 min de diferença.
const T24H_PISO_MINUTOS = 60;

// Acima disso o aviso é honestamente "amanhã". Abaixo, "Amanhã: X" é mentira:
// a faixa t24h vai de 61 min a 24h, então um evento hoje às 22h avisado às 15h
// caía como "Amanhã" enquanto o corpo dizia "começa em 7h".
const TITULO_AMANHA_MINUTOS = 18 * 60;

const MAX_EVENTOS_POR_RODADA = 200;
const MAX_DESTINATARIOS_POR_EVENTO = 2000;

// Todo `.in(...)` do supabase-js vira query string de um GET. Um UUID custa
// ~37 caracteres no filtro; alguns milhares estouram o limite de URL do edge
// do Supabase e a query volta 414 (ou pior, truncada). Daí o fatiamento.
const LOTE_IDS = 100;

// Tamanho do lote de entrega: reserva + insert de 100 pessoas por vez. Grande
// o bastante para não virar N queries, pequeno o bastante para que um worker
// morto no meio perca no máximo 100 avisos — que a rodada seguinte reenvia.
const LOTE_ENTREGA = 100;

// Janela de retomada do curto-circuito de custo (ver processarJanela).
const RETRY_MINUTOS = 5;

interface InternalEvent {
  id: string;
  tenant_id: string;
  title: string;
  starts_at: string;
  scope: "company" | "areas" | "custom" | string;
  status: string;
  registration_required: boolean | null;
  meeting_id: string | null;
}

interface Destinatario {
  employee_id: string;
  user_id: string;
}

/**
 * Sinalizações que precisam chegar à resposta HTTP a partir do fundo da pilha.
 * Passado por parâmetro (e não em variável de módulo) porque o runtime do Deno
 * reaproveita a instância entre requisições concorrentes — estado global aqui
 * misturaria diagnóstico de execuções diferentes.
 */
interface Diagnostico {
  truncados: Set<string>;
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function envObrigatoria(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`env obrigatória ausente: ${nome}`);
  return v;
}

/** Fatia uma lista em lotes de no máximo `tamanho`. */
function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Roda `consulta` uma vez por lote de ids e concatena os resultados.
 * Usado em TODO `.in(...)` de ids desta função — ver comentário de LOTE_IDS.
 */
async function emLotesDeIds<T>(
  ids: string[],
  consulta: (lote: string[]) => Promise<T[]>,
): Promise<T[]> {
  const saida: T[] = [];
  for (const lote of emLotes(ids, LOTE_IDS)) {
    saida.push(...(await consulta(lote)));
  }
  return saida;
}

/**
 * Registra truncamento por `.limit()`. Um lote que volta com exatamente
 * MAX_DESTINATARIOS_POR_EVENTO linhas quase certamente deixou gente de fora —
 * e, sem isso, o corte é silencioso: ninguém nunca soube que faltou avisar.
 */
function anotarTruncamento(diag: Diagnostico, ev: InternalEvent, onde: string, qtd: number) {
  if (qtd < MAX_DESTINATARIOS_POR_EVENTO) return;
  const marca = `${ev.id}:${onde}`;
  diag.truncados.add(marca);
  console.warn(
    `[notify-upcoming-events] TRUNCADO em ${onde}: evento ${ev.id} bateu o teto de ` +
      `${MAX_DESTINATARIOS_POR_EVENTO} destinatários — parte do público NÃO será avisada.`,
  );
}

/** Colaboradores ativos do tenant que têm conta de acesso. */
async function colaboradoresAtivos(
  svc: SupabaseClient,
  ev: InternalEvent,
  diag: Diagnostico,
): Promise<Destinatario[]> {
  // `order` explícito porque `limit` sem ordenação deixa o Postgres escolher o
  // recorte: sem isso, quem é cortado muda de rodada para rodada.
  const { data, error } = await svc
    .from("employees")
    .select("id, user_id")
    .eq("tenant_id", ev.tenant_id)
    .eq("status", "active")
    .eq("is_test", false)
    .not("user_id", "is", null)
    .order("id")
    .limit(MAX_DESTINATARIOS_POR_EVENTO);
  if (error) throw error;
  anotarTruncamento(diag, ev, "company", (data ?? []).length);
  return (data ?? []).map((e) => ({ employee_id: e.id, user_id: e.user_id }));
}

/**
 * Busca employees ativos e não-teste dentro de uma lista de ids, em lotes.
 * O `is_test = false` vale aqui também: sem ele, um colaborador de teste em
 * setor alvo (ou na lista custom) recebia notificação real — o filtro existia
 * só no caminho 'company'.
 */
async function employeesPorIds(
  svc: SupabaseClient,
  ev: InternalEvent,
  ids: string[],
  onde: string,
  diag: Diagnostico,
): Promise<Destinatario[]> {
  if (!ids.length) return [];
  const linhas = await emLotesDeIds(ids, async (lote) => {
    const { data, error } = await svc
      .from("employees")
      .select("id, user_id")
      .eq("tenant_id", ev.tenant_id)
      .eq("status", "active")
      .eq("is_test", false)
      .not("user_id", "is", null)
      .in("id", lote)
      .order("id")
      .limit(MAX_DESTINATARIOS_POR_EVENTO);
    if (error) throw error;
    return data ?? [];
  });
  anotarTruncamento(diag, ev, onde, linhas.length);
  return linhas
    .slice(0, MAX_DESTINATARIOS_POR_EVENTO)
    .map((e) => ({ employee_id: e.id, user_id: e.user_id }));
}

/**
 * Público de `scope='areas'`.
 *
 * Não existe `employees.area_id` no banco real. O caminho é:
 *   employee_positions.employee_id → positions.area_id
 *   employee_positions.employee_id → positions.subarea_id → subareas.area_id
 * Toda etapa é filtrada por tenant_id — dois tenants nunca se cruzam.
 */
async function colaboradoresDasAreas(
  svc: SupabaseClient,
  ev: InternalEvent,
  areaIds: string[],
  diag: Diagnostico,
): Promise<Destinatario[]> {
  if (!areaIds.length) return [];

  // Subáreas que pertencem às áreas alvo (dentro do tenant).
  const subareas = await emLotesDeIds(areaIds, async (lote) => {
    const { data, error } = await svc
      .from("subareas")
      .select("id")
      .eq("tenant_id", ev.tenant_id)
      .in("area_id", lote);
    if (error) throw error;
    return data ?? [];
  });
  const subareaIds = [...new Set(subareas.map((s) => s.id as string))];

  // Cargos ligados às áreas (direta ou via subárea). Duas consultas em vez do
  // `.or(area_id.in.(...),subarea_id.in.(...))` de antes: o `or` embutia as
  // duas listas inteiras numa única URL, exatamente o que o lote evita.
  const porArea = await emLotesDeIds(areaIds, async (lote) => {
    const { data, error } = await svc
      .from("positions")
      .select("id")
      .eq("tenant_id", ev.tenant_id)
      .in("area_id", lote);
    if (error) throw error;
    return data ?? [];
  });
  const porSubarea = await emLotesDeIds(subareaIds, async (lote) => {
    const { data, error } = await svc
      .from("positions")
      .select("id")
      .eq("tenant_id", ev.tenant_id)
      .in("subarea_id", lote);
    if (error) throw error;
    return data ?? [];
  });
  const positionIds = [...new Set([...porArea, ...porSubarea].map((p) => p.id as string))];
  if (!positionIds.length) return [];

  // employee_positions não tem tenant_id — o isolamento multi-tenant é
  // garantido pelo filtro no `employees` logo abaixo.
  const vinculos = await emLotesDeIds(positionIds, async (lote) => {
    const { data, error } = await svc
      .from("employee_positions")
      .select("employee_id")
      .in("position_id", lote);
    if (error) throw error;
    return data ?? [];
  });
  const employeeIds = [...new Set(vinculos.map((v) => v.employee_id as string))];

  return employeesPorIds(svc, ev, employeeIds, "areas", diag);
}

/** Público de `scope='custom'`: employees listados em internal_event_targets. */
async function colaboradoresCustom(
  svc: SupabaseClient,
  ev: InternalEvent,
  employeeIds: string[],
  diag: Diagnostico,
): Promise<Destinatario[]> {
  return employeesPorIds(svc, ev, employeeIds, "custom", diag);
}

/** Resolve o público do evento conforme o scope. */
async function resolverPublico(
  svc: SupabaseClient,
  ev: InternalEvent,
  diag: Diagnostico,
): Promise<Destinatario[]> {
  if (ev.scope === "company") return colaboradoresAtivos(svc, ev, diag);

  const { data: targets, error } = await svc
    .from("internal_event_targets")
    .select("area_id, employee_id")
    .eq("tenant_id", ev.tenant_id)
    .eq("event_id", ev.id);
  if (error) throw error;

  if (ev.scope === "areas") {
    const areaIds = [
      ...new Set((targets ?? []).map((t) => t.area_id).filter(Boolean) as string[]),
    ];
    return colaboradoresDasAreas(svc, ev, areaIds, diag);
  }

  if (ev.scope === "custom") {
    const empIds = [
      ...new Set((targets ?? []).map((t) => t.employee_id).filter(Boolean) as string[]),
    ];
    return colaboradoresCustom(svc, ev, empIds, diag);
  }

  console.warn(`[notify-upcoming-events] scope desconhecido "${ev.scope}" no evento ${ev.id}`);
  return [];
}

/** employee_ids inscritos e não cancelados. */
async function inscritos(svc: SupabaseClient, ev: InternalEvent): Promise<Set<string>> {
  const { data, error } = await svc
    .from("internal_event_registrations")
    .select("employee_id, status")
    .eq("tenant_id", ev.tenant_id)
    .eq("event_id", ev.id);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .filter((r) => !["cancelled", "canceled", "declined"].includes(String(r.status ?? "")))
      .map((r) => r.employee_id),
  );
}

/** user_ids com notificação silenciada globalmente (kind 'all'). */
async function silenciados(svc: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  // Mute é preferência, não regra de negócio: se a consulta falhar, seguimos
  // notificando em vez de derrubar o lote.
  let linhas: Array<{ user_id: string; expires_at: string | null }> = [];
  try {
    linhas = await emLotesDeIds(userIds, async (lote) => {
      // notification_mutes é por auth.users, sem tenant_id — nada a filtrar.
      const { data, error } = await svc
        .from("notification_mutes")
        .select("user_id, expires_at")
        .in("user_id", lote)
        .eq("kind", "all");
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; expires_at: string | null }>;
    });
  } catch (e) {
    console.error("[notify-upcoming-events] falha lendo notification_mutes:", (e as Error).message);
    return new Set();
  }
  const agora = Date.now();
  return new Set(
    linhas
      .filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > agora)
      .map((m) => m.user_id),
  );
}

function textoDoAviso(ev: InternalEvent, janela: WindowKey, minutosRestantes: number) {
  // A rota registrada no App.tsx é `/eventos`; o id do evento vai no query
  // param `evento` (a página lê searchParams.get("evento")). `/eventos/<id>`
  // não existe e caía no 404.
  const link = `/eventos?evento=${ev.id}`;
  if (janela === "t15m") {
    const min = Math.max(1, Math.round(minutosRestantes));
    return {
      title: `Começa em ${min} min: ${ev.title}`,
      body: ev.meeting_id
        ? "Entre pela sala da reunião pelo card do evento."
        : "O evento está prestes a começar.",
      link,
    };
  }
  const horas = Math.max(1, Math.round(minutosRestantes / 60));
  // Título obedece ao tempo real que falta: "Amanhã" só quando é de fato
  // amanhã. Corpo segue o mesmo número que aparece no título.
  if (minutosRestantes < TITULO_AMANHA_MINUTOS) {
    return {
      title: `Em ${horas}h: ${ev.title}`,
      body: `O evento começa em aproximadamente ${horas}h.`,
      link,
    };
  }
  return {
    title: `Amanhã: ${ev.title}`,
    body: `O evento começa amanhã, em aproximadamente ${horas}h.`,
    link,
  };
}

/** Dispara o Web Push via send-push. Falha aqui nunca derruba o lote. */
async function enviarPush(
  supabaseUrl: string,
  employeeIds: string[],
  aviso: { title: string; body: string; link: string },
  tag: string,
) {
  const secret = Deno.env.get("INTERNAL_PUSH_SECRET");
  if (!secret) {
    console.warn("[notify-upcoming-events] INTERNAL_PUSH_SECRET ausente — só in-app");
    return;
  }
  if (!employeeIds.length) return;
  // O send-push também faz `.in("employee_id", ...)`: mandar a lista inteira
  // só empurra o estouro de URL para dentro dele.
  for (const lote of emLotes(employeeIds, LOTE_IDS)) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify({
          employee_ids: lote,
          title: aviso.title,
          body: aviso.body,
          tag,
          // URL relativa de propósito — o service worker resolve pelo próprio
          // origin. Depender de SITE_URL já mandou clique para domínio morto.
          url: aviso.link,
        }),
      });
      if (!resp.ok) {
        console.error(`[notify-upcoming-events] send-push respondeu ${resp.status}`);
      }
    } catch (e) {
      console.error("[notify-upcoming-events] falha no send-push:", (e as Error).message);
    }
  }
}

/**
 * Curto-circuito de CUSTO (não de correção).
 *
 * A faixa t24h dura 1.379 minutos e o cron roda a cada minuto: sem isso, a
 * função re-resolve o público inteiro do evento ~1.379 vezes para mandar um
 * upsert que devolve zero linhas. Se já existe reserva para (evento, janela),
 * pulamos antes de pagar por `resolverPublico`.
 *
 * NÃO substitui a trava de idempotência — quem garante zero reenvio continua
 * sendo a UNIQUE (event_id, employee_id, window_key). Isto aqui só evita gastar
 * queries à toa.
 *
 * A carência de RETRY_MINUTOS existe porque a entrega é em lotes: um worker
 * que morre no meio deixa a janela parcialmente reservada, e um curto-circuito
 * puramente "existe alguma linha?" congelaria esse estado para sempre. Dentro
 * da carência as rodadas seguintes completam o que faltou; depois dela,
 * assumimos concluída e paramos de pagar.
 */
async function janelaJaResolvida(
  svc: SupabaseClient,
  ev: InternalEvent,
  janela: WindowKey,
): Promise<boolean> {
  const { data, error } = await svc
    .from("internal_event_notifications")
    // A coluna de tempo desta tabela é `sent_at` (não `created_at`).
    .select("sent_at")
    .eq("tenant_id", ev.tenant_id)
    .eq("event_id", ev.id)
    .eq("window_key", janela)
    .order("sent_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const ultima = data?.[0]?.sent_at as string | undefined;
  if (!ultima) return false;
  return Date.now() - new Date(ultima).getTime() > RETRY_MINUTOS * 60_000;
}

/** Processa uma janela de um evento. Devolve quantos foram notificados. */
async function processarJanela(
  svc: SupabaseClient,
  supabaseUrl: string,
  ev: InternalEvent,
  janela: WindowKey,
  minutosRestantes: number,
  diag: Diagnostico,
): Promise<number> {
  if (await janelaJaResolvida(svc, ev, janela)) return 0;

  let publico = await resolverPublico(svc, ev, diag);
  if (!publico.length) return 0;

  // registration_required:
  //  - 't24h' vai para TODO o público — é justamente o aviso que leva a
  //    pessoa a se inscrever; mandar só para quem já se inscreveu esvazia o
  //    propósito da inscrição.
  //  - 't15m' vai SÓ para quem se inscreveu — "começa em 15 min, entre agora"
  //    para quem não vai é ruído puro.
  if (ev.registration_required && janela === "t15m") {
    const inscritosSet = await inscritos(svc, ev);
    publico = publico.filter((d) => inscritosSet.has(d.employee_id));
    if (!publico.length) return 0;
  }

  const aviso = textoDoAviso(ev, janela, minutosRestantes);
  let entregues = 0;

  // ── Reserva + entrega, lote a lote ──────────────────────────
  // A ordem importa: reserva ESTE lote → insere as notificações DELE → só
  // então passa ao próximo. Reservar o público todo antes de entregar
  // significa que uma queda no meio deixa os restantes reservados (a UNIQUE os
  // esconde das próximas rodadas) e sem aviso nenhum: perda permanente.
  for (const grupo of emLotes(publico, LOTE_ENTREGA)) {
    const linhas = grupo.map((d) => ({
      tenant_id: ev.tenant_id,
      event_id: ev.id,
      employee_id: d.employee_id,
      user_id: d.user_id,
      window_key: janela,
    }));

    // ON CONFLICT DO NOTHING RETURNING: só volta quem ainda não tinha sido
    // avisado nessa janela. Duas execuções em paralelo não duplicam.
    const { data: reservados, error: reservaErr } = await svc
      .from("internal_event_notifications")
      .upsert(linhas, {
        onConflict: "event_id,employee_id,window_key",
        ignoreDuplicates: true,
      })
      .select("id, employee_id, user_id");
    if (reservaErr) {
      // Nada foi reservado neste lote → a próxima rodada tenta de novo. Não
      // abortamos os demais lotes: um lote ruim não pode calar o resto.
      console.error(
        `[notify-upcoming-events] reserva falhou (evento ${ev.id}, janela ${janela}):`,
        reservaErr.message,
      );
      continue;
    }
    if (!reservados?.length) continue;

    const idsReserva = reservados.map((r) => r.id as string);
    const mudos = await silenciados(svc, reservados.map((r) => r.user_id as string));

    // Um único insert com o array: N inserts em série é o que fazia a entrega
    // levar minutos e ampliava a janela de morte do worker.
    const { error: insErr } = await svc.from("notifications").insert(
      reservados.map((r) => ({
        tenant_id: ev.tenant_id,
        user_id: r.user_id,
        type: "internal_event_reminder",
        title: aviso.title,
        body: aviso.body,
        link: aviso.link,
        source: "system-bot",
        source_id: ev.id,
      })),
    );

    if (insErr) {
      console.error(
        `[notify-upcoming-events] insert de notifications falhou (evento ${ev.id}, ` +
          `janela ${janela}, ${idsReserva.length} pessoas):`,
        insErr.message,
      );
      // Rollback das reservas DESTE lote para a próxima rodada tentar de novo.
      // supabase-js não lança em erro de PostgREST — devolve `{ error }`. O
      // try/catch antigo aqui era decorativo e engolia a falha em silêncio.
      const { error: rollbackErr } = await svc
        .from("internal_event_notifications")
        .delete()
        .in("id", idsReserva);
      if (rollbackErr) {
        // Pior caso: essas pessoas ficam reservadas sem receber o aviso —
        // nunca recebem duas vezes. Precisa aparecer no log para ser visto.
        console.error(
          `[notify-upcoming-events] ROLLBACK DA RESERVA FALHOU (evento ${ev.id}, ` +
            `janela ${janela}): ${idsReserva.length} pessoas ficarão sem aviso —`,
          rollbackErr.message,
        );
      }
      continue;
    }

    entregues += reservados.length;

    // Push só para quem não silenciou tudo. O registro in-app fica de qualquer
    // jeito — mute silencia o alerta, não apaga o histórico.
    const paraPush = reservados
      .filter((r) => !mudos.has(r.user_id as string))
      .map((r) => r.employee_id as string);
    await enviarPush(supabaseUrl, paraPush, aviso, `evento-${ev.id}-${janela}`);
  }

  return entregues;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let supabaseUrl: string;
  let serviceKey: string;
  try {
    supabaseUrl = envObrigatoria("SUPABASE_URL");
    serviceKey = envObrigatoria("SUPABASE_SERVICE_ROLE_KEY");
  } catch (e) {
    console.error("[notify-upcoming-events]", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }

  // Fail-closed: sem segredo de cron nem service_role, ninguém entra.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const autorizado =
    (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret) ||
    req.headers.get("Authorization") === `Bearer ${serviceKey}`;
  if (!autorizado) return json({ error: "unauthorized" }, 401);

  try {
    const svc = createClient(supabaseUrl, serviceKey);
    const agora = Date.now();
    const maiorLead = Math.max(...JANELAS.map((j) => j.leadMinutes));
    const diag: Diagnostico = { truncados: new Set() };

    const { data: eventos, error } = await svc
      .from("internal_events")
      .select("id, tenant_id, title, starts_at, scope, status, registration_required, meeting_id")
      .eq("status", "published")
      .gt("starts_at", new Date(agora).toISOString())
      .lte("starts_at", new Date(agora + maiorLead * 60_000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(MAX_EVENTOS_POR_RODADA);
    if (error) throw error;

    let notificados = 0;
    let eventosProcessados = 0;
    let falhas = 0;

    for (const ev of (eventos ?? []) as InternalEvent[]) {
      const minutosRestantes = (new Date(ev.starts_at).getTime() - agora) / 60_000;
      if (minutosRestantes <= 0) continue;

      for (const janela of JANELAS) {
        if (minutosRestantes > janela.leadMinutes) continue;
        if (janela.key === "t24h" && minutosRestantes <= T24H_PISO_MINUTOS) continue;
        try {
          notificados += await processarJanela(
            svc,
            supabaseUrl,
            ev,
            janela.key,
            minutosRestantes,
            diag,
          );
        } catch (e) {
          // Um evento problemático não pode derrubar os demais.
          falhas++;
          console.error(
            `[notify-upcoming-events] evento ${ev.id} janela ${janela.key} falhou:`,
            (e as Error).message,
          );
        }
      }
      eventosProcessados++;
    }

    return json({
      ok: true,
      eventos: eventosProcessados,
      notificados,
      falhas,
      // Público cortado pelo teto de MAX_DESTINATARIOS_POR_EVENTO. Lista vazia
      // = ninguém ficou de fora nesta rodada.
      truncados: [...diag.truncados],
    });
  } catch (e) {
    console.error("[notify-upcoming-events] erro:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
