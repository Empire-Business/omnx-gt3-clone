/**
 * LiveKitTranscriptOverlay — v8.7.7
 * Painel flutuante (canto inferior-esquerdo, acima da ControlBar) que mostra a transcrição
 * ao vivo durante a call LiveKit. Toggle ON/OFF via botão "Captions".
 * Preferência persistida em useMeetPreferences.liveTranscriptionEnabled.
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Captions, CaptionsOff, ChevronDown, ChevronUp, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";
import { useLiveKitTranscription } from "@/hooks/useLiveKitTranscription";
import { cn } from "@/lib/utils";

interface Props {
  meetingId: string | null;
  isHost: boolean;
}

const SPEAKER_BG = [
  "bg-area-acquisition/15 text-area-acquisition",
  "bg-success/15 text-success",
  "bg-primary/15 text-primary",
  "bg-warning/15 text-warning",
  "bg-danger/15 text-danger",
  "bg-info/15 text-info",
];

function speakerColor(label: string) {
  const hash = label.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return SPEAKER_BG[hash % SPEAKER_BG.length];
}

export function LiveKitTranscriptOverlay({ meetingId, isHost }: Props) {
  const { prefs, update } = useMeetPreferences();
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Apenas host habilita transcrição (custo + 1 fluxo só por sala)
  const enabled = isHost && prefs.liveTranscriptionEnabled && !!meetingId;

  const { transcript, liveText, liveSpeaker, isReady, isReconnecting, error, participantsCaptured } =
    useLiveKitTranscription(meetingId, enabled);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript, liveText]);

  if (!isHost) return null;

  return (
    <div className="absolute bottom-20 left-4 z-40 w-80 max-w-[calc(100vw-2rem)]">
      <div className="rounded-lg border border-border bg-background/95 backdrop-blur-md shadow-xl overflow-hidden">
        {/* Header com toggle */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant={prefs.liveTranscriptionEnabled ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 gap-1.5"
              onClick={() => update({ liveTranscriptionEnabled: !prefs.liveTranscriptionEnabled })}
              title={prefs.liveTranscriptionEnabled ? "Desligar transcrição ao vivo" : "Ligar transcrição ao vivo"}
            >
              {prefs.liveTranscriptionEnabled ? (
                <Captions className="w-3.5 h-3.5" />
              ) : (
                <CaptionsOff className="w-3.5 h-3.5" />
              )}
              <span className="text-xs font-medium">Transcrição</span>
            </Button>
            {enabled && isReady && !isReconnecting && (
              <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                AO VIVO
              </Badge>
            )}
            {enabled && isReconnecting && (
              <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-1 text-warning border-warning/40">
                <WifiOff className="w-3 h-3" />
                Reconectando…
              </Badge>
            )}
            {enabled && !isReady && !isReconnecting && !error && (
              <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Conectando…
              </Badge>
            )}
            {enabled && error && (
              <Badge variant="destructive" className="h-5 text-[10px] px-1.5 gap-1">
                <AlertCircle className="w-3 h-3" />
                Erro
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expandir" : "Recolher"}
          >
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {/* Conteúdo */}
        {!collapsed && (
          <div className="p-2">
            {!prefs.liveTranscriptionEnabled ? (
              <p className="text-xs text-muted-foreground p-3 leading-relaxed">
                Ative a transcrição ao vivo para capturar a fala de todos os participantes em tempo
                real. O conteúdo será salvo automaticamente e processado pela IA ao encerrar a
                reunião.
              </p>
            ) : error ? (
              <p className="text-xs text-destructive p-3">{error}</p>
            ) : (
              <>
                <ScrollArea className="h-48">
                  <div className="space-y-1 text-xs pr-2">
                    {transcript.length === 0 && !liveText && (
                      <p className="text-muted-foreground italic p-2">Aguardando fala…</p>
                    )}
                    {transcript.map((t, i) => (
                      <div
                        key={i}
                        className={cn("rounded px-2 py-1 leading-snug", speakerColor(t.speaker))}
                      >
                        <span className="font-semibold mr-1.5">{t.speaker}:</span>
                        <span className="text-foreground">{t.text}</span>
                      </div>
                    ))}
                    {liveText && (
                      <div
                        className={cn(
                          "rounded px-2 py-1 leading-snug opacity-60 italic",
                          liveSpeaker ? speakerColor(liveSpeaker) : "bg-muted",
                        )}
                      >
                        {liveSpeaker && <span className="font-semibold mr-1.5">{liveSpeaker}:</span>}
                        <span className="text-muted-foreground">{liveText}</span>
                      </div>
                    )}
                    <div ref={scrollRef} />
                  </div>
                </ScrollArea>
                <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-muted-foreground">
                  <span>{participantsCaptured} mic(s) capturado(s)</span>
                  <span>{transcript.length} segmentos</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
