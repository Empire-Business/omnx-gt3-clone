/**
 * MeetRoom — v8.36.0
 * Página /meet/:roomId — videoconferência nativa LiveKit, fullscreen.
 * - PreJoin (mic/cam check) → LiveKitRoom + composição manual
 * - Roles via querystring (?role=host|guest|observer)
 * - Observer pula PreJoin (entra invisível)
 * - Áudio otimizado para voz + fundo virtual + filtro Krisp
 * - ControlBar 100% custom em PT-BR (MeetControlBar)
 *   • Encerrar p/ todos, Convidar externo e Conversa ficam DENTRO da barra
 * - Chat em Sheet lateral (não flutua sobre vídeo)
 * - Painel de participantes (quem está na sala)
 * - MeetStage com FocusLayout automático para screen share
 *
 * v8.36.0
 * - Desconexão: só motivos TERMINAIS encerram a sala. Queda de rede/servidor
 *   mostra "Conexão perdida" com botão para voltar (antes qualquer oscilação
 *   expulsava o usuário sem volta).
 * - <ConnectionStateToast /> montado (o usuário vê "Reconectando…").
 * - Indicador "GRAVANDO" (LGPD) — fonte da verdade: meetings.recording_status.
 * - Atalhos de teclado (M/V) via useMeetShortcuts.
 * - Transcrição: LiveKitTranscriptOverlay substitui o antigo TranscriptionStatus e
 *   vira o ÚNICO consumidor de useLiveKitTranscription na página (nunca pode haver
 *   dois — seriam duas sessões Soniox e duas escritas em transcript_raw).
 *   O pipeline segue rodando para o host como antes; as LEGENDAS nascem desligadas
 *   (prefs.liveTranscriptionEnabled, default false).
 * - Zero cores hardcoded (tokens semânticos).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BRAND } from "@/config/brand";
import {
  LiveKitRoom,
  LayoutContextProvider,
  ConnectionStateToast,
  useParticipants,
  type LocalUserChoices,
} from "@livekit/components-react";
import { BoostedAudioRenderer } from "@/components/meetings/BoostedAudioRenderer";
import { MeetPreJoin } from "@/components/meetings/MeetPreJoin";
import { DisconnectReason } from "livekit-client";
import "@livekit/components-styles";
import "@/styles/livekit-theme.css";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, ArrowLeft, WifiOff, RotateCw, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMeetToken, useEndRoom, type MeetRole } from "@/hooks/useLiveKit";
import { useAuth } from "@/hooks/useAuth";
import { useEmployees } from "@/hooks/useEmployees";
import { GuestApprovalPanel } from "@/components/meetings/GuestApprovalPanel";
import { MeetControlBar } from "@/components/meetings/MeetControlBar";
import { MeetStage } from "@/components/meetings/MeetStage";
import { MeetChat } from "@/components/meetings/MeetChat";
import { MeetChatProvider, useMeetChatStore } from "@/components/meetings/MeetChatStore";
import { MeetParticipantsPanel } from "@/components/meetings/MeetParticipantsPanel";
import { useMeetShortcuts } from "@/components/meetings/useMeetShortcuts";
import {
  buildMeetRoomOptions,
  useCapturaPorTamanhoDaSala,
} from "@/components/meetings/room-options";
import { LiveKitTranscriptOverlay } from "@/components/meetings/LiveKitTranscriptOverlay";
import { useMeetRoomSounds } from "@/hooks/useMeetRoomSounds";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";
import { useMeetingByRoomName } from "@/hooks/useMeetingByRoomName";
import { toast } from "sonner";

/**
 * Motivos de desconexão que realmente encerram a participação.
 * Qualquer outro (SIGNAL_CLOSE, SERVER_SHUTDOWN, UNKNOWN_REASON, queda de rede)
 * é tratado como perda temporária de conexão — com botão de voltar.
 */
const TERMINAL_DISCONNECT_REASONS: DisconnectReason[] = [
  DisconnectReason.CLIENT_INITIATED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.DUPLICATE_IDENTITY,
];

function disconnectMessage(reason: DisconnectReason): string {
  switch (reason) {
    case DisconnectReason.SERVER_SHUTDOWN:
      return "O servidor da reunião reiniciou. Você pode voltar agora.";
    case DisconnectReason.SIGNAL_CLOSE:
      return "A conexão com o servidor da reunião caiu.";
    case DisconnectReason.JOIN_FAILURE:
      return "Não foi possível concluir a entrada na sala.";
    default:
      return "Sua conexão com a reunião foi interrompida.";
  }
}

