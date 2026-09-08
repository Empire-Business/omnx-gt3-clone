/**
 * VoiceTaskRecorder — cria tarefa por voz.
 *
 * Grava o áudio, envia para a Edge Function `task-voice-ai` e devolve um
 * rascunho estruturado (título, descrição, prioridade, prazo, responsáveis,
 * projeto e checklist) para o formulário de Nova Tarefa. O usuário sempre
 * revisa antes de salvar — nada é criado direto pela IA.
 */
import { useState } from "react";
import { Mic, Square, X, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useTaskVoiceAI, type VoiceTaskDraft } from "@/hooks/useTaskVoiceAI";
import { cn } from "@/lib/utils";

interface VoiceTaskRecorderProps {
  onDraft: (draft: VoiceTaskDraft) => void;
  className?: string;
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceTaskRecorder({ onDraft, className }: VoiceTaskRecorderProps) {
  const { start, stop, cancel, recording, elapsed, error: recorderError } = useVoiceRecorder();
  const { processAudio, isProcessing } = useTaskVoiceAI();
  const [error, setError] = useState<string | null>(null);

  const handleStop = async () => {
    setError(null);
    const file = await stop();
    if (!file || file.size < 1024) {
      setError("Áudio muito curto. Segure e fale por alguns segundos.");
      return;
    }
    try {
      const draft = await processAudio(file);
      onDraft(draft);
    } catch (e) {
      setError((e as Error).message ?? "Falha ao processar o áudio");
    }
  };

  const message = error ?? recorderError;

  if (isProcessing) {
    return (
      <div
        className={cn(
          "flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
        <span className="text-xs text-foreground min-w-0">
          Organizando o que você falou em uma tarefa…
        </span>
      </div>
    );
  }

  if (recording) {
    return (
      <div
        className={cn(
          "w-full min-w-0 overflow-hidden rounded-md border border-primary/40 bg-primary/5 px-3 py-2",
          className
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" aria-hidden />
          <span className="text-xs font-medium tabular-nums text-foreground shrink-0">
            {formatElapsed(elapsed)}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">gravando</span>
          <div className="flex-1 min-w-0" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-2xs shrink-0"
            onClick={() => { cancel(); setError(null); }}
          >
            <X className="w-3.5 h-3.5" />
            <span className="sr-only">Cancelar gravação</span>
          </Button>
          <Button type="button" size="sm" className="h-7 px-2.5 text-2xs gap-1 shrink-0" onClick={handleStop}>
            <Square className="w-3 h-3" /> Concluir
          </Button>
        </div>
        <p className="mt-1 text-2xs text-muted-foreground">
          Diga o que fazer, para quem e até quando.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0 space-y-1.5", className)}>
      <Button
        type="button"
        variant="outline"
        className="w-full h-10 gap-2 border-dashed"
        onClick={() => { setError(null); start(); }}
      >
        <Mic className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-medium truncate">Ditar tarefa</span>
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden />
      </Button>
      {message && (
        <p className="flex items-start gap-1.5 text-2xs text-destructive" role="alert">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{message}</span>
        </p>
      )}
    </div>
  );
}
