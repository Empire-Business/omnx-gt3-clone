// Cami — assistente de IA do OMNX GT3.
// Dois modos:
//   1) Chat: { message, history?, channel_id?, context? } → { reply, actions }
//      - Tools de leitura (search_items, list_my_tasks, list_upcoming_meetings)
//        são executadas no servidor para fundamentar a resposta.
//      - Tools de ação (propose_task, propose_meeting, open_item) NÃO executam:
//        viram "propostas" (actions) que o frontend mostra como cartões de
//        confirmação / botões de navegação.
//   2) Execute: { execute: { type, args } } → executa de fato a ação confirmada
//      (create_task / create_meeting) e devolve o resultado (+ navigate).
//
// Provedor: OpenRouter (OPENROUTER_API_KEY), mesmo padrão de omnx-bot/process-ai.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://gt3.empirebusiness.com.br",
  "https://t3.empirebusiness.com.br",
  "http://localhost:8080",
  "http://localhost:5173",
];

function corsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

const OPENROUTER_MODELS = [
  "anthropic/claude-haiku-4.5",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-3-haiku",
];

interface Ctx {
  user_id: string;
  tenant_id: string;
  full_name: string;
  employee_id: string | null;
}

type Action =
  | { kind: "create_task"; payload: Record<string, unknown> }
  | { kind: "create_meeting"; payload: Record<string, unknown> }
  | { kind: "open"; payload: { label: string; path: string } };

// ── Rotas do app para navegação ───────────────────────────────
function buildPath(kind: string, id: string): string | null {
  switch (kind) {
    case "process": return `/processos/${id}`;
    case "document": return `/documento/${id}`;
    case "project": return `/projetos/${id}`;
    case "task": return `/tarefas`;
    case "meeting": return `/reunioes`;
    default: return null;
  }
}

