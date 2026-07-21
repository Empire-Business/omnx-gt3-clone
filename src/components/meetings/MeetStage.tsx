/**
 * MeetStage — v8.10.8 (Google Meet style, redesign Liquid Glass dark)
 *
 * Layout:
 *  - Desktop (≥768px): split horizontal — área principal ~70% + sidebar grid à direita.
 *  - Mobile (<768px): stack vertical — área principal 60% em cima, carrossel
 *    horizontal com scroll snap embaixo.
 *  - Sem screen share + ≤2 participantes: grid simétrico (sem sidebar) para não
 *    desperdiçar espaço.
 *
 * Foco automático:
 *  - Screen share sempre ganha o foco quando presente.
 *  - Pin manual (clique no tile) sobrescreve a heurística.
 *  - Caso contrário, último active speaker (via `useSpeakingParticipants`).
 *  - Fallback: primeiro participante remoto, depois local.
 *
 * Gerencia o `pinnedSid` localmente — não persiste, é um override de sessão.
 */
import { useEffect, useMemo, useState } from "react";
import {
  useTracks,
  useSpeakingParticipants,
  useLocalParticipant,
  isTrackReference,
  type TrackReferenceOrPlaceholder,
  type TrackReference,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MeetTile } from "./MeetTile";
import { cn } from "@/lib/utils";

interface MeetStageProps {
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function MeetStage(_props: MeetStageProps = {}) {
  const tracksRaw = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Mantemos só TrackReferences "reais" (descartando placeholders sem participant válido).
  const tracks = useMemo(
    () => tracksRaw.filter((t): t is TrackReference => isTrackReference(t)),
    [tracksRaw],
  );

  const screenShare = useMemo(
    () => tracks.find((t) => t.source === Track.Source.ScreenShare),
    [tracks],
  );

  const cameraTracks = useMemo(
    () => tracks.filter((t) => t.source === Track.Source.Camera),
    [tracks],
  );

  const speakers = useSpeakingParticipants();
  const { localParticipant } = useLocalParticipant();

  const [pinnedSid, setPinnedSid] = useState<string | null>(null);
  // Active speaker estável: lembra o último que falou (anti-flicker em silêncios curtos)
  const [lastSpeakerSid, setLastSpeakerSid] = useState<string | null>(null);
  useEffect(() => {
    const top = speakers.find((p) => !p.isLocal) ?? speakers[0];
    if (top?.sid) setLastSpeakerSid(top.sid);
  }, [speakers]);

  // Resolve a track de foco (screen share > pin > active speaker > primeiro remoto > local)
  const focusTrack: TrackReference | undefined = useMemo(() => {
    if (screenShare) return screenShare;

    if (pinnedSid) {
      const pinned = cameraTracks.find((t) => t.participant.sid === pinnedSid);
      if (pinned) return pinned;
    }

    if (lastSpeakerSid) {
      const speaking = cameraTracks.find((t) => t.participant.sid === lastSpeakerSid);
      if (speaking) return speaking;
    }

    const firstRemote = cameraTracks.find((t) => !t.participant.isLocal);
    if (firstRemote) return firstRemote;

    return cameraTracks.find((t) => t.participant.sid === localParticipant?.sid);
  }, [screenShare, pinnedSid, lastSpeakerSid, cameraTracks, localParticipant?.sid]);

  // Tiles que vão para a sidebar / carrossel (todos menos o foco — exceto se o
  // foco for screen share, aí o publicador também aparece como tile separado).
  const sideTracks: TrackReference[] = useMemo(() => {
    if (screenShare) return cameraTracks;
    if (!focusTrack) return cameraTracks;
    return cameraTracks.filter(
      (t) => t.participant.sid !== focusTrack.participant.sid,
    );
  }, [cameraTracks, screenShare, focusTrack]);

  // Caso degenerado: 1 ou 2 câmeras e sem screen share → grid simétrico bonito,
  // sem sidebar (evita layout enviesado em call de poucas pessoas).
  const useSymmetricGrid = !screenShare && cameraTracks.length <= 2;

  if (useSymmetricGrid) {
    return (
      <div className="relative h-full w-full bg-[#0a0a14] p-2 sm:p-4">
        <div
          className={cn(
            "grid gap-2 sm:gap-3 h-full w-full",
            cameraTracks.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
          )}
        >
          {cameraTracks.map((t) => (
            <MeetTile
              key={`${t.participant.sid}:${t.publication?.trackSid ?? "cam"}`}
              trackRef={t}
              size="focus"
              pinned={pinnedSid === t.participant.sid}
              onTogglePin={() =>
                setPinnedSid((cur) => (cur === t.participant.sid ? null : t.participant.sid))
              }
              showPinButton={false}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#0a0a14]">
      {/* Desktop: split horizontal (lg+). Mobile: stack vertical. */}
      <div className="h-full w-full flex flex-col md:flex-row gap-1.5 sm:gap-3 p-1.5 sm:p-4">
        {/* Área de foco */}
        <div
          className={cn(
            "relative min-h-0",
            "flex-[5] md:flex-[7]",
            "h-[65%] md:h-auto",
          )}
        >
          {focusTrack ? (
            <MeetTile
              key={`focus:${focusTrack.participant.sid}:${focusTrack.publication?.trackSid ?? focusTrack.source}`}
              trackRef={focusTrack}
              size="focus"
              pinned={pinnedSid === focusTrack.participant.sid}
              onTogglePin={() =>
                setPinnedSid((cur) =>
                  cur === focusTrack.participant.sid ? null : focusTrack.participant.sid,
                )
              }
              showPinButton={!screenShare}
            />
          ) : (
            <div className="h-full w-full rounded-2xl bg-[#0F0F23] flex items-center justify-center text-white/40 text-sm">
              Aguardando participantes…
            </div>
          )}
        </div>

        {/* Sidebar (desktop) / Carrossel (mobile) */}
        {sideTracks.length > 0 && (
          <div
            className={cn(
              "min-h-0",
              "flex-[2] md:flex-[3] md:max-w-[360px]",
              "flex flex-row md:flex-col gap-2 sm:gap-3",
              "overflow-x-auto md:overflow-y-auto md:overflow-x-hidden",
              "snap-x snap-mandatory md:snap-none",
              "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10",
              "pb-1 md:pb-0",
            )}
          >
            {/* Mobile: tiles ocupam ~45% da largura, lado a lado com scroll */}
            {/* Desktop: grid 1-col (max ~360px) com scroll vertical */}
            {sideTracks.map((t) => (
              <div
                key={`${t.participant.sid}:${t.publication?.trackSid ?? "cam"}`}
                className={cn(
                  "shrink-0 snap-start md:snap-align-none",
                  "w-[44%] sm:w-[36%] md:w-full",
                )}
              >
                <MeetTile
                  trackRef={t}
                  size="thumb"
                  pinned={pinnedSid === t.participant.sid}
                  onTogglePin={() =>
                    setPinnedSid((cur) =>
                      cur === t.participant.sid ? null : t.participant.sid,
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
