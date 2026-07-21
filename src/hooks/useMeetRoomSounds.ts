/**
 * useMeetRoomSounds — v8.12.5
 * Toca um chime curto via Web Audio API quando alguém entra/sai da sala
 * LiveKit. Sem assets externos: gera o som inline (oscilador + envelope ADSR).
 *
 * Uso: chamar dentro de qualquer componente filho de <LiveKitRoom> (precisa
 * do RoomContext). Ignora silenciosamente o evento da própria conexão local.
 */
import { useEffect, useRef } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, type RemoteParticipant } from "livekit-client";

const JOIN_NOTES = [880, 1175]; // A5 → D6 (sobe)
const LEAVE_NOTES = [880, 587]; // A5 → D5 (desce)

function playChime(notes: number[]) {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const noteDuration = 0.12;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * noteDuration);

      const start = now + i * noteDuration;
      const peak = start + 0.02;
      const end = start + noteDuration;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, peak);
      gain.gain.exponentialRampToValueAtTime(0.001, end);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.05);
    });

    // Fecha o contexto ~400ms depois para liberar recurso
    setTimeout(() => ctx.close().catch(() => undefined), 600);
  } catch {
    /* navegador sem WebAudio ou bloqueado por autoplay-policy */
  }
}

export function useMeetRoomSounds(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const room = useRoomContext();
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!room || !enabled) return;

    const onConnected = (p: RemoteParticipant) => {
      // Ignora notificações dos primeiros 1.2s (quando entramos na sala e
      // recebemos os participantes que já estavam dentro — não queremos
      // tocar um chime para cada um deles).
      if (Date.now() - startedAtRef.current < 1200) return;
      console.debug("[meet-sounds] participant connected:", p.identity);
      playChime(JOIN_NOTES);
    };

    const onDisconnected = (p: RemoteParticipant) => {
      if (Date.now() - startedAtRef.current < 1200) return;
      console.debug("[meet-sounds] participant disconnected:", p.identity);
      playChime(LEAVE_NOTES);
    };

    room.on(RoomEvent.ParticipantConnected, onConnected);
    room.on(RoomEvent.ParticipantDisconnected, onDisconnected);

    // Reseta timestamp ao re-entrar
    startedAtRef.current = Date.now();

    return () => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
    };
  }, [room, enabled]);
}
