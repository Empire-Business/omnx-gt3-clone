/**
 * useTaskVoiceAI — transforma um áudio ditado em um rascunho de tarefa.
 *
 * Chama a Edge Function `task-voice-ai`, que transcreve o áudio e devolve
 * título, descrição, prioridade, prazo, responsáveis e checklist já resolvidos
 * contra os colaboradores/projetos do tenant. Não cria nada: o usuário revisa
 * o rascunho no modal de Nova Tarefa antes de salvar.
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toWav16kMono } from "@/lib/audio-to-wav";

/** Uma etapa do plano de execução montado pela IA a partir do áudio. */
export interface VoiceTaskStep {
  title: string;
  /** Explicação didática da etapa. Pode vir vazia se o modelo só deu o título. */
  detail: string;
}

export interface VoiceTaskDraft {
  transcription: string;
  title: string;
  /**
   * Briefing completo já montado em TEXTO PURO pela Edge Function (objetivo,
   * contexto, passos, critérios de aceite, riscos, dúvidas e a transcrição).
   * É o que vai direto para `tasks.description` — o front não precisa remontar.
   */
  description: string;
  /**
   * Os mesmos dados em forma estruturada. Hoje só a `description` é usada, mas
   * ficam expostos para a UI poder exibi-los em blocos próprios no futuro sem
   * ter que reparsear o texto.
   */
  objective: string;
  context: string;
  steps: VoiceTaskStep[];
  acceptance_criteria: string[];
  resources: string[];
  risks: string[];
  open_questions: string[];
  effort_estimate: "" | "small" | "medium" | "large" | "extra_large";
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  assignee_ids: string[];
  assignee_names: string[];
  /** Nomes ditos no áudio que não casaram com nenhum colaborador. */
  unmatched_assignees: string[];
  project_id: string | null;
  project_name: string | null;
  checklist_items: { text: string; checked: boolean }[];
  model: string;
}

/** Converte o File gravado em base64 sem estourar a call stack. */
async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function useTaskVoiceAI() {
  const [isProcessing, setIsProcessing] = useState(false);

  const processAudio = useCallback(async (file: File): Promise<VoiceTaskDraft> => {
    setIsProcessing(true);
    try {
      // O modelo só aceita wav/mp3 — o MediaRecorder entrega webm/opus.
      const wav = await toWav16kMono(file);
      const audio_base64 = await fileToBase64(wav);
      const { data, error } = await supabase.functions.invoke("task-voice-ai", {
        body: { audio_base64, mime: wav.type },
      });

      if (error) {
        // A Edge Function devolve `{ error: "..." }` no corpo em falhas de negócio.
        const detail = (error as { context?: { body?: unknown } })?.context?.body;
        throw new Error(
          (typeof detail === "string" ? detail : null) ||
            error.message ||
            "Falha ao processar o áudio"
        );
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.title) throw new Error("Não consegui entender uma tarefa nesse áudio");

      return data as VoiceTaskDraft;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { processAudio, isProcessing };
}