const SYSTEM_PROMPT = (ctx: Ctx, today_iso: string, mode: string) => `Você é a Clara, assistente de IA do OMNX GT3 — simpática, objetiva e proativa.

Usuário atual: ${ctx.full_name}.
Data/hora atual (ISO): ${today_iso} — fuso America/Sao_Paulo.

SOBRE A PLATAFORMA (OMNX GT3) — use para dúvidas de "como funciona" / "onde fica":
- Plataforma de gestão: projetos, tarefas, processos, reuniões, chat e feed. Multi-tenant — você só vê dados da sua empresa.
- Onde fica cada coisa (rotas):
  • Dashboard (/dashboard): visão geral e indicadores.
  • Projetos (/projetos): projetos, membros, documentos e tarefas de cada projeto.
  • Tarefas (/tarefas): quadro Kanban — arraste cartões entre colunas; cada tarefa tem responsável, prioridade e prazo.
  • Processos (/processos): fluxos/diagramas dos processos da empresa, com etapas e áreas.
  • Reuniões (/reunioes): agendar e entrar em reuniões por vídeo.
  • Chat (/chat): canais por área (geral, diretoria, aquisição, operação, entrega), grupos, mensagens diretas, anotações — e você (Clara).
  • Feed (/feed): comunicados e novidades.
  • Configurações (/configuracoes): conta, equipe e ajustes.
- Conceitos: colaboradores têm cargos ligados a áreas; os canais de área reúnem quem é daquela área. "CEO" é título organizacional; "Admin" é papel de acesso — coisas diferentes.
- Para guiar alguém, diga o caminho (ex: "vá em Tarefas") e, quando for um item específico (processo/projeto/documento), use search_items + open_item para gerar o botão "Abrir".

VOCÊ PODE:
- Criar tarefas → chame propose_task (NÃO cria direto; o usuário confirma).
- Agendar/iniciar reuniões → chame propose_meeting (omita scheduled_at para "agora").
- Encontrar processos, documentos e projetos → use search_items e ofereça o link com open_item.
- Responder perguntas sobre tarefas/reuniões → use list_my_tasks / list_upcoming_meetings.
- Ler a conversa atual do canal (quando fornecida) e responder/agir com base nela — ex: "qual documento ele citou?", "cria a tarefa do que combinamos aqui".
- Sugerir respostas para mensagens do chat.

REGRAS:
- Responda SEMPRE em português do Brasil, curto e direto. Markdown leve quando ajudar.
- Para AÇÕES (criar tarefa, agendar reunião) use SEMPRE as tools propose_*. Nunca afirme que já criou — quem confirma é o usuário.
- Converta datas relativas ("amanhã 9h", "sexta") para ISO 8601 absoluto usando a data atual.
- LOCALIZAR / IR ATÉ: para "onde está X", "acha o documento/processo/projeto Y" ou "me leva até Z": chame search_items e, para o resultado certo, SEMPRE chame open_item com o id retornado — isso gera um botão que leva a pessoa direto ao lugar. Responda em 1 linha o que encontrou e deixe o botão fazer o redirecionamento; quando for um item específico, nunca só descreva o caminho sem o botão.
- Nunca invente ids — sempre obtenha via search_items antes de open_item.
- Se faltar algo essencial (ex: título da tarefa), faça UMA pergunta curta.
- PRIORIZAÇÃO/CONSULTORIA: para "por onde começar?", "qual tarefa é mais fácil/rápida" ou "melhor ordem/maneira de executar": chame list_my_tasks (status todo/in_progress) e analise prazo (mais próximo = mais urgente), prioridade e o esforço aparente pela descrição. Sugira uma ordem curta, justificando cada item em 1 linha, e aponte a mais rápida de concluir.
- ACESSO: você só enxerga o que ESTE usuário pode ver (projetos/tarefas/documentos de que participa). Se uma busca não retornar nada, diga que não encontrou (ou que ele pode não ter acesso) — NUNCA invente dados.${
  mode === "suggest_reply"
    ? "\n- MODO SUGERIR RESPOSTA: o usuário quer ajuda para responder a mensagem citada. Ofereça 2–3 sugestões de resposta curtas, em tom adequado, numeradas. Não chame tools de ação."
    : ""
}`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_items",
      description: "Busca processos, documentos, projetos ou tarefas do tenant por texto. Use para 'onde está X' / 'me leva até Y'.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["process", "document", "project", "task"] },
          query: { type: "string", description: "Termo de busca" },
          limit: { type: "number", default: 5 },
        },
        required: ["kind", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_tasks",
      description: "Lista tarefas do usuário (ou de outra pessoa). Para 'o que tenho hoje?', 'tarefas atrasadas'.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["todo", "in_progress", "done", "all"], default: "all" },
          overdue_only: { type: "boolean", default: false },
          assignee_name: { type: "string" },
          limit: { type: "number", default: 10 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_upcoming_meetings",
      description: "Lista próximas reuniões do tenant.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", default: 5 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_task",
      description: "Propõe a criação de uma tarefa para o usuário confirmar. NÃO cria de imediato.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          assignee_name: { type: "string", description: "Nome (ou parte) do responsável" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_meeting",
      description: "Propõe agendar/iniciar uma reunião para o usuário confirmar. Omita scheduled_at para começar agora.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          scheduled_at: { type: "string", description: "ISO 8601; omita para 'agora'" },
          attendee_names: { type: "array", items: { type: "string" } },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_item",
      description: "Oferece um botão para abrir/navegar até um item encontrado via search_items. Use o id retornado pela busca.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["process", "document", "project", "task", "meeting"] },
          id: { type: "string", description: "id retornado por search_items" },
          label: { type: "string", description: "Texto do botão, ex: 'Abrir processo Onboarding'" },
        },
        required: ["kind", "id", "label"],
      },
    },
  },
];

function escLike(s: string): string {
  return s.replace(/[%_]/g, "\\$&");
}

async function resolveEmployeeByName(svc: any, tenantId: string, name: string) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  // employees não tem full_name — vem de profiles. Buscamos profiles e mapeamos.
  const { data: profs } = await svc
    .from("profiles")
    .select("user_id, full_name")
    .eq("tenant_id", tenantId)
    .ilike("full_name", `%${escLike(trimmed)}%`)
    .limit(5);
  if (!profs?.length) return null;
  const lc = trimmed.toLowerCase();
  const pick =
    profs.find((p: any) => (p.full_name || "").toLowerCase().split(/\s+/)[0] === lc) || profs[0];
  const { data: emp } = await svc
    .from("employees")
    .select("id, user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", pick.user_id)
    .maybeSingle();
  if (!emp) return null;
  return { id: emp.id, user_id: emp.user_id, full_name: pick.full_name };
}

