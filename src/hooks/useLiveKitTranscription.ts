/**
 * useLiveKitTranscription — v8.7.8
 * Coleta MediaStreams de áudio (mic local + remotos) da sala LiveKit, mixa via useSoniox
 * e faz auto-save em meetings.transcript_raw a cada 10s.
 *
 * v8.7.8 — auto-save estável (ref) + flush final ao desmontar/desabilitar.
 */
import { useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant, type LocalTrackPublication } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { useSoniox, type UseSonioxReturn, type SonioxToken } from "./useSoniox";

const SAVE_INTERVAL_MS = 10_000;

export interface UseLiveKitTranscriptionReturn extends UseSonioxReturn {
  participantsCaptured: number;
}

function formatTranscript(list: SonioxToken[]): string {
  return list.map((t) => `[${t.speaker}]: ${t.text}`).join("\n");
}

export function useLiveKitTranscription(
  meetingId: string | null,
  enabled: boolean,
): UseLiveKitTranscriptionReturn {
  const room = useRoomContext();
  const streamsRef = useRef<MediaStream[]>([]);
  const [participantsCaptured, setParticipantsCaptured] = useState(0);

  // Recoleta MediaStreams de áudio (mic local + remotos subscritos) sempre que algo muda
  useEffect(() => {
    if (!enabled || !room) {
      streamsRef.current = [];
      setParticipantsCaptured(0);
      return;
    }

    const refresh = () => {
      const streams: MediaStream[] = [];

      const localPubs = Array.from(room.localParticipant.trackPublications.values()) as LocalTrackPublication[];
      localPubs.forEach((pub) => {
        if (pub.source === Track.Source.Microphone && pub.track?.mediaStreamTrack) {
          streams.push(new MediaStream([pub.track.mediaStreamTrack]));
        }
      });

      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        p.trackPublications.forEach((pub: RemoteTrackPublication) => {
          if (
            pub.source === Track.Source.Microphone &&
            pub.isSubscribed &&
            pub.track?.mediaStreamTrack
          ) {
            streams.push(new MediaStream([(pub.track as RemoteTrack).mediaStreamTrack]));
          }
        });
      });

      streamsRef.current = streams;
      setParticipantsCaptured(streams.length);
    };

    refresh();

    const events: RoomEvent[] = [
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
    ];
    events.forEach((e) => room.on(e, refresh));
    return () => {
      events.forEach((e) => room.off(e, refresh));
    };
  }, [room, enabled]);

  const soniox = useSoniox({
    enabled,
    captureFromMic: false,
    externalStreams: streamsRef,
    // Nenhuma UI da sala desenha o medidor de volume da transcrição. Ligado, ele
    // custava um setInterval(100ms) → ~10 re-renders/s no componente consumidor
    // durante a reunião inteira, sem nada na tela mudando.
    vuMeter: false,
  });

  // Mantém uma ref sempre atualizada com a transcrição mais recente —
  // assim o setInterval/flush não precisa ser recriado a cada token.
  const latestTranscriptRef = useRef<SonioxToken[]>([]);
  useEffect(() => {
    latestTranscriptRef.current = soniox.transcript;
  }, [soniox.transcript]);

  /**
   * Marcador de "o pipeline chegou a rodar nesta reunião", gravado uma única vez
   * assim que a captura fica ativa — ANTES de existir qualquer palavra.
   *
   * Sem ele, uma reunião cujo pipeline nunca subiu (sala sem host) e uma cujo
   * pipeline rodou mas não captou áudio (todos mudos, mic sem permissão) ficavam
   * as duas com `transcript_raw = NULL` e `soniox_session_id = NULL` — estados
   * indistinguíveis no banco, e portanto impossíveis de diagnosticar depois.
   */
  const markerWrittenRef = useRef(false);

  // Salva o estado atual no banco (idempotente, escopado por meeting).
  const saveNow = useRef<(reason?: string) => Promise<void>>(async () => {});
  saveNow.current = async (reason = "tick") => {
    if (!meetingId) return;
    const list = latestTranscriptRef.current;
    const isEmpty = !list || list.length === 0;

    // Ainda sem falas: grava só o marcador de sessão, uma vez. Nunca sobrescreve
    // `transcript_raw` com vazio — um retorno tardio de token não pode apagar o
    // que já foi salvo.
    if (isEmpty) {
      if (markerWrittenRef.current) return;
      markerWrittenRef.current = true;
      try {
        const { error } = await supabase
          .from("meetings")
          .update({ soniox_session_id: "livekit-realtime" })
          .eq("id", meetingId);
        if (error) {
          markerWrittenRef.current = false; // permite nova tentativa no próximo tick
          console.warn(`[useLiveKitTranscription] marker (${reason}) erro:`, error);
        }
      } catch (err) {
        markerWrittenRef.current = false;
        console.warn(`[useLiveKitTranscription] marker (${reason}) falhou:`, err);
      }
      return;
    }

    const full = formatTranscript(list);
    try {
      const { error } = await supabase
        .from("meetings")
        .update({ transcript_raw: full, soniox_session_id: "livekit-realtime" })
        .eq("id", meetingId);
      if (error) {
        console.warn(`[useLiveKitTranscription] save (${reason}) erro:`, error);
      } else {
        markerWrittenRef.current = true;
      }
    } catch (err) {
      console.warn(`[useLiveKitTranscription] save (${reason}) falhou:`, err);
    }
  };

  // Auto-save com intervalo ESTÁVEL (não recriado a cada token).
  useEffect(() => {
    if (!meetingId || !enabled) return;
    markerWrittenRef.current = false;
    // Marca a sessão imediatamente — não espera 10s pelo primeiro tick, porque
    // uma sala encerrada antes disso não deixaria rastro nenhum.
    void saveNow.current("start");
    const id = setInterval(() => {
      void saveNow.current("interval");
    }, SAVE_INTERVAL_MS);
    return () => {
      clearInterval(id);
      // Flush final: garante que o último trecho não se perca quando
      // o hook é desabilitado, a sala encerra ou o componente desmonta.
      void saveNow.current("flush");
    };
  }, [meetingId, enabled]);

  // Flush em pagehide / beforeunload (host fecha aba sem clicar encerrar).
  useEffect(() => {
    if (!meetingId || !enabled) return;
    const handler = () => { void saveNow.current("pagehide"); };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [meetingId, enabled]);

  return {
    ...soniox,
    participantsCaptured,
  };
}
