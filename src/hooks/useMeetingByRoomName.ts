/**
 * useMeetingByRoomName — v8.36.0
 * Busca (e cria sob demanda quando solicitado pelo host) o registro `meetings`
 * vinculado ao `livekit_room_name`. Necessário para salvar transcript_raw
 * gerado em tempo real durante a call.
 *
 * v8.36.0 — passa a expor `recordingStatus` (fonte da verdade do indicador
 * "GRAVANDO" na sala) e `resolved` (já sabemos a resposta do banco — evita
 * piscar placeholder no primeiro render). O egress é iniciado pelo webhook
 * `participant_joined`, ou seja, DEPOIS que a sala montou: por isso o status
 * é repolado a cada 15s enquanto o hook estiver montado.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const POLL_MS = 15_000;

export function useMeetingByRoomName(
  roomName: string | undefined,
  opts?: { createIfMissing?: boolean; title?: string },
) {
  const { profile } = useAuth();
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** true quando a consulta ao banco já retornou (com ou sem registro). */
  const [resolved, setResolved] = useState(false);
  const meetingIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!roomName || !profile?.tenant_id) return;
    setLoading(true);

    (async () => {
      try {
        const { data: existing, error } = await (supabase as any)
          .from("meetings")
          .select("id, title, recording_status")
          .eq("livekit_room_name", roomName)
          .eq("tenant_id", profile.tenant_id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;

        if (existing?.id) {
          setMeetingId(existing.id);
          meetingIdRef.current = existing.id;
          setTitle(existing.title ?? null);
          setRecordingStatus(existing.recording_status ?? null);
        } else if (opts?.createIfMissing) {
          const insertPayload: any = {
            title: opts.title || `Reunião ${new Date().toLocaleString("pt-BR")}`,
            tenant_id: profile.tenant_id,
            created_by: profile.user_id,
            status: "recording",
            started_at: new Date().toISOString(),
            meeting_mode: "livekit",
            livekit_room_name: roomName,
            recording_status: "pending",
            approval_status: "pending",
          };
          const { data: created, error: insErr } = await (supabase as any)
            .from("meetings")
            .insert(insertPayload)
            .select("id, title, recording_status")
            .single();
          if (insErr) throw insErr;
          if (!cancelled) {
            setMeetingId(created.id);
            meetingIdRef.current = created.id;
            setTitle(created.title ?? null);
            setRecordingStatus(created.recording_status ?? null);
          }
        }
      } catch (err) {
        console.warn("[useMeetingByRoomName] erro:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setResolved(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [roomName, profile?.tenant_id, profile?.user_id, opts?.createIfMissing, opts?.title]);

  // Repolling do status de gravação — o egress só começa quando o primeiro
  // participante entra, então o valor muda depois do fetch inicial.
  useEffect(() => {
    if (!meetingId || !profile?.tenant_id) return;
    let cancelled = false;

    const id = window.setInterval(async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("meetings")
          .select("recording_status, title")
          .eq("id", meetingId)
          .eq("tenant_id", profile.tenant_id)
          .maybeSingle();
        if (error || cancelled || !data) return;
        setRecordingStatus(data.recording_status ?? null);
        setTitle(data.title ?? null);
      } catch {
        /* silencioso — é só polling de status */
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [meetingId, profile?.tenant_id]);

  return { meetingId, title, recordingStatus, loading, resolved };
}
