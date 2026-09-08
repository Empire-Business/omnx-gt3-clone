// meeting-ai v8.10.6 — Modelo principal Qwen3 Max + fallback Gemini 3 Flash.
// Prompts reforçados para extração exaustiva e schema com subtarefas estruturadas.
// Mantém compat com chamadas antigas (mode: correction; default: process).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://t3.empirebusiness.com.br",
  "https://gt3.empirebusiness.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

// ==================== LLM CALL COM RETRY/BACKOFF/TIMEOUT ====================
// Ordem de tentativa: principal primeiro; fallbacks em sequência caso o anterior falhe.
// IDs seguem a convenção OpenRouter — confira em https://openrouter.ai/models
// caso precise ajustar.
const OPENROUTER_MODELS = [
  "qwen/qwen3-max",                    // 1º — principal (extração exaustiva)
  "google/gemini-3-flash",             // 2º — fallback rápido
  "google/gemini-2.0-flash-001",       // 3º — fallback estável legado
  "anthropic/claude-sonnet-4",         // 4º — último recurso
];

const LLM_TIMEOUT_MS = 180_000;         // 180s por chamada (consolidação de 2h+ pode ser pesada)
const LLM_MAX_RETRIES = 3;              // por modelo
const LLM_BACKOFF_BASE_MS = 1_500;
const LLM_MAX_OUTPUT_TOKENS = 16_000;   // garante resposta completa em consolidações grandes
const CHUNK_CONCURRENCY = 2;            // chunks paralelos (evita rate limit)
const CHUNK_SIZE = 18_000;              // ~6 min de transcrição
const CHUNK_OVERLAP = 1_500;
const REDUCE_BATCH_SIZE = 4;            // se >4 chunks, reduz em batches (menor = menos truncamento)
const REDUCE_INPUT_LIMIT = 200_000;     // ~200KB por batch reduce
const CONSOLIDATE_INPUT_LIMIT = 300_000;// ~300KB para consolidação final

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function callLLMOnce(
  apiKey: string,
  model: string,
  messages: any[],
  tools?: any[],
  toolChoice?: any,
): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const body: any = {
      model,
      messages,
      temperature: 0.3,
      max_tokens: LLM_MAX_OUTPUT_TOKENS,
    };
    if (tools) body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (res.ok) return await res.json();
    const errText = await res.text();
    const err: any = new Error(`Model ${model} failed (${res.status}): ${errText.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callLLM(apiKey: string, messages: any[], tools?: any[], toolChoice?: any): Promise<any> {
  let lastErr: any;
  for (const model of OPENROUTER_MODELS) {
    for (let attempt = 0; attempt < LLM_MAX_RETRIES; attempt++) {
      try {
        return await callLLMOnce(apiKey, model, messages, tools, toolChoice);
      } catch (e: any) {
        lastErr = e;
        const status = e?.status;
        const retriable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || e?.name === "AbortError";
        console.error(`[LLM] ${model} attempt ${attempt + 1} failed: ${e?.message || e}`);
        if (!retriable) break;                       // próximo modelo
        await sleep(LLM_BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 500);
      }
    }
  }
  throw lastErr || new Error("All LLM models failed");
}

// ==================== CHUNKING ====================
interface TranscriptChunk { index: number; content: string; isLast: boolean; }

function chunkTranscript(transcript: string): TranscriptChunk[] {
  if (transcript.length <= CHUNK_SIZE) {
    return [{ index: 0, content: transcript, isLast: true }];
  }
  const chunks: TranscriptChunk[] = [];
  let position = 0;
  let chunkIndex = 0;
  while (position < transcript.length) {
    let endPosition = Math.min(position + CHUNK_SIZE, transcript.length);
    const isLast = endPosition >= transcript.length;
    if (!isLast) {
      const lookAhead = transcript.slice(endPosition, endPosition + 500);
      const speakerMatch = lookAhead.match(/\n\n[A-Z][^:]+:/);
      if (speakerMatch && speakerMatch.index !== undefined) {
        endPosition += speakerMatch.index;
      } else {
        const dn = lookAhead.indexOf("\n\n");
        if (dn !== -1) endPosition += dn;
        else {
          const se = lookAhead.search(/[.!?]\s/);
          if (se !== -1) endPosition += se + 2;
        }
      }
    }
    const content = transcript.slice(position, endPosition).trim();
    if (content.length > 0) {
      chunks.push({ index: chunkIndex, content, isLast });
      chunkIndex++;
    }
    position = Math.max(endPosition - CHUNK_OVERLAP, position + CHUNK_SIZE / 2);
  }
  if (chunks.length > 0) chunks[chunks.length - 1].isLast = true;
  return chunks;
}

// ==================== POOL DE CONCORRÊNCIA ====================
async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, lane);
  await Promise.all(lanes);
  return results;
}

// ==================== PROMPTS ====================
function chunkPrompt(idx: number, total: number) {
  return `Você é um analista sênior de reuniões corporativas em português do Brasil.
Esta é a parte ${idx + 1} de ${total} de uma transcrição real de reunião.

OBJETIVO PRINCIPAL: NÃO PERDER NENHUMA TAREFA OU SUBTAREFA mencionada.
Reuniões reais misturam contexto e ações; sua função é extrair exaustivamente
tudo que foi combinado, decidido, sugerido ou implícito como trabalho a fazer.

REGRAS DE EXTRAÇÃO (siga TODAS):
1. Identifique TODAS as tarefas (explícitas e implícitas). Se alguém disse
   "precisa arrumar X", "vou olhar Y", "vamos resolver Z" — vira tarefa.
2. Quando a tarefa tem múltiplas etapas concretas, quebre em SUBTAREFAS no
   campo "subtasks" (não no campo "steps"): cada subtarefa é uma unidade de
   trabalho independente, com título próprio, descrição curta e prioridade.
   Use "steps" apenas para passos operacionais curtos da tarefa-mãe.
3. Para CADA tarefa preencha: título objetivo, descrição rica em contexto
   (cite o que foi falado), prioridade (low|medium|high|urgent), responsável
   sugerido (se mencionado, mesmo que apelido), prazo sugerido (se mencionado),
   esforço (small|medium|large|extra_large), risco (low|medium|high),
   critérios de aceite (até 5), passos operacionais (até 6), e subtarefas
   quando fizer sentido (até 8).
4. Capture TODOS os pontos-chave (decisões, números, marcos, definições) e
   pontos de atenção (riscos, bloqueios, conflitos, dúvidas em aberto).
5. NÃO invente. Se algo não foi mencionado, deixe vazio. Se foi mencionado
   parcialmente, registre o que foi dito e marque como sugestão.
6. Seja exaustivo na quantidade, objetivo na descrição. Prefira muitas
   tarefas pequenas a poucas tarefas vagas.`;
}

const REDUCE_PROMPT = `Você consolida análises parciais de uma reunião longa em português do Brasil.

REGRAS:
- Mescle apenas tarefas claramente duplicadas (mesmo título e mesmo escopo).
- Em caso de dúvida, MANTENHA AS DUAS — perder tarefa é o pior erro possível.
- Una passos, subtarefas e critérios complementares sem descartar conteúdo.
- Preserve TODAS as subtarefas — elas representam trabalho real a fazer.
- Devolva o mesmo schema da extração por chunk.`;

const FINAL_PROMPT = `Você produz o resumo final e a lista definitiva de tarefas a partir de análises parciais já consolidadas, em português do Brasil.

REGRAS:
- Mantenha TODAS as tarefas únicas. Não descarte tarefas pequenas.
- Mantenha TODAS as subtarefas geradas — elas são entregáveis reais.
- Ordene as tarefas por prioridade (urgent → high → medium → low).
- O resumo deve ser em markdown, com seções: Decisões, Próximos Passos,
  Riscos/Bloqueios, e Contexto Geral.`;

// ==================== TOOL SCHEMAS ====================
const taskItemSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    suggested_assignee: { type: "string" },
    effort_estimate: { type: "string", enum: ["small", "medium", "large", "extra_large"] },
    risk_level: { type: "string", enum: ["low", "medium", "high"] },
    acceptance_criteria: { type: "array", items: { type: "string" } },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          order: { type: "number" },
          description: { type: "string" },
          estimated_time: { type: "string" },
        },
        required: ["order", "description"],
      },
    },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          task_title_ref: { type: "string" },
          dependency_type: { type: "string", enum: ["blocks", "blocked_by", "related_to"] },
        },
        required: ["task_title_ref", "dependency_type"],
      },
    },
    subtasks: {
      type: "array",
      description: "Subtarefas estruturadas: cada uma é uma unidade de trabalho independente derivada da tarefa-mãe. Use quando a tarefa tem múltiplos entregáveis distintos.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          suggested_assignee: { type: "string" },
          suggested_due_date: { type: "string" },
        },
        required: ["title"],
      },
    },
    project_suggestion: { type: "string" },
    suggested_due_date: { type: "string" },
  },
  required: ["title", "description", "priority"],
};

const chunkAnalysisTools = [{
  type: "function",
  function: {
    name: "extract_chunk_data",
    description: "Extract all tasks and data from a transcript chunk",
    parameters: {
      type: "object",
      properties: {
        key_points: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
        attention_points: { type: "array", items: { type: "object", properties: { text: { type: "string" }, severity: { type: "string", enum: ["low", "medium", "high"] } }, required: ["text", "severity"] } },
        action_items: { type: "array", items: { type: "object", properties: { text: { type: "string" }, responsible: { type: "string" } }, required: ["text"] } },
        tasks: { type: "array", items: taskItemSchema },
        generated_projects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["name", "description", "priority"],
          },
        },
        summary_fragment: { type: "string", description: "Brief summary of this chunk" },
      },
      required: ["key_points", "attention_points", "action_items", "tasks"],
      additionalProperties: false,
    },
  },
}];

const finalTools = [{
  type: "function",
  function: {
    name: "consolidate_meeting_data",
    description: "Consolidate all chunk analyses into final meeting data",
    parameters: {
      type: "object",
      properties: {
        summary_markdown: { type: "string" },
        key_points: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
        attention_points: { type: "array", items: { type: "object", properties: { text: { type: "string" }, severity: { type: "string", enum: ["low", "medium", "high"] } }, required: ["text", "severity"] } },
        action_items: { type: "array", items: { type: "object", properties: { text: { type: "string" }, responsible: { type: "string" } }, required: ["text"] } },
        generated_projects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["name", "description", "priority"],
          },
        },
        generated_tasks: { type: "array", items: taskItemSchema },
      },
      required: ["summary_markdown", "key_points", "attention_points", "action_items", "generated_projects", "generated_tasks"],
      additionalProperties: false,
    },
  },
}];

// ==================== SERVE ====================
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const internalHeader = req.headers.get("x-internal-invoke") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const isInternal =
      (bearer && bearer === SERVICE_ROLE_KEY) ||
      (internalHeader && internalHeader === SERVICE_ROLE_KEY);

    if (!isInternal) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401, corsHeaders);
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) return json({ error: "Unauthorized" }, 401, corsHeaders);
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const body = await req.json();

    // ========== MODE: CORRECTION (chat de correção) ==========
    if (body.mode === "correction") {
      const { context, user_message } = body;
      if (!context || !user_message) {
        return json({ error: "context and user_message are required" }, 400, corsHeaders);
      }
      const correctionPrompt = `Você é um assistente que ajuda a corrigir e ajustar sugestões de projetos e tarefas geradas a partir de uma reunião.

Estado atual dos itens (JSON):
${context}

Regras:
- Se o usuário pedir para alterar projetos ou tarefas, retorne o JSON atualizado
- Mantenha a mesma estrutura completa
- Se o usuário pedir apenas informação, responda normalmente
- Responda sempre em português

Retorne SEMPRE um JSON válido com esta estrutura:
{
  "updated_projects": [...] ou null se não alterou projetos,
  "updated_tasks": [...] ou null se não alterou tarefas,
  "message": "explicação do que foi feito"
}`;
      const result = await callLLM(OPENROUTER_API_KEY, [
        { role: "system", content: correctionPrompt },
        { role: "user", content: user_message },
      ]);
      const content = result.choices?.[0]?.message?.content || "";
      try {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) return json(JSON.parse(m[0]), 200, corsHeaders);
      } catch { /* fallthrough */ }
      return json({ message: content }, 200, corsHeaders);
    }

    // ========== MODE: TRANSCRIPT PROCESSING (default) ==========
    const { meeting_id, transcript: bodyTranscript, force } = body;
    if (!meeting_id) {
      return json({ error: "meeting_id is required" }, 400, corsHeaders);
    }

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_ROLE_KEY);

    // Idempotência: já processada?
    const { data: existing } = await serviceClient
      .from("meetings")
      .select("status, summary_markdown, tenant_id, created_by, transcript_raw, soniox_session_id")
      .eq("id", meeting_id)
      .maybeSingle();

    if (!existing) return json({ error: "meeting not found" }, 404, corsHeaders);

    // Se transcript não veio no body, usa o salvo no banco (reprocessamento retroativo)
    const transcript = bodyTranscript || existing.transcript_raw;
    if (!transcript) {
      // `soniox_session_id` é gravado pelo useLiveKitTranscription assim que a
      // captura sobe, mesmo sem nenhuma fala. Ele separa dois casos que antes
      // eram o mesmo NULL — e que exigem ações opostas de quem lê o erro.
      const pipelineRan = !!existing.soniox_session_id;
      return json({
        error: pipelineRan
          ? "A transcrição rodou nesta reunião, mas não captou áudio nenhum. Verifique se os microfones estavam ativos e se o navegador do responsável tinha permissão de áudio."
          : "Esta reunião não tem transcrição: o responsável pela reunião não esteve na sala, então a captura nunca chegou a rodar. Só a gravação de vídeo existe.",
        code: pipelineRan ? "transcript_empty" : "transcript_never_captured",
      }, 400, corsHeaders);
    }

    if (!force && existing.summary_markdown && existing.summary_markdown.trim().length > 0) {
      return json({ success: true, skipped: true, reason: "already_processed" }, 200, corsHeaders);
    }

    // Marca jobs antigos como stale (sem heartbeat há > 4 min)
    await serviceClient
      .from("meeting_ai_jobs")
      .update({
        status: "failed",
        error_message: "Stale job (no heartbeat)",
        finished_at: new Date().toISOString(),
      })
      .eq("meeting_id", meeting_id)
      .in("status", ["queued", "processing"])
      .lt("heartbeat_at", new Date(Date.now() - 4 * 60_000).toISOString());

    // Existe job ativo recente? Se sim, retorna ele.
    const { data: activeJob } = await serviceClient
      .from("meeting_ai_jobs")
      .select("id, status, phase, progress, heartbeat_at")
      .eq("meeting_id", meeting_id)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeJob && !force) {
      return json({ success: true, status: "processing", job_id: activeJob.id, reused: true }, 202, corsHeaders);
    }

    // Cria job
    const { data: job, error: jobErr } = await serviceClient
      .from("meeting_ai_jobs")
      .insert({
        meeting_id,
        tenant_id: existing.tenant_id,
        created_by: existing.created_by,
        status: "queued",
        phase: "queued",
        progress: 0,
        heartbeat_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (jobErr || !job) throw jobErr || new Error("failed to create job");

    const jobId = job.id;

    await serviceClient.from("meetings").update({ status: "processing" }).eq("id", meeting_id);

    const updateJob = async (patch: Record<string, unknown>) => {
      try {
        await serviceClient
          .from("meeting_ai_jobs")
          .update({ ...patch, heartbeat_at: new Date().toISOString() })
          .eq("id", jobId);
      } catch (e) {
        console.error("[meeting-ai] updateJob failed", e);
      }
    };

    // ========================== BACKGROUND PIPELINE ==========================
    const processInBackground = async () => {
      try {
        await updateJob({ status: "processing", phase: "chunking", progress: 2 });

        const chunks = chunkTranscript(transcript);
        await updateJob({ phase: "extracting", progress: 5, total_chunks: chunks.length });
        console.log(`[meeting-ai job=${jobId}] ${chunks.length} chunks (concurrency=${CHUNK_CONCURRENCY})`);

        let processed = 0;
        let failed = 0;

        const chunkResults = await runWithConcurrency(chunks, async (chunk) => {
          try {
            const result = await callLLM(
              OPENROUTER_API_KEY,
              [
                { role: "system", content: chunkPrompt(chunk.index, chunks.length) },
                { role: "user", content: `Fragmento da transcrição:\n\n${chunk.content}` },
              ],
              chunkAnalysisTools,
              { type: "function", function: { name: "extract_chunk_data" } },
            );
            const tc = result.choices?.[0]?.message?.tool_calls?.[0];
            const data = tc ? JSON.parse(tc.function.arguments) : null;
            processed++;
            const pct = 5 + Math.round((processed / chunks.length) * 70);
            await updateJob({ processed_chunks: processed, progress: pct });
            return data;
          } catch (e) {
            failed++;
            console.error(`[meeting-ai job=${jobId}] chunk ${chunk.index} failed:`, (e as any)?.message || e);
            await updateJob({ failed_chunks: failed });
            return null;
          }
        }, CHUNK_CONCURRENCY);

        const validAnalyses = chunkResults.filter((c): c is any => c !== null);
        if (validAnalyses.length === 0) {
          throw new Error(`Nenhum fragmento retornou dados válidos (${failed}/${chunks.length} falharam)`);
        }

        // ========== REDUCE STAGE (se muitos chunks) ==========
        let reduced = validAnalyses;
        if (reduced.length > REDUCE_BATCH_SIZE) {
          await updateJob({ phase: "reducing", progress: 78 });
          const batches: any[][] = [];
          for (let i = 0; i < reduced.length; i += REDUCE_BATCH_SIZE) {
            batches.push(reduced.slice(i, i + REDUCE_BATCH_SIZE));
          }
          const reducedBatches = await runWithConcurrency(batches, async (batch) => {
            const fullJson = JSON.stringify(batch);
            const truncated = fullJson.length > REDUCE_INPUT_LIMIT;
            if (truncated) {
              console.warn(`[meeting-ai job=${jobId}] reduce batch truncado: ${fullJson.length} > ${REDUCE_INPUT_LIMIT}`);
            }
            const result = await callLLM(
              OPENROUTER_API_KEY,
              [
                { role: "system", content: REDUCE_PROMPT },
                { role: "user", content: `Análises parciais:\n\n${fullJson.slice(0, REDUCE_INPUT_LIMIT)}` },
              ],
              chunkAnalysisTools,
              { type: "function", function: { name: "extract_chunk_data" } },
            );
            const tc = result.choices?.[0]?.message?.tool_calls?.[0];
            if (!tc) return null;
            try {
              return JSON.parse(tc.function.arguments);
            } catch (parseErr) {
              console.error(`[meeting-ai job=${jobId}] reduce batch JSON inválido (provável max_tokens):`, (parseErr as Error).message);
              return null;
            }
          }, CHUNK_CONCURRENCY);
          reduced = reducedBatches.filter((b): b is any => b !== null);
          if (reduced.length === 0) throw new Error("Reduce stage retornou vazio");
        }

        // ========== FINAL CONSOLIDATION ==========
        await updateJob({ phase: "consolidating", progress: 88 });
        let extracted: any;
        if (reduced.length === 1 && chunks.length === 1) {
          const single = reduced[0];
          extracted = {
            summary_markdown: single.summary_fragment || "Resumo da reunião processado.",
            key_points: single.key_points || [],
            attention_points: single.attention_points || [],
            action_items: single.action_items || [],
            generated_projects: single.generated_projects || [],
            generated_tasks: single.tasks || [],
          };
        } else {
          const fullJson = JSON.stringify(reduced);
          if (fullJson.length > CONSOLIDATE_INPUT_LIMIT) {
            console.warn(`[meeting-ai job=${jobId}] consolidação truncada: ${fullJson.length} > ${CONSOLIDATE_INPUT_LIMIT}`);
          }
          const consolidationInput = fullJson.slice(0, CONSOLIDATE_INPUT_LIMIT);
          const result = await callLLM(
            OPENROUTER_API_KEY,
            [
              { role: "system", content: FINAL_PROMPT },
              { role: "user", content: `Análises consolidadas:\n\n${consolidationInput}` },
            ],
            finalTools,
            { type: "function", function: { name: "consolidate_meeting_data" } },
          );
          const tc = result.choices?.[0]?.message?.tool_calls?.[0];
          if (!tc) throw new Error("LLM não retornou dados consolidados");
          try {
            extracted = JSON.parse(tc.function.arguments);
          } catch (parseErr) {
            // Saída cortada por max_tokens — fallback: monta resultado a partir de `reduced`
            console.error(`[meeting-ai job=${jobId}] consolidação JSON inválido (provável max_tokens):`, (parseErr as Error).message);
            const allTasks = reduced.flatMap((r) => r?.tasks || []);
            const allActions = reduced.flatMap((r) => r?.action_items || []);
            const allKey = reduced.flatMap((r) => r?.key_points || []);
            const allAtt = reduced.flatMap((r) => r?.attention_points || []);
            const summaryParts = reduced.map((r) => r?.summary_fragment).filter(Boolean);
            extracted = {
              summary_markdown: summaryParts.join("\n\n") || "Resumo consolidado a partir de fragmentos.",
              key_points: allKey,
              attention_points: allAtt,
              action_items: allActions,
              generated_projects: [],
              generated_tasks: allTasks,
            };
          }
        }
        // Garante que generated_tasks nunca venha undefined
        extracted.generated_tasks = extracted.generated_tasks || [];
        extracted.action_items = extracted.action_items || [];
        extracted.key_points = extracted.key_points || [];
        extracted.attention_points = extracted.attention_points || [];
        extracted.generated_projects = extracted.generated_projects || [];

        // ========== SAVE ==========
        await updateJob({ phase: "saving", progress: 96 });
        const { error: updateErr } = await serviceClient.from("meetings").update({
          status: "completed",
          transcript_raw: transcript,
          summary_markdown: extracted.summary_markdown,
          key_points: extracted.key_points,
          attention_points: extracted.attention_points,
          action_items: extracted.action_items,
          generated_projects: extracted.generated_projects,
          generated_tasks: extracted.generated_tasks,
          updated_at: new Date().toISOString(),
        }).eq("id", meeting_id);

        if (updateErr) throw updateErr;

        await updateJob({
          status: "completed",
          phase: "done",
          progress: 100,
          finished_at: new Date().toISOString(),
        });

        console.log(`[meeting-ai job=${jobId}] meeting ${meeting_id} done (${extracted.generated_tasks?.length || 0} tasks)`);
      } catch (bgErr) {
        console.error(`[meeting-ai job=${jobId}] failed:`, bgErr);
        await updateJob({
          status: "failed",
          error_message: bgErr instanceof Error ? bgErr.message : String(bgErr),
          finished_at: new Date().toISOString(),
        });
        // Destrava reunião para permitir reprocessamento.
        try {
          await serviceClient.from("meetings").update({
            status: "completed",
            metadata: { ai_error: bgErr instanceof Error ? bgErr.message : String(bgErr), failed_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          }).eq("id", meeting_id);
        } catch (e) {
          console.error("[meeting-ai] failed to unlock meeting", e);
        }
      }
    };

    // @ts-ignore - EdgeRuntime no Supabase
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processInBackground());
    } else {
      await processInBackground();
    }

    return json({
      success: true,
      status: "processing",
      job_id: jobId,
      message: "Processamento iniciado em background.",
    }, 202, corsHeaders);
  } catch (e) {
    console.error("meeting-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get("Origin") || ""), "Content-Type": "application/json" },
    });
  }
});

function json(data: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
