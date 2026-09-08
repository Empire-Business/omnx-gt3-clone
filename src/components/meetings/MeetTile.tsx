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
 *
 * v8.36.0 — cores hardcoded (#0F0F23, hsl literal do ring, rose-500, emerald-400)
 * trocadas por tokens semânticos: bg-card, --success, destructive.
 *
 * v8.37.0 — ORÇAMENTO DE VÍDEO (portado do omnx-meet). O tile passou a aceitar
 * `permitirVideo`: sem vaga no orçamento global da sala (ver `video-budget.tsx`),
 * ele desenha o avatar que já sabe desenhar em vez de montar um `<video>`.
 * Ganhou também `memo` com comparador próprio — ver nota no fim do arquivo.
 */
import { memo, useMemo } from "react";
import {
  VideoTrack,
  useIsMuted,
  useIsSpeaking,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Mic, MicOff, Pin, ScreenShare } from "lucide-react";
import { cn } from "@/lib/utils";
import { podeUsarVidroSobreVideo } from "./device-capabilities";

interface MeetTileProps {
  trackRef: TrackReference;
  size?: "focus" | "thumb";
  pinned?: boolean;
  onTogglePin?: () => void;
  showPinButton?: boolean;
  /**
   * Quando falso, o tile NÃO monta o elemento de vídeo — vira avatar.
   *
   * É o teto de decodificação simultânea da máquina, repartido por zona de
   * prioridade no `video-budget.tsx` (portado do omnx-meet). Quem decide é
   * SEMPRE o palco, nunca o tile: se cada tile declarasse a própria demanda ao
   * orçamento, todos escreveriam na mesma zona e o último sobrescreveria os
   * outros. O palco conta uma vez e distribui as vagas por ordem de tela.
   *
   * Padrão `true` para que qualquer uso do tile fora do palco (e o palco de
   * sala pequena, onde o teto nunca aperta) continue exatamente como antes.
   */
  permitirVideo?: boolean;
}

function MeetTileBase({
  trackRef,
  size = "thumb",
  pinned = false,
  onTogglePin,
  showPinButton = true,
  permitirVideo = true,
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

  /*
    Mic state vem do participant (não do trackRef, que aqui é o da câmera).

    Precisa passar pelo `useIsMuted` — e não ler `micPub.isMuted` direto —
    porque o tile agora é `memo`: sem uma assinatura de evento DENTRO do
    componente, mutar/desmutar um remoto não dispararia render nenhum e o ícone
    de microfone cortado ficaria congelado no estado antigo.
  */
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const micMuted = useIsMuted({
    participant,
    source: Track.Source.Microphone,
    publication: micPub,
  } as TrackReferenceOrPlaceholder);
  const micEnabled = !!micPub && !micMuted;

  // Avatar derivado do nome
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }, [name]);

  /*
    O VIDRO DAS PÍLULAS É A PRIMEIRA COISA A CAIR EM MÁQUINA FRACA.

    Cada `backdrop-blur` deste tile é recomposto pela GPU a cada quadro, porque
    atrás dele há vídeo em movimento: o filtro obriga a placa a LER DE VOLTA o
    que já foi desenhado e refiltrar. São cinco por tile; numa grade de 6 com o
    painel de participantes aberto isso vira dezenas de camadas disputando a GPU
    com a decodificação do vídeo — a interface fica bonita e a call fica
    travada. (Medido no produto irmão omnx-meet: 36 camadas → 0.)

    Sem o vidro o fundo vira mais OPACO, e o nome continua legível sobre
    qualquer imagem — que era o único serviço que o desfoque prestava.

    Não é hook nem `useMemo`: a resposta é memoizada no módulo
    (`podeUsarVidroSobreVideo`), então aqui é a leitura de um booleano.
  */
  const comVidro = podeUsarVidroSobreVideo();

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
        "bg-card transition-shadow duration-300",
        size === "focus" ? "h-full w-full" : "aspect-video w-full",
        onTogglePin && "cursor-pointer",
      )}
      style={{
        boxShadow: isSpeaking
          ? "0 0 0 2px hsl(var(--success)), 0 0 24px hsl(var(--success) / 0.45)"
          : "0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      {/* Vídeo ou avatar — sem vaga no orçamento, cai para avatar (custo zero
          de decodificação). O screen share também respeita a vaga, mas ele é a
          zona de MAIOR prioridade no palco: só perde numa máquina que não
          aguenta um único vídeo, e aí o problema é outro. */}
      {permitirVideo && (cameraVisible || isScreenShare) ? (
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
              "rounded-full border border-white/10",
              comVidro ? "bg-white/8 backdrop-blur-xl" : "bg-white/15",
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
            "text-primary-foreground",
            comVidro ? "bg-primary/85 backdrop-blur-md" : "bg-primary",
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
              "rounded-full flex items-center justify-center text-destructive-foreground",
              comVidro ? "bg-destructive/90 backdrop-blur-md" : "bg-destructive",
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
              "rounded-full text-white border border-white/10",
              comVidro ? "bg-black/55 backdrop-blur-md" : "bg-black/75",
              "flex items-center justify-center transition-all",
              // Em touch (mobile) o tap no tile já pina — botão só aparece no hover desktop.
              "hidden md:flex opacity-0 group-hover:opacity-100 hover:bg-black/85",
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
          comVidro ? "bg-black/55 backdrop-blur-md" : "bg-black/70",
          "border border-white/8",
          "text-white",
        )}
      >
        {isScreenShare && (
          <ScreenShare className="w-3.5 h-3.5 shrink-0 text-success" />
        )}
        {!isScreenShare && micEnabled && (
          <span className="relative flex items-center justify-center">
            <Mic className="w-3 h-3" />
            {isSpeaking && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="block w-3 h-3 rounded-full bg-success/40 animate-ping" />
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

/**
 * MEMOIZADO — e com comparador próprio, porque o padrão não serviria.
 *
 * (Padrão portado do `ParticipantCard` do omnx-meet.)
 *
 * O `useTracks` do LiveKit devolve uma lista NOVA a cada render da sala, com
 * objetos `TrackReference` novos dentro. Com a comparação rasa padrão do
 * `memo`, todo tile re-renderizaria a cada mensagem de chat, a cada evento de
 * participante e a cada tique do relógio da call — e re-render de tile custa
 * caro, porque cada um carrega assinatura de fala (`useIsSpeaking`) e recalcula
 * o gradiente do avatar.
 *
 * Comparamos então só o que de fato muda a IMAGEM do tile: quem é, de que
 * fonte, qual publicação, e se ela está assinada/muda. `useIsSpeaking` continua
 * morando DENTRO do componente, então falar segue repintando o tile
 * normalmente — o memo não esconde nada disso.
 *
 * `onTogglePin` fica de fora da comparação de propósito: o MeetStage o recria a
 * cada render (é uma arrow inline) e compará-lo anularia o memo inteiro. O que
 * ele faz depende só do `sid` do participante, que já está comparado abaixo.
 */
export const MeetTile = memo(MeetTileBase, (antes, agora) => {
  if (
    antes.size !== agora.size ||
    antes.pinned !== agora.pinned ||
    antes.showPinButton !== agora.showPinButton ||
    antes.permitirVideo !== agora.permitirVideo
  ) {
    return false;
  }

  const a = antes.trackRef;
  const b = agora.trackRef;
  return (
    a.participant.sid === b.participant.sid &&
    a.participant.identity === b.participant.identity &&
    a.participant.name === b.participant.name &&
    a.source === b.source &&
    a.publication?.trackSid === b.publication?.trackSid &&
    a.publication?.isSubscribed === b.publication?.isSubscribed &&
    a.publication?.isMuted === b.publication?.isMuted
  );
});
