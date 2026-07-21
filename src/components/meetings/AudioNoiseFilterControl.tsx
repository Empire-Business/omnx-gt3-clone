/**
 * AudioNoiseFilterControl — v8.10.2
 * Botão na MeetControlBar que liga/desliga o cancelamento de ruído Krisp AI.
 *
 * v8.10.2 — Fix: voz desaparecia ao reativar Krisp depois de desligar.
 *   Causa: instância antiga do KrispNoiseFilter já parada era reaproveitada,
 *   resultando em pipeline de áudio quebrado (track sem fluxo audível).
 *   Correção: cria SEMPRE uma instância nova ao ligar e descarta a referência
 *   ao desligar. Também remove processador antes de reaplicar para evitar
 *   empilhamento.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { Track, ParticipantEvent, type LocalAudioTrack } from "livekit-client";
import { KrispNoiseFilter, isKrispNoiseFilterSupported } from "@livekit/krisp-noise-filter";
import { Sparkles, Waves } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";

export function AudioNoiseFilterControl() {
  const { localParticipant } = useLocalParticipant();
  const { prefs, update } = useMeetPreferences();
  const processorRef = useRef<ReturnType<typeof KrispNoiseFilter> | null>(null);
  const [busy, setBusy] = useState(false);

  const supported = isKrispNoiseFilterSupported();
  const active = supported && prefs.noiseFilter;

  const getAudioTrack = useCallback((): LocalAudioTrack | null => {
    const pub = localParticipant?.getTrackPublication(Track.Source.Microphone);
    return (pub?.track as LocalAudioTrack | undefined) ?? null;
  }, [localParticipant]);

  const applyFilter = useCallback(
    async (enabled: boolean) => {
      if (!supported) {
        toast.error("Cancelamento de ruído requer WebAssembly (Chrome, Edge ou Firefox atualizado).");
        return;
      }
      const track = getAudioTrack();
      if (!track) return;

      setBusy(true);
      try {
        // Limpa ref ANTES de qualquer chamada para que, se algo falhar, o auto-effect
        // possa reaplicar (não fica preso achando que o processador ainda está ativo).
        processorRef.current = null;
        try {
          await track.stopProcessor();
        } catch {
          // sem processador anterior — ok
        }
        if (enabled) {
          const proc = KrispNoiseFilter();
          await track.setProcessor(proc);
          processorRef.current = proc;
        }
        update({ noiseFilter: enabled });
      } catch (err) {
        console.error("[AudioNoiseFilter] falha ao aplicar processador:", err);
        toast.error("Falha ao aplicar cancelamento de ruído.");
      } finally {
        setBusy(false);
      }
    },
    [getAudioTrack, supported, update],
  );

  // Aplica automaticamente quando a faixa de áudio fica disponível.
  // Antes só dependia de `localParticipant` (referência estável) — quando o
  // mic era publicado depois do mount, o efeito não re-rodava e o filtro
  // ficava aparentemente "off" até o usuário desligar+ligar.
  useEffect(() => {
    if (!supported || !prefs.noiseFilter || !localParticipant) return;

    const tryApply = () => {
      const track = getAudioTrack();
      if (!track || processorRef.current) return;
      void applyFilter(true);
    };

    // Tenta aplicar imediatamente (caso já haja track)
    tryApply();

    // E também quando o mic for publicado/(re)inscrito depois
    const onPublished = () => tryApply();
    localParticipant.on(ParticipantEvent.LocalTrackPublished, onPublished);
    localParticipant.on(ParticipantEvent.TrackMuted, onPublished);
    localParticipant.on(ParticipantEvent.TrackUnmuted, onPublished);

    return () => {
      localParticipant.off(ParticipantEvent.LocalTrackPublished, onPublished);
      localParticipant.off(ParticipantEvent.TrackMuted, onPublished);
      localParticipant.off(ParticipantEvent.TrackUnmuted, onPublished);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localParticipant, supported, prefs.noiseFilter]);

  const handleToggle = () => {
    if (!supported) {
      toast.error("Cancelamento de ruído requer WebAssembly (Chrome, Edge ou Firefox atualizado).");
      return;
    }
    void applyFilter(!prefs.noiseFilter);
  };

  const tooltipText = !supported
    ? "Cancelamento de ruído indisponível neste navegador"
    : active
      ? "Krisp AI: removendo ruído de fundo e mantendo só a voz"
      : "Filtro desligado — áudio cru sem cancelamento de ruído";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy || !supported}
          aria-pressed={active}
          aria-label={active ? "Desligar cancelamento de ruído" : "Ligar cancelamento de ruído"}
          className={
            "h-11 w-11 rounded-full flex items-center justify-center transition-colors " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
            "disabled:opacity-50 disabled:cursor-not-allowed " +
            (active
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted/40 hover:bg-muted/70 text-foreground")
          }
        >
          {active ? <Sparkles className="w-5 h-5" /> : <Waves className="w-5 h-5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