// ── Tools de leitura (executadas no servidor) ─────────────────
async function runReadTool(svc: any, ctx: Ctx, name: string, args: any) {
  if (name === "search_items") {
    const kind = args.kind as string;
    // Remove vírgulas/parênteses que quebram a sintaxe do .or() do PostgREST.
    const query = String(args.query || "").replace(/[,()]/g, " ").trim();
    const limit = Math.min(args.limit || 5, 10);
    if (!query) return { ok: false, error: "query vazia" };
    const like = `%${escLike(query)}%`;
    let rows: any[] = [];
    if (kind === "process") {
      const { data } = await svc.from("processes").select("id, name, description")
        .eq("tenant_id", ctx.tenant_id).or(`name.ilike.${like},description.ilike.${like}`).limit(limit);
      rows = (data || []).map((r: any) => ({ id: r.id, name: r.name, snippet: (r.description || "").slice(0, 120) }));
    } else if (kind === "document") {
      const { data } = await svc.from("project_documents").select("id, title, content")
        .eq("tenant_id", ctx.tenant_id).or(`title.ilike.${like},content.ilike.${like}`).limit(limit);
      rows = (data || []).map((r: any) => ({ id: r.id, name: r.title, snippet: (r.content || "").slice(0, 120) }));
    } else if (kind === "project") {
      const { data } = await svc.from("projects").select("id, name, description")
        .eq("tenant_id", ctx.tenant_id).or(`name.ilike.${like},description.ilike.${like}`).limit(limit);
      rows = (data || []).map((r: any) => ({ id: r.id, name: r.name, snippet: (r.description || "").slice(0, 120) }));
    } else if (kind === "task") {
      const { data } = await svc.from("tasks").select("id, title, status")
        .eq("tenant_id", ctx.tenant_id).ilike("title", like).limit(limit);
      rows = (data || []).map((r: any) => ({ id: r.id, name: r.title, snippet: `status: ${r.status}` }));
    } else {
      return { ok: false, error: "kind inválido" };
    }
    return { ok: true, result: rows.map((r) => ({ ...r, path: buildPath(kind, r.id) })) };
  }

  if (name === "list_my_tasks") {
    let assigneeId = ctx.employee_id;
    if (args.assignee_name) {
      const emp = await resolveEmployeeByName(svc, ctx.tenant_id, args.assignee_name);
      if (!emp) return { ok: false, error: `Não encontrei "${args.assignee_name}".` };
      assigneeId = emp.id;
    }
    let q = svc.from("tasks").select("id, title, status, priority, due_date, description, project:projects(name)")
      .eq("tenant_id", ctx.tenant_id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(Math.min(args.limit || 10, 50));
    if (assigneeId) q = q.eq("assignee_id", assigneeId);
    if (args.status && args.status !== "all") q = q.eq("status", args.status);
    if (args.overdue_only) q = q.lt("due_date", new Date().toISOString().slice(0, 10)).neq("status", "done");
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    // Enriquece para a Clara conseguir priorizar/sugerir ordem e esforço.
    const result = (data || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      project: t.project?.name ?? null,
      description: (t.description || "").slice(0, 240),
    }));
    return { ok: true, result };
  }

  if (name === "list_upcoming_meetings") {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await svc.from("meetings")
      .select("id, title, scheduled_date, scheduled_time, status")
      .eq("tenant_id", ctx.tenant_id).gte("scheduled_date", today).neq("status", "cancelled")
      .order("scheduled_date", { ascending: true }).order("scheduled_time", { ascending: true })
      .limit(Math.min(args.limit || 5, 20));
    if (error) return { ok: false, error: error.message };
    return { ok: true, result: data || [] };
  }

  return { ok: false, error: `tool de leitura desconhecida: ${name}` };
}

