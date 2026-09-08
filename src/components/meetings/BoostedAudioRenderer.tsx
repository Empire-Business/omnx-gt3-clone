/**
 * BoostedAudioRenderer — v8.11.1
 *
 * Renderiza áudio remoto da sala LiveKit. Dois modos:
 *
 *  • Modo nativo (gain ≤ 1.0): apenas <audio> com volume = gain. A/V fica
 *    perfeitamente sincronizado pela pipeline de mídia do browser, sem
 *    Web Audio (zero CPU extra, zero latência adicional).
 *
 *  • Modo boost (gain > 1.0): MediaStreamSource → GainNode → destination.
 *    O <audio> fica mudo (volume=0) para evitar duplicação. Compressor
 *    só entra em gains altos (>= 3.0) onde clipping é provável.
 *
 * Troca dinâmica: quando o usuário altera o slider para cruzar 1.0,
 * recriamos o bundle de cada track com o pipeline apropriado.
 *
 * ATENÇÃO — o ganho é POR FONTE. A MeetRoom não usa <RoomAudioRenderer>: quem
 * toca TODO o áudio remoto é este componente. Enquanto ele assinava só
 * Microphone, o áudio de quem compartilhava a tela simplesmente não existia
 * do lado do receptor ("compartilhei o vídeo e ninguém ouviu"). Agora
 * ScreenShareAudio também entra — mas com ganho NEUTRO (1.0), nunca o boost
 * do slider: o boost existe pra realçar voz captada por microfone, e áudio de
 * guia/sistema já chega em nível de linha; multiplicá-lo clipa/estoura o som.
 */
import { useEffect, useMemo, useRef } from "react";
import { useTracks, useRoomContext } from "@livekit/components-react";
import { Track, RoomEvent, type RemoteAudioTrack } from "livekit-client";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";

interface NodeBundle {
  mode: "native" | "boost";
  /** Áudio de tela ignora o slider de volume remoto (ganho fixo em 1.0). */
  isScreenShare: boolean;
  audioEl: HTMLAudioElement;
  source?: MediaStreamAudioSourceNode;
  gain?: GainNode;
  compressor?: DynamicsCompressorNode;
}

const MAX_GAIN = 10.0;
const COMPRESSOR_THRESHOLD_GAIN = 3.0; // só adiciona compressor em boosts altos

