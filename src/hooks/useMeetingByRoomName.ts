/**
 * useMeetingByRoomName — v8.7.7
 * Busca (e cria sob demanda quando solicitado pelo host) o registro `meetings`
 * vinculado ao `livekit_room_name`. Necessário para salvar transcript_raw
 * gerado em tempo real durante a call.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useMeetingByRoomName(
  roomName: string | undefined,
  opts?: { createIfMissing?: boolean; title?: string },
) {
  const { profile } = useAuth();
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!roomName || !profile?.tenant_id) return;
    setLoading(true);

    (async () => {
      try {
        const { data: existing, error } = await (supabase as any)
          .from("meetings")
          .select("id, title")
          .eq("livekit_room_name", roomName)
          .eq("tenant_id", profile.tenant_id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;

        if (existing?.id) {
          setMeetingId(existing.id);
          setTitle(existing.title ?? null);
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
            .select("id, title")
            .single();
          if (insErr) throw insErr;
          if (!cancelled) {
            setMeetingId(created.id);
            setTitle(created.title ?? null);
          }
        }
      } catch (err) {
        console.warn("[useMeetingByRoomName] erro:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [roomName, profile?.tenant_id, profile?.user_id, opts?.createIfMissing, opts?.title]);

  return { meetingId, title, loading };
}
