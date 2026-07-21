import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Meeting, useDeleteMeeting } from "@/hooks/useMeetings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Users, MapPin, Video, ExternalLink, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { CopyGuestLinkButton } from "@/components/meetings/CopyGuestLinkButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MeetingCardProps {
  meeting: Meeting;
  onClick?: () => void;
}

const statusStyles: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Agendada", variant: "outline" },
  recording: { label: "Gravando", variant: "destructive" },
  processing: { label: "Processando", variant: "secondary" },
  completed: { label: "Concluída", variant: "default" },
  cancelled: { label: "Cancelada", variant: "outline" },
};

const approvalMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "secondary" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Rejeitado", variant: "destructive" },
};

export function MeetingCard({ meeting, onClick }: MeetingCardProps) {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const deleteMeeting = useDeleteMeeting();

  const getScheduledDateTime = (): string | null => {
    if (!meeting.scheduled_date) return null;

    const date = new Date(meeting.scheduled_date);
    const formattedDate = format(date, "dd/MM/yyyy", { locale: ptBR });

    if (meeting.scheduled_time) {
      return `${formattedDate} às ${meeting.scheduled_time}`;
    }
    return formattedDate;
  };

  const attendeesCount = (meeting.meeting_attendees || []).filter(
    (a) => a.attendance_status === "attended",
  ).length;
  const isLiveKit = meeting.meeting_mode === 'livekit' && !!meeting.livekit_room_name;
  const isFinished = meeting.status === 'completed' || meeting.status === 'cancelled';
  const isLive = meeting.recording_status === 'recording' && !isFinished;
  const isHost = !!user && !!meeting.created_by && meeting.created_by === user.id;

  const handleEnter = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!meeting.livekit_room_name) return;
    const role = isHost ? 'host' : 'guest';
    window.open(`/meet/${meeting.livekit_room_name}?role=${role}`, '_blank', 'noopener');
  };

  const handleDelete = () => {
    deleteMeeting.mutate(meeting.id);
  };

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="pb-3 pt-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm truncate pr-2">{meeting.title}</h4>
            <div className="flex items-center gap-1.5 shrink-0">
              {isLive && (
                <Badge variant="destructive" className="text-[10px] gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-current" /> AO VIVO
                </Badge>
              )}
              <Badge variant={statusStyles[meeting.status]?.variant || "outline"}>
                {statusStyles[meeting.status]?.label || meeting.status}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {getScheduledDateTime() && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{getScheduledDateTime()}</span>
              </div>
            )}

            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>
                {attendeesCount} {attendeesCount === 1 ? "participante" : "participantes"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {meeting.project && (
                <Badge variant="outline" className="text-xs truncate">
                  {meeting.project.name}
                </Badge>
              )}
              {meeting.location && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[120px]">{meeting.location}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {meeting.status === "completed" && (
                <Badge
                  variant={approvalMap[meeting.approval_status]?.variant || "secondary"}
                  className="text-xs"
                >
                  {approvalMap[meeting.approval_status]?.label || meeting.approval_status}
                </Badge>
              )}
              {isLiveKit && meeting.status !== 'completed' && meeting.status !== 'cancelled' && (
                <>
                  {isHost && meeting.livekit_room_name && (
                    <CopyGuestLinkButton
                      roomName={meeting.livekit_room_name}
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      label="Link convidado"
                      stopPropagation
                    />
                  )}
                  <Button
                    size="sm"
                    variant={isLive ? 'destructive' : 'default'}
                    onClick={handleEnter}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    <Video className="w-3 h-3" />
                    Entrar
                  </Button>
                </>
              )}
              {meeting.meeting_mode === 'external_link' && meeting.location && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(meeting.location!, '_blank', 'noopener');
                  }}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir
                </Button>
              )}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => e.stopPropagation()}
                      disabled={deleteMeeting.isPending}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Excluir reunião"
                      aria-label="Excluir reunião"
                    >
                      {deleteMeeting.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir esta reunião?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A reunião <strong>"{meeting.title}"</strong> e todos os
                        seus dados (participantes, transcrições, gravações,
                        itens aprovados) serão removidos permanentemente. Esta
                        ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
