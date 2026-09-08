/**
 * MeetParticipantsPanel — v8.36.0
 * Lista lateral (Sheet) com TODOS os participantes da sala — presentes com ou
 * sem câmera. Antes disso a única "lista" era a sidebar do MeetStage, que só
 * mostra quem tem vídeo publicado: em calls de 4+ pessoas ninguém sabia quem
 * estava presente.
 *
 * Mesmo padrão visual do MeetChat: Sheet lateral (vira full-width no mobile),
 * cabeçalho com título PT-BR e corpo rolável.
 */
import { useMemo } from "react";
import {
  useParticipants,
  useTracks,
  useIsSpeaking,
  useConnectionQualityIndicator,
  isTrackReference,
} from "@livekit/components-react";
import { Track, ConnectionQuality, type Participant } from "livekit-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SignalZero,
  Users,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface MeetParticipantsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Estado de mídia (mic/cam) por identity, derivado das publications. */
type MediaState = { mic: boolean; cam: boolean };

/*
  CONSTANTES DE MÓDULO — o mesmo motivo do MeetStage.

  O `useMemo` final do `useTracks` tem `sources` CRU nas deps (visto no bundle
  do `@livekit/components-react`). Com `withPlaceholder: true` e um literal
  inline, ele remonta um Array novo — com objetos placeholder novos dentro — a
  cada render, e o `mediaByIdentity` abaixo é reconstruído junto, refazendo a
  lista inteira de participantes a cada evento da sala.
*/
const PANEL_SOURCES = [
  { source: Track.Source.Microphone, withPlaceholder: true },
  { source: Track.Source.Camera, withPlaceholder: true },
];
const PANEL_TRACK_OPTIONS = { onlySubscribed: false };

/**
 * Iniciais e gradiente determinístico do avatar.
 * A lógica original vive inline no MeetTile.tsx (não é exportada de lá), então
 * replicamos aqui para manter o MESMO avatar do palco — mesma derivação por
 * nome, mesmo hash, mesmas cores. Se um dia virar util compartilhado, os dois
 * arquivos devem passar a importá-lo.
 */
function avatarFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 60) % 360;
  return {
    initials,
    gradient: `linear-gradient(135deg, hsl(${hue1} 55% 28%) 0%, hsl(${hue2} 60% 18%) 100%)`,
  };
}

export function MeetParticipantsPanel({
  open,
  onOpenChange,
}: MeetParticipantsPanelProps) {
  const participants = useParticipants();

  // useTracks (com placeholders) é a fonte REATIVA de mute/unmute — ler
  // participant.getTrackPublication() direto não re-renderiza no mute remoto.
  const tracks = useTracks(PANEL_SOURCES, PANEL_TRACK_OPTIONS);

  const mediaByIdentity = useMemo(() => {
    const map = new Map<string, MediaState>();
    for (const t of tracks) {
      const identity = t.participant.identity;
      const current = map.get(identity) ?? { mic: false, cam: false };
      const live = isTrackReference(t) && !t.publication.isMuted;
      if (t.source === Track.Source.Microphone) current.mic = live;
      if (t.source === Track.Source.Camera) current.cam = live;
      map.set(identity, current);
    }
    return map;
  }, [tracks]);

  // Local primeiro, depois ordem alfabética — lista estável entre renders.
  const ordered = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      const an = a.name || a.identity || "";
      const bn = b.name || b.identity || "";
      return an.localeCompare(bn, "pt-BR");
    });
  }, [participants]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle>Participantes ({ordered.length})</SheetTitle>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            {ordered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
                <Users className="w-8 h-8 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Ninguém na sala ainda. Assim que alguém entrar, aparece aqui.
                </p>
              </div>
            ) : (
              <ul className="p-2 space-y-1">
                {ordered.map((p) => (
                  <ParticipantRow
                    key={p.sid || p.identity}
                    participant={p}
                    media={
                      mediaByIdentity.get(p.identity) ?? { mic: false, cam: false }
                    }
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ============================================================
   Linha de participante
   ============================================================ */

function ParticipantRow({
  participant,
  media,
}: {
  participant: Participant;
  media: MediaState;
}) {
  const isSpeaking = useIsSpeaking(participant);
  const name = participant.name || participant.identity || "Participante";
  const { initials, gradient } = useMemo(() => avatarFromName(name), [name]);

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors",
        "hover:bg-muted/50",
        isSpeaking && "bg-primary/10",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
          // text-white/95 (e não um token) porque o fundo é o gradiente escuro
          // determinístico do avatar, igual ao MeetTile — o contraste é com a
          // arte, não com a superfície do tema.
          "text-xs font-semibold text-white/95",
          isSpeaking && "ring-2 ring-primary",
        )}
        style={{ background: gradient }}
        aria-hidden
      >
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {name}
          {participant.isLocal && (
            <span className="text-muted-foreground font-normal"> (você)</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {isSpeaking ? "Falando agora" : media.mic ? "Microfone ativo" : "Silenciado"}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <StateIcon
          on={media.mic}
          onLabel={`${name}: microfone ativo`}
          offLabel={`${name}: microfone desligado`}
          IconOn={Mic}
          IconOff={MicOff}
        />
        <StateIcon
          on={media.cam}
          onLabel={`${name}: câmera ligada`}
          offLabel={`${name}: câmera desligada`}
          IconOn={Video}
          IconOff={VideoOff}
        />
        <ConnectionQualityIcon participant={participant} />
      </div>
    </li>
  );
}

type LucideIconType = typeof Mic;

/**
 * Ícone de estado com aria-label textual — o estado NUNCA é comunicado só por
 * cor: o ícone muda de forma (Mic/MicOff) e o label diz o estado por extenso.
 */
function StateIcon({
  on,
  onLabel,
  offLabel,
  IconOn,
  IconOff,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  IconOn: LucideIconType;
  IconOff: LucideIconType;
}) {
  const Icon = on ? IconOn : IconOff;
  return (
    <span
      role="img"
      aria-label={on ? onLabel : offLabel}
      title={on ? onLabel : offLabel}
      className={cn(
        "flex items-center justify-center w-6 h-6 rounded-full",
        on ? "text-muted-foreground" : "text-destructive",
      )}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </span>
  );
}

function ConnectionQualityIcon({ participant }: { participant: Participant }) {
  const { quality } = useConnectionQualityIndicator({ participant });

  const { Icon, label, tone } = qualityPresentation(quality);

  return (
    <span
      role="img"
      aria-label={`Conexão: ${label}`}
      title={`Conexão: ${label}`}
      className={cn("flex items-center justify-center w-6 h-6 rounded-full", tone)}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </span>
  );
}

function qualityPresentation(quality: ConnectionQuality): {
  Icon: LucideIconType;
  label: string;
  tone: string;
} {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return { Icon: SignalHigh, label: "excelente", tone: "text-primary" };
    case ConnectionQuality.Good:
      return { Icon: SignalMedium, label: "boa", tone: "text-muted-foreground" };
    case ConnectionQuality.Poor:
      return { Icon: SignalLow, label: "instável", tone: "text-destructive" };
    case ConnectionQuality.Lost:
      return { Icon: SignalZero, label: "perdida", tone: "text-destructive" };
    default:
      return { Icon: SignalZero, label: "desconhecida", tone: "text-muted-foreground" };
  }
}
