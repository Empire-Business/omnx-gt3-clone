/**
 * MeetTile — v8.10.8
 * Tile custom de participante (substitui o <ParticipantTile> padrão do LiveKit
 * para controle total de design). Suporta dois tamanhos:
 *  - "focus": ocupa 100% do container pai (área principal do palco)
 *  - "thumb": aspect-video (sidebar / carrossel mobile)
 *
 * Visual: dark glass premium. Ring esmeralda anima quando o participante fala.
 * Avatar com gradiente determinístico baseado no hash do nome quando câmera
 * está desligada. Pin manual via clique (host/usuário escolhe foco).
 */
import { useMemo } from "react";
import {
  VideoTrack,
  useIsSpeaking,
  type TrackReference,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Mic, MicOff, Pin, ScreenShare } from "lucide-react";
import { cn } from "@/lib/utils";

interface MeetTileProps {
  trackRef: TrackReference;
  size?: "focus" | "thumb";
  pinned?: boolean;
  onTogglePin?: () => void;
  showPinButton?: boolean;
}

export function MeetTile({
  trackRef,
  size = "thumb",
  pinned = false,
  onTogglePin,
  showPinButton = true,
}: MeetTileProps) {
  const participant = trackRef.participant;
  const isSpeaking = useIsSpeaking(participant);

  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const isLocal = participant.isLocal;
  const name = participant.name || participant.identity || "Participante";

  // Camera publication state — para saber se devemos mostrar vídeo ou avatar.
  const camPub = trackRef.publication;
  const cameraVisible =
    !!camPub && !camPub.isMuted && (camPub.isSubscribed || isLocal);

  // Mic state vem direto do participant (não do trackRef que aqui é da câmera).
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const micEnabled = !!micPub && !micPub.isMuted;

  // Avatar derivado do nome
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }, [name]);

  const gradient = useMemo(() => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const hue1 = h % 360;
    const hue2 = (hue1 + 60) % 360;
    return `linear-gradient(135deg, hsl(${hue1} 55% 28%) 0%, hsl(${hue2} 60% 18%) 100%)`;
  }, [name]);

  return (
    <div
      onClick={onTogglePin}
      className={cn(
        "group relative overflow-hidden rounded-2xl",
        "bg-[#0F0F23] transition-shadow duration-300",
        size === "focus" ? "h-full w-full" : "aspect-video w-full",
        onTogglePin && "cursor-pointer",
      )}
      style={{
        boxShadow: isSpeaking
          ? "0 0 0 2px hsl(160 84% 45%), 0 0 24px hsl(160 84% 45% / 0.45)"
          : "0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      {/* Vídeo ou avatar */}
      {cameraVisible || isScreenShare ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn(
            "h-full w-full",
            isScreenShare ? "object-contain bg-black" : "object-cover",
            isLocal && !isScreenShare && "[transform:rotateY(180deg)]",
          )}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: gradient }}
        >
          <div
            className={cn(
              "rounded-full bg-white/8 backdrop-blur-xl border border-white/10",
              "flex items-center justify-center font-semibold text-white/95 tracking-wide",
              size === "focus"
                ? "w-32 h-32 text-5xl sm:w-40 sm:h-40 sm:text-6xl"
                : "w-12 h-12 text-base sm:w-14 sm:h-14 sm:text-lg",
            )}
          >
            {initials.toUpperCase() || "?"}
          </div>
        </div>
      )}

      {/* Overlay sutil no rodapé p/ legibilidade do nome */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent"
      />

      {/* Top-left: chip "Fixado" (mobile-friendly indicator) */}
      {pinned && (
        <div
          className={cn(
            "absolute top-2 left-2 flex items-center gap-1 rounded-md",
            "bg-primary/85 backdrop-blur-md text-primary-foreground",
            "px-2 py-0.5 text-[10px] font-medium",
          )}
        >
          <Pin className="w-3 h-3 fill-current" />
          Fixado
        </div>
      )}

      {/* Top-right: pin (hover) + mic muted (sempre visível quando muted) */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {!micEnabled && (
          <span
            className={cn(
              "rounded-full bg-rose-500/90 backdrop-blur-md flex items-center justify-center text-white",
              size === "focus" ? "h-9 w-9" : "h-7 w-7",
            )}
            aria-label="Microfone desligado"
          >
            <MicOff className={size === "focus" ? "w-4 h-4" : "w-3.5 h-3.5"} />
          </span>
        )}
        {showPinButton && onTogglePin && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            aria-label={pinned ? "Desafixar" : "Afixar no foco"}
            className={cn(
              "rounded-full bg-black/55 backdrop-blur-md text-white border border-white/10",
              "flex items-center justify-center transition-all",
              // Em touch (mobile) o tap no tile já pina — botão só aparece no hover desktop.
              "hidden md:flex opacity-0 group-hover:opacity-100 hover:bg-black/75",
              pinned && "md:opacity-100 bg-primary/85 hover:bg-primary border-primary/0",
              size === "focus" ? "h-9 w-9" : "h-7 w-7",
            )}
          >
            <Pin className={cn(size === "focus" ? "w-4 h-4" : "w-3.5 h-3.5", pinned && "fill-current")} />
          </button>
        )}
      </div>

      {/* Bottom-left: nome pill glass */}
      <div
        className={cn(
          "absolute left-2.5 bottom-2.5 flex items-center gap-1.5",
          "px-2.5 py-1 rounded-lg",
          "bg-black/55 backdrop-blur-md border border-white/8",
          "text-white",
        )}
      >
        {isScreenShare && (
          <ScreenShare className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
        )}
        {!isScreenShare && micEnabled && (
          <span className="relative flex items-center justify-center">
            <Mic className="w-3 h-3" />
            {isSpeaking && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="block w-3 h-3 rounded-full bg-emerald-400/40 animate-ping" />
              </span>
            )}
          </span>
        )}
        <span
          className={cn(
            "font-medium leading-none truncate",
            size === "focus" ? "text-sm max-w-[40vw]" : "text-xs max-w-[140px]",
          )}
        >
          {isScreenShare
            ? `${isLocal ? "Você" : name} • Compartilhando tela`
            : isLocal
              ? "Você"
              : name}
        </span>
      </div>
    </div>
  );
}
