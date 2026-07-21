
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const ALLOWED_ORIGINS = [
  "https://gt3.omnx.pro",
  "https://gt3.empirebusiness.com.br",
  "https://t3.empirebusiness.com.br",
  "http://localhost:8080",
  "http://localhost:5173",
];

function getCorsHeaders(origin: string) {
  const allowed = origin || ALLOWED_ORIGINS[0]; // reflete o origin (auth por bearer token, nao cookie) — suporta Vercel previews e dominios de tenant
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const SYSTEM_PROMPT = `Você é um especialista em processos empresariais e modelagem BPM.

Quando o usuário descrever um processo, você DEVE:

1. Gerar um documento Markdown COMPLETO e ESTRUTURADO seguindo este template:

# [Nome do Processo]

## Objetivo
[Descrição clara do objetivo do processo]

## Escopo
- **Aplica-se a:** [áreas/cargos envolvidos]
- **Não se aplica a:** [exclusões]

## Responsáveis
| Papel | Responsável |
|-------|-------------|
| Dono do processo | [cargo/função] |
| Executor(es) | [cargo/função] |

## Etapas

### 1. [Nome da Etapa]
- **Responsável:** [cargo]
- **Tempo estimado:** [X minutos/horas]
- **Entrada:** [o que precisa para iniciar]
- **Saída:** [o que produz]
- **Detalhes:** [descrição detalhada]

### 2. [Nome da Etapa]
(continuar para todas as etapas)

## Pontos de Decisão
- **[Pergunta de decisão]:** Se sim → Etapa X | Se não → Etapa Y

## Exceções e Tratamento
[Descrever situações excepcionais e como tratá-las]

## Métricas de Sucesso
[KPIs e indicadores para medir a eficácia do processo]

2. OBRIGATORIAMENTE chamar a function tool "generate_process_diagram" com os nodes e edges que representam o diagrama BPM do processo.

Regras CRÍTICAS para o diagrama:
- Sempre começar com um node tipo "start" e terminar com "end"
- Cada etapa do processo deve ser um node tipo "task"
- Pontos de decisão devem ser nodes tipo "decision"
- Subprocessos complexos devem ser "subprocess"
- Edges conectam os nodes na sequência correta
- Edges saindo de "decision" devem ter labels descritivas ("Sim", "Não", "Aprovado", etc.)
- IDs devem ser simples: "start", "end", "task-1", "task-2", "decision-1", etc.

REGRA DE FASES (SWIM LANES) - OBRIGATÓRIA:
- TODOS os nodes DEVEM ter o campo "phase" preenchido
- O campo "phase" agrupa os nós em raias horizontais no diagrama (swim lanes)
- Exemplos de fases: "Antes da Chegada", "Primeiro Dia", "Primeira Semana", "Primeiro Mês"
- Ou: "Solicitação", "Análise", "Aprovação", "Execução", "Encerramento"
- As fases representam etapas temporais ou lógicas do processo
- Organize os nós nas fases corretas de acordo com quando acontecem no processo
- Use nomes curtos e claros para as fases (máximo 3 palavras)
- A ordem das fases no array de nodes define a ordem visual no diagrama

REGRAS DE FIDELIDADE AOS DADOS (CRÍTICO):
- NUNCA omita dados específicos que o usuário mencionou: nomes de sistemas, ferramentas, scripts, cadências, valores percentuais, prazos, critérios de qualificação, regras de negócio, fontes de leads
- NUNCA resuma ou condense etapas que o usuário detalhou — se ele descreveu 3 sub-etapas, documente as 3
- COPIE com precisão nomes de ferramentas (ex: "Apollo.io", "HubSpot", "LinkedIn Sales Navigator"), scripts de abordagem, mensagens modelo, sequências de follow-up
- Se o usuário descreveu um script de mensagem ou template de e-mail/WhatsApp, inclua o texto COMPLETO na seção de Detalhes da etapa correspondente
- Se o usuário mencionou métricas específicas (ex: "taxa de resposta > 15%", "60 tentativas de contato"), preserve esses valores exatos
- Se o usuário descreveu fontes de leads, canais de prospecção ou critérios de ICP, inclua todos eles explicitamente
- O documento final deve ser suficientemente completo para que alguém execute o processo sem precisar consultar o texto original
- Não invente etapas que não foram mencionadas, mas também NÃO REMOVA nada que foi mencionado`;

const PREVIEW_PROMPT = `Você é um especialista em processos empresariais. O usuário vai descrever um processo e você deve gerar uma PRÉVIA RESUMIDA para aprovação antes de criar o processo completo.

Responda APENAS com um JSON válido (sem markdown, sem code blocks) com esta estrutura:
{
  "summary": "Resumo de 1-2 frases do processo",
  "steps_count": <número estimado de etapas>,
  "steps_preview": ["Nome da Etapa 1", "Nome da Etapa 2", ...],
  "roles_involved": ["Cargo/função 1", "Cargo/função 2", ...],
  "estimated_phases": ["Fase 1", "Fase 2", ...],
  "complexity": "baixa" | "media" | "alta"
}

Seja fiel à descrição do usuário. Não invente etapas que não foram mencionadas. Apenas organize o que o usuário descreveu. Preserve nomes de ferramentas, sistemas, scripts e critérios específicos mencionados.`;

const SUMMARIZE_PROMPT = `Você é um especialista em processos empresariais. Com base no documento Markdown do processo fornecido, escreva uma NOTA CURTA E OBJETIVA para o campo "Nota do processo".

A nota deve:
- Ter entre 100 e 300 caracteres
- Resumir em 1 a 3 frases o objetivo do processo e seu contexto principal
- Destacar no máximo um ponto crítico ou regra importante, se houver
- Ser direta, sem repetir o nome do processo

Responda APENAS com o texto da nota, sem títulos, sem markdown, sem aspas.`;

const REPROCESS_PROMPT = `Você é um especialista em modelagem BPM e design de fluxogramas legíveis. Analise o documento Markdown de processo abaixo e gere o diagrama chamando a function tool "generate_process_diagram".

OBJETIVO: um fluxograma CLARO e BONITO que qualquer pessoa entenda de relance — não um despejo literal de cada linha do texto.

REGRAS DE ESTRUTURA (siga à risca):
1. Sempre exatamente 1 nó "start" e ao menos 1 nó "end".
2. LEGIBILIDADE ACIMA DE TUDO: mire entre 6 e 10 nós no total, TETO ABSOLUTO de 12. NUNCA crie um nó por item repetitivo. Se o processo é grande, agregue passos afins num único nó/subprocesso.
2b. RÓTULOS CURTOS: o "label" de cada nó tem no máximo 4 palavras (ex: "Contato Inicial", "Agendar Conversa"). Todo o resto (scripts, mensagens, detalhes) vai em "description" — NUNCA no label.
3. AGRUPE repetição/iteração: se o processo tem passos que se repetem (ex: "Dia 1, Dia 2, … Dia 14", tentativas de contato, cadências), modele como UM único "subprocess" (ex: "Cadência diária de contato") + um "decision" de saída do laço (ex: "Respondeu?" ou "Chegou ao fim da cadência?"), com um edge de retorno (loop) rotulado "Não". NÃO crie 14 nós de dia.
4. Use "decision" (losango) em TODO ponto de ramificação, com edges rotulados "Sim"/"Não" (ou os rótulos reais das opções). As decisões descritas na seção "Pontos de Decisão" DEVEM virar nós decision.
5. Tipos de nó por natureza do passo:
   - "task": atividade executada por alguém.
   - "subprocess": conjunto de passos agrupados / laço / sub-rotina.
   - "decision": ramificação (sempre losango).
   - "document": geração/uso de documento, script, template ou mensagem-modelo.
   - "data": entrada/saída de sistema/CRM (ex: "Lead no CRM").
   - "event": espera, gatilho ou marco temporal (ex: "Aguardar resposta", "Timeout 14 dias").
   - "note": regra crítica ou exceção importante (use com parcimônia).
6. COR semântica (campo color): start→success, end→danger, decision→warning, subprocess/event→info, document/data/task→neutral (ou primary p/ destaque). Só use color quando ajudar a leitura.
7. FASES (phase): agrupe os nós em 2 a 5 fases lógicas (swim lanes) que representem os grandes estágios do processo (ex: "Captação", "Prospecção", "Agendamento", "Encerramento") — NÃO uma fase por passo. A ordem das fases segue a ordem natural do processo.
8. Todo nó (exceto start/end) deve ter phase. Preencha responsible/estimated_time quando o texto informar.
9. Edges: conecte o fluxo de forma que todo caminho leve a um "end". Rotule os edges que saem de decisions.

Modele a INTENÇÃO do processo, condensando o texto em um fluxo enxuto e navegável.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_process_diagram",
      description: "Gera o diagrama BPM visual do processo com nodes (com fases/swim lanes) e edges para React Flow",
      parameters: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                type: { type: "string", enum: ["start", "end", "task", "decision", "subprocess", "note", "document", "data", "event"] },
                label: { type: "string" },
                description: { type: "string" },
                responsible: { type: "string" },
                estimated_time: { type: "string" },
                phase: { type: "string", description: "Fase/etapa temporal do processo para agrupamento em swim lanes. Ex: 'Solicitação', 'Aprovação', 'Execução'" },
                color: { type: "string", enum: ["primary", "success", "warning", "danger", "info", "neutral"], description: "Cor semântica opcional do nó. Ex: 'success' para conclusão, 'danger' para bloqueio/fim, 'warning' para decisão." },
              },
              required: ["id", "type", "label", "phase"],
              additionalProperties: false,
            },
          },
          edges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                source: { type: "string" },
                target: { type: "string" },
                label: { type: "string" },
              },
              required: ["id", "source", "target"],
              additionalProperties: false,
            },
          },
        },
        required: ["nodes", "edges"],
        additionalProperties: false,
      },
    },
  },
];

serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // BRECHA 6: exige usuário autenticado (JWT). Chamada pelo frontend via
    // supabase.functions.invoke, que já envia o Authorization. Sem isto,
    // qualquer pessoa na internet usaria a IA (OpenRouter) de graça, gerando
    // custo ilimitado para a empresa.
    const authHeader = req.headers.get("Authorization") || "";
    const unauthorized = () =>
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    if (!authHeader) return unauthorized();
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: authUser }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authUser) return unauthorized();

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, prompt, markdown } = await req.json();

    if (!action || (action === "generate" && !prompt) || (action === "reprocess" && !markdown) || (action === "preview" && !prompt) || (action === "summarize" && !markdown)) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PREVIEW action — lightweight outline, no tools, cheap model
    if (action === "preview") {
      const previewResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://gt3.lovable.app",
          "X-Title": "GT3 - Processos AI Preview",
        },
        body: JSON.stringify({
          models: ["google/gemini-2.0-flash-001", "anthropic/claude-3-haiku"],
          route: "fallback",
          messages: [
            { role: "system", content: PREVIEW_PROMPT },
            { role: "user", content: prompt },
          ],
          max_tokens: 800,
        }),
      });

      if (!previewResp.ok) {
        const errorText = await previewResp.text();
        console.error("Preview error:", previewResp.status, errorText);
        return new Response(JSON.stringify({ error: `Erro ao gerar prévia (${previewResp.status})` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const previewData = await previewResp.json();
      const previewContent = previewData.choices?.[0]?.message?.content || "";
      
      let preview;
      try {
        // Try to parse directly or extract JSON from the response
        const jsonMatch = previewContent.match(/\{[\s\S]*\}/);
        preview = JSON.parse(jsonMatch ? jsonMatch[0] : previewContent);
      } catch {
        preview = { summary: previewContent, steps_count: 0, steps_preview: [], roles_involved: [], estimated_phases: [], complexity: "media" };
      }

      return new Response(JSON.stringify({ preview }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SUMMARIZE action — gera nota completa a partir do markdown do processo
    if (action === "summarize") {
      const summarizeResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://gt3.lovable.app",
          "X-Title": "GT3 - Processos AI Summarize",
        },
        body: JSON.stringify({
          models: ["google/gemini-2.0-flash-001", "anthropic/claude-3-haiku"],
          route: "fallback",
          messages: [
            { role: "system", content: SUMMARIZE_PROMPT },
            { role: "user", content: markdown },
          ],
          max_tokens: 600,
        }),
      });

      if (!summarizeResp.ok) {
        const errorText = await summarizeResp.text();
        console.error("Summarize error:", summarizeResp.status, errorText);
        return new Response(JSON.stringify({ error: `Erro ao gerar nota (${summarizeResp.status})` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const summarizeData = await summarizeResp.json();
      const note = (summarizeData.choices?.[0]?.message?.content || "").trim();

      return new Response(JSON.stringify({ note }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let messages: Array<{ role: string; content: string }>;

    if (action === "generate") {
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ];
    } else {
      messages = [
        { role: "system", content: REPROCESS_PROMPT },
        { role: "user", content: markdown },
      ];
    }

    const payload: Record<string, unknown> = {
      models: [
        "anthropic/claude-3.5-sonnet",
        "google/gemini-2.0-flash-001",
        "anthropic/claude-3-haiku",
      ],
      route: "fallback",
      messages,
      tools: TOOLS,
      tool_choice: { type: "function", function: { name: "generate_process_diagram" } },
    };

    if (action === "generate") {
      delete payload.tool_choice;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://gt3.lovable.app",
        "X-Title": "GT3 - Processos AI",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes no OpenRouter. Adicione fundos à sua conta." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: `Erro do provedor de IA (${response.status})` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      return new Response(JSON.stringify({ error: "Resposta vazia da IA" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resultMarkdown = action === "generate" ? (choice.message?.content || "") : markdown;

    let flowData = null;
    const toolCalls = choice.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        if (tc.function?.name === "generate_process_diagram") {
          try {
            flowData = JSON.parse(tc.function.arguments);
          } catch {
            console.error("Failed to parse tool call arguments:", tc.function.arguments);
          }
        }
      }
    }

    if (!flowData && action === "reprocess") {
      const retryPayload = { ...payload };
      retryPayload.tool_choice = { type: "function", function: { name: "generate_process_diagram" } };

      const retryResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://gt3.lovable.app",
          "X-Title": "GT3 - Processos AI",
        },
        body: JSON.stringify(retryPayload),
      });

      if (retryResp.ok) {
        const retryData = await retryResp.json();
        const retryChoice = retryData.choices?.[0];
        const retryToolCalls = retryChoice?.message?.tool_calls;
        if (retryToolCalls?.length > 0) {
          for (const tc of retryToolCalls) {
            if (tc.function?.name === "generate_process_diagram") {
              try {
                flowData = JSON.parse(tc.function.arguments);
              } catch { /* ignore */ }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ markdown: resultMarkdown, flowData, model: data.model }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
