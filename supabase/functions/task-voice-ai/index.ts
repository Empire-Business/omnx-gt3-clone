// Edge Function: task-voice-ai
// Recebe um áudio gravado pelo usuário, transcreve e estrutura uma TAREFA.
//
// Fluxo: áudio (base64) → modelo multimodal via OpenRouter → JSON com título,
// briefing detalhado, prioridade, prazo, responsáveis e checklist. A função NÃO
// cria a tarefa: devolve um rascunho para o usuário revisar e confirmar no
// frontend.
//
// A resolução de responsáveis/projeto é feita aqui (server-side), casando os
// nomes ditos no áudio contra os colaboradores e projetos do tenant.
//
// v8.36.0 — A descrição deixou de ser um resumo. O modelo agora devolve um
// BRIEFING estruturado (objetivo, contexto, passos detalhados, critérios de
// aceite, riscos, dúvidas em aberto) e a `description` final é MONTADA AQUI a
// partir desses campos. Montar server-side é o que garante o detalhamento:
// enquanto dependia de o modelo "escrever bonito" num único campo de texto, ele
// resumia. O formato é TEXTO PURO com seções — o front renderiza a descrição
// com `whitespace-pre-wrap` e NÃO interpreta markdown
// (src/components/shared/TaskDetailModal.tsx), então `**negrito**` e `#`
// apareceriam como lixo literal na tela.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Modelos que aceitam input_audio HOJE no OpenRouter (mesma lista do feed).
// Tentamos em ordem. Conferir em https://openrouter.ai/api/v1/models antes de
// mexer: IDs saem do ar sem aviso (gemini-2.0-flash-001 e gpt-4o-audio-preview
// morreram e derrubaram a tarefa por voz).
const MODELS = [
  "google/gemini-3.5-flash",
  "google/gemini-2.5-flash",
  "openai/gpt-audio",
];

// ~15 MB de base64 ≈ 11 MB de áudio — mais que suficiente para alguns minutos
// de opus e evita estourar memória da função.
const MAX_BASE64_LENGTH = 15 * 1024 * 1024;

// Um briefing detalhado ocupa espaço. Sem teto explícito o provedor corta a
// resposta no meio do JSON e o parse falha como se o modelo tivesse errado.
const MAX_OUTPUT_TOKENS = 8000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeFormat(mime?: string | null): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("mp3") || m.includes("mpeg")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  return "webm";
}

// Remove acentos e caixa para casar nomes ditos no áudio ("bruno andrease")
// contra o cadastro ("Bruno Andrease").
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchByName<T extends { id: string; name: string }>(
  spoken: string,
  candidates: T[],
): T | null {
  const target = slug(spoken);
  if (!target) return null;

  // 1) igualdade exata
  const exact = candidates.find((c) => slug(c.name) === target);
  if (exact) return exact;

  // 2) o nome cadastrado começa com o que foi dito (primeiro nome, ex: "davi")
  const prefix = candidates.filter((c) => slug(c.name).startsWith(`${target} `) || slug(c.name) === target);
  if (prefix.length === 1) return prefix[0];

  // 3) contém — só aceita quando não é ambíguo
  const contains = candidates.filter((c) => slug(c.name).includes(target));
  if (contains.length === 1) return contains[0];

  // 4) qualquer palavra do nome bate exatamente (ex: sobrenome único)
  const byToken = candidates.filter((c) => slug(c.name).split(" ").includes(target));
  if (byToken.length === 1) return byToken[0];

  return null;
}

const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const EFFORTS = new Set(["small", "medium", "large", "extra_large"]);
const EFFORT_LABELS: Record<string, string> = {
  small: "Pequeno (até algumas horas)",
  medium: "Médio (1 a 2 dias)",
  large: "Grande (alguns dias)",
  extra_large: "Muito grande (uma semana ou mais)",
};

