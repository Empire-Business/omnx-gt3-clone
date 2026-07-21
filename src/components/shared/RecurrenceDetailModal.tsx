import { useState, useRef, useEffect } from "react";
import {
  Repeat, Send, Trash2, CheckSquare2, Square, Calendar,
  Clock, Flag, FolderKanban, Users, AlignLeft, ListChecks,
  MessageSquare, CheckCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AvatarBadge, StatusBadge } from "@/components/shared/SharedComponents";
import { useRecurrenceDetail } from "@/hooks/useRecurrenceDetail";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Diariamente",
  weekly: "Semanalmente",
  biweekly: "Quinzenalmente",
  monthly: "Mensalmente",
  custom: "Personalizado",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

interface RecurrenceInfo {
  id: string;
  task_id: string;
  frequency: string;
  interval_days: number | null;
  next_occurrence: string;
  end_date: string | null;
  is_active: boolean;
  task_title: string;
  task_status: string;
  task_priority: string;
  project_name: string | null;
  assignee_name: string | null;
}

interface RecurrenceDetailModalProps {
  recurrence: RecurrenceInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmployeeId?: string;
}

export function RecurrenceDetailModal({
  recurrence,
  open,
  onOpenChange,
  currentEmployeeId,
}: RecurrenceDetailModalProps) {
  const { user } = useAuth();
  const {
    task,
    taskLoading,
    comments,
    commentsLoading,
    completions,
    completionsLoading,
    addComment,
    deleteComment,
    toggleCompletion,
  } = useRecurrenceDetail(open ? recurrence?.id : undefined);

  const [commentText, setCommentText] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom when new comments arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  if (!recurrence) return null;

  const checklist = task?.checklist_items
    ? (Array.isArray(task.checklist_items) ? task.checklist_items as { text: string; checked: boolean }[] : [])
    : [];

  const handleSendComment = async () => {
    if (!commentText.trim() || !currentEmployeeId) return;
    try {
      await addComment.mutateAsync({ authorId: currentEmployeeId, content: commentText.trim() });
      setCommentText("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleToggleDay = async (dateStr: string) => {
    if (!currentEmployeeId) return;
    try {
      const result = await toggleCompletion.mutateAsync({
        employeeId: currentEmployeeId,
        date: dateStr,
        notes: completionNotes.trim() || undefined,
      });
      toast.success(result.action === "completed" ? "Dia marcado como concluído!" : "Conclusão removida");
      setCompletionNotes("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Generate last 14 days for completion checklist
  const today = new Date();
  const recentDays = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(today, i);
    return format(d, "yyyy-MM-dd");
  });

  const completionDates = new Set(completions.map((c) => c.completion_date));
  const completionMap = new Map(completions.map((c) => [c.completion_date, c]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
              recurrence.is_active ? "bg-primary/10" : "bg-muted"
            )}>
              <Repeat className={cn("w-5 h-5", recurrence.is_active ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-semibold text-foreground leading-tight">
                {recurrence.task_title}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {FREQUENCY_LABELS[recurrence.frequency] || recurrence.frequency}
                </Badge>
                <StatusBadge status={recurrence.task_priority || "medium"} size="sm" />
                {recurrence.project_name && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <FolderKanban className="w-3 h-3" /> {recurrence.project_name}
                  </span>
                )}
                <Badge
                  variant={recurrence.is_active ? "default" : "outline"}
                  className={cn(
                    "text-xs",
                    recurrence.is_active ? "bg-success/10 text-success border-success/20" : "text-muted-foreground"
                  )}
                >
                  {recurrence.is_active ? "Ativa" : "Pausada"}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1 gap-1.5 text-xs">
                <AlignLeft className="w-3.5 h-3.5" /> Detalhes
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex-1 gap-1.5 text-xs">
                <MessageSquare className="w-3.5 h-3.5" /> Chat
                {comments.length > 0 && (
                  <span className="text-2xs opacity-60">({comments.length})</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="completions" className="flex-1 gap-1.5 text-xs">
                <CheckCircle className="w-3.5 h-3.5" /> Conclusões
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── DETAILS TAB ── */}
          <TabsContent value="details" className="flex-1 overflow-auto px-6 py-4 space-y-4">
            {taskLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : (
              <>
                {/* Description */}
                {task?.description && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Descrição</h4>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
                  </div>
                )}

                {/* Info grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoItem icon={<Calendar className="w-4 h-4" />} label="Próxima data" value={
                    format(new Date(recurrence.next_occurrence + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                  } />
                  {recurrence.end_date && (
                    <InfoItem icon={<Clock className="w-4 h-4" />} label="Data limite" value={
                      format(new Date(recurrence.end_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                    } />
                  )}
                  <InfoItem icon={<Flag className="w-4 h-4" />} label="Prioridade" value={
                    PRIORITY_LABELS[recurrence.task_priority] || recurrence.task_priority
                  } />
                  {recurrence.assignee_name && (
                    <InfoItem icon={<Users className="w-4 h-4" />} label="Responsável" value={recurrence.assignee_name} />
                  )}
                </div>

                {/* Checklist */}
                {checklist.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ListChecks className="w-3.5 h-3.5" /> Checklist modelo
                    </h4>
                    <p className="text-2xs text-muted-foreground mb-2">
                      Estes itens são copiados para cada nova tarefa criada pela recorrência
                    </p>
                    <div className="space-y-1">
                      {checklist.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/30">
                          <Square className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm text-foreground">{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ── CHAT TAB ── */}
          <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 px-0 py-0">
            <ScrollArea className="flex-1 px-6 py-4" style={{ maxHeight: "50vh" }}>
              {commentsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
              ) : comments.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
                  <p className="text-2xs text-muted-foreground mt-1">Inicie uma conversa sobre esta tarefa recorrente.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => {
                    const isOwn = currentEmployeeId === comment.author_id;
                    return (
                      <div key={comment.id} className={cn("flex gap-2.5 group", isOwn && "flex-row-reverse")}>
                        <AvatarBadge
                          name={comment.author_name || "?"}
                          avatarUrl={comment.author_avatar}
                          size="sm"
                        />
                        <div className={cn("flex-1 max-w-[75%]", isOwn && "flex flex-col items-end")}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-foreground">{comment.author_name || "Usuário"}</span>
                            <span className="text-2xs text-muted-foreground">
                              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}
                            </span>
                          </div>
                          <div className={cn(
                            "rounded-lg px-3 py-2 text-sm",
                            isOwn
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          )}>
                            {comment.content}
                          </div>
                          {isOwn && (
                            <button
                              onClick={() => deleteComment.mutate(comment.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                              title="Excluir comentário"
                            >
                              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Chat input */}
            <div className="border-t border-border px-4 py-3 flex gap-2 items-end">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Escreva um comentário..."
                className="resize-none text-sm min-h-[40px] max-h-[100px]"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendComment();
                  }
                }}
              />
              <Button
                size="sm"
                className="h-10 px-3"
                onClick={handleSendComment}
                disabled={!commentText.trim() || !currentEmployeeId || addComment.isPending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          {/* ── COMPLETIONS TAB ── */}
          <TabsContent value="completions" className="flex-1 overflow-auto px-6 py-4 space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Registro de conclusões
              </h4>
              <p className="text-2xs text-muted-foreground mb-3">
                Marque os dias em que esta tarefa recorrente foi concluída
              </p>

              {/* Optional notes for today */}
              <div className="flex gap-2 mb-4">
                <Input
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Observações sobre a conclusão (opcional)..."
                  className="text-sm h-9"
                />
              </div>
            </div>

            {completionsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : (
              <div className="space-y-1">
                {recentDays.map((dateStr) => {
                  const isCompleted = completionDates.has(dateStr);
                  const completion = completionMap.get(dateStr);
                  const isToday = dateStr === format(today, "yyyy-MM-dd");
                  const dayDate = new Date(dateStr + "T12:00:00");

                  return (
                    <div
                      key={dateStr}
                      className={cn(
                        "flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors",
                        isToday ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/50",
                        isCompleted && "bg-success/5"
                      )}
                    >
                      <button
                        onClick={() => handleToggleDay(dateStr)}
                        disabled={toggleCompletion.isPending}
                        className="flex-shrink-0"
                      >
                        {isCompleted
                          ? <CheckSquare2 className="w-5 h-5 text-success" />
                          : <Square className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                        }
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-medium",
                            isToday ? "text-primary" : "text-foreground"
                          )}>
                            {format(dayDate, "EEEE, dd/MM", { locale: ptBR })}
                          </span>
                          {isToday && (
                            <Badge variant="outline" className="text-2xs">Hoje</Badge>
                          )}
                        </div>
                        {completion?.notes && (
                          <p className="text-2xs text-muted-foreground mt-0.5 truncate">{completion.notes}</p>
                        )}
                      </div>

                      {isCompleted && completion && (
                        <span className="text-2xs text-muted-foreground flex-shrink-0">
                          por {completion.completed_by_name || "—"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Stats */}
            {completions.length > 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total de conclusões registradas</span>
                  <span className="font-semibold text-foreground">{completions.length}</span>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-2xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
