// Edge Function: chat-transcribe
// Transcreve um áudio do chat via OpenRouter (modelo multimodal de áudio).
// Reaproveita a lógica de feed-audio-transcribe (OpenRouter), substituindo a versão
// antiga baseada em Soniox que vinha estourando 502.
// Cacheia o resultado em public.feed_audio_transcriptions por (tenant_id, attachment_url).

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
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Modelos que aceitam input_audio. Tentamos em ordem.
const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001",
  "openai/gpt-4o-audio-preview",
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function guessAudioFormat(url: string, mime?: string | null): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("mp3") || m.includes("mpeg")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".mp3")) return "mp3";
  if (lower.endsWith(".wav")) return "wav";
  if (lower.endsWith(".ogg")) return "ogg";
  if (lower.endsWith(".webm")) return "webm";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "mp4";
  return "mp3";
}

async function fetchAudioAsBase64(url: string): Promise<{ base64: string; mime: string | null }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar áudio (${res.status})`);
  const mime = res.headers.get("content-type");
  const buf = new Uint8Array(await res.arrayBuffer());
  // Convert to base64 in chunks to avoid call-stack overflow
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return { base64: btoa(binary), mime };
}

async function callOpenRouter(model: string, base64: string, format: string): Promise<string> {
  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Transcreva o áudio a seguir literalmente em português brasileiro. " +
              "Devolva APENAS o texto transcrito, sem prefácios, sem comentários, sem aspas.",
          },
          {
            type: "input_audio",
            input_audio: {
              data: base64,
              format,
            },
          },
        ],
      },
    ],
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://gt3.omnx.pro",
      "X-Title": "OMNX GT3 - Chat Audio Transcribe",
    },
    body: JSON.stringify(body),
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
  return content.trim();
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

    // Cliente com a sessão do usuário (para checar tenant + RLS)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return jsonResponse({ error: "Sessão inválida" }, 401);
    }

    const { data: profile } = await userClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userRes.user.id)
      .maybeSingle();

    const tenantId = profile?.tenant_id;
    if (!tenantId) return jsonResponse({ error: "Tenant não identificado" }, 403);

    const body = await req.json().catch(() => ({}));
    const audioUrl: string | undefined = body?.audio_url;
    const mime: string | undefined = body?.mime;
    // force=true → ignora o cache e re-transcreve (botão "Transcrever de novo").
    const force: boolean = body?.force === true;
    if (!audioUrl || typeof audioUrl !== "string") {
      return jsonResponse({ error: "audio_url obrigatório" }, 400);
    }

    // Service role para cache (bypass RLS) — leitura+escrita controladas pelo edge.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Cache hit? (pulado quando force=true)
    const { data: cached } = await adminClient
      .from("feed_audio_transcriptions")
      .select("transcription, language, model")
      .eq("tenant_id", tenantId)
      .eq("attachment_url", audioUrl)
      .maybeSingle();

    if (!force && cached?.transcription) {
      return jsonResponse({
        transcription: cached.transcription,
        language: cached.language ?? "pt",
        model: cached.model,
        cached: true,
      });
    }

    // 2) Baixar áudio + tentar modelos em ordem
    const { base64, mime: detectedMime } = await fetchAudioAsBase64(audioUrl);
    const format = guessAudioFormat(audioUrl, mime ?? detectedMime);

    let transcription = "";
    let usedModel = "";
    let lastError: unknown = null;
    for (const model of MODELS) {
      try {
        transcription = await callOpenRouter(model, base64, format);
        usedModel = model;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[feed-audio-transcribe] modelo ${model} falhou:`, err);
      }
    }

    if (!transcription) {
      return jsonResponse(
        { error: `Nenhum modelo conseguiu transcrever: ${(lastError as Error)?.message ?? "erro desconhecido"}` },
        502,
      );
    }

    // 3) Salvar no cache
    await adminClient.from("feed_audio_transcriptions").upsert(
      {
        tenant_id: tenantId,
        attachment_url: audioUrl,
        transcription,
        language: "pt",
        model: usedModel,
        created_by: userRes.user.id,
      },
      { onConflict: "tenant_id,attachment_url" },
    );

    return jsonResponse({
      transcription,
      language: "pt",
      model: usedModel,
      cached: false,
    });
  } catch (err) {
    console.error("[feed-audio-transcribe] erro:", err);
    return jsonResponse({ error: (err as Error).message ?? "Erro interno" }, 500);
  }
});