export default function MeetRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // O papel pedido na URL é apenas uma DICA — a autoridade é a edge function
  // `livekit-token`, que rebaixa para `guest` quem não for o criador da reunião
  // (ver `finalRole` lá). Por isso o default aqui é `host`, não `guest`.
  //
  // Com o default antigo (`guest`), qualquer entrada sem `?role=host` na URL —
  // link colado, favorito, abrir /meet/:sala na mão — fazia até o PRÓPRIO criador
  // entrar como convidado. E como o pipeline de transcrição só roda para o host
  // (LiveKitTranscriptOverlay), a reunião gravava vídeo e não transcrevia nada,
  // em silêncio: `transcript_raw` ficava NULL e só se descobria dias depois, ao
  // clicar em "Reprocessar IA" e receber um 400.
  const requestedRole = searchParams.get("role") as MeetRole | null;
  const role: MeetRole = requestedRole ?? "host";
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
  /** Desconexão NÃO terminal (rede/servidor) — permite voltar para a sala. */
  const [lostConnection, setLostConnection] = useState<DisconnectReason | null>(null);
  const [rejoining, setRejoining] = useState(false);
  /** Muda a cada reentrada para forçar a remontagem do LiveKitRoom. */
  const [connectKey, setConnectKey] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
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
  const meetingOpts = useMemo(
    () => ({ createIfMissing: isHost, title: `Reunião ${roomId}` }),
    [isHost, roomId],
  );
  const {
    meetingId,
    title: meetingTitle,
    recordingStatus,
    resolved: meetingResolved,
  } = useMeetingByRoomName(roomId, meetingOpts);

  const isRecording = recordingStatus === "recording";

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

  /**
   * `onDisconnected` do LiveKit dispara em QUALQUER queda — inclusive oscilação
   * de rede. Antes isso caía direto na tela "Reunião encerrada", sem retorno.
   */
  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    if (reason === undefined || TERMINAL_DISCONNECT_REASONS.includes(reason)) {
      setEnded(true);
      return;
    }
    console.warn("[MeetRoom] desconectado (não terminal):", reason);
    setLostConnection(reason);
  }, []);

  /** Reentra na sala: refaz o token (pode ter expirado) e remonta o LiveKitRoom. */
  const handleRejoin = useCallback(async () => {
    setRejoining(true);
    try {
      await tokenQ.refetch();
    } catch (err) {
      console.warn("[MeetRoom] falha ao renovar token:", err);
    } finally {
      setRejoining(false);
    }
    setLostConnection(null);
    setEnded(false);
    setConnectKey((k) => k + 1);
  }, [tokenQ]);

  // SEO básico
  useEffect(() => {
    document.title = `Reunião · ${BRAND.appName}`;
  }, []);

  if (lostConnection !== null) {
    return (
      <FullScreen>
        <div className="text-center space-y-4 max-w-sm">
          <WifiOff className="w-10 h-10 mx-auto text-warning" aria-hidden />
          <h1 className="text-2xl font-semibold">Conexão perdida</h1>
          <p className="text-muted-foreground">{disconnectMessage(lostConnection)}</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={handleRejoin} disabled={rejoining}>
              {rejoining ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCw className="w-4 h-4 mr-2" />
              )}
              Voltar para a reunião
            </Button>
            <Button variant="outline" onClick={() => navigate("/reunioes")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (ended) {
    return (
      <FullScreen>
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Reunião encerrada</h1>
          <p className="text-muted-foreground">Obrigado pela participação.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={() => navigate("/reunioes")} variant="default">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Reuniões
            </Button>
            <Button variant="outline" onClick={handleRejoin} disabled={rejoining}>
              {rejoining ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCw className="w-4 h-4 mr-2" />
              )}
              Entrar novamente
            </Button>
          </div>
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
        /* O nome vem do perfil/colaborador: a tela confirma a identidade em vez
           de pedir que a pessoa digite o próprio nome. Se o perfil ainda não
           carregou, o campo continua aberto (o fallback seria "Participante"). */
        identityKnown={!!(profile?.full_name || myEmployee?.full_name)}
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
      className="dark h-[100dvh] w-screen bg-background relative flex flex-col"
    >
      <LiveKitRoom
        key={connectKey}
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
        // Performance: a configuração de mídia vive em `room-options.ts` — fonte
        // única compartilhada com MeetGuest.tsx. Ela adapta captura, simulcast e
        // bitrate ao PERFIL DA MÁQUINA (portado do omnx-meet); o ajuste por
        // tamanho da sala vem depois, no <AjusteDeCapturaPorSala /> lá dentro.
        options={buildMeetRoomOptions({
          audioCaptureDefaults,
          audioInputDeviceId: prefs.audioInputDeviceId || undefined,
          videoInputDeviceId: prefs.videoInputDeviceId || undefined,
        })}
        onDisconnected={handleDisconnected}
        className="h-full w-full flex flex-col"
      >
        <LayoutContextProvider>
         <MeetChatProvider isOpen={showChat}>
          <div className="flex-1 min-h-0 relative">
            <MeetStage />

            {/* LGPD: aviso de gravação em curso — visível também no mobile.
                Só aparece quando o banco confirma `recording_status = recording`. */}
            {isRecording && <RecordingBadge />}

            {/* Sala sem host = sala sem transcrição. Avisa quem está lá dentro. */}
            <TranscriptionCoverageWarning isHost={isHost} />

            {/* Transcrição do host: pipeline sempre ligado (alimenta a meeting-ai),
                legendas só se o host ligar. Único ponto que roda
                useLiveKitTranscription nesta página. */}
            {isHost && (
              <LiveKitTranscriptOverlay meetingId={meetingId} isHost={isHost} />
            )}
          </div>
          <BoostedAudioRenderer />
          <MeetSounds />
          <MeetShortcuts />
          <AjusteDeCapturaPorSala />

          {/* "Reconectando…" / "Conexão instável" visível ao usuário. */}
          <ConnectionStateToast />

          {/* Banner inferior: horário+título à esquerda, controles centralizados */}
          <div className="relative bg-background pb-[env(safe-area-inset-bottom)]">
            <MeetInfoChip title={meetingTitle} resolved={meetingResolved} />
            <ControlsWithParticipantCount
              isHost={!!isHost}
              roomName={roomId}
              showChat={showChat}
              onToggleChat={() => setShowChat((v) => !v)}
              showParticipants={showParticipants}
              onToggleParticipants={() => setShowParticipants((v) => !v)}
              isRecording={isRecording}
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

          {/* Quem está na sala */}
          <MeetParticipantsPanel open={showParticipants} onOpenChange={setShowParticipants} />

          {isHost && (
            /* Painel de aprovação flutuante */
            <GuestApprovalPanel roomName={roomId} />
          )}
         </MeetChatProvider>
        </LayoutContextProvider>
      </LiveKitRoom>
    </div>
  );
}

/**
 * Barra de controles + contagem de participantes.
 * `useParticipants` só funciona dentro do LiveKitRoom, daí o subcomponente.
 */
function ControlsWithParticipantCount(
  props: ComponentProps<typeof MeetControlBar>,
) {
  const participants = useParticipants();
  const { unreadCount } = useMeetChatStore();
  return (
    <MeetControlBar
      {...props}
      participantCount={participants.length}
      unreadChatCount={unreadCount}
    />
  );
}

/**
 * Indicador de gravação (LGPD). Fonte da verdade: `meetings.recording_status`.
 * Fica no topo do palco, acima do vídeo, e é visível em qualquer breakpoint.
 */
function RecordingBadge() {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "absolute top-2 left-1/2 -translate-x-1/2 sm:left-3 sm:translate-x-0 z-30",
        "pointer-events-none flex items-center gap-1.5 rounded-full",
        "border border-destructive/40 bg-background/85 backdrop-blur-md",
        "px-2.5 py-1 text-[11px] sm:text-xs font-semibold tracking-wide shadow-lg",
        "text-destructive",
      )}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
      </span>
      GRAVANDO
      <span className="sr-only">Esta reunião está sendo gravada.</span>
    </div>
  );
}

