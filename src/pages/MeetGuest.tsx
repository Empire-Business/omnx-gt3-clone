/**
 * MeetGuest — v8.36.0
 * Rota pública /meet/:roomId/guest — convidados externos solicitam entrada.
 * Fluxo: input nome → solicitar → aguardar aprovação → PreJoin custom → call.
 *
 * v8.10.5: unificado com a experiência de membros — usa MeetPreJoin,
 * MeetControlBar, MeetStage, MeetChat, fundo virtual, Krisp AI noise filter.
 * Convidado tem as MESMAS opções da call normal, exceto:
 *  - sem botão "Encerrar p/ todos" (isHost=false)
 *  - sem botão "Convidar externo" (isHost=false)
 *  - sem preset "Sala Empire" (filtrado em BackgroundPickerPopover via useAuth)
 *
 * v8.36.0 — paridade com MeetRoom:
 *  - MeetChatProvider montado (sem ele, abrir "Conversa" derrubava a página)
 *  - BoostedAudioRenderer (faz o slider de volume remoto funcionar)
 *  - adaptiveStream/dynacast/simulcast + teto de 540p (performance)
 *  - onDisconnected inspeciona DisconnectReason: queda de rede vira tela
 *    "Conexão perdida" com botão de voltar, reaproveitando o token
 *  - painel de participantes, atalhos de teclado e aviso de gravação (LGPD)
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BRAND } from "@/config/brand";
import {
  LiveKitRoom,
  LayoutContextProvider,
  ConnectionStateToast,
  useParticipants,
  useIsRecording,
  type LocalUserChoices,
} from "@livekit/components-react";
import { DisconnectReason } from "livekit-client";
import "@livekit/components-styles";
import "@/styles/livekit-theme.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Loader2,
  ShieldX,
  ArrowLeft,
  UserPlus,
  Video,
  WifiOff,
  RotateCcw,
} from "lucide-react";
import {
  useGuestRequest,
  useGuestRequestStatus,
  useGuestToken,
} from "@/hooks/useLiveKit";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";
import { useAuth } from "@/hooks/useAuth";
import { useEmployees } from "@/hooks/useEmployees";
import { useMeetingByRoomName } from "@/hooks/useMeetingByRoomName";
import { MeetPreJoin } from "@/components/meetings/MeetPreJoin";
import { MeetControlBar } from "@/components/meetings/MeetControlBar";
import { useMeetRoomSounds } from "@/hooks/useMeetRoomSounds";
import { useMeetShortcuts } from "@/components/meetings/useMeetShortcuts";
import {
  buildMeetRoomOptions,
  useCapturaPorTamanhoDaSala,
} from "@/components/meetings/room-options";
import { MeetStage } from "@/components/meetings/MeetStage";
import { MeetChat } from "@/components/meetings/MeetChat";
import { MeetChatProvider, useMeetChatStore } from "@/components/meetings/MeetChatStore";
import { MeetParticipantsPanel } from "@/components/meetings/MeetParticipantsPanel";
import { BoostedAudioRenderer } from "@/components/meetings/BoostedAudioRenderer";
import { toast } from "sonner";

type Phase = "form" | "waiting" | "rejected" | "in-call" | "ended";

/**
 * Motivos em que a saída é definitiva — o convidado realmente saiu ou foi
 * removido. Qualquer outro motivo (queda de rede, shutdown do servidor,
 * websocket fechado, desconhecido) é tratado como perda temporária: o
 * convidado pode voltar sem refazer o pedido de aprovação.
 */
const TERMINAL_DISCONNECT_REASONS: readonly DisconnectReason[] = [
  DisconnectReason.CLIENT_INITIATED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.DUPLICATE_IDENTITY,
];