function buildPrompt(params: {
  today: string;
  employeeNames: string[];
  projectNames: string[];
  requesterName: string;
}): string {
  return [
    "Você é um gerente de projetos sênior brasileiro. Você recebe um áudio em português do Brasil no qual uma pessoa dita, de forma solta e informal, uma tarefa de trabalho.",
    "Sua função é transcrever fielmente e transformar essa fala em um BRIEFING DE EXECUÇÃO completo, didático e destrinchado — do tipo que uma pessoa que NÃO participou da conversa consegue pegar e executar sozinha, sem precisar perguntar nada.",
    "",
    "==== O ERRO QUE VOCÊ NÃO PODE COMETER ====",
    "Resumir. Devolver uma frase curta repetindo o que foi dito é FALHA GRAVE.",
    "Quem grava 30 segundos de áudio espera receber uma tarefa DESTRINCHADA, não uma transcrição encurtada.",
    "Seja generoso, explicativo e minucioso: explique o objetivo, o contexto, cada passo, como saber que ficou pronto e o que pode dar errado.",
    "",
    "==== EXPANDIR SIM, INVENTAR NÃO ====",
    "Existe uma diferença que você precisa respeitar com rigor:",
    "- EXPANDIR (obrigatório): destrinchar em passos, explicar o COMO de algo que foi pedido, tornar explícito o que estava implícito, escrever com clareza didática, sugerir a ordem lógica de execução.",
    "- INVENTAR (proibido): criar fatos que não existem — nomes, números, valores, datas, prazos, clientes, ferramentas ou responsáveis que não foram ditos.",
    "Quando algo for dedução sua e não fala literal, marque com o prefixo \"Sugestão:\".",
    "Quando faltar informação essencial para executar, NÃO chute: registre em open_questions como pergunta a confirmar.",
    "",
    "==== REGRAS ====",
    "1. Mantenha nomes próprios, siglas, produtos, ferramentas e jargões exatamente como foram ditos.",
    "2. Escreva em português brasileiro, com acentuação correta e frases completas.",
    "3. NÃO use markdown (nada de **, ##, crases). O sistema exibe texto puro — markdown aparece como lixo na tela.",
    "4. Se prazo, responsável ou projeto não foram ditos, deixe o campo nulo/vazio — não preencha por conta própria.",
    `5. Hoje é ${params.today} (fuso America/Sao_Paulo). Use isso para resolver prazos relativos como "amanhã", "sexta", "daqui a duas semanas".`,
    `6. Quem está ditando é: ${params.requesterName}. Se a pessoa disser "pra mim", "eu faço" ou "deixa comigo", o responsável é ela.`,
    "7. Se a pessoa não indicar urgência, use \"medium\".",
    "",
    params.employeeNames.length > 0
      ? `Colaboradores da empresa (use exatamente estes nomes ao preencher assignee_names): ${params.employeeNames.join("; ")}`
      : "Não há lista de colaboradores disponível — deixe assignee_names vazio.",
    params.projectNames.length > 0
      ? `Projetos existentes (use exatamente estes nomes em project_name): ${params.projectNames.join("; ")}`
      : "Não há lista de projetos disponível — deixe project_name nulo.",
    "",
    "==== FORMATO DA RESPOSTA ====",
    "Responda APENAS com um objeto JSON válido, sem markdown, sem cercas de código:",
    "{",
    '  "transcription": "transcrição literal e completa do áudio, sem cortes",',
    '  "title": "título curto e acionável, no imperativo, até 80 caracteres",',
    '  "objective": "1 a 3 frases dizendo o RESULTADO esperado — o que estará diferente quando a tarefa terminar. Não é o passo a passo, é o porquê.",',
    '  "context": "parágrafo explicando a situação por trás do pedido: o que motivou, o que já existe hoje, qual problema resolve, quem é afetado. Use tudo que o áudio deu de pano de fundo. Mínimo 2 frases.",',
    '  "steps": [',
    '    { "title": "nome curto da etapa", "detail": "explicação didática da etapa: o que fazer, onde, como, com o que tomar cuidado. 2 a 4 frases. Escreva para alguém que nunca fez isso antes." }',
    "  ],",
    '  "acceptance_criteria": ["condições objetivas e verificáveis de pronto — cada uma checável com sim ou não"],',
    '  "resources": ["pessoas, sistemas, acessos, arquivos ou ferramentas necessários, se mencionados ou claramente implícitos"],',
    '  "risks": ["o que pode dar errado, dependências, bloqueios e pontos de atenção"],',
    '  "open_questions": ["informações que faltam e precisam ser confirmadas antes ou durante a execução"],',
    '  "effort_estimate": "small" | "medium" | "large" | "extra_large",',
    '  "priority": "low" | "medium" | "high" | "urgent",',
    '  "due_date": "YYYY-MM-DD ou null",',
    '  "assignee_names": ["nomes exatamente como na lista de colaboradores"],',
    '  "project_name": "nome exato de um projeto da lista ou null",',
    '  "checklist_items": ["itens curtos e marcáveis, um por etapa executável — espelhe os steps em formato de checkbox"]',
    "}",
    "",
    "==== CALIBRAGEM DE VOLUME ====",
    "- steps: no mínimo 3, idealmente de 4 a 8. Se o áudio descreve uma única ação, quebre-a em preparação, execução e verificação.",
    "- acceptance_criteria: de 2 a 5 itens.",
    "- checklist_items: entre 3 e 15, sempre coerentes com os steps.",
    "- risks e open_questions: podem ficar vazios se o áudio realmente não der margem — mas pense antes; quase sempre há uma dependência ou uma informação faltando.",
    "- context e objective NUNCA ficam vazios.",
  ].join("\n");
}

