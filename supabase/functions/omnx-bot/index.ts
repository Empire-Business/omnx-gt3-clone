// OMNX Bot — assistente operacional com tool-calling via OpenRouter.
// Recebe { channel_id, message } com JWT do usuário, executa tools server-side
// (criar tarefa, agendar mensagem, criar reunião, listar tarefas/reuniões) e
// posta a resposta como mensagem do bot no canal.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

const OPENROUTER_MODELS = ["anthropic/claude-haiku-4.5", "google/gemini-2.0-flash-001", "anthropic/claude-3-haiku"];

const SYSTEM_PROMPT = (ctx: {
  user_name: string;
  position?: string | null;
  team?: string | null;
  today_iso: string;
  tz?: string;
}) => `Você é o OMNX Bot, assistente operacional do OMNX GT3.

Usuário atual: ${ctx.user_name}${ctx.position ? ` (${ctx.position}${ctx.team ? `, ${ctx.team}` : ""})` : ""}.
Data/hora atual (ISO): ${ctx.today_iso}${ctx.tz ? ` — fuso ${ctx.tz}` : ""}.

REGRAS:
- Responda SEMPRE em português do Brasil, conciso e objetivo.
- Quando o usuário pedir uma ação operacional (criar tarefa, agendar mensagem, marcar reunião, consultar dados), CHAME a tool correspondente em vez de descrever o que faria.
- Para datas/horas relativas ("amanhã 9h", "sexta 14h", "daqui 2h"), CONVERTA para ISO 8601 absoluto antes de chamar a tool, usando a data atual como referência.
- Se faltar informação obrigatória (ex: título da tarefa, destinatário da mensagem), pergunte UMA pergunta curta antes de agir.
- Nunca invente employee_id, channel_id ou nomes — use as tools de busca primeiro se precisar resolver alguém pelo nome.
- Após executar uma tool com sucesso, confirme em uma frase curta (ex: "Tarefa criada ✓").
- Use markdown leve quando ajudar a leitura: listas, **negrito**, \`código\`.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Cria uma tarefa no sistema. Use quando o usuário pedir para criar tarefa/atividade/to-do.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título curto da tarefa" },
          description: { type: "string", description: "Descrição opcional, mais detalhada" },
          assignee_name: { type: "string", description: "Nome (ou parte) do responsável. Será resolvido para employee_id." },
          due_date: { type: "string", description: "Data limite no formato YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_message",
      description: "Agenda uma mensagem para ser enviada em horário futuro a alguém ou a um canal.",
      parameters: {
        type: "object",
        properties: {
          recipient_name: { type: "string", description: "Nome (ou parte) da pessoa destinatária. Use isso OU channel_name." },
          channel_name: { type: "string", description: "Nome do canal de destino. Use isso OU recipient_name." },
          content: { type: "string", description: "Texto da mensagem" },
          send_at: { type: "string", description: "Quando enviar — ISO 8601 (ex: 2026-05-02T14:00:00-03:00)" },
        },
        required: ["content", "send_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_meeting",
      description: "Cria uma reunião (sala LiveKit). Use scheduled_at no futuro para agendar; omita para começar agora.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da reunião" },
          scheduled_at: { type: "string", description: "ISO 8601 quando agendar (opcional). Se omitido, começa agora." },
          attendee_names: {
            type: "array",
            items: { type: "string" },
            description: "Nomes (ou parte) das pessoas convidadas. Serão resolvidos para employee_id.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_tasks",
      description: "Lista tarefas do usuário atual (ou de outra pessoa, se especificada). Útil para perguntas tipo 'o que tenho hoje?', 'tarefas atrasadas'.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["todo", "in_progress", "done", "all"], default: "all" },
          overdue_only: { type: "boolean", default: false },
          assignee_name: { type: "string", description: "Se quiser ver de outra pessoa" },
          limit: { type: "number", default: 10 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_upcoming_meetings",
      description: "Lista próximas reuniões do tenant (até 10).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", default: 5 },
        },
      },
    },
  },
];

interface UserContext {
  user_id: string;
  tenant_id: string;
  full_name: string;
  position_title?: string | null;
  area_name?: string | null;
  employee_id?: string | null;
}

async function resolveEmployeeByName(svc: any, tenantId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Tenta match por nome inteiro (case-insensitive)
  const { data } = await svc
    .from("employees")
    .select("id, user_id, full_name, email")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .ilike("full_name", `%${trimmed.replace(/[%_]/g, "\\$&")}%`)
    .limit(5);
  if (!data || data.length === 0) return null;
  // Se houver match exato pelo primeiro nome, prefere
  const lc = trimmed.toLowerCase();
  const exact = data.find((e: any) =>
    (e.full_name || "").toLowerCase().split(/\s+/)[0] === lc
  );
  return exact || data[0];
}

async function executeTool(svc: any, ctx: UserContext, tool: { name: string; args: any }): Promise<{ ok: boolean; result?: any; error?: string }> {
  try {
    if (tool.name === "create_task") {
      const a = tool.args || {};
      let assigneeId: string | null = null;
      if (a.assignee_name) {
        const emp = await resolveEmployeeByName(svc, ctx.tenant_id, a.assignee_name);
        if (!emp) return { ok: false, error: `Não encontrei "${a.assignee_name}" entre os colaboradores ativos.` };
        assigneeId = emp.id;
      }
      const { data, error } = await svc
        .from("tasks")
        .insert({
          tenant_id: ctx.tenant_id,
          title: String(a.title).slice(0, 200),
          description: a.description || null,
          assignee_id: assigneeId,
          due_date: a.due_date || null,
          priority: a.priority || "medium",
          status: "todo",
          created_by: ctx.user_id,
        })
        .select()
        .single();
      if (error) throw error;
      return { ok: true, result: { id: data.id, title: data.title, assignee_id: assigneeId } };
    }

    if (tool.name === "schedule_message") {
      const a = tool.args || {};
      let channelId: string | null = null;
      let recipientUserId: string | null = null;
      if (a.recipient_name) {
        const emp = await resolveEmployeeByName(svc, ctx.tenant_id, a.recipient_name);
        if (!emp) return { ok: false, error: `Não encontrei "${a.recipient_name}".` };
        recipientUserId = emp.user_id || null;
      } else if (a.channel_name) {
        const { data: ch } = await svc
          .from("chat_channels")
          .select("id")
          .eq("tenant_id", ctx.tenant_id)
          .ilike("name", a.channel_name.replace(/^#/, "").trim())
          .maybeSingle();
        if (!ch) return { ok: false, error: `Canal "${a.channel_name}" não encontrado.` };
        channelId = ch.id;
      } else {
        return { ok: false, error: "Especifique recipient_name OU channel_name." };
      }
      const { data, error } = await svc
        .from("scheduled_messages")
        .insert({
          tenant_id: ctx.tenant_id,
          created_by: ctx.user_id,
          channel_id: channelId,
          recipient_user_id: recipientUserId,
          content: String(a.content).slice(0, 4000),
          send_at: a.send_at,
        })
        .select()
        .single();
      if (error) throw error;
      return { ok: true, result: { id: data.id, send_at: data.send_at } };
    }

    if (tool.name === "create_meeting") {
      const a = tool.args || {};
      const isNow = !a.scheduled_at;
      const when = isNow ? new Date() : new Date(a.scheduled_at);
      const date = when.toISOString().slice(0, 10);
      const time = `${String(when.getUTCHours()).padStart(2, "0")}:${String(when.getUTCMinutes()).padStart(2, "0")}`;
      const roomName = `meet-${crypto.randomUUID().slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;
      const { data: meeting, error } = await svc
        .from("meetings")
        .insert({
          tenant_id: ctx.tenant_id,
          created_by: ctx.user_id,
          title: String(a.title).slice(0, 200),
          status: "scheduled",
          scheduled_date: date,
          scheduled_time: time,
          meeting_mode: "livekit",
          livekit_room_name: roomName,
        })
        .select()
        .single();
      if (error) throw error;
      const attendees: any[] = [];
      if (ctx.employee_id) {
        attendees.push({
          meeting_id: meeting.id,
          employee_id: ctx.employee_id,
          name: ctx.full_name,
          role: "required",
        });
      }
      const names: string[] = Array.isArray(a.attendee_names) ? a.attendee_names : [];
      const unresolved: string[] = [];
      for (const n of names) {
        const emp = await resolveEmployeeByName(svc, ctx.tenant_id, n);
        if (emp && !attendees.some((x) => x.employee_id === emp.id)) {
          attendees.push({ meeting_id: meeting.id, employee_id: emp.id, name: emp.full_name, role: "required" });
        } else if (!emp) {
          unresolved.push(n);
        }
      }
      if (attendees.length > 0) {
        await svc
          .from("meeting_attendees")
          .upsert(attendees, { onConflict: "meeting_id,employee_id", ignoreDuplicates: false });
      }
      return {
        ok: true,
        result: {
          id: meeting.id,
          room_name: roomName,
          when: isNow ? "agora" : a.scheduled_at,
          attendees_added: attendees.length,
          unresolved,
        },
      };
    }

    if (tool.name === "list_my_tasks") {
      const a = tool.args || {};
      let assigneeId = ctx.employee_id;
      if (a.assignee_name) {
        const emp = await resolveEmployeeByName(svc, ctx.tenant_id, a.assignee_name);
        if (!emp) return { ok: false, error: `Não encontrei "${a.assignee_name}".` };
        assigneeId = emp.id;
      }
      let q = svc
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .eq("tenant_id", ctx.tenant_id)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(Math.min(a.limit || 10, 50));
      if (assigneeId) q = q.eq("assignee_id", assigneeId);
      if (a.status && a.status !== "all") q = q.eq("status", a.status);
      if (a.overdue_only) q = q.lt("due_date", new Date().toISOString().slice(0, 10)).neq("status", "done");
      const { data, error } = await q;
      if (error) throw error;
      return { ok: true, result: data || [] };
    }

    if (tool.name === "list_upcoming_meetings") {
      const a = tool.args || {};
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await svc
        .from("meetings")
        .select("id, title, scheduled_date, scheduled_time, livekit_room_name, status")
        .eq("tenant_id", ctx.tenant_id)
        .gte("scheduled_date", today)
        .neq("status", "cancelled")
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true })
        .limit(Math.min(a.limit || 5, 20));
      if (error) throw error;
      return { ok: true, result: data || [] };
    }

    return { ok: false, error: `Tool desconhecida: ${tool.name}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function postBotMessage(svc: any, channelId: string, tenantId: string, botUserId: string, content: string, parentId?: string | null) {
  await svc.from("chat_messages").insert({
    channel_id: channelId,
    tenant_id: tenantId,
    author_id: botUserId,
    content,
    ...(parentId ? { parent_id: parentId } : {}),
  });
}

serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY não configurada" }), { status: 500, headers: cors });
    }
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: cors });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: cors });

    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const { channel_id, message } = body || {};
    if (!channel_id || !message?.trim()) {
      return new Response(JSON.stringify({ error: "channel_id e message são obrigatórios" }), { status: 400, headers: cors });
    }

    // Hidrata contexto do usuário
    const { data: prof } = await svc.from("profiles").select("full_name, tenant_id").eq("id", user.id).maybeSingle();
    if (!prof?.tenant_id) {
      return new Response(JSON.stringify({ error: "Tenant não resolvido" }), { status: 400, headers: cors });
    }
    const { data: emp } = await svc
      .from("employees")
      .select("id, position_title, area_name, subarea_name")
      .eq("tenant_id", prof.tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();
    const ctx: UserContext = {
      user_id: user.id,
      tenant_id: prof.tenant_id,
      full_name: prof.full_name || "Usuário",
      position_title: emp?.position_title || null,
      area_name: emp?.subarea_name || emp?.area_name || null,
      employee_id: emp?.id || null,
    };

    // Resolve o bot user_id do tenant (cria se ainda não existir)
    const { data: botUserId, error: botErr } = await svc.rpc("ensure_omnx_bot", { p_tenant_id: ctx.tenant_id });
    if (botErr || !botUserId) throw new Error("Falha ao resolver OMNX Bot: " + (botErr?.message || "id vazio"));

    // Histórico recente do canal (últimas 10 mensagens) para contexto
    const { data: history } = await svc
      .from("chat_messages")
      .select("author_id, content, created_at")
      .eq("channel_id", channel_id)
      .eq("tenant_id", ctx.tenant_id)
      .order("created_at", { ascending: false })
      .limit(10);
    const historyMessages = (history || [])
      .reverse()
      .map((m: any) => ({
        role: m.author_id === botUserId ? "assistant" : "user",
        content: m.content || "",
      }));

    // Loop de tool-calling (até 5 iterações)
    const messages: any[] = [
      {
        role: "system",
        content: SYSTEM_PROMPT({
          user_name: ctx.full_name,
          position: ctx.position_title,
          team: ctx.area_name,
          today_iso: new Date().toISOString(),
          tz: "America/Sao_Paulo",
        }),
      },
      ...historyMessages,
      { role: "user", content: message },
    ];

    let finalText: string | null = null;
    for (let i = 0; i < 5; i++) {
      const llmResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://gt3.omnx.pro",
          "X-Title": "OMNX Bot",
        },
        body: JSON.stringify({
          models: OPENROUTER_MODELS,
          route: "fallback",
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0.4,
        }),
      });
      if (!llmResp.ok) {
        const errText = await llmResp.text();
        throw new Error(`OpenRouter ${llmResp.status}: ${errText.slice(0, 200)}`);
      }
      const llmData = await llmResp.json();
      const choice = llmData.choices?.[0];
      const msg = choice?.message;
      if (!msg) throw new Error("Resposta vazia do modelo");

      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        finalText = (msg.content || "").trim() || "Ok.";
        break;
      }

      // Adiciona a msg do assistant com as tool_calls e executa cada uma
      messages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });
      for (const tc of toolCalls) {
        const fnName = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { args = {}; }
        const result = await executeTool(svc, ctx, { name: fnName, args });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: fnName,
          content: JSON.stringify(result).slice(0, 4000),
        });
      }
    }

    if (!finalText) finalText = "Operação concluída.";
    await postBotMessage(svc, channel_id, ctx.tenant_id, botUserId as string, finalText);

    return new Response(JSON.stringify({ ok: true, reply: finalText }), { headers: cors });
  } catch (e: any) {
    console.error("[omnx-bot] erro:", e);
    // Tenta postar mensagem de erro no canal
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const svc = createClient(SUPABASE_URL, SERVICE_KEY);
      const body = await req.clone().json().catch(() => ({}));
      const { channel_id } = body || {};
      const { data: prof } = channel_id
        ? await svc.from("chat_channels").select("tenant_id").eq("id", channel_id).maybeSingle()
        : { data: null };
      if (channel_id && prof?.tenant_id) {
        const { data: botId } = await svc.rpc("ensure_omnx_bot", { p_tenant_id: prof.tenant_id });
        if (botId) {
          await postBotMessage(svc, channel_id, prof.tenant_id, botId as string, `Tive um problema: ${e?.message || "erro desconhecido"}`);
        }
      }
    } catch { /* ignora */ }
    return new Response(JSON.stringify({ error: e?.message || "Erro interno" }), { status: 500, headers: cors });
  }
});