export default function MeetGuest() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [lkUrl, setLkUrl] = useState<string | null>(null);
  const [choices, setChoices] = useState<LocalUserChoices | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Conexão caiu por motivo não-terminal: dá pra voltar com o mesmo token.
  const [connectionLost, setConnectionLost] = useState(false);
  // A reconexão com o token existente falhou (token provavelmente expirado).
  const [sessionExpired, setSessionExpired] = useState(false);
  // Força remontagem do LiveKitRoom ao voltar para a sala.
  const [roomKey, setRoomKey] = useState(0);
  const rejoinAttemptedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { prefs } = useMeetPreferences();
  const { user, profile } = useAuth();
  const { data: employees } = useEmployees();
  const myEmployee = employees?.find((e) => e.user_id === user?.id);

  // Se logado e a reunião pertence ao mesmo tenant, busca retorna meetingId.
  // Caso contrário (não logado, ou tenant diferente), retorna null por RLS.
  const { meetingId } = useMeetingByRoomName(roomId);

  // Pré-preencher nome do usuário logado (ou displayName lembrado entre sessões)
  useEffect(() => {
    if (name) return;
    const candidate =
      prefs.displayName ||
      profile?.full_name ||
      myEmployee?.full_name ||
      user?.email?.split("@")[0] ||
      "";
    if (candidate) setName(candidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, myEmployee, user, prefs.displayName]);

  // Se usuário logado é membro do mesmo tenant da reunião, redireciona
  // para a rota de membro (sem fluxo de aprovação). PreJoin do MeetRoom
  // mostra "Oi, fulano!" e permite ativar mic/cam antes de entrar.
  useEffect(() => {
    if (phase !== "form") return;
    if (!user || !roomId || !meetingId) return;
    navigate(`/meet/${roomId}?role=guest`, { replace: true });
  }, [user, meetingId, roomId, phase, navigate]);

  const requestMut = useGuestRequest();
  const tokenMut = useGuestToken();
  // Polling ativo apenas em "waiting" — para assim que o convidado entra na sala
  const statusQ = useGuestRequestStatus(
    requestId || undefined,
    guestToken || undefined,
    phase === "waiting" && !lkToken,
  );

  useEffect(() => {
    document.title = `Entrar como convidado · ${BRAND.appName}`;
  }, []);

  // Erro no polling de status precisa ser visível — antes falhava em silêncio
  // e o convidado ficava eternamente no "Aguardando aprovação".
  const statusErrShownRef = useRef(false);
  useEffect(() => {
    if (statusQ.isError && !statusErrShownRef.current) {
      statusErrShownRef.current = true;
      toast.error(
        (statusQ.error as Error)?.message ||
          "Não foi possível verificar o status do seu pedido.",
      );
    }
    if (!statusQ.isError) statusErrShownRef.current = false;
  }, [statusQ.isError, statusQ.error]);

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
      console.warn("[MeetGuest] fullscreen bloqueado:", err);
      toast.error("Seu navegador bloqueou o modo tela cheia.");
    }
  };

  // Quando aprovado, busca token automaticamente
  useEffect(() => {
    if (phase !== "waiting" || !statusQ.data) return;
    const { status } = statusQ.data;
    if (status === "approved" && requestId && guestToken && !lkToken) {
      tokenMut
        .mutateAsync({ request_id: requestId, guest_token: guestToken })
        .then((res) => {
          setLkToken(res.token);
          setLkUrl(res.url);
        })
        .catch((err) => {
          toast.error((err as Error)?.message || "Erro ao obter token de acesso");
        });
    } else if (status === "rejected") {
      setPhase("rejected");
    } else if (status === "expired") {
      setPhase("rejected");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQ.data, phase, requestId, guestToken, lkToken]);

  const handleRequest = async () => {
    if (!roomId) return;
    if (name.trim().length < 2) {
      toast.error("Digite seu nome (mínimo 2 caracteres)");
      return;
    }
    try {
      const res = await requestMut.mutateAsync({
        room_name: roomId,
        guest_name: name.trim(),
      });
      setRequestId(res.request_id);
      setGuestToken(res.guest_token);
      setPhase("waiting");
    } catch (err) {
      toast.error((err as Error).message || "Erro ao solicitar entrada");
    }
  };

  /** Desconexão: só encerra de verdade em motivos terminais. */
  const handleDisconnected = (reason?: DisconnectReason) => {
    if (reason !== undefined && TERMINAL_DISCONNECT_REASONS.includes(reason)) {
      setPhase("ended");
      return;
    }
    // Se já tentamos voltar com esse token e caiu de novo por falha de entrada,
    // o token provavelmente expirou — aí sim é preciso refazer o pedido.
    if (reason === DisconnectReason.JOIN_FAILURE && rejoinAttemptedRef.current) {
      setSessionExpired(true);
    }
    setConnectionLost(true);
  };

  /** Volta para a sala reaproveitando o token já obtido (sem novo pedido). */
  const handleBackToRoom = () => {
    rejoinAttemptedRef.current = true;
    setConnectionLost(false);
    setSessionExpired(false);
    setRoomKey((k) => k + 1);
  };

  /** Recomeça o fluxo do zero (novo pedido de aprovação). */
  const handleRestartRequest = () => {
    rejoinAttemptedRef.current = false;
    setConnectionLost(false);
    setSessionExpired(false);
    setLkToken(null);
    setLkUrl(null);
    setRequestId(null);
    setGuestToken(null);
    setChoices(null);
    setPhase("form");
  };

  // Tela: formulário inicial
  if (phase === "form") {
    return (
      <FullScreen>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <UserPlus className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Entrar como convidado</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Digite seu nome para solicitar entrada na reunião. O host receberá uma notificação para aprovar.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="guest-name">Seu nome</Label>
              <Input
                id="guest-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Ana Silva"
                maxLength={80}
                onKeyDown={(e) => e.key === "Enter" && handleRequest()}
                autoFocus
              />
            </div>
            <RecordingNotice />
            <Button
              className="w-full"
              onClick={handleRequest}
              disabled={requestMut.isPending || name.trim().length < 2}
            >
              {requestMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Solicitar entrada
            </Button>
            {requestMut.isError && (
              <p role="alert" className="text-sm text-destructive text-center">
                {(requestMut.error as Error)?.message ||
                  "Não foi possível enviar seu pedido. Tente novamente."}
              </p>
            )}
          </CardContent>
        </Card>
      </FullScreen>
    );
  }

  // Tela: aguardando aprovação
  if (phase === "waiting" && !lkToken) {
    return (
      <FullScreen>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <h2 className="text-lg font-semibold">Aguardando aprovação do host…</h2>
            <p className="text-sm text-muted-foreground">
              Você entrará automaticamente assim que <strong>{name}</strong> for admitido.
            </p>
            <p className="text-xs text-muted-foreground">
              Status: <span className="font-medium">{statusQ.data?.status || "pending"}</span>
            </p>
            {statusQ.isError && (
              <p role="alert" className="text-sm text-destructive">
                {(statusQ.error as Error)?.message ||
                  "Falha ao verificar o status do pedido. Verifique sua conexão."}
              </p>
            )}
            {tokenMut.isError && (
              <p role="alert" className="text-sm text-destructive">
                {(tokenMut.error as Error)?.message ||
                  "Aprovado, mas houve falha ao gerar seu acesso. Tente novamente."}
              </p>
            )}
            <RecordingNotice />
            <Button variant="outline" size="sm" onClick={() => setPhase("form")}>
              Cancelar
            </Button>
          </CardContent>
        </Card>
      </FullScreen>
    );
  }

  // Tela: recusado
  if (phase === "rejected") {
    return (
      <FullScreen>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldX className="w-6 h-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">Acesso recusado</h2>
            <p className="text-sm text-muted-foreground">
              O host não aprovou a sua entrada nesta reunião.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </FullScreen>
    );
  }

  // Tela: encerrado (apenas motivos terminais)
  if (phase === "ended") {
    return (
      <FullScreen>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <h2 className="text-lg font-semibold">Reunião encerrada</h2>
            <p className="text-sm text-muted-foreground">Obrigado pela participação.</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </FullScreen>
    );
  }

  // Tela: sessão expirou — precisa de novo pedido de aprovação
  if (sessionExpired) {
    return (
      <FullScreen>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldX className="w-6 h-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">Seu acesso expirou</h2>
            <p className="text-sm text-muted-foreground">
              Não foi possível reconectar com o acesso anterior. Solicite entrada
              novamente para voltar à reunião.
            </p>
            <Button onClick={handleRestartRequest}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Solicitar entrada novamente
            </Button>
          </CardContent>
        </Card>
      </FullScreen>
    );
  }

  // Tela: conexão perdida (queda de rede, signal close, shutdown…)
  if (connectionLost) {
    return (
      <FullScreen>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <WifiOff className="w-6 h-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Conexão perdida</h2>
            <p className="text-sm text-muted-foreground">
              Você foi desconectado da reunião. Sua aprovação continua válida —
              basta voltar para a sala.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={handleBackToRoom}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Voltar para a sala
              </Button>
              <Button variant="outline" onClick={() => setPhase("ended")}>
                Sair da reunião
              </Button>
            </div>
          </CardContent>
        </Card>
      </FullScreen>
    );
  }

  // Tela: PreJoin custom antes de entrar
  if (lkToken && lkUrl && !choices) {
    return (
      <MeetPreJoin
        defaultName={name}
        onSubmit={(c) => {
          setChoices({
            username: c.username,
            videoEnabled: c.videoEnabled,
            audioEnabled: c.audioEnabled,
          } as LocalUserChoices);
          setPhase("in-call");
        }}
      />
    );
  }

  // Tela: dentro da chamada — mesma experiência da MeetRoom (membros), com
  // exceção dos botões reservados ao host (encerrar p/ todos, convidar).
  if (lkToken && lkUrl && choices) {
    // Quando Krisp AI está ativo, NS+AGC nativos do browser conflitam com ele
    // (NS distorce sinal antes do Krisp; AGC causa "pumping"). Manter só
    // echoCancellation nativo. Recomendação oficial LiveKit/Krisp.
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
          key={roomKey}
          token={lkToken}
          serverUrl={lkUrl}
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
          // Performance: mesma fonte única do MeetRoom (`room-options.ts`) — a
          // duplicação literal que existia aqui acabou. A configuração agora se
          // adapta ao PERFIL DA MÁQUINA do convidado (que costuma ser a mais
          // fraca da sala: celular ou notebook de casa) e, já dentro da sala, ao
          // número de participantes via <AjusteDeCapturaPorSalaGuest />.
          options={buildMeetRoomOptions({
            audioCaptureDefaults,
            audioInputDeviceId: prefs.audioInputDeviceId || undefined,
            videoInputDeviceId: prefs.videoInputDeviceId || undefined,
          })}
          onDisconnected={handleDisconnected}
          onError={(err) => {
            toast.error(
              err?.message ||
                "Falha na conexão com a reunião. Verifique sua internet e o acesso ao microfone/câmera.",
            );
          }}
          onMediaDeviceFailure={() => {
            toast.error(
              "Não conseguimos acessar seu microfone/câmera. Verifique a permissão no navegador.",
            );
          }}
          className="h-full w-full flex flex-col"
        >
          <LayoutContextProvider>
            <MeetChatProvider isOpen={showChat}>
              <div className="flex-1 min-h-0 relative">
                <MeetStage />
              </div>
              <BoostedAudioRenderer />
              <MeetSoundsGuest />
              <MeetShortcutsGuest />
              <AjusteDeCapturaPorSalaGuest />
              {/* Feedback visual durante reconexão automática */}
              <ConnectionStateToast />

              <div className="relative bg-black pb-[env(safe-area-inset-bottom)]">
                <GuestControlBar
                  roomName={roomId || ""}
                  showChat={showChat}
                  onToggleChat={() => setShowChat((v) => !v)}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={handleToggleFullscreen}
                  showParticipants={showParticipants}
                  onToggleParticipants={() => setShowParticipants((v) => !v)}
                />
              </div>

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

              <MeetParticipantsPanel
                open={showParticipants}
                onOpenChange={setShowParticipants}
              />
            </MeetChatProvider>
          </LayoutContextProvider>
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <FullScreen>
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </FullScreen>
  );
}

/**
 * Control bar do convidado. Fica em componente próprio porque `useParticipants`
 * e `useIsRecording` só funcionam dentro do contexto do LiveKitRoom.
 */
function GuestControlBar({
  roomName,
  showChat,
  onToggleChat,
  isFullscreen,
  onToggleFullscreen,
  showParticipants,
  onToggleParticipants,
}: {
  roomName: string;
  showChat: boolean;
  onToggleChat: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showParticipants: boolean;
  onToggleParticipants: () => void;
}) {
  const participants = useParticipants();
  const isRecording = useIsRecording();
  const { unreadCount } = useMeetChatStore();

  return (
    <MeetControlBar
      isHost={false}
      roomName={roomName}
      showChat={showChat}
      onToggleChat={onToggleChat}
      onEndForAll={() => undefined}
      endingForAll={false}
      isFullscreen={isFullscreen}
      onToggleFullscreen={onToggleFullscreen}
      showParticipants={showParticipants}
      onToggleParticipants={onToggleParticipants}
      participantCount={participants.length}
      isRecording={isRecording}
      unreadChatCount={unreadCount}
    />
  );
}

/** Aviso de gravação (LGPD) — a gravação inicia automaticamente na sala. */
function RecordingNotice() {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-left"
    >
      <Video className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Esta reunião pode ser gravada e transcrita.</span>{" "}
        Ao entrar, você concorda com a gravação de áudio, vídeo e da conversa
        para registro da reunião. Se não concordar, não entre na sala.
      </p>
    </div>
  );
}

function MeetSoundsGuest() {
  useMeetRoomSounds();
  return null;
}

/** Atalhos de teclado (M/V) também para o convidado. Sem UI. */
function MeetShortcutsGuest() {
  useMeetShortcuts();
  return null;
}

/**
 * Desce a resolução de captura conforme a sala cresce. Sem UI.
 * Dentro do <LiveKitRoom> por depender de useRemoteParticipants. Só desce,
 * nunca sobe — subir exigiria restartTrack e faria a imagem piscar.
 */
function AjusteDeCapturaPorSalaGuest() {
  useCapturaPorTamanhoDaSala(true);
  return null;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}