/** Espera antes de concluir que não há host na sala (ver componente abaixo). */
const HOST_DETECTION_GRACE_MS = 12_000;

/**
 * Aviso de COBERTURA DE TRANSCRIÇÃO.
 *
 * O pipeline Soniox → `meetings.transcript_raw` roda no navegador do HOST e só
 * dele (`LiveKitTranscriptOverlay`). A gravação de vídeo, ao contrário, é
 * server-side (egress disparado pelo webhook `participant_joined`) e independe
 * de quem está na sala.
 *
 * Consequência: uma sala sem host grava vídeo e não transcreve NADA — e antes
 * ninguém era avisado. O usuário só descobria dias depois, ao pedir o resumo da
 * IA e receber um 400 ("no transcript available"). Este banner fecha esse buraco
 * enquanto ainda dá tempo de agir: basta o criador da reunião entrar.
 *
 * Fonte da verdade do papel: `metadata.role`, gravado no JWT pela edge function
 * `livekit-token` — o mesmo valor que decidiu o `finalRole`, não um palpite.
 */
function TranscriptionCoverageWarning({ isHost }: { isHost: boolean }) {
  const participants = useParticipants();
  const [dismissed, setDismissed] = useState(false);
  /**
   * Carência antes de acusar ausência de host.
   *
   * `useParticipants()` começa apenas com o participante local — os remotos só
   * aparecem conforme a assinatura acontece. Sem esta espera, quem entra numa
   * sala que TEM host vê "sem transcrição" por alguns segundos, e um aviso que
   * mente na abertura destrói a confiança no aviso que importa.
   */
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGraceOver(true), HOST_DETECTION_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  const hasHost = useMemo(
    () =>
      participants.some((p) => {
        try {
          return (JSON.parse(p.metadata || "{}") as { role?: string })?.role === "host";
        } catch {
          return false;
        }
      }),
    [participants],
  );

  // O host tem o overlay de transcrição, com status próprio (conectando/erro/mics).
  if (isHost || hasHost || dismissed || !graceOver) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "absolute top-12 left-1/2 -translate-x-1/2 sm:left-3 sm:translate-x-0 z-30",
        "flex items-start gap-2 rounded-lg max-w-[min(26rem,calc(100vw-2rem))]",
        "border border-warning/40 bg-background/90 backdrop-blur-md",
        "px-3 py-2 text-xs shadow-lg text-foreground",
      )}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" aria-hidden />
      <p className="flex-1 leading-snug">
        <span className="font-semibold">Sem transcrição nesta reunião.</span>{" "}
        O responsável pela reunião não está na sala — a gravação continua, mas nenhum
        texto será gerado e a IA não terá o que resumir.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dispensar aviso"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Toca chime quando alguém entra/sai da call. Sem UI. */
