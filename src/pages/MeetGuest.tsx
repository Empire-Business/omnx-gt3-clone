/**
 * MeetGuest — v8.10.5
 * Rota pública /meet/:roomId/guest — convidados externos solicitam entrada.
 * Fluxo: input nome → solicitar → aguardar aprovação → PreJoin custom → call.
 *
 * v8.10.5: unificado com a experiência de membros — usa MeetPreJoin,
 * MeetControlBar, MeetStage, MeetChat, fundo virtual, Krisp AI noise filter.
 * Convidado tem as MESMAS opções da call normal, exceto:
 *  - sem botão "Encerrar p/ todos" (isHost=false)
 *  - sem botão "Convidar externo" (isHost=false)
 *  - sem preset "Sala Empire" (filtrado em BackgroundPickerPopover via useAuth)
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BRAND } from "@/config/brand";
import {
  LiveKitRoom,
  LayoutContextProvider,
  RoomAudioRenderer,
  type LocalUserChoices,
} from "@livekit/components-react";
import { AudioPresets } from "livekit-client";
import "@livekit/components-styles";
import "@/styles/livekit-theme.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, ShieldX, ArrowLeft, UserPlus } from "lucide-react";
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
import { MeetStage } from "@/components/meetings/MeetStage";
import { MeetChat } from "@/components/meetings/MeetChat";
import { toast } from "sonner";

type Phase = "form" | "waiting" | "rejected" | "in-call" | "ended";

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
  const [isFullscreen, setIsFullscreen] = useState(false);
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
          toast.error(err.message || "Erro ao obter token");
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
            <Button
              className="w-full"
              onClick={handleRequest}
              disabled={requestMut.isPending || name.trim().length < 2}
            >
              {requestMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Solicitar entrada
            </Button>
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

  // Tela: encerrado
  if (phase === "ended") {
    return (
      <FullScreen>
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <h2 className="text-lg font-semibold">Reunião encerrada</h2>
            <p className="text-sm text-muted-foreground">Obrigado pela participação.</p>
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
        className="dark h-screen w-screen bg-background relative flex flex-col"
      >
        <LiveKitRoom
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
          options={{
            audioCaptureDefaults: {
              ...audioCaptureDefaults,
              ...(prefs.audioInputDeviceId ? { deviceId: prefs.audioInputDeviceId } : {}),
            },
            videoCaptureDefaults: prefs.videoInputDeviceId
              ? { deviceId: prefs.videoInputDeviceId }
              : undefined,
            publishDefaults: {
              audioPreset: AudioPresets.speech,
              dtx: true,
              red: true,
            },
          }}
          onDisconnected={() => setPhase("ended")}
          className="h-full w-full flex flex-col"
        >
          <LayoutContextProvider>
            <div className="flex-1 min-h-0 relative">
              <MeetStage
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
              />
            </div>
            <RoomAudioRenderer />
            <MeetSoundsGuest />

            <MeetControlBar
              isHost={false}
              roomName={roomId || ""}
              showChat={showChat}
              onToggleChat={() => setShowChat((v) => !v)}
              onEndForAll={() => undefined}
              endingForAll={false}
            />

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

function MeetSoundsGuest() {
  useMeetRoomSounds();
  return null;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}
