/**
 * MeetRoom — v8.7.8
 * Página /meet/:roomId — videoconferência nativa LiveKit, fullscreen.
 * - PreJoin (mic/cam check) → LiveKitRoom + composição manual
 * - Roles via querystring (?role=host|guest|observer)
 * - Observer pula PreJoin (entra invisível)
 * - Áudio otimizado para voz + fundo virtual + filtro Krisp
 * - ControlBar 100% custom em PT-BR (MeetControlBar)
 *   • Encerrar p/ todos, Convidar externo e Conversa ficam DENTRO da barra
 * - Chat em Sheet lateral (não flutua sobre vídeo)
 * - MeetStage com FocusLayout automático para screen share + botão fullscreen
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BRAND } from "@/config/brand";
import {
  LiveKitRoom,
  LayoutContextProvider,
  type LocalUserChoices,
} from "@livekit/components-react";
import { BoostedAudioRenderer } from "@/components/meetings/BoostedAudioRenderer";
import { MeetPreJoin } from "@/components/meetings/MeetPreJoin";
import { AudioPresets, VideoPresets } from "livekit-client";
import "@livekit/components-styles";
import "@/styles/livekit-theme.css";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, ArrowLeft, Mic, MicOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMeetToken, useEndRoom, type MeetRole } from "@/hooks/useLiveKit";
import { useAuth } from "@/hooks/useAuth";
import { useEmployees } from "@/hooks/useEmployees";
import { GuestApprovalPanel } from "@/components/meetings/GuestApprovalPanel";
import { MeetControlBar } from "@/components/meetings/MeetControlBar";
import { MeetStage } from "@/components/meetings/MeetStage";
import { MeetChat } from "@/components/meetings/MeetChat";
import { MeetChatProvider } from "@/components/meetings/MeetChatStore";
import { useLiveKitTranscription } from "@/hooks/useLiveKitTranscription";
import { useMeetRoomSounds } from "@/hooks/useMeetRoomSounds";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";
import { useMeetingByRoomName } from "@/hooks/useMeetingByRoomName";
import { toast } from "sonner";

export default function MeetRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const role = (searchParams.get("role") || "guest") as MeetRole;
  const defaultName = searchParams.get("name") || "";
  const isObserver = role === "observer";

  const { user, profile } = useAuth();
  const { data: employees } = useEmployees();
  const myEmployee = employees?.find((e) => e.user_id === user?.id);
  const { prefs } = useMeetPreferences();

  const fallbackName =
    defaultName ||
    prefs.displayName ||
    profile?.full_name ||
    myEmployee?.full_name ||
    user?.email?.split("@")[0] ||
    "Participante";

  const [choices, setChoices] = useState<LocalUserChoices | null>(
    isObserver
      ? ({ username: fallbackName, videoEnabled: false, audioEnabled: false } as LocalUserChoices)
      : null,
  );
  const [ended, setEnded] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Acompanha o estado real do fullscreen (ESC, F11, etc.)
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const handleToggleFullscreen = async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.warn("[MeetRoom] fullscreen bloqueado:", err);
    }
  };

  const participantName = choices?.username || fallbackName;
  const tokenQ = useMeetToken(roomId, role, participantName, !!choices);
  const endRoom = useEndRoom();

  const isHost = tokenQ.data?.role === "host";

  // Vincula a sala LiveKit a um registro `meetings` (cria sob demanda se host)
  const { meetingId, title: meetingTitle } = useMeetingByRoomName(roomId, {
    createIfMissing: isHost,
    title: `Reunião ${roomId}`,
  });

  const handleEndForAll = async () => {
    if (!roomId) return;
    try {
      await endRoom.mutateAsync(roomId);
      toast.success("Reunião encerrada para todos os participantes.");
      setEnded(true);
    } catch (err) {
      toast.error((err as Error)?.message || "Falha ao encerrar a reunião.");
    }
  };

  // SEO básico
  useEffect(() => {
    document.title = `Reunião · ${BRAND.appName}`;
  }, []);

  if (ended) {
    return (
      <FullScreen>
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Reunião encerrada</h1>
          <p className="text-muted-foreground">Obrigado pela participação.</p>
          <Button onClick={() => navigate("/reunioes")} variant="default">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Reuniões
          </Button>
        </div>
      </FullScreen>
    );
  }

  if (!roomId) {
    return (
      <FullScreen>
        <p className="text-destructive">Sala inválida.</p>
      </FullScreen>
    );
  }

  if (!choices) {
    return (
      <MeetPreJoin
        defaultName={fallbackName}
        onSubmit={(c) =>
          setChoices({
            username: c.username,
            videoEnabled: c.videoEnabled,
            audioEnabled: c.audioEnabled,
          } as LocalUserChoices)
        }
      />
    );
  }

  if (tokenQ.isLoading) {
    return (
      <FullScreen>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Conectando...
        </div>
      </FullScreen>
    );
  }

  if (tokenQ.isError || !tokenQ.data) {
    return (
      <FullScreen>
        <div className="text-center space-y-3">
          <p className="text-destructive font-medium">
            {(tokenQ.error as Error)?.message || "Erro ao gerar token"}
          </p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </div>
      </FullScreen>
    );
  }

  // Quando Krisp AI está ativo, o NS e AGC nativos do browser conflitam com ele:
  // - NS nativo distorce o sinal antes do Krisp processar (perda de qualidade).
  // - AGC nativo brigando com Krisp causa "pumping" (oscilação de volume).
  // Solução: deixar Krisp cuidar de NS+AGC, manter apenas echoCancellation
  // nativo (Krisp não faz cancelamento de eco). Quando Krisp indisponível,
  // cair para os filtros nativos. Recomendação oficial LiveKit/Krisp.
  const krispActive = prefs.audioEnhanced && prefs.noiseFilter;

  const audioCaptureDefaults = krispActive
    ? {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: 48000,
      }
    : prefs.audioEnhanced
      ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        }
      : {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };

  return (
    <div
      ref={rootRef}
      data-lk-theme="default"
      className="dark h-[100dvh] w-screen bg-black relative flex flex-col"
    >
      <LiveKitRoom
        token={tokenQ.data.token}
        serverUrl={tokenQ.data.url}
        connect
        video={
          choices.videoEnabled
            ? prefs.videoInputDeviceId
              ? { deviceId: { ideal: prefs.videoInputDeviceId } }
              : true
            : false
        }
        audio={
          choices.audioEnabled
            ? {
                ...audioCaptureDefaults,
                ...(prefs.audioInputDeviceId
                  ? { deviceId: { ideal: prefs.audioInputDeviceId } }
                  : {}),
              }
            : false
        }
        options={{
          // Performance (v8.10.7):
          // - adaptiveStream pausa/baixa qualidade de tracks que não estão visíveis
          //   no DOM (off-screen / janela em background) — corte gigante de CPU/banda.
          // - dynacast deixa de publicar layers de simulcast que ninguém está
          //   consumindo, reduzindo upload do publisher.
          // - publishDefaults fixa simulcast + 540p como teto, com layers h180/h360
          //   para clientes em condições piores. Antes a câmera ia em 720p sem
          //   simulcast, derrubando reuniões com 8+ participantes.
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            ...audioCaptureDefaults,
            ...(prefs.audioInputDeviceId ? { deviceId: prefs.audioInputDeviceId } : {}),
          },
          videoCaptureDefaults: {
            resolution: VideoPresets.h540.resolution,
            ...(prefs.videoInputDeviceId ? { deviceId: prefs.videoInputDeviceId } : {}),
          },
          publishDefaults: {
            audioPreset: AudioPresets.speech,
            dtx: true,
            red: true,
            simulcast: true,
            videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
            videoEncoding: VideoPresets.h540.encoding,
            screenShareEncoding: VideoPresets.h1080.encoding,
          },
        }}
        onDisconnected={() => setEnded(true)}
        className="h-full w-full flex flex-col"
      >
        <LayoutContextProvider>
         <MeetChatProvider>
          <div className="flex-1 min-h-0 relative">
            <MeetStage />
          </div>
          <BoostedAudioRenderer />
          <MeetSounds />

          {/* Banner inferior: horário+título à esquerda, controles centralizados */}
          <div className="relative bg-black pb-[env(safe-area-inset-bottom)]">
            <MeetInfoChip title={meetingTitle ?? "Reunião"} />
            <MeetControlBar
              isHost={!!isHost}
              roomName={roomId}
              showChat={showChat}
              onToggleChat={() => setShowChat((v) => !v)}
              onEndForAll={handleEndForAll}
              endingForAll={endRoom.isPending}
              isFullscreen={isFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
            />
          </div>

          {/* Chat lateral custom em PT-BR (substitui o <Chat /> padrão problemático). */}
          <Sheet open={showChat} onOpenChange={setShowChat}>
            <SheetContent
              side="right"
              className="w-full sm:max-w-md p-0 flex flex-col gap-0"
            >
              <SheetHeader className="px-4 py-3 border-b border-border">
                <SheetTitle>Conversa da reunião</SheetTitle>
              </SheetHeader>
              <div className="flex-1 min-h-0 overflow-hidden">
                <MeetChat />
              </div>
            </SheetContent>
          </Sheet>

          {isHost && (
            <>
              {/* Painel de aprovação flutuante */}
              <GuestApprovalPanel roomName={roomId} />

              {/* Transcrição automática + indicador de status visível ao host */}
              <TranscriptionStatus meetingId={meetingId} />
            </>
          )}
         </MeetChatProvider>
        </LayoutContextProvider>
      </LiveKitRoom>
    </div>
  );
}