function extractJson(raw: string): Record<string, unknown> {
  let text = raw.trim();
  // Remove cercas de código, caso o modelo desobedeça.
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    // Sem o conteúdo bruto no log, "não devolveu JSON" não diz nada — foi
    // exatamente o que atrasou o diagnóstico do formato de áudio errado.
    console.warn("[task-voice-ai] resposta não-JSON do modelo:", text.slice(0, 300));
    throw new Error("O modelo não devolveu JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function callOpenRouter(
  model: string,
  base64: string,
  format: string,
  prompt: string,
): Promise<Record<string, unknown>> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://gt3.omnx.pro",
      "X-Title": "OMNX GT3 - Task Voice AI",
    },
    body: JSON.stringify({
      model,
      // 0.4 em vez de 0.2: o briefing precisa de redação fluida. Os fatos vêm
      // do áudio; a temperatura afeta a escrita, não o conteúdo.
      temperature: 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "input_audio", input_audio: { data: base64, format } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Resposta vazia do modelo");
  }
  return extractJson(content);
}

// ── Saneamento de listas vindas do modelo ──────────────────────────────
function stringList(value: unknown, maxItems: number, maxLen = 500): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i: unknown): i is string => typeof i === "string" && i.trim().length > 0)
    .map((i: string) => i.trim().slice(0, maxLen))
    .slice(0, maxItems);
}

interface Step {
  title: string;
  detail: string;
}

