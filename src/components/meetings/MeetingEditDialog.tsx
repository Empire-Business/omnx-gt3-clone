import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Clock, MapPin, Loader2 } from "lucide-react";
import { Meeting, useUpdateMeeting, MeetingUpdateInput } from "@/hooks/useMeetings";
import { generateRoomName } from "@/hooks/useLiveKit";
import { useProjects } from "@/hooks/useProjects";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MeetingEditDialogProps {
  meeting: Meeting;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MeetingEditDialog({ meeting, open, onOpenChange }: MeetingEditDialogProps) {
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description || "");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(
    meeting.scheduled_date ? new Date(meeting.scheduled_date) : undefined
  );
  const [scheduledTime, setScheduledTime] = useState(meeting.scheduled_time || "");
  const [location, setLocation] = useState(meeting.location || "");
  const [projectId, setProjectId] = useState(meeting.project_id || "");
  const VALID_MODES = ['in_person', 'external_link', 'livekit'] as const;
  const [meetingMode, setMeetingMode] = useState<'in_person' | 'external_link' | 'livekit'>(
    VALID_MODES.includes(meeting.meeting_mode as any) ? (meeting.meeting_mode as any) : 'livekit'
  );

  const updateMeeting = useUpdateMeeting();
  const { data: projects } = useProjects();

  const handleSave = async () => {
    const updates: MeetingUpdateInput = {
      title,
      description: description || null,
      scheduled_date: scheduledDate ? format(scheduledDate, "yyyy-MM-dd") : null,
      scheduled_time: scheduledTime || null,
      project_id: projectId || null,
      location: location || null,
      meeting_mode: meetingMode,
    };

    // Gera sala LiveKit se modo mudou para livekit e reunião ainda não tem sala
    if (meetingMode === 'livekit' && !meeting.livekit_room_name) {
      updates.livekit_room_name = generateRoomName();
    }

    await updateMeeting.mutateAsync({ id: meeting.id, updates });
    onOpenChange(false);
  };

  const isLoading = updateMeeting.isPending;

  // Reset form when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setTitle(meeting.title);
      setDescription(meeting.description || "");
      setScheduledDate(meeting.scheduled_date ? new Date(meeting.scheduled_date) : undefined);
      setScheduledTime(meeting.scheduled_time || "");
      setLocation(meeting.location || "");
      setProjectId(meeting.project_id || "");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Reunião</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Daily Standup"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivo da reunião..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Modo da reunião</Label>
            <Select value={meetingMode} onValueChange={(v) => setMeetingMode(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="livekit">🎥 Sala interna (gravada)</SelectItem>
                <SelectItem value="external_link">🔗 Link externo (Meet, Zoom...)</SelectItem>
                <SelectItem value="in_person">🏢 Presencial</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {meetingMode === 'livekit' && 'A sala será criada automaticamente no app, com gravação e transcrição.'}
              {meetingMode === 'external_link' && 'Cole o link do Google Meet/Zoom no campo "Local / Link" abaixo.'}
              {meetingMode === 'in_person' && 'Sem videochamada — apenas registro presencial.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={(date) => setScheduledDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Horário</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project">Projeto Vinculado</Label>
            <Select value={projectId || ""} onValueChange={(v) => setProjectId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhum projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nenhum projeto</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Local / Link</Label>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: Google Meet, Sala de Reuniões"
                className="flex-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isLoading || !title.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