function MeetSounds() {
  useMeetRoomSounds();
  return null;
}

/** Atalhos de teclado (M = microfone, V = câmera). Sem UI. */
function MeetShortcuts() {
  useMeetShortcuts();
  return null;
}

/**
 * Desce a resolução de captura conforme a sala cresce. Sem UI.
 * Precisa estar DENTRO do <LiveKitRoom> porque depende de
 * useRemoteParticipants/useLocalParticipant. Só desce, nunca sobe — subir
 * exigiria restartTrack e faria a imagem piscar sem ganho para ninguém.
 */
function AjusteDeCapturaPorSala() {
  useCapturaPorTamanhoDaSala(true);
  return null;
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}

/**
 * Chip "horário | título" do banner inferior (Meet-style).
 * Mobile: versão compacta (sem ocupar a largura dos controles).
 * Enquanto o meeting não foi resolvido no banco, mostra o horário sem título —
 * nada de placeholder "Reunião" piscando antes da resposta.
 */
function MeetInfoChip({ title, resolved }: { title: string | null; resolved: boolean }) {
  const [now, setNow] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setNow(formatClock(new Date())), 30 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const showTitle = resolved && !!title;

  return (
    <div className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-10 pointer-events-none flex items-center gap-1.5 md:gap-2 text-xs md:text-sm text-foreground/80 select-none max-w-[35vw] md:max-w-none">
      <span className="tabular-nums font-medium">{now}</span>
      {showTitle && (
        <>
          <span className="text-foreground/30" aria-hidden>|</span>
          <span className="font-medium truncate max-w-[22vw] md:max-w-[30vw]">{title}</span>
        </>
      )}
      {!resolved && (
        <span className="hidden md:inline-block h-3 w-24 rounded bg-muted animate-pulse" aria-hidden />
      )}
    </div>
  );
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