// Converte um Date para a data/hora de parede em America/Sao_Paulo.
function toSaoPauloWallClock(when: Date): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(when).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// ── Execução real (modo execute, após confirmação) ────────────
async function executeConfirmed(svc: any, ctx: Ctx, type: string, args: any) {
  if (type === "create_task") {
    let assigneeId: string | null = null;
    if (args.assignee_name) {
      const emp = await resolveEmployeeByName(svc, ctx.tenant_id, args.assignee_name);
      if (!emp) return { ok: false, error: `Não encontrei "${args.assignee_name}" entre os colaboradores.` };
      assigneeId = emp.id;
    }
    const { data, error } = await svc.from("tasks").insert({
      tenant_id: ctx.tenant_id,
      title: String(args.title || "Nova tarefa").slice(0, 200),
      description: args.description || null,
      assignee_id: assigneeId,
      due_date: args.due_date || null,
      priority: args.priority || "medium",
      status: "todo",
      created_by: ctx.user_id,
    }).select("id, title").single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, result: { id: data.id, title: data.title }, navigate: { label: "Ver tarefas", path: "/tarefas" } };
  }

  if (type === "create_meeting") {
    const isNow = !args.scheduled_at;
    const when = isNow ? new Date() : new Date(args.scheduled_at);
    // Converte para o horário de parede de São Paulo (evita deslocar 15h → 18h UTC).
    const { date, time } = toSaoPauloWallClock(when);
    const roomName = `meet-${crypto.randomUUID().slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;
    const { data: meeting, error } = await svc.from("meetings").insert({
      tenant_id: ctx.tenant_id,
      created_by: ctx.user_id,
      title: String(args.title || "Reunião").slice(0, 200),
      status: "scheduled",
      scheduled_date: date,
      scheduled_time: time,
      meeting_mode: "livekit",
      livekit_room_name: roomName,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };

    const attendees: any[] = [];
    if (ctx.employee_id) {
      attendees.push({ meeting_id: meeting.id, employee_id: ctx.employee_id, name: ctx.full_name, role: "required" });
    }
    const names: string[] = Array.isArray(args.attendee_names) ? args.attendee_names : [];
    const unresolved: string[] = [];
    for (const n of names) {
      const emp = await resolveEmployeeByName(svc, ctx.tenant_id, n);
      if (emp && !attendees.some((x) => x.employee_id === emp.id)) {
        attendees.push({ meeting_id: meeting.id, employee_id: emp.id, name: emp.full_name, role: "required" });
      } else if (!emp) unresolved.push(n);
    }
    if (attendees.length) {
      await svc.from("meeting_attendees").upsert(attendees, { onConflict: "meeting_id,employee_id" });
    }
    return {
      ok: true,
      result: { id: meeting.id, room_name: roomName, unresolved, when: isNow ? "agora" : args.scheduled_at },
      navigate: isNow
        ? { label: "Entrar na reunião", path: `/meet/${roomName}` }
        : { label: "Ver reuniões", path: "/reunioes" },
    };
  }

  return { ok: false, error: `tipo de ação desconhecido: ${type}` };
}

// Busca as mensagens recentes do canal (com nome do autor) para dar à Clara o
// contexto da conversa — permite perguntas como "qual documento ele citou?".
async function fetchConversation(svc: any, ctx: Ctx, channelId: string): Promise<string | null> {
  // Garante que o canal é do tenant do usuário
  const { data: ch } = await svc.from("chat_channels").select("name, tenant_id, is_dm").eq("id", channelId).maybeSingle();
  if (!ch || ch.tenant_id !== ctx.tenant_id) return null;

  const { data: msgs } = await svc
    .from("chat_messages")
    .select("author_id, content, created_at")
    .eq("channel_id", channelId)
    .eq("tenant_id", ctx.tenant_id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (!msgs?.length) return null;

  const authorIds = [...new Set(msgs.map((m: any) => m.author_id))];
  const { data: profs } = await svc.from("profiles").select("user_id, full_name").in("user_id", authorIds);
  const nameMap = new Map((profs || []).map((p: any) => [p.user_id, p.full_name || "Alguém"]));

  const lines = msgs
    .reverse()
    .map((m: any) => {
      const who = m.author_id === ctx.user_id ? `${ctx.full_name} (você)` : nameMap.get(m.author_id) || "Alguém";
      const text = (m.content || "[mídia]").replace(/\s+/g, " ").slice(0, 300);
      return `${who}: ${text}`;
    });

  const label = ch.is_dm ? "conversa direta" : `canal #${ch.name}`;
  return `CONVERSA ATUAL (${label}) — mais recente por último:\n${lines.join("\n")}`;
}