export function BoostedAudioRenderer() {
  const room = useRoomContext();
  const { prefs } = useMeetPreferences();
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<Map<string, NodeBundle>>(new Map());

  // Todas as faixas de áudio remotas: microfone E áudio da tela compartilhada.
  const tracks = useTracks(
    [Track.Source.Microphone, Track.Source.ScreenShareAudio],
    { onlySubscribed: true },
  );

  const remoteAudioTracks = useMemo(
    () =>
      tracks
        // Filtrar o participante local é obrigatório inclusive para o áudio de
        // tela: quem compartilha já ouve a própria guia pelos alto-falantes;
        // reproduzir a volta do servidor causaria eco/microfonia.
        .filter((t) => t.participant.identity !== room?.localParticipant?.identity)
        .map((t) => ({
          id: `${t.participant.identity}:${t.publication.trackSid}`,
          isScreenShare: t.source === Track.Source.ScreenShareAudio,
          track: t.publication.track as RemoteAudioTrack | undefined,
        }))
        .filter(
          (x): x is { id: string; isScreenShare: boolean; track: RemoteAudioTrack } => !!x.track,
        ),
    [tracks, room?.localParticipant?.identity],
  );

  const targetGain = Math.min(MAX_GAIN, Math.max(0, prefs.remoteAudioGain));

  // Cria AudioContext sob demanda (só quando o boost estiver ativo)
  const ensureCtx = () => {
    if (ctxRef.current) return ctxRef.current;
    try {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (Ctor) ctxRef.current = new Ctor();
    } catch (err) {
      console.warn("[BoostedAudioRenderer] AudioContext indisponível:", err);
    }
    return ctxRef.current;
  };

  const teardownBundle = (bundle: NodeBundle) => {
    try { bundle.gain?.disconnect(); } catch { /* noop */ }
    try { bundle.compressor?.disconnect(); } catch { /* noop */ }
    try { bundle.source?.disconnect(); } catch { /* noop */ }
    try { bundle.audioEl.srcObject = null; bundle.audioEl.remove(); } catch { /* noop */ }
  };

  // Cleanup global ao desmontar
  useEffect(() => {
    return () => {
      for (const bundle of nodesRef.current.values()) teardownBundle(bundle);
      nodesRef.current.clear();
      try { ctxRef.current?.close(); } catch { /* noop */ }
      ctxRef.current = null;
    };
  }, []);

  // Sincroniza nós com as tracks remotas atuais e com o modo escolhido (native vs boost)
  useEffect(() => {
    const seen = new Set<string>();
    for (const { id, track, isScreenShare } of remoteAudioTracks) {
      // Ganho por fonte: microfone segue o slider; tela fica sempre neutra.
      const trackGain = isScreenShare ? 1.0 : targetGain;
      const desiredMode: NodeBundle["mode"] = trackGain > 1.0 ? "boost" : "native";

      seen.add(id);
      const existing = nodesRef.current.get(id);
      // Se já existe no mesmo modo, só ajusta o ganho/volume
      if (existing && existing.mode === desiredMode) {
        if (desiredMode === "native") {
          existing.audioEl.volume = Math.min(1, trackGain);
        }
        continue;
      }
      // Se mudou o modo, destrói o antigo antes de recriar
      if (existing) {
        teardownBundle(existing);
        nodesRef.current.delete(id);
      }
      const mediaStream = track.mediaStream ?? new MediaStream([track.mediaStreamTrack]);
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.srcObject = mediaStream;

      if (desiredMode === "native") {
        // Modo nativo: <audio> toca direto — A/V sincronizado pelo browser
        audioEl.muted = false;
        audioEl.volume = Math.min(1, trackGain);
        audioEl.play().catch(() => { /* será iniciado por user gesture */ });
        nodesRef.current.set(id, { mode: "native", isScreenShare, audioEl });
      } else {
        // Modo boost: <audio> mudo + Web Audio com GainNode
        const ctx = ensureCtx();
        if (!ctx) {
          // Fallback se AudioContext falhar
          audioEl.muted = false;
          audioEl.volume = 1;
          audioEl.play().catch(() => undefined);
          nodesRef.current.set(id, { mode: "native", isScreenShare, audioEl });
          continue;
        }
        if (ctx.state === "suspended") {
          void ctx.resume().catch(() => undefined);
        }
        audioEl.muted = true;
        audioEl.play().catch(() => undefined);
        try {
          const source = ctx.createMediaStreamSource(mediaStream);
          const gain = ctx.createGain();
          gain.gain.value = trackGain;
          // Compressor só em boost alto — evita latência/coloração em uso normal.
          if (trackGain >= COMPRESSOR_THRESHOLD_GAIN) {
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = -6;
            compressor.knee.value = 12;
            compressor.ratio.value = 20;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.2;
            source.connect(gain).connect(compressor).connect(ctx.destination);
            nodesRef.current.set(id, { mode: "boost", isScreenShare, audioEl, source, gain, compressor });
          } else {
            source.connect(gain).connect(ctx.destination);
            nodesRef.current.set(id, { mode: "boost", isScreenShare, audioEl, source, gain });
          }
        } catch (err) {
          console.warn("[BoostedAudioRenderer] falha createMediaStreamSource:", err);
          // Fallback nativo se Web Audio falhar
          audioEl.muted = false;
          audioEl.volume = 1;
          nodesRef.current.set(id, { mode: "native", isScreenShare, audioEl });
        }
      }
    }

    // Remove nós de tracks que sumiram
    for (const [id, bundle] of nodesRef.current) {
      if (!seen.has(id)) {
        teardownBundle(bundle);
        nodesRef.current.delete(id);
      }
    }
  }, [remoteAudioTracks, targetGain]);

  // Atualiza o ganho em tempo real (sem recriar nós) quando dentro do mesmo modo
  useEffect(() => {
    const ctx = ctxRef.current;
    for (const bundle of nodesRef.current.values()) {
      // Áudio de tela é imune ao slider — seu ganho permanece em 1.0.
      if (bundle.isScreenShare) continue;
      if (bundle.mode === "boost" && bundle.gain && ctx) {
        try {
          bundle.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
        } catch { /* noop */ }
      } else if (bundle.mode === "native") {
        bundle.audioEl.volume = Math.min(1, targetGain);
      }
    }
  }, [targetGain]);

  // Garante retomada do AudioContext após o primeiro user gesture (autoplay policy)
  useEffect(() => {
    const resume = () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    };
    if (!room) return;
    room.on(RoomEvent.LocalTrackPublished, resume);
    document.addEventListener("click", resume, { once: true, capture: true });
    return () => {
      room.off(RoomEvent.LocalTrackPublished, resume);
      document.removeEventListener("click", resume, true);
    };
  }, [room]);

  return null;
}
