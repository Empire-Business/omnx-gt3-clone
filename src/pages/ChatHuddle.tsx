/**
 * ChatHuddle — chamada efêmera estilo Slack/Discord
 * Áudio-first com toggle independente de câmera/tela.
 * Usa LiveKit por baixo via useMeetToken + LiveKitRoom.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useParticipants,
  ParticipantTile,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { ArrowLeft, Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, PhoneOff, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useMeetToken } from "@/hooks/useLiveKit";
import { useActiveHuddle, useEndHuddle, useChatChannels } from "@/hooks/useChat";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { cn } from "@/lib/utils";
import "@livekit/components-styles";

export default function ChatHuddle() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: channels = [] } = useChatChannels();
  const { data: huddle, isLoading } = useActiveHuddle(channelId);
  const endHuddle = useEndHuddle();
  const channel = channels.find((c) => c.id === channelId);

  const participantName = profile?.full_name || "Convidado";
  const { data: tokenData, isLoading: loadingToken, error: tokenError } = useMeetToken(
    huddle?.room_name,
    "host",
    participantName,
    !!huddle?.room_name
  );

  const handleLeave = () => {
    if (channelId) navigate(`/chat/${channelId}`);
    else navigate("/chat");
  };

  if (isLoading || loadingToken) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!huddle) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-muted-foreground">Esta chamada já foi encerrada.</p>
          <Button onClick={handleLeave}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao chat</Button>
        </div>
      </div>
    );
  }

  if (tokenError || !tokenData?.token) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-4">
          <p className="text-destructive">Erro ao conectar: {(tokenError as Error)?.message || "token inválido"}</p>
          <Button onClick={handleLeave}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={tokenData.token}
      serverUrl={tokenData.url}
      connect
      audio={true}
      video={false}
      onDisconnected={handleLeave}
      data-lk-theme="default"
      style={{ height: "100vh" }}
    >
      <HuddleUI
        channelName={channel?.is_dm ? ((channel as any).display_name || "Conversa") : (channel?.name || "")}
        isDm={!!channel?.is_dm}
        isCreator={huddle.started_by === profile?.user_id}
        onEndForAll={() => {
          endHuddle.mutate(huddle.id);
          handleLeave();
        }}
        onLeave={handleLeave}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function HuddleUI({
  channelName,
  isDm,
  isCreator,
  onEndForAll,
  onLeave,
}: {
  channelName: string;
  isDm: boolean;
  isCreator: boolean;
  onEndForAll: () => void;
  onLeave: () => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);

  // Sync local state com livekit
  useEffect(() => {
    if (!localParticipant) return;
    localParticipant.setMicrophoneEnabled(micOn).catch(() => {});
  }, [localParticipant, micOn]);

  useEffect(() => {
    if (!localParticipant) return;
    localParticipant.setCameraEnabled(camOn).catch(() => {});
  }, [localParticipant, camOn]);

  useEffect(() => {
    if (!localParticipant) return;
    // O 2º argumento (ScreenShareCaptureOptions) é o que faz o navegador
    // OFERECER a caixa "Compartilhar áudio da guia". Sem ele o LiveKit pede
    // getDisplayMedia({ audio: false }) e a tela compartilhada chega muda
    // para os outros participantes.
    localParticipant
      .setScreenShareEnabled(screenOn, {
        audio: true,
        selfBrowserSurface: "include",
        systemAudio: "include",
        surfaceSwitching: "include",
        suppressLocalAudioPlayback: false,
      })
      .catch(() => {});
  }, [localParticipant, screenOn]);

  const totalParticipants = participants.length;

  // Tiles com vídeo (cam ou screen)
  const videoTracks = tracks.filter((t) => t.publication?.isSubscribed || t.participant.isLocal);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/10 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/70 hover:text-white hover:bg-white/10" onClick={onLeave}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate">
              {channelName
                ? (isDm ? channelName : `# ${channelName}`)
                : "Chamada"}
            </h1>
            <p className="text-xs text-white/60 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Em chamada · {totalParticipants} participante{totalParticipants !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:flex items-center gap-1.5 text-xs text-white/70 px-2.5 py-1 rounded-full bg-white/10">
            <Users className="w-3 h-3" /> {totalParticipants}
          </span>
        </div>
      </div>

      {/* Stage */}
      <div className="flex-1 overflow-hidden p-4">
        {videoTracks.length > 0 ? (
          // Modo vídeo — tiles em grid
          <div className={cn(
            "grid gap-3 h-full",
            videoTracks.length === 1 && "grid-cols-1",
            videoTracks.length === 2 && "grid-cols-2",
            videoTracks.length >= 3 && "grid-cols-2 md:grid-cols-3",
          )}>
            {videoTracks.map((tref) => (
              <div key={tref.publication?.trackSid || tref.participant.identity}
                   className="relative rounded-xl overflow-hidden bg-slate-800 ring-1 ring-white/10">
                <ParticipantTile trackRef={tref} disableSpeakingIndicator={false} />
              </div>
            ))}
          </div>
        ) : (
          // Modo áudio-only — bolhas grandes com avatar
          <div className="flex flex-wrap items-center justify-center gap-6 h-full content-center">
            {participants.map((p) => {
              const isSpeaking = p.isSpeaking;
              const isMuted = !p.isMicrophoneEnabled;
              return (
                <div key={p.identity} className="flex flex-col items-center gap-2">
                  <div className={cn(
                    "relative w-28 h-28 rounded-full ring-4 transition-all",
                    isSpeaking ? "ring-green-400 scale-105" : "ring-white/20"
                  )}>
                    <AvatarBadge
                      name={p.name || p.identity}
                      size="xl"
                    />
                    {isMuted && (
                      <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center ring-2 ring-slate-900">
                        <MicOff className="w-4 h-4 text-white" />
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    {p.name || p.identity}
                    {p.isLocal && <span className="text-white/50 ml-1">(você)</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-6 py-5 flex items-center justify-center gap-3 border-t border-white/10 backdrop-blur">
        <button
          onClick={() => setMicOn((v) => !v)}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            micOn ? "bg-white/15 hover:bg-white/20 text-white" : "bg-red-500 hover:bg-red-600 text-white"
          )}
          title={micOn ? "Mutar microfone" : "Ativar microfone"}
        >
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        <button
          onClick={() => setCamOn((v) => !v)}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            camOn ? "bg-primary hover:bg-primary/90 text-white" : "bg-white/15 hover:bg-white/20 text-white"
          )}
          title={camOn ? "Desligar câmera" : "Ligar câmera"}
        >
          {camOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        <button
          onClick={() => setScreenOn((v) => !v)}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
            screenOn ? "bg-primary hover:bg-primary/90 text-white" : "bg-white/15 hover:bg-white/20 text-white"
          )}
          title={screenOn ? "Parar compartilhamento" : "Compartilhar tela"}
        >
          <MonitorUp className="w-5 h-5" />
        </button>

        <div className="w-px h-8 bg-white/10 mx-2" />

        {isCreator ? (
          <button
            onClick={onEndForAll}
            className="h-12 px-5 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium flex items-center gap-2 transition-colors"
            title="Encerrar chamada para todos"
          >
            <PhoneOff className="w-5 h-5" /> Encerrar
          </button>
        ) : (
          <button
            onClick={onLeave}
            className="h-12 px-5 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium flex items-center gap-2 transition-colors"
            title="Sair da chamada"
          >
            <PhoneOff className="w-5 h-5" /> Sair
          </button>
        )}
      </div>
    </div>
  );
}