async function buildCtx(svc: any, userId: string): Promise<Ctx | null> {
  const { data: prof } = await svc.from("profiles").select("full_name, tenant_id").eq("user_id", userId).maybeSingle();
  if (!prof?.tenant_id) return null;
  const { data: emp } = await svc.from("employees").select("id").eq("tenant_id", prof.tenant_id).eq("user_id", userId).maybeSingle();
  return { user_id: userId, tenant_id: prof.tenant_id, full_name: prof.full_name || "Usuário", employee_id: emp?.id || null };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (d: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(d), { status, headers: cors });

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Sessão inválida" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const ctx = await buildCtx(svc, user.id);
    if (!ctx) return json({ error: "Tenant não resolvido" }, 400);

    const body = await req.json().catch(() => ({}));

    // ── Modo Execute (ação confirmada) ──────────────────────────
    if (body.execute) {
      const { type, args } = body.execute;
      const out = await executeConfirmed(svc, ctx, type, args || {});
      return json(out as Record<string, unknown>, out.ok ? 200 : 400);
    }

    // ── Modo Chat ───────────────────────────────────────────────
    if (!OPENROUTER_API_KEY) return json({ error: "OPENROUTER_API_KEY não configurada" }, 500);
    const message = String(body.message || "").trim();
    if (!message) return json({ error: "message obrigatório" }, 400);

    const mode = body.context?.type === "suggest_reply" ? "suggest_reply" : "chat";
    const history: any[] = Array.isArray(body.history)
      ? body.history.filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12)
      : [];

    let userContent = message;
    if (mode === "suggest_reply" && body.context?.message_text) {
      userContent = `Preciso de ajuda para responder a esta mensagem${
        body.context.author_name ? ` de ${body.context.author_name}` : ""
      }:\n\n"""${String(body.context.message_text).slice(0, 1000)}"""\n\n${message || "Me dê sugestões de resposta."}`;
    }

    // Contexto da conversa atual do canal (se houver), para a Clara "ler" o chat.
    // Usa o cliente do USUÁRIO (RLS) — só lê canais dos quais ele é membro.
    let conversationBlock: string | null = null;
    if (body.channel_id) {
      try { conversationBlock = await fetchConversation(userClient, ctx, String(body.channel_id)); } catch { /* ignora */ }
    }

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT(ctx, new Date().toISOString(), mode) },
      ...(conversationBlock
        ? [{ role: "system", content: `${conversationBlock}\n\nUse esta conversa para responder perguntas sobre o que foi dito (ex: "qual documento ele citou?"), e para criar tarefas/reuniões a partir do que foi combinado. Cite nomes quando relevante.` }]
        : []),
      ...history,
      { role: "user", content: userContent },
    ];

    const actions: Action[] = [];
    let finalText: string | null = null;

    for (let i = 0; i < 5; i++) {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://gt3.omnx.pro",
          "X-Title": "Clara",
        },
        body: JSON.stringify({
          models: OPENROUTER_MODELS,
          route: "fallback",
          messages,
          tools: TOOLS,
          tool_choice: mode === "suggest_reply" ? "none" : "auto",
          temperature: 0.5,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`OpenRouter ${resp.status}: ${t.slice(0, 200)}`);
      }
      const data = await resp.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error("Resposta vazia do modelo");

      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        finalText = (msg.content || "").trim() || "Pronto.";
        break;
      }

      messages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });
      for (const tc of toolCalls) {
        const fn = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { args = {}; }

        let toolResult: any;
        if (fn === "propose_task") {
          actions.push({ kind: "create_task", payload: args });
          toolResult = { ok: true, note: "Proposta de tarefa apresentada ao usuário para confirmação." };
        } else if (fn === "propose_meeting") {
          actions.push({ kind: "create_meeting", payload: args });
          toolResult = { ok: true, note: "Proposta de reunião apresentada ao usuário para confirmação." };
        } else if (fn === "open_item") {
          const path = buildPath(args.kind, args.id);
          if (path) {
            actions.push({ kind: "open", payload: { label: args.label || "Abrir", path } });
            toolResult = { ok: true, note: "Botão de navegação apresentado ao usuário." };
          } else {
            toolResult = { ok: false, error: "kind inválido para navegação" };
          }
        } else {
          // Reads via cliente do USUÁRIO (RLS) — a Clara só "enxerga" o que esta
          // pessoa pode ver (projetos/tarefas/documentos de que participa).
          toolResult = await runReadTool(userClient, ctx, fn, args);
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: fn,
          content: JSON.stringify(toolResult).slice(0, 4000),
        });
      }
    }

    if (!finalText) finalText = actions.length ? "Veja a sugestão abaixo." : "Pronto.";
    return json({ reply: finalText, actions });
  } catch (e: any) {
    console.error("[cami] erro:", e);
    return json({ error: e?.message || "Erro interno" }, 500);
  }
});