function stepList(value: unknown, maxItems = 12): Step[] {
  if (!Array.isArray(value)) return [];
  const out: Step[] = [];
  for (const raw of value) {
    // Aceita tanto {title, detail} quanto string solta — modelos alternam entre
    // os dois formatos e perder os passos por causa disso seria absurdo.
    if (typeof raw === "string" && raw.trim()) {
      out.push({ title: raw.trim().slice(0, 200), detail: "" });
    } else if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const detail = typeof o.detail === "string" ? o.detail.trim() : "";
      if (title || detail) {
        out.push({
          title: (title || detail).slice(0, 200),
          detail: title ? detail.slice(0, 1200) : "",
        });
      }
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Monta a descrição final em TEXTO PURO com seções.
 *
 * O detalhamento é garantido aqui, não na boa vontade do modelo: cada campo
 * estruturado vira uma seção. Seções vazias somem — tarefa simples não ganha
 * cabeçalho vazio.
 *
 * Nada de markdown: `TaskDetailModal` renderiza com `whitespace-pre-wrap` e só
 * interpreta imagens, @menções e links.
 */
function composeDescription(parts: {
  objective: string;
  context: string;
  steps: Step[];
  acceptance: string[];
  resources: string[];
  risks: string[];
  questions: string[];
  effort: string;
  transcription: string;
}): string {
  const blocks: string[] = [];

  if (parts.objective) blocks.push(`🎯 OBJETIVO\n${parts.objective}`);
  if (parts.context) blocks.push(`📌 CONTEXTO\n${parts.context}`);

  if (parts.steps.length > 0) {
    const lines = parts.steps.map((s, i) => {
      const head = `${i + 1}. ${s.title}`;
      // Indenta o detalhe para o passo continuar legível sem markdown.
      return s.detail ? `${head}\n   ${s.detail.replace(/\n+/g, "\n   ")}` : head;
    });
    blocks.push(`🧭 COMO EXECUTAR\n${lines.join("\n\n")}`);
  }

  if (parts.acceptance.length > 0) {
    blocks.push(
      `✅ CRITÉRIOS DE ACEITE (como saber que está pronto)\n${parts.acceptance.map((c) => `• ${c}`).join("\n")}`,
    );
  }
  if (parts.resources.length > 0) {
    blocks.push(`🧰 O QUE VOCÊ VAI PRECISAR\n${parts.resources.map((r) => `• ${r}`).join("\n")}`);
  }
  if (parts.risks.length > 0) {
    blocks.push(`⚠️ PONTOS DE ATENÇÃO\n${parts.risks.map((r) => `• ${r}`).join("\n")}`);
  }
  if (parts.questions.length > 0) {
    blocks.push(`❓ A CONFIRMAR ANTES DE EXECUTAR\n${parts.questions.map((q) => `• ${q}`).join("\n")}`);
  }
  if (parts.effort) {
    blocks.push(`⏱️ ESFORÇO ESTIMADO\n${EFFORT_LABELS[parts.effort] ?? parts.effort}`);
  }
  if (parts.transcription) {
    // A transcrição era gerada e descartada silenciosamente. Guardá-la aqui dá
    // rastreabilidade: quem executa confere o que foi realmente dito.
    blocks.push(`🎙️ TRANSCRIÇÃO DO ÁUDIO ORIGINAL\n"${parts.transcription}"`);
  }

  return blocks.join("\n\n———\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!OPENROUTER_API_KEY) {
      return jsonResponse({ error: "OPENROUTER_API_KEY não configurada" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autenticado" }, 401);

    // Cliente com a sessão do usuário: tudo abaixo respeita RLS do tenant dele.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return jsonResponse({ error: "Sessão inválida" }, 401);
    }

    const { data: profile } = await userClient
      .from("profiles")
      .select("tenant_id, full_name")
      .eq("user_id", userRes.user.id)
      .maybeSingle();

    const tenantId = profile?.tenant_id;
    if (!tenantId) return jsonResponse({ error: "Tenant não identificado" }, 403);

    const body = await req.json().catch(() => ({}));
    const audioBase64: string | undefined = body?.audio_base64;
    const mime: string | undefined = body?.mime;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return jsonResponse({ error: "audio_base64 obrigatório" }, 400);
    }
    if (audioBase64.length > MAX_BASE64_LENGTH) {
      return jsonResponse({ error: "Áudio muito longo. Grave no máximo ~3 minutos." }, 413);
    }

    // Contexto do tenant para o modelo casar nomes ditos no áudio.
    // O nome do colaborador vive em `profiles`; `organograma_view` é a leitura
    // canônica que já junta os dois (mesma fonte usada por useEmployees/useTasks).
    const [employeesRes, projectsRes] = await Promise.all([
      userClient
        .from("organograma_view")
        .select("employee_id, full_name")
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
      userClient
        .from("projects")
        .select("id, name")
        .eq("tenant_id", tenantId),
    ]);

    const employees = (employeesRes.data || [])
      .filter((e: { employee_id: string | null; full_name: string | null }) => !!e.employee_id && !!e.full_name)
      .map((e: { employee_id: string; full_name: string }) => ({ id: e.employee_id, name: e.full_name }));
    const projects = (projectsRes.data || [])
      .filter((p: { name: string | null }) => !!p.name)
      .map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const prompt = buildPrompt({
      today,
      employeeNames: employees.map((e) => e.name),
      projectNames: projects.map((p) => p.name),
      requesterName: profile?.full_name || "o usuário",
    });

    const format = normalizeFormat(mime);
    let parsed: Record<string, unknown> | null = null;
    let usedModel = "";
    let lastError: unknown = null;
    for (const model of MODELS) {
      try {
        parsed = await callOpenRouter(model, audioBase64, format, prompt);
        usedModel = model;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[task-voice-ai] modelo ${model} falhou:`, err);
      }
    }

    if (!parsed) {
      return jsonResponse(
        {
          error: `Nenhum modelo conseguiu processar o áudio: ${
            (lastError as Error)?.message ?? "erro desconhecido"
          }`,
        },
        502,
      );
    }

    // ── Saneamento: nada do modelo vai cru para o frontend ──────────
    const title = String(parsed.title || "").trim().slice(0, 200);
    if (!title) {
      return jsonResponse({ error: "Não consegui entender uma tarefa nesse áudio. Tente de novo." }, 422);
    }

    const rawPriority = String(parsed.priority || "medium").toLowerCase();
    const priority = PRIORITIES.has(rawPriority) ? rawPriority : "medium";

    const rawEffort = String(parsed.effort_estimate || "").toLowerCase();
    const effort_estimate = EFFORTS.has(rawEffort) ? rawEffort : "";

    const rawDue = typeof parsed.due_date === "string" ? parsed.due_date.trim() : "";
    const due_date = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null;

    const spokenNames: string[] = Array.isArray(parsed.assignee_names)
      ? parsed.assignee_names.filter((n: unknown): n is string => typeof n === "string")
      : [];
    const matchedAssignees = spokenNames
      .map((n) => matchByName(n, employees))
      .filter((e): e is { id: string; name: string } => !!e);
    const assignee_ids = [...new Set(matchedAssignees.map((e) => e.id))];
    const unmatched_assignees = spokenNames.filter((n) => !matchByName(n, employees));

    const spokenProject = typeof parsed.project_name === "string" ? parsed.project_name : "";
    const matchedProject = spokenProject ? matchByName(spokenProject, projects) : null;

    const transcription = String(parsed.transcription || "").trim();
    const objective = String(parsed.objective || "").trim();
    const context = String(parsed.context || "").trim();
    const steps = stepList(parsed.steps);
    const acceptance_criteria = stringList(parsed.acceptance_criteria, 8);
    const resources = stringList(parsed.resources, 10, 300);
    const risks = stringList(parsed.risks, 8);
    const open_questions = stringList(parsed.open_questions, 8);

    // Checklist: o modelo às vezes devolve vazio mesmo com steps ricos. Nesse
    // caso derivamos dos próprios passos — a tarefa nunca chega sem nada
    // marcável quando existe um plano de execução.
    let checklist_items = stringList(parsed.checklist_items, 30, 300)
      .map((text: string) => ({ text, checked: false }));
    if (checklist_items.length === 0 && steps.length > 0) {
      checklist_items = steps.map((s) => ({ text: s.title.slice(0, 300), checked: false }));
    }

    // Se o modelo ignorar os campos estruturados, ainda aproveitamos o que ele
    // escreveu em `description` — melhor uma descrição simples que nenhuma.
    const composed = composeDescription({
      objective,
      context,
      steps,
      acceptance: acceptance_criteria,
      resources,
      risks,
      questions: open_questions,
      effort: effort_estimate,
      transcription,
    });
    const fallbackDescription = String(parsed.description || "").trim();
    const description = composed || fallbackDescription;

    return jsonResponse({
      transcription,
      title,
      description,
      // Os campos estruturados também vão crus: o front pode passar a exibi-los
      // em blocos próprios sem precisar reparsear o texto montado.
      objective,
      context,
      steps,
      acceptance_criteria,
      resources,
      risks,
      open_questions,
      effort_estimate,
      priority,
      due_date,
      assignee_ids,
      assignee_names: matchedAssignees.map((e) => e.name),
      unmatched_assignees,
      project_id: matchedProject?.id ?? null,
      project_name: matchedProject?.name ?? null,
      checklist_items,
      model: usedModel,
    });
  } catch (err) {
    console.error("[task-voice-ai] erro:", err);
    return jsonResponse({ error: (err as Error).message ?? "Erro interno" }, 500);
  }
});
