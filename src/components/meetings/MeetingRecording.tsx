/**
 * MeetingRecording — v8.7.4
 * Aba dedicada ao vídeo da gravação LiveKit.
 * Isolada do resumo IA e dos controles de gravação local (Soniox).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Video, Loader2, AlertCircle } from "lucide-react";
import { Meeting } from "@/hooks/useMeetings";

interface Props {
  meeting: Meeting;
}

export function MeetingRecording({ meeting }: Props) {
  const recStatus = meeting.recording_status;
  const recUrl = meeting.recording_url;

  const statusBadge = recStatus
    ? {
        completed: { label: "Disponível", variant: "default" as const },
        recording: { label: "Gravando…", variant: "secondary" as const },
        pending: { label: "Aguardando", variant: "secondary" as const },
        failed: { label: "Falhou", variant: "destructive" as const },
      }[recStatus]
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Video className="w-5 h-5" />
          Vídeo da Reunião
          {statusBadge && (
            <Badge variant={statusBadge.variant} className="ml-2 text-xs">
              {statusBadge.label}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recUrl ? (
          <video
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-lg bg-black aspect-video"
            src={recUrl}
          >
            Seu navegador não suporta vídeo.
          </video>
        ) : recStatus === "failed" ? (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            A gravação falhou. Verifique os logs ou inicie uma nova reunião.
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            {recStatus === "recording"
              ? "Gravação em andamento — o vídeo aparecerá aqui ao final."
              : "Aguardando início da gravação."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