/**
 * Roda a transcrição automática (host) e mostra um indicador de status ao vivo.
 * Antes era "Silent" (sem UI) — falhas de captura ficavam invisíveis. Agora o host
 * vê se está capturando, quantos microfones entraram e quantos trechos já foram
 * pegos; erros viram toast. Assim dá pra diagnosticar/retomar na hora.
 */
function TranscriptionStatus({ meetingId }: { meetingId: string | null }) {
  const t = useLiveKitTranscription(meetingId, !!meetingId);
  const errShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (t.error && errShownRef.current !== t.error) {
      errShownRef.current = t.error;
      toast.error(`Transcrição: ${t.error}`);
    }
    if (!t.error) errShownRef.current = null;
  }, [t.error]);

  if (!meetingId) return null;

  const state = t.error
    ? { label: "Transcrição com erro", dot: "bg-destructive", Icon: AlertTriangle, spin: false }
    : t.isReconnecting
    ? { label: "Reconectando transcrição…", dot: "bg-amber-500", Icon: Loader2, spin: true }
    : !t.isReady
    ? { label: "Iniciando transcrição…", dot: "bg-amber-500", Icon: Loader2, spin: true }
    : t.participantsCaptured === 0
    ? { label: "Transcrição ligada · sem microfone captado", dot: "bg-amber-500", Icon: MicOff, spin: false }
    : { label: `Transcrevendo · ${t.participantsCaptured} mic${t.participantsCaptured > 1 ? "s" : ""}`, dot: "bg-emerald-500", Icon: Mic, spin: false };

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
      <span className={cn("h-2 w-2 rounded-full", state.dot, !t.error && t.isReady && "animate-pulse")} />
      <state.Icon className={cn("h-3.5 w-3.5 text-muted-foreground", state.spin && "animate-spin")} />
      <span className="font-medium text-foreground">{state.label}</span>
      {t.transcript.length > 0 && (
        <span className="text-muted-foreground">· {t.transcript.length} trecho{t.transcript.length > 1 ? "s" : ""}</span>
      )}
    </div>
  );
}

/** Toca chime quando alguém entra/sai da call. Sem UI. */
function MeetSounds() {
  useMeetRoomSounds();
  return null;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}

/** Chip "horário | título" alinhado à esquerda do banner inferior (Meet-style). */
function MeetInfoChip({ title }: { title: string }) {
  const [now, setNow] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setNow(formatClock(new Date())), 30 * 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-10 pointer-events-none hidden md:flex items-center gap-2 text-sm text-white/80 select-none">
      <span className="tabular-nums font-medium">{now}</span>
      <span className="text-white/30">|</span>
      <span className="font-medium truncate max-w-[30vw]">{title}</span>
    </div>
  );
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
