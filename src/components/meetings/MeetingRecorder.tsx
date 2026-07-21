/**
 * MeetingRecorder — v8.7.7
 * Refatorado para usar o hook reutilizável `useSoniox`. Mantém:
 *  - Captura do microfone padrão (captureFromMic: true)
 *  - System audio opcional (compartilhar aba) — passado como external stream
 *  - VU meter, pause/resume, cronômetro
 *  - Disparo de meeting-ai ao encerrar
 */
import { useState, useRef, useCallback, useEffect, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Mic, MicOff, Square, Loader2, AlertCircle, Clock, WifiOff, Volume2, Monitor, MonitorOff } from "lucide-react";
import { useUpdateMeeting, useProcessTranscript, type Meeting } from "@/hooks/useMeetings";
import { useSoniox } from "@/hooks/useSoniox";
import { toast } from "sonner";

interface Props {
  meeting: Meeting;
  onProcessingComplete: () => void;
}

const SPEAKER_COLORS = [
  "text-area-acquisition",
  "text-success",
  "text-primary",
  "text-warning",
  "text-danger",
  "text-info",
  "text-primary",
  "text-warning",
];

const SPEAKER_BG_COLORS = [
  "bg-area-acquisition/10",
  "bg-success/10",
  "bg-primary/10",
  "bg-warning/10",
  "bg-danger/10",
  "bg-info/10",
  "bg-primary/10",
  "bg-warning/10",
];

function getSpeakerColor(speaker: string, type: "text" | "bg" = "text") {
  const hash = speaker.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const colors = type === "text" ? SPEAKER_COLORS : SPEAKER_BG_COLORS;
  return colors[hash % colors.length];
}

function detectCapabilities(): { supported: boolean; reason?: string } {
  if (typeof window === "undefined") return { supported: false, reason: "Ambiente sem navegador." };
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    return { supported: false, reason: "Gravação de áudio requer HTTPS." };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { supported: false, reason: "Seu navegador não suporta captura de áudio (getUserMedia)." };
  }
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return { supported: false, reason: "Seu navegador não suporta AudioContext." };
  if (!window.WebSocket) return { supported: false, reason: "Seu navegador não suporta WebSocket." };
  return { supported: true };
}

