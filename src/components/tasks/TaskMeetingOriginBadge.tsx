/**
 * TaskMeetingOriginBadge — v8.10.6
 * Badge "Vinda da reunião X" quando task tem source_meeting_id.
 */
import { useQuery } from "@tanstack/react-query";
import { Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  meetingId: string | null | undefined;
}

export function TaskMeetingOriginBadge({ meetingId }: Props) {
  const navigate = useNavigate();
  const { data: meeting } = useQuery({
    queryKey: ["meeting-origin", meetingId],
    enabled: !!meetingId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data } = await supabase
        .from("meetings")
        .select("id, title, scheduled_at, started_at, created_at")
        .eq("id", meetingId!)
        .maybeSingle();
      return data;
    },
  });

  if (!meetingId || !meeting) return null;

  const when = meeting.started_at || meeting.scheduled_at || meeting.created_at;
  const dateText = when
    ? format(new Date(when), "dd MMM", { locale: ptBR })
    : null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/reunioes/${meeting.id}`)}
      className="inline-flex items-center gap-1.5 text-2xs font-medium text-primary hover:underline"
      title="Abrir reunião de origem"
    >
      <Video className="w-3 h-3" />
      <span className="truncate max-w-[200px]">
        Vinda da reunião "{meeting.title || "Reunião"}"
      </span>
      {dateText && <span className="text-muted-foreground">· {dateText}</span>}
    </button>
  );
}