export const MeetingRecorder = forwardRef<HTMLDivElement, Props>(function MeetingRecorder({ meeting, onProcessingComplete }, ref) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [browserSupport] = useState(() => detectCapabilities());
  const [systemAudioActive, setSystemAudioActive] = useState(false);
  const [systemAudioSupported] = useState(() =>
    typeof navigator?.mediaDevices?.getDisplayMedia === "function",
  );

  const systemStreamRef = useRef<MediaStream | null>(null);
  const extraStreamsRef = useRef<MediaStream[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const updateMeeting = useUpdateMeeting();
  const processTranscript = useProcessTranscript();

  const soniox = useSoniox({
    enabled: isRecording,
    captureFromMic: isRecording,
    paused: isPaused,
    externalStreams: extraStreamsRef,
  });

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // System audio: captura aba e adiciona à lista de extras
  const addSystemAudio = useCallback(async () => {
    try {
      let displayStream: MediaStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({ video: false, audio: true } as any);
      } catch {
        displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true } as any);
        displayStream.getVideoTracks().forEach((t) => t.stop());
      }
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        toast.warning("Nenhum áudio do sistema detectado. Marque 'Compartilhar áudio' ao escolher a aba.");
        return;
      }
      systemStreamRef.current = displayStream;
      extraStreamsRef.current = [...extraStreamsRef.current, displayStream];
      setSystemAudioActive(true);
      audioTracks[0].onended = () => removeSystemAudio();
      toast.success("Áudio do sistema conectado!");
    } catch (err: any) {
      if (err.name === "NotAllowedError") toast.info("Compartilhamento cancelado.");
      else toast.error("Erro ao capturar áudio do sistema: " + (err.message || ""));
    }
  }, []);

  const removeSystemAudio = useCallback(() => {
    systemStreamRef.current?.getTracks().forEach((t) => t.stop());
    extraStreamsRef.current = extraStreamsRef.current.filter((s) => s !== systemStreamRef.current);
    systemStreamRef.current = null;
    setSystemAudioActive(false);
    toast.info("Áudio do sistema desconectado.");
  }, []);

  const startRecording = useCallback(async () => {
    if (!browserSupport.supported) return;
    try {
      await updateMeeting.mutateAsync({
        id: meeting.id,
        updates: { status: "recording", started_at: new Date().toISOString() },
      });
      setIsRecording(true);
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar gravação");
    }
  }, [browserSupport.supported, meeting.id, updateMeeting]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    // Cleanup system audio
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach((t) => t.stop());
      systemStreamRef.current = null;
      extraStreamsRef.current = [];
      setSystemAudioActive(false);
    }

    setIsRecording(false);
    setIsPaused(false);

    // stop() retorna o transcript final acumulado (incluindo tokens recebidos
    // entre o EOF e o close do WS) — evita stale closure que zerava a transcrição.
    const finalTokens = await soniox.stop();
    const fullTranscript = finalTokens.map((t) => `[${t.speaker}]: ${t.text}`).join("\n");

    if (!fullTranscript.trim()) {
      toast.warning("Nenhuma transcrição capturada — verifique o microfone e tente novamente.");
      await updateMeeting.mutateAsync({
        id: meeting.id,
        updates: { status: "scheduled", ended_at: new Date().toISOString(), duration_seconds: elapsedSeconds },
      }).catch(() => undefined);
      return;
    }

    await updateMeeting.mutateAsync({
      id: meeting.id,
      updates: {
        status: "processing",
        ended_at: new Date().toISOString(),
        duration_seconds: elapsedSeconds,
        transcript_raw: fullTranscript,
      },
    });

    toast.info("Processando transcrição com IA...");
    try {
      await processTranscript.mutateAsync({ meeting_id: meeting.id, transcript: fullTranscript });
      onProcessingComplete();
    } catch (err: any) {
      toast.error("Erro ao processar: " + (err.message || "Tente novamente"));
    }
  }, [elapsedSeconds, meeting.id, updateMeeting, processTranscript, onProcessingComplete, soniox]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [soniox.transcript, soniox.liveText]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      systemStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const audioProcessedSeconds = Math.floor(soniox.audioProcessedMs / 1000);

  return (
    <Card ref={ref}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Gravação</CardTitle>
        <div className="flex items-center gap-2">
          {soniox.isReconnecting && (
            <Badge variant="outline" className="text-xs text-warning border-warning/30 gap-1">
              <WifiOff className="w-3 h-3" />
              Reconectando...
            </Badge>
          )}
          {isRecording && (
            <>
              <Badge variant="destructive" className="animate-pulse">
                <span className="w-2 h-2 rounded-full bg-destructive-foreground mr-1.5 inline-block" />
                {isPaused ? "PAUSADO" : "REC"} {formatTime(elapsedSeconds)}
              </Badge>
              {soniox.isReady && <Badge variant="outline" className="text-xs">Soniox ✓</Badge>}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!browserSupport.supported && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {browserSupport.reason}
          </div>
        )}

        {soniox.error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {soniox.error}
          </div>
        )}

        <div className="flex items-center gap-2">
          {!isRecording ? (
            <Button onClick={startRecording} disabled={!browserSupport.supported} className="gap-2">
              <Mic className="w-4 h-4" />
              Iniciar Gravação
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsPaused((p) => !p)} className="gap-2">
                {isPaused ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                {isPaused ? "Retomar" : "Pausar"}
              </Button>
              <Button
                variant="destructive"
                onClick={stopRecording}
                disabled={processTranscript.isPending}
                className="gap-2"
              >
                {processTranscript.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Encerrar Reunião
              </Button>
              {systemAudioSupported && (
                <Button
                  variant={systemAudioActive ? "secondary" : "outline"}
                  onClick={systemAudioActive ? removeSystemAudio : addSystemAudio}
                  className="gap-2"
                  title={systemAudioActive
                    ? "Desconectar áudio do sistema"
                    : "Capturar áudio da aba do Meet/Zoom (compartilhar aba)"
                  }
                >
                  {systemAudioActive ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                  {systemAudioActive ? "Desconectar Áudio" : "Áudio do Sistema"}
                </Button>
              )}
            </>
          )}
        </div>

        {isRecording && systemAudioActive && (
          <div className="flex items-center gap-2 text-xs bg-primary/10 text-primary p-2 rounded-lg">
            <Monitor className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Capturando áudio do sistema + microfone. A aba compartilhada deve permanecer aberta.</span>
          </div>
        )}
        {isRecording && !systemAudioActive && systemAudioSupported && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
            <Monitor className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
            <span>Dica: Clique em "Áudio do Sistema" para capturar a fala dos outros participantes no Meet/Zoom.</span>
          </div>
        )}

        {isRecording && (
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${Math.min(100, soniox.audioLevel)}%`,
                  backgroundColor:
                    soniox.audioLevel > 70
                      ? "hsl(var(--destructive))"
                      : soniox.audioLevel > 30
                        ? "hsl(var(--primary))"
                        : "hsl(var(--muted-foreground))",
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{soniox.audioLevel}%</span>
          </div>
        )}

        {isRecording && soniox.audioProcessedMs > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Áudio processado: {formatTime(audioProcessedSeconds)}</span>
            <Progress value={Math.min(100, (audioProcessedSeconds / Math.max(elapsedSeconds, 1)) * 100)} className="flex-1 h-1.5" />
          </div>
        )}

        <ScrollArea className="h-64 rounded-lg border p-4 bg-muted/30">
          <div className="space-y-1.5 text-sm">
            {soniox.transcript.map((entry, i) => (
              <div key={i} className={`flex items-start gap-2 p-1.5 rounded ${getSpeakerColor(entry.speaker, "bg")}`}>
                <Badge variant="outline" className={`text-xs flex-shrink-0 font-mono ${getSpeakerColor(entry.speaker)}`}>
                  {entry.speaker}
                </Badge>
                <span className="text-foreground leading-relaxed">{entry.text}</span>
              </div>
            ))}
            {soniox.liveText && (
              <div className={`flex items-start gap-2 p-1.5 rounded opacity-60 ${soniox.liveSpeaker ? getSpeakerColor(soniox.liveSpeaker, "bg") : ""}`}>
                {soniox.liveSpeaker && (
                  <Badge variant="outline" className={`text-xs flex-shrink-0 font-mono ${getSpeakerColor(soniox.liveSpeaker)}`}>
                    {soniox.liveSpeaker}
                  </Badge>
                )}
                <span className="text-muted-foreground italic leading-relaxed">{soniox.liveText}</span>
              </div>
            )}
            {soniox.transcript.length === 0 && !soniox.liveText && isRecording && (
              <div className="text-center text-muted-foreground py-8">
                <Mic className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Aguardando fala...</p>
                <p className="text-xs mt-1">Fale normalmente — a transcrição aparecerá aqui em tempo real</p>
              </div>
            )}
            {!isRecording && soniox.transcript.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <p>Clique em "Iniciar Gravação" para começar</p>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {soniox.transcript.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {soniox.transcript.length} segmentos transcritos • {new Set(soniox.transcript.map((t) => t.speaker)).size} falantes detectados
          </div>
        )}
      </CardContent>
    </Card>
  );
});
