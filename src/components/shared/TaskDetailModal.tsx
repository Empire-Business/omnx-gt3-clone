import { useEffect, useState, useRef, useCallback } from "react";
import {
  X, Plus, Clock, ListChecks, Square, CheckSquare2, Tag,
  Paperclip, Image as ImageIcon, Trash2, Upload, Calendar,
  User, FolderKanban, Flag, AlignLeft, Pencil, ExternalLink,
  FileText, File as FileIconLucide, ChevronDown, ChevronUp, Download, MessageSquare, Send, Repeat,
  History as TaskHistoryIcon, Copy, MessageCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { findOrCreateDM } from "@/hooks/useChat";
import { TaskHistoryTimeline } from "@/components/tasks/TaskHistoryTimeline";
import { TaskTimer } from "@/components/tasks/TaskTimer";
import { TaskSubtasksSection } from "@/components/tasks/TaskSubtasksSection";
import { TaskDependenciesSection } from "@/components/tasks/TaskDependenciesSection";
import { TaskMeetingOriginBadge } from "@/components/tasks/TaskMeetingOriginBadge";
import { CornerDownRight, ArrowUpFromLine } from "lucide-react";
import { useSubtasks } from "@/hooks/useSubtasks";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { useAuth } from "@/hooks/useAuth";
import { useTaskComments } from "@/hooks/useTaskComments";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge, AvatarBadge } from "@/components/shared/SharedComponents";
import { ImageLightbox, type LightboxImage } from "@/components/shared/ImageLightbox";
import { RecurrenceConfig } from "@/components/shared/RecurrenceConfig";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday, isValid, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { normalizeDateForSave, extractDateForInput, parseDateSafe, isTaskOverdue } from "@/lib/date-utils";
import { getTaskLabelStyle, syncProjectLabel } from "@/lib/task-project-labels";
import type { Database } from "@/integrations/supabase/types";
import type { TaskWithDetails } from "@/hooks/useTasks";
import { normalizeSupabaseAssetUrl } from "@/integrations/supabase/config";

type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "A Fazer" },
  { value: "doing", label: "Em Andamento" },
  { value: "review", label: "Em Revisão" },
  { value: "ajustes", label: "Ajustes" },
  { value: "done", label: "Concluído" },
  { value: "arquivado", label: "Arquivado" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: "low", label: "Baixa", color: "bg-muted text-muted-foreground" },
  { value: "medium", label: "Média", color: "bg-info/10 text-info" },
  { value: "high", label: "Alta", color: "bg-warning/10 text-warning" },
  { value: "urgent", label: "Urgente", color: "bg-danger/10 text-danger" },
];

const LABEL_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

interface TaskLabel {
  text: string;
  color: string;
}

interface TaskAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
  uploaded_at: string;
}

interface TaskDetailModalProps {
  task: TaskWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: any) => Promise<void>;
  onDelete: (id: string) => void;
  onSyncAssignees?: (taskId: string, employeeIds: string[]) => void;
  employees: Array<{ id: string; full_name: string | null; status: string | null; user_id?: string | null }>;
  projects: Array<{ id: string; name: string }>;
  projectId?: string;
  canEdit?: boolean;
}

export function TaskDetailModal({
  task, open, onOpenChange, onSave, onDelete, onSyncAssignees,
  employees, projects, projectId, canEdit = true,
}: TaskDetailModalProps) {
  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-none w-[calc(100vw-1rem)] h-[calc(100dvh-1rem)] sm:w-[calc(100vw-2rem)] sm:h-[calc(100dvh-2rem)] md:w-[calc(100vw-3rem)] md:h-[calc(100dvh-3rem)] max-h-none p-0 gap-0 flex flex-col overflow-hidden rounded-xl border shadow-2xl"
      >
        <DialogTitle className="sr-only">{task.title}</DialogTitle>
        <TaskDetailContent
          task={task}
          onClose={() => onOpenChange(false)}
          onSave={onSave}
          onDelete={onDelete}
          onSyncAssignees={onSyncAssignees}
          employees={employees}
          projects={projects}
          projectId={projectId}
          canEdit={canEdit}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Componente isolado por comentário — estado de edição local ──────────────
interface CommentItemProps {
  comment: import("@/hooks/useTaskComments").TaskComment;
  currentEmployeeId: string | undefined;
  updateComment: { mutateAsync: (args: { commentId: string; content: string }) => Promise<void>; isPending: boolean };
  deleteComment: { mutate: (id: string) => void };
  renderContent: (content: string) => React.ReactNode;
}

function CommentItem({ comment, currentEmployeeId, updateComment, deleteComment, renderContent }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const isOwn = currentEmployeeId === comment.author_id;

  return (
    <div className="flex gap-2 group">
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
        {comment.author_avatar ? (
          <img src={normalizeSupabaseAssetUrl(comment.author_avatar) || ""} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">{comment.author_name || "Usuário"}</span>
          <span className="text-2xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}
          </span>
          {isOwn && !isEditing && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex items-center gap-1.5">
              <button
                type="button"
                className="p-1 rounded hover:bg-muted"
                onClick={() => { setIsEditing(true); setEditContent(comment.content); }}
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
              <button
                type="button"
                className="p-1 rounded hover:bg-muted"
                onClick={() => deleteComment.mutate(comment.id)}
              >
                <Trash2 className="w-3 h-3 text-muted-foreground hover:text-danger" />
              </button>
            </div>
          )}
        </div>
        {isEditing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="text-sm"
              onKeyDown={(e) => { if (e.key === "Escape") setIsEditing(false); }}
            />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!editContent.trim() || updateComment.isPending}
                onClick={async () => {
                  try {
                    await updateComment.mutateAsync({ commentId: comment.id, content: editContent.trim() });
                    setIsEditing(false);
                  } catch (err: any) {
                    toast.error(err.message || "Erro ao salvar comentário");
                  }
                }}
              >
                Salvar
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-0.5">{renderContent(comment.content)}</div>
        )}
      </div>
    </div>
  );
}

// ── Padrões visuais reutilizáveis (DS1 — eyebrow mono + tracking-wider) ──────
interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: string | number;
  action?: React.ReactNode;
}

function SectionHeader({ icon: Icon, label, count, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-2xs font-mono font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        {count !== undefined && count !== "" && (
          <span className="text-2xs font-mono text-muted-foreground/70 tabular-nums">
            · {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

interface SidebarGroupProps {
  label: string;
  children: React.ReactNode;
}

function SidebarGroup({ label, children }: SidebarGroupProps) {
  return (
    <div className="space-y-3">
      <p className="text-2xs font-mono font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </p>
      {children}
    </div>
  );
}

interface SidebarFieldProps {
  label: string;
  children: React.ReactNode;
}

function SidebarField({ label, children }: SidebarFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-2xs text-muted-foreground/80 font-normal">
        {label}
      </Label>
      {children}
    </div>
  );
}

function TaskDetailContent({
  task, onClose, onSave, onDelete, onSyncAssignees, employees, projects, projectId, canEdit,
}: Omit<TaskDetailModalProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  // Visualizador de imagens: anexos e imagens da descrição abrem AQUI, sobre a
  // tarefa, em vez de numa aba do navegador (que fazia o usuário perder o
  // contexto — e, no PWA instalado, sair do app).
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [title, setTitle] = useState(task!.title);
  const [description, setDescription] = useState(task!.description || "");
  const [priority, setPriority] = useState<TaskPriority>((task!.priority || "medium") as TaskPriority);
  const [status, setStatus] = useState<TaskStatus>((task!.status || "todo") as TaskStatus);
  const [assigneeId, setAssigneeId] = useState(task!.assignee_id || "");
  const [taskProjectId, setTaskProjectId] = useState(task!.project_id || projectId || "");
  const [dueDate, setDueDate] = useState(extractDateForInput(task!.due_date));
  const [labels, setLabels] = useState<TaskLabel[]>(
    Array.isArray((task as any)?.labels) ? (task as any).labels : []
  );
  const [attachments, setAttachments] = useState<TaskAttachment[]>(
    Array.isArray((task as any)?.attachments) ? ((task as any).attachments as TaskAttachment[]) : []
  );
  const [coverUrl, setCoverUrl] = useState<string>((task as any)?.cover_url || "");
  const [checklist, setChecklist] = useState<{ text: string; checked: boolean }[]>(
    Array.isArray(task!.checklist_items) ? (task!.checklist_items as any[]) : []
  );

  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task!.assignees && task!.assignees.length > 0
      ? task!.assignees.map((a) => a.employee_id)
      : task!.assignee_id ? [task!.assignee_id] : []
  );

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [newLabelText, setNewLabelText] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showCheckedItems, setShowCheckedItems] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const currentEmployeeId = employees.find((e) => e.user_id === user?.id)?.id;

  // Auto-save: salva silenciosamente 1.2s após qualquer alteração nos campos principais
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!canEdit || !task) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (!title.trim()) return;
      setSaving(true);
      try {
        const nextProject = projects.find((p) => p.id === taskProjectId) || null;
        const nextLabels = syncProjectLabel(labels, nextProject, projects);
        await onSave(task.id, {
          title: title.trim(),
          description: description.trim() || null,
          priority, status,
          assignee_id: assigneeIds[0] || null,
          project_id: taskProjectId || null,
          due_date: normalizeDateForSave(dueDate),
          labels: nextLabels,
          attachments: attachments.length > 0 ? attachments : [],
          cover_url: coverUrl || null,
          checklist_items: checklist.length > 0 ? checklist : null,
        });
        if (onSyncAssignees) onSyncAssignees(task.id, assigneeIds);
      } catch { /* silencioso */ } finally {
        setSaving(false);
      }
    }, 1200);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, priority, status, dueDate, taskProjectId, assigneeIds, labels]);

  const { comments, commentsLoading, addComment, updateComment, deleteComment } = useTaskComments(task?.id);

  const checkedCount = checklist.filter((i) => i.checked).length;
  const checklistProgress = checklist.length > 0 ? (checkedCount / checklist.length) * 100 : 0;
  const selectedProject = projects.find((project) => project.id === taskProjectId) || null;
  const normalizedCoverUrl = normalizeSupabaseAssetUrl(coverUrl);

  const handleProjectChange = (nextProjectId: string) => {
    const nextProject = projects.find((project) => project.id === nextProjectId) || null;
    setTaskProjectId(nextProjectId);
    setLabels((currentLabels) => syncProjectLabel(currentLabels, nextProject, projects));
  };

  // Extrai menções do formato @[Nome](employee_id) e envia notificações
  const sendMentionNotifications = async (content: string) => {
    if (!profile?.tenant_id) return;
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    const mentionedEmployeeIds = new Set<string>();
    while ((m = mentionRegex.exec(content)) !== null) {
      mentionedEmployeeIds.add(m[2]);
    }
    if (mentionedEmployeeIds.size === 0) return;

    const currentEmployee = employees.find((e) => e.user_id === user?.id);
    const authorName = currentEmployee?.full_name || profile?.full_name || "Alguém";

    for (const empId of mentionedEmployeeIds) {
      const emp = employees.find((e) => e.id === empId);
      if (!emp?.user_id || emp.user_id === user?.id) continue;
      await supabase.from("notifications" as any).insert({
        tenant_id: profile.tenant_id,
        user_id: emp.user_id,
        type: "mention",
        title: "Você foi mencionado",
        body: `${authorName} mencionou você em "${task!.title}"`,
        link: `/tarefas?taskId=${task!.id}`,
        is_read: false,
      });
    }
  };

  // Notifica responsáveis da tarefa + quem já comentou (exceto o autor e quem já
  // recebeu notificação de menção neste mesmo comentário — para não duplicar).
  const sendCommentNotifications = async (content: string) => {
    if (!profile?.tenant_id || !task) return;

    // employee_ids já mencionados neste comentário (recebem notificação de "mention")
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentionedEmployeeIds = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = mentionRegex.exec(content)) !== null) mentionedEmployeeIds.add(m[2]);

    // Público-alvo: responsáveis (assigneeIds) + quem já comentou antes
    const targetEmployeeIds = new Set<string>();
    assigneeIds.forEach((id) => id && targetEmployeeIds.add(id));
    comments.forEach((c) => c.author_id && targetEmployeeIds.add(c.author_id));

    const currentEmployee = employees.find((e) => e.user_id === user?.id);
    const authorName = currentEmployee?.full_name || profile?.full_name || "Alguém";

    // Dedupe por user_id, excluindo o autor e quem já foi mencionado
    const sentUserIds = new Set<string>();
    for (const empId of targetEmployeeIds) {
      if (mentionedEmployeeIds.has(empId)) continue;
      const emp = employees.find((e) => e.id === empId);
      if (!emp?.user_id || emp.user_id === user?.id || sentUserIds.has(emp.user_id)) continue;
      sentUserIds.add(emp.user_id);
      await supabase.from("notifications" as any).insert({
        tenant_id: profile.tenant_id,
        user_id: emp.user_id,
        type: "task_comment",
        title: "Novo comentário na tarefa",
        body: `${authorName} comentou em "${task.title}"`,
        link: `/tarefas?taskId=${task.id}`,
        is_read: false,
      });
    }
  };

  // ── "Perguntar no chat": envia o card da tarefa para a DM do responsável ──
  const navigate = useNavigate();
  const [askChatOpen, setAskChatOpen] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [sendingToChat, setSendingToChat] = useState(false);

  const assigneeEmployee = employees.find(
    (e) => e.id === (assigneeIds[0] || task!.assignee_id || "")
  );
  const canAskInChat =
    !!assigneeEmployee?.user_id && assigneeEmployee.user_id !== profile?.user_id;

  const handleAskInChat = async () => {
    if (!profile?.user_id || !profile?.tenant_id) { toast.error("Sessão inválida"); return; }
    if (!assigneeEmployee?.user_id) { toast.error("Esta tarefa não tem um responsável com acesso ao chat"); return; }
    const question = chatQuestion.trim();
    setSendingToChat(true);
    try {
      const dmId = await findOrCreateDM(profile.user_id, assigneeEmployee.user_id, profile.tenant_id);
      const project = projects.find((p) => p.id === taskProjectId);
      const taskTitle = title.trim() || task!.title;
      const taskAtt = {
        type: "task",
        task_id: task!.id,
        title: taskTitle,
        description: description.trim() || null,
        priority,
        due_date: normalizeDateForSave(dueDate),
        assignee_id: assigneeEmployee.id,
        assignee_name: assigneeEmployee.full_name,
        project_id: taskProjectId || null,
        project_name: project?.name || null,
        url: `/tarefas?task=${task!.id}`,
        name: taskTitle,
      };
      const content = question || `Sobre a tarefa "${taskTitle}"`;
      const { data: inserted, error } = await supabase
        .from("chat_messages" as any)
        .insert({
          channel_id: dmId,
          tenant_id: profile.tenant_id,
          author_id: profile.user_id,
          content,
          attachments: [taskAtt],
        })
        .select("id")
        .single();
      if (error) throw error;
      if ((inserted as any)?.id) {
        supabase.functions
          .invoke("send-chat-notification", { body: { message_id: (inserted as any).id } })
          .catch(() => {});
      }
      await supabase.rpc("create_chat_task_notification" as any, {
        p_channel_id: dmId,
        p_assignee_user_id: assigneeEmployee.user_id,
        p_title: `${profile.full_name || "Alguém"} perguntou sobre uma tarefa`,
        p_body: (question || taskTitle).slice(0, 140),
      });
      qc.invalidateQueries({ queryKey: ["chat_channels"] });
      toast.success("Pergunta enviada no chat");
      setAskChatOpen(false);
      setChatQuestion("");
      onClose();
      navigate(`/chat/${dmId}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar para o chat");
    } finally {
      setSendingToChat(false);
    }
  };

  // Detecta @ no textarea de comentário e atualiza mentionQuery
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStartPos(cursor - atMatch[0].length);
    } else {
      setMentionQuery(null);
    }
  };

  // Insere menção no textarea ao selecionar um colaborador
  const insertMention = (emp: { id: string; full_name: string | null }) => {
    const name = emp.full_name || "Usuário";
    const mentionText = `@[${name}](${emp.id})`;
    const before = newComment.slice(0, mentionStartPos);
    const after = newComment.slice(mentionStartPos + 1 + (mentionQuery?.length ?? 0));
    const next = before + mentionText + after;
    setNewComment(next);
    setMentionQuery(null);
    commentTextareaRef.current?.focus();
  };

  const activeMentionEmployees = mentionQuery !== null
    ? employees.filter(
        (e) => e.status === "active" && (e.full_name ?? "").toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  const saveTaskChanges = async (
    overrides: Record<string, unknown> = {},
    options?: { closeAfterSave?: boolean; syncAssigneesAfterSave?: boolean }
  ) => {
    if (!title.trim()) { toast.error("Título é obrigatório"); return false; }

    setSaving(true);
    try {
      const nextProjectId =
        typeof overrides.project_id === "undefined" ? taskProjectId : ((overrides.project_id as string | null) || "");
      const nextProject = projects.find((project) => project.id === nextProjectId) || null;
      const nextLabels =
        typeof overrides.labels === "undefined"
          ? syncProjectLabel(labels, nextProject, projects)
          : (overrides.labels as TaskLabel[]);

      await onSave(task!.id, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        assignee_id: assigneeIds[0] || null,
        project_id: nextProjectId || null,
        due_date: normalizeDateForSave(dueDate),
        labels: nextLabels,
        attachments: attachments.length > 0 ? attachments : [],
        cover_url: coverUrl || null,
        checklist_items: checklist.length > 0 ? checklist : null,
        ...overrides,
      });

      if (options?.syncAssigneesAfterSave && onSyncAssignees) {
        onSyncAssignees(task!.id, assigneeIds);
      }

      if (options?.closeAfterSave) {
        onClose();
      }

      return true;
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar tarefa");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Título é obrigatório"); return; }
    setSaving(true);
    try {
      await onSave(task!.id, {
        title: title.trim(),
        description: description.trim() || null,
        priority, status,
        assignee_id: assigneeIds[0] || null,
        project_id: taskProjectId || null,
        due_date: normalizeDateForSave(dueDate),
        labels: syncProjectLabel(labels, selectedProject, projects),
        attachments: attachments.length > 0 ? attachments : [],
        cover_url: coverUrl || null,
        checklist_items: checklist.length > 0 ? checklist : null,
      });
      // Sync multi-assignees
      if (onSyncAssignees) {
        onSyncAssignees(task!.id, assigneeIds);
      }
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Máximo 10MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `task-attachments/${task!.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);
      const newAttachment: TaskAttachment = {
        name: file.name,
        url: publicUrl,
        type: file.type,
        size: file.size,
        uploaded_at: new Date().toISOString(),
      };
      const nextAttachments = [...attachments, newAttachment];
      const nextCoverUrl = file.type.startsWith("image/") && !coverUrl ? publicUrl : coverUrl;
      setAttachments(nextAttachments);
      // Auto-set cover if it's an image and no cover yet
      if (file.type.startsWith("image/") && !coverUrl) {
        setCoverUrl(publicUrl);
      }
      await onSave(task!.id, {
        attachments: nextAttachments,
        cover_url: nextCoverUrl || null,
      });
      toast.success("Arquivo anexado!");
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const uploadPastedImage = async (file: File): Promise<string | null> => {
    if (!task?.id) return null;
    if (file.size > 10 * 1024 * 1024) { toast.error("Imagem muito grande (máx 10MB)"); return null; }
    try {
      const ext = file.type.split("/")[1] || "png";
      const path = `task-attachments/${task.id}/paste-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);
      return publicUrl;
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer upload da imagem");
      return null;
    }
  };

  const insertTextAtCursor = (
    currentValue: string,
    insertedText: string,
    textarea: HTMLTextAreaElement | null,
    onChange: (next: string) => void
  ) => {
    if (!textarea) {
      onChange(currentValue + insertedText);
      return;
    }

    const start = textarea.selectionStart ?? currentValue.length;
    const end = textarea.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${insertedText}${currentValue.slice(end)}`;
    onChange(nextValue);

    requestAnimationFrame(() => {
      const nextCursor = start + insertedText.length;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const appendImageMarkdown = (
    currentValue: string,
    url: string,
    textarea: HTMLTextAreaElement | null,
    onChange: (next: string) => void
  ) => {
    const normalizedUrl = normalizeSupabaseAssetUrl(url) || url;
    const fileName = normalizedUrl.split("/").pop()?.split("?")[0] || "imagem-colada";
    const needsLeadingBreak = currentValue.length > 0 && !currentValue.endsWith("\n");
    const markdown = `${needsLeadingBreak ? "\n" : ""}![${fileName}](${normalizedUrl})\n`;
    insertTextAtCursor(currentValue, markdown, textarea, onChange);
  };

  const getValueWithImageMarkdown = (
    currentValue: string,
    url: string,
    textarea: HTMLTextAreaElement | null
  ) => {
    const normalizedUrl = normalizeSupabaseAssetUrl(url) || url;
    const fileName = normalizedUrl.split("/").pop()?.split("?")[0] || "imagem-colada";
    const needsLeadingBreak = currentValue.length > 0 && !currentValue.endsWith("\n");
    const markdown = `${needsLeadingBreak ? "\n" : ""}![${fileName}](${normalizedUrl})\n`;

    if (!textarea) {
      return currentValue + markdown;
    }

    const start = textarea.selectionStart ?? currentValue.length;
    const end = textarea.selectionEnd ?? currentValue.length;
    return `${currentValue.slice(0, start)}${markdown}${currentValue.slice(end)}`;
  };

  const parseRichTextWithImages = (content: string) => {
    const normalized = content.replace(/__img__(\S+)/g, "![]($1)");
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const segments: Array<{ type: "text"; value: string } | { type: "image"; alt: string; url: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = imageRegex.exec(normalized)) !== null) {
      if (match.index > lastIndex) {
        const text = normalized.slice(lastIndex, match.index);
        if (text) segments.push({ type: "text", value: text });
      }

      segments.push({ type: "image", alt: match[1] || "Imagem", url: match[2] });
      lastIndex = imageRegex.lastIndex;
    }

    if (lastIndex < normalized.length) {
      const text = normalized.slice(lastIndex);
      if (text) segments.push({ type: "text", value: text });
    }

    return segments.length > 0 ? segments : [{ type: "text" as const, value: normalized }];
  };

  const getUrlLabel = (url: string): string => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const map: Record<string, string> = {
        "instagram.com": "Instagram",
        "facebook.com": "Facebook",
        "fb.com": "Facebook",
        "twitter.com": "Twitter",
        "x.com": "Twitter/X",
        "linkedin.com": "LinkedIn",
        "youtube.com": "YouTube",
        "youtu.be": "YouTube",
        "tiktok.com": "TikTok",
        "whatsapp.com": "WhatsApp",
        "wa.me": "WhatsApp",
        "chat.whatsapp.com": "Grupo WhatsApp",
        "t.me": "Telegram",
        "telegram.org": "Telegram",
        "github.com": "GitHub",
        "gitlab.com": "GitLab",
        "bitbucket.org": "Bitbucket",
        "figma.com": "Figma",
        "notion.so": "Notion",
        "trello.com": "Trello",
        "asana.com": "Asana",
        "linear.app": "Linear",
        "slack.com": "Slack",
        "discord.com": "Discord",
        "discord.gg": "Discord",
        "zoom.us": "Zoom",
        "meet.google.com": "Google Meet",
        "calendar.google.com": "Google Agenda",
        "docs.google.com": "Google Docs",
        "drive.google.com": "Google Drive",
        "sheets.google.com": "Google Sheets",
        "mail.google.com": "Gmail",
        "dropbox.com": "Dropbox",
        "loom.com": "Loom",
        "vercel.com": "Vercel",
        "supabase.com": "Supabase",
        "openai.com": "OpenAI",
        "chatgpt.com": "ChatGPT",
        "claude.ai": "Claude",
        "anthropic.com": "Anthropic",
        "spotify.com": "Spotify",
        "open.spotify.com": "Spotify",
        "canva.com": "Canva",
        "medium.com": "Medium",
        "stackoverflow.com": "Stack Overflow",
      };
      if (map[host]) return map[host];
      const parts = host.split(".");
      const root = parts.length > 1 ? parts[parts.length - 2] : host;
      return root.charAt(0).toUpperCase() + root.slice(1);
    } catch {
      return "Link";
    }
  };

  const renderTextWithLinks = (text: string, keyPrefix: string): React.ReactNode[] => {
    const urlRegex = /(\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|\bwww\.[^\s<>()]+[^\s<>().,;:!?'"])/gi;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = urlRegex.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const raw = m[0];
      const href = raw.startsWith("http") ? raw : `https://${raw}`;
      const label = getUrlLabel(href);
      parts.push(
        <a
          key={`${keyPrefix}-url-${m.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={raw}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {label}
        </a>
      );
      last = urlRegex.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const renderTextWithMentions = (text: string): React.ReactNode => {
    const mentionRegex = /@\[([^\]]+)\]\([^)]+\)/g;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = mentionRegex.exec(text)) !== null) {
      if (m.index > last) parts.push(...renderTextWithLinks(text.slice(last, m.index), `m${m.index}`));
      parts.push(
        <span key={`mention-${m.index}`} className="text-primary font-medium">@{m[1]}</span>
      );
      last = mentionRegex.lastIndex;
    }
    if (last < text.length) parts.push(...renderTextWithLinks(text.slice(last), `end${last}`));
    return parts;
  };

  const renderRichTextWithImages = (content: string, emptyFallback?: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return emptyFallback ? <p className="text-sm text-muted-foreground">{emptyFallback}</p> : null;
    }

    return (
      <div className="space-y-2">
        {parseRichTextWithImages(content).map((segment, index) => {
          if (segment.type === "image") {
            const src = normalizeSupabaseAssetUrl(segment.url) || segment.url;
            return (
              <button
                key={`${segment.url}-${index}`}
                type="button"
                onClick={() => setLightbox({ images: [{ url: src, name: segment.alt || undefined }], index: 0 })}
                className="block cursor-zoom-in"
                title="Ampliar imagem"
              >
                <img
                  src={src}
                  alt={segment.alt}
                  className="max-h-72 w-auto max-w-full rounded-lg border border-border/50 object-contain"
                />
              </button>
            );
          }

          return (
            <p key={`text-${index}`} className="text-sm text-foreground/80 whitespace-pre-wrap">
              {renderTextWithMentions(segment.value)}
            </p>
          );
        })}
      </div>
    );
  };

  // Retorna File (screenshot) ou { url: string } (imagem copiada da web) ou null
  const getImageFromClipboard = (clipboardData: DataTransfer): File | { url: string } | null => {
    // 1. Arquivo binário — screenshots e imagens copiadas como arquivo
    const items = Array.from(clipboardData.items || []);
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
    const files = Array.from(clipboardData.files || []);
    const imgFile = files.find(f => f.type.startsWith("image/"));
    if (imgFile) return imgFile;

    // 2. text/html — imagem copiada do browser (direito → copiar imagem)
    const html = clipboardData.getData("text/html");
    if (html) {
      const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match?.[1]) return { url: match[1] };
    }

    // 3. text/plain — URL de imagem colada diretamente
    const text = clipboardData.getData("text/plain");
    if (text && /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(text.trim())) {
      return { url: text.trim() };
    }

    return null;
  };

  const handleDescriptionPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const result = getImageFromClipboard(e.clipboardData);
    if (!result) return;
    e.preventDefault();

    let url: string | null = null;
    if (result instanceof File) {
      toast.loading("Enviando imagem...", { id: "paste-img" });
      url = await uploadPastedImage(result);
      toast.dismiss("paste-img");
    } else {
      url = result.url;
    }

    if (url) {
      // Adiciona como anexo (fica visível na seção de anexos da tarefa)
      const name = url.split("/").pop()?.split("?")[0] || "imagem-colada";
      const newAtt = { name, url, type: "image/png", size: 0, uploaded_at: new Date().toISOString() };
      const nextAttachments = [...attachments, newAtt];
      const nextCoverUrl = coverUrl || url;
      const nextDescription = getValueWithImageMarkdown(description, url, descriptionTextareaRef.current);

      setAttachments(nextAttachments);
      if (!coverUrl) setCoverUrl(url);
      appendImageMarkdown(description, url, descriptionTextareaRef.current, setDescription);

      try {
        await onSave(task.id, {
          description: nextDescription.trim() || null,
          attachments: nextAttachments,
          cover_url: nextCoverUrl || null,
        });
        toast.success("Imagem inserida e salva na descrição");
      } catch (err: any) {
        toast.error(err.message || "Imagem inserida, mas não foi possível salvar a tarefa");
      }
    }
  };

  const pasteImageIntoDescription = async (result: File | { url: string }) => {
    let url: string | null = null;
    if (result instanceof File) {
      toast.loading("Enviando imagem...", { id: "paste-img" });
      url = await uploadPastedImage(result);
      toast.dismiss("paste-img");
    } else {
      url = result.url;
    }

    if (!url) return;

    const name = url.split("/").pop()?.split("?")[0] || "imagem-colada";
    const newAtt = { name, url, type: "image/png", size: 0, uploaded_at: new Date().toISOString() };
    const nextAttachments = [...attachments, newAtt];
    const nextCoverUrl = coverUrl || url;
    const nextDescription = getValueWithImageMarkdown(description, url, descriptionTextareaRef.current);

    setAttachments(nextAttachments);
    if (!coverUrl) setCoverUrl(url);
    appendImageMarkdown(description, url, descriptionTextareaRef.current, setDescription);

    try {
      await onSave(task.id, {
        description: nextDescription.trim() || null,
        attachments: nextAttachments,
        cover_url: nextCoverUrl || null,
      });
      toast.success("Imagem inserida e salva na descrição");
    } catch (err: any) {
      toast.error(err.message || "Imagem inserida, mas não foi possível salvar a tarefa");
    }
  };

  const pasteImageIntoComment = async (result: File | { url: string }) => {
    if (!currentEmployeeId) { toast.error("Colaborador não identificado"); return; }

    let url: string | null = null;
    if (result instanceof File) {
      toast.loading("Enviando imagem...", { id: "paste-comment-img" });
      url = await uploadPastedImage(result);
      toast.dismiss("paste-comment-img");
    } else {
      url = result.url;
    }

    if (!url) return;
    appendImageMarkdown(newComment, url, commentTextareaRef.current, setNewComment);
    toast.success("Imagem inserida no comentário");
  };

  const handleCommentPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const result = getImageFromClipboard(e.clipboardData);
    if (!result) return;
    e.preventDefault();
    if (!currentEmployeeId) { toast.error("Colaborador não identificado"); return; }

    let url: string | null = null;
    if (result instanceof File) {
      toast.loading("Enviando imagem...", { id: "paste-comment-img" });
      url = await uploadPastedImage(result);
      toast.dismiss("paste-comment-img");
    } else {
      url = result.url;
    }

    if (!url) return;
    appendImageMarkdown(newComment, url, commentTextareaRef.current, setNewComment);
    toast.success("Imagem inserida no comentário");
    return;
  };

  useEffect(() => {
    const handleGlobalPaste = async (event: ClipboardEvent) => {
      if (!event.clipboardData) return;

      const result = getImageFromClipboard(event.clipboardData);
      if (!result) return;

      event.preventDefault();

      const isCommentFocused = document.activeElement === commentTextareaRef.current;
      if (isCommentFocused) {
        await pasteImageIntoComment(result);
        return;
      }

      await pasteImageIntoDescription(result);
    };

    window.addEventListener("paste", handleGlobalPaste, true);
    return () => window.removeEventListener("paste", handleGlobalPaste, true);
  }, [attachments, coverUrl, currentEmployeeId, description, newComment, task.id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      descriptionTextareaRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  const removeAttachment = (idx: number) => {
    const att = attachments[idx];
    const nextAttachments = attachments.filter((_, i) => i !== idx);
    const nextCoverUrl = att.url === coverUrl ? "" : coverUrl;

    if (att.url === coverUrl) setCoverUrl("");
    setAttachments(nextAttachments);

    void onSave(task!.id, {
      attachments: nextAttachments,
      cover_url: nextCoverUrl || null,
    }).catch((err: any) => {
      toast.error(err.message || "Erro ao salvar anexos");
    });
  };

  const handleDownload = async (att: TaskAttachment) => {
    try {
      // Extrai o path do bucket "attachments" a partir da URL pública,
      // independentemente de o host ser supabase.co ou um proxy same-origin.
      const match = att.url.match(/\/storage\/v1\/object\/(?:public|sign)\/attachments\/([^?]+)/);
      let blob: Blob | null = null;

      if (match) {
        const path = decodeURIComponent(match[1]);
        const { data, error } = await supabase.storage.from("attachments").download(path);
        if (error) throw error;
        blob = data;
      } else {
        // Fallback: tenta fetch direto (URLs externas)
        const res = await fetch(normalizeSupabaseAssetUrl(att.url) || att.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blob = await res.blob();
      }

      if (!blob) throw new Error("Arquivo vazio");
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao baixar arquivo");
    }
  };

  const addLabel = () => {
    if (!newLabelText.trim()) return;
    setLabels((prev) => [...prev, { text: newLabelText.trim(), color: newLabelColor }]);
    setNewLabelText("");
  };

  const removeLabel = (idx: number) => {
    setLabels((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveChecklistItems = (nextChecklist: { text: string; checked: boolean }[]) => {
    void onSave(task!.id, {
      checklist_items: nextChecklist.length > 0 ? nextChecklist : null,
    }).catch((err: any) => {
      toast.error(err.message || "Erro ao salvar checklist");
    });
  };

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    const nextChecklist = [...checklist, { text: newCheckItem.trim(), checked: false }];
    setChecklist(nextChecklist);
    setNewCheckItem("");
    saveChecklistItems(nextChecklist);
  };

  const toggleCheckItem = (idx: number) => {
    const nextChecklist = checklist.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item);
    setChecklist(nextChecklist);
    saveChecklistItems(nextChecklist);
  };

  const removeCheckItem = (idx: number) => {
    const nextChecklist = checklist.filter((_, i) => i !== idx);
    setChecklist(nextChecklist);
    saveChecklistItems(nextChecklist);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return ImageIcon;
    if (type.includes("pdf")) return FileText;
    return FileIconLucide;
  };

  const assignee = employees.find((e) => e.id === assigneeId);
  const project = projects.find((p) => p.id === taskProjectId);

  // Promove "passo" (item de checklist) a subtarefa real e remove do checklist.
  const { createSubtask: createSubtaskFromStep } = useSubtasks(task!.id);
  const promoteStepToSubtask = async (idx: number) => {
    const item = checklist[idx];
    if (!item) return;
    if (!confirm(`Promover "${item.text}" a subtarefa? Vira uma task completa com responsável e prazo próprios.`)) return;
    try {
      await createSubtaskFromStep.mutateAsync({
        title: item.text,
        project_id: taskProjectId || null,
        priority: "medium",
        status: item.checked ? "done" : "todo",
      } as any);
      const nextChecklist = checklist.filter((_, i) => i !== idx);
      setChecklist(nextChecklist);
      saveChecklistItems(nextChecklist);
      toast.success("Promovido a subtarefa.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao promover");
    }
  };

  // Rebaixa subtarefa a passo (chamado pelo TaskSubtasksSection).
  const demoteSubtaskToStep = (text: string) => {
    const nextChecklist = [...checklist, { text, checked: false }];
    setChecklist(nextChecklist);
    saveChecklistItems(nextChecklist);
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col pb-8">
        {/* Cover Image — botão "Remover capa" vai à esquerda para não colidir
            com o X de fechar do Sheet (que fica no canto superior direito). */}
        {normalizedCoverUrl && (
          <div className="relative h-32 sm:h-40 lg:h-52 w-full overflow-hidden bg-muted">
            <img src={normalizedCoverUrl} alt="Capa" className="w-full h-full object-cover" />
            {canEdit && (
              <Button
                variant="secondary" size="sm"
                className="absolute top-2 left-2 h-7 text-xs opacity-80 hover:opacity-100"
                onClick={() => setCoverUrl("")}
              >
                <X className="w-3 h-3 mr-1" /> Remover capa
              </Button>
            )}
          </div>
        )}

        <div className="p-6 lg:px-10 xl:px-14 mx-auto w-full max-w-[1400px]">
          {/* Header — title em destaque + meta-row mono compacto */}
          <header className="mb-6">
            {/* Eyebrow: contexto (subtarefa / projeto / criada / reunião de origem) */}
            <div className="flex items-center gap-2 text-2xs font-mono uppercase tracking-[0.14em] text-muted-foreground mb-2 flex-wrap">
              {(task as any).parent_task_id ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <CornerDownRight className="w-3 h-3" />
                  Subtarefa
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <FolderKanban className="w-3 h-3" />
                  Tarefa
                </span>
              )}
              {project && (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-primary font-medium normal-case tracking-normal">{project.name}</span>
                </>
              )}
              {task!.created_at && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="normal-case tracking-normal">
                    criada {formatDistanceToNow(new Date(task!.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </>
              )}
            </div>

            {/* Title — protagonista */}
            {editingTitle ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === "Enter") setEditingTitle(false); }}
                className="text-xl lg:text-2xl font-semibold -ml-2 h-auto py-1.5"
                autoFocus
              />
            ) : (
              <h2
                className="text-xl lg:text-2xl font-semibold text-foreground leading-tight cursor-pointer hover:bg-muted/40 rounded-md px-2 -ml-2 py-1 transition-colors"
                onClick={() => canEdit && setEditingTitle(true)}
              >
                {title}
              </h2>
            )}

            {/* Pills: meeting origin + labels */}
            {((task as any).source_meeting_id || labels.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {(task as any).source_meeting_id && (
                  <TaskMeetingOriginBadge meetingId={(task as any).source_meeting_id} />
                )}
                {labels.map((label, idx) => (
                  <div key={idx} className="relative inline-flex">
                    <Badge
                      className="pr-4 text-2xs font-medium border h-5"
                      style={getTaskLabelStyle(label.color)}
                    >
                      {label.text}
                    </Badge>
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remover etiqueta ${label.text}`}
                        className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-background/40 bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
                        onClick={() => removeLabel(idx)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-10">
            {/* Main Content */}
            <div className="flex flex-col gap-7 min-w-0">
              {/* Description */}
              <section>
                <SectionHeader
                  icon={AlignLeft}
                  label="Descrição"
                  action={
                    description ? (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await navigator.clipboard.writeText(description);
                            toast.success("Descrição copiada");
                          } catch {
                            toast.error("Não foi possível copiar");
                          }
                        }}
                        className="flex items-center gap-1 text-2xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Copiar descrição"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copiar</span>
                      </button>
                    ) : undefined
                  }
                />
                {editingDesc || !description ? (
                  <div>
                    <Textarea
                      ref={descriptionTextareaRef}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onPaste={handleDescriptionPaste}
                      placeholder="Adicione uma descrição mais detalhada..."
                      rows={4}
                      className="text-sm"
                      onFocus={() => setEditingDesc(true)}
                      disabled={!canEdit}
                    />
                    {editingDesc && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            const saved = await saveTaskChanges();
                            if (saved) setEditingDesc(false);
                          }}
                        >
                          Salvar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEditingDesc(false); }}>Cancelar</Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="bg-muted/40 border border-border/50 rounded-lg p-3.5 cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => canEdit && setEditingDesc(true)}
                  >
                    {renderRichTextWithImages(description)}
                  </div>
                )}
              </section>

              {/* Subtarefas — só aparecem se a task não for subtarefa (1 nível apenas) */}
              {!(task as any).parent_task_id && (
                <section>
                  <TaskSubtasksSection
                    parentTaskId={task!.id}
                    parentProjectId={taskProjectId || null}
                    canEdit={!!canEdit}
                    employees={employees}
                    onDemoteToStep={demoteSubtaskToStep}
                  />
                </section>
              )}

              {/* Dependências */}
              <section>
                <TaskDependenciesSection
                  taskId={task!.id}
                  canEdit={!!canEdit}
                />
              </section>

              {/* Passos (ex-Checklist) — micro-itens operacionais sem responsável próprio. */}
              <section>
                <SectionHeader
                  icon={ListChecks}
                  label="Passos"
                  count={checklist.length > 0 ? `${checkedCount}/${checklist.length}` : undefined}
                  action={checklist.some((i) => i.checked) ? (
                    <Button
                      variant="ghost" size="sm" className="h-6 text-2xs gap-1 -mr-1"
                      onClick={() => setShowCheckedItems(!showCheckedItems)}
                    >
                      {showCheckedItems ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {showCheckedItems ? "Ocultar concluídos" : "Mostrar concluídos"}
                    </Button>
                  ) : undefined}
                />
                {checklist.length > 0 && (
                  <Progress value={checklistProgress} className="h-1 mb-3" />
                )}
                <div className="space-y-1">
                  {checklist.map((item, idx) => {
                    if (item.checked && !showCheckedItems) return null;
                    return (
                      <div key={idx} className="flex items-center gap-2 group py-1 px-1 rounded hover:bg-muted/50 transition-colors">
                        <button type="button" onClick={() => canEdit && toggleCheckItem(idx)} className="flex-shrink-0" disabled={!canEdit}>
                          {item.checked
                            ? <CheckSquare2 className="w-4 h-4 text-success" />
                            : <Square className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          }
                        </button>
                        <span className={`text-sm flex-1 ${item.checked ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.text}
                        </span>
                        {canEdit && !(task as any).parent_task_id && (
                          <button
                            type="button"
                            onClick={() => promoteStepToSubtask(idx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Promover a subtarefa (vira task com responsável e prazo)"
                          >
                            <ArrowUpFromLine className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                          </button>
                        )}
                        {canEdit && (
                          <button type="button" onClick={() => removeCheckItem(idx)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-danger" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {canEdit && (
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        value={newCheckItem}
                        onChange={(e) => setNewCheckItem(e.target.value)}
                        placeholder="Adicionar passo (micro-item desta tarefa)..."
                        className="text-sm h-8"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCheckItem(); } }}
                      />
                      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={addCheckItem} disabled={!newCheckItem.trim()}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </section>

              {/* Attachments — imagens em carrossel horizontal, arquivos em lista */}
              <section>
                <SectionHeader
                  icon={Paperclip}
                  label="Anexos"
                  count={attachments.length || undefined}
                />

                {(() => {
                  const imageAttachments = attachments
                    .map((att, idx) => ({ att, idx }))
                    .filter(({ att }) => att.type.startsWith("image/"));
                  const fileAttachments = attachments
                    .map((att, idx) => ({ att, idx }))
                    .filter(({ att }) => !att.type.startsWith("image/"));

                  return (
                    <div className="space-y-3">
                      {/* Carrossel de imagens — passa como carrossel via scroll horizontal com snap */}
                      {imageAttachments.length > 0 && (
                        <div className="relative -mx-1">
                          <div
                            className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 px-1 scroll-smooth
                                       scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                            style={{ scrollbarWidth: "thin" }}
                          >
                            {imageAttachments.map(({ att, idx }) => {
                              const isCover = coverUrl === att.url;
                              return (
                                <div
                                  key={idx}
                                  className="group relative flex-shrink-0 w-[260px] aspect-[16/10] rounded-lg overflow-hidden border border-border/60 bg-muted snap-start"
                                >
                                  <button
                                    type="button"
                                    onClick={() => setLightbox({
                                      images: imageAttachments.map(({ att: a }) => ({
                                        url: normalizeSupabaseAssetUrl(a.url) || a.url,
                                        name: a.name,
                                        caption: formatFileSize(a.size),
                                      })),
                                      // Índice DENTRO da lista de imagens, não do
                                      // array de anexos: os arquivos não-imagem não
                                      // entram no visualizador.
                                      index: imageAttachments.findIndex((x) => x.idx === idx),
                                    })}
                                    className="block w-full h-full cursor-zoom-in"
                                    title="Ampliar imagem"
                                  >
                                    <img
                                      src={normalizeSupabaseAssetUrl(att.url) || att.url}
                                      alt={att.name}
                                      className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                                      loading="lazy"
                                    />
                                  </button>

                                  {/* Gradiente + nome do arquivo na base */}
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pointer-events-none">
                                    <p className="text-2xs text-white font-medium truncate">{att.name}</p>
                                    <p className="text-2xs text-white/70">{formatFileSize(att.size)}</p>
                                  </div>

                                  {/* Badge "Capa" se for capa atual */}
                                  {isCover && (
                                    <div className="absolute top-2 left-2 inline-flex items-center gap-1 bg-primary text-primary-foreground text-2xs font-medium px-1.5 py-0.5 rounded">
                                      <ImageIcon className="w-2.5 h-2.5" />
                                      Capa
                                    </div>
                                  )}

                                  {/* Ações no hover */}
                                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!isCover && canEdit && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); setCoverUrl(att.url); }}
                                        className="h-6 w-6 inline-flex items-center justify-center rounded bg-background/90 text-foreground hover:bg-background shadow-sm"
                                        title="Definir como capa"
                                      >
                                        <ImageIcon className="w-3 h-3" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); handleDownload(att); }}
                                      className="h-6 w-6 inline-flex items-center justify-center rounded bg-background/90 text-foreground hover:bg-background shadow-sm"
                                      title="Baixar"
                                    >
                                      <Download className="w-3 h-3" />
                                    </button>
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); removeAttachment(idx); }}
                                        className="h-6 w-6 inline-flex items-center justify-center rounded bg-background/90 text-danger hover:bg-background shadow-sm"
                                        title="Excluir"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {imageAttachments.length > 1 && (
                            <p className="text-2xs text-muted-foreground/70 mt-1 px-1">
                              {imageAttachments.length} imagens · arraste para ver mais
                            </p>
                          )}
                        </div>
                      )}

                      {/* Arquivos não-imagem — lista compacta */}
                      {fileAttachments.length > 0 && (
                        <div className="space-y-2">
                          {fileAttachments.map(({ att, idx }) => {
                            const FileIcon = getFileIcon(att.type);
                            return (
                              <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-muted/30 group hover:bg-muted/50 transition-colors">
                                <div className="w-14 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                  <FileIcon className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{att.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{formatFileSize(att.size)}</span>
                                    {att.uploaded_at && (
                                      <span>· {formatDistanceToNow(new Date(att.uploaded_at), { addSuffix: true, locale: ptBR })}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                                    onClick={() => handleDownload(att)}
                                    title="Baixar arquivo"
                                  >
                                    <Download className="w-3 h-3" />
                                  </Button>
                                  <a href={normalizeSupabaseAssetUrl(att.url) || att.url} target="_blank" rel="noopener noreferrer">
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Abrir em nova aba">
                                      <ExternalLink className="w-3 h-3" />
                                    </Button>
                                  </a>
                                  {canEdit && (
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-danger" onClick={() => removeAttachment(idx)}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {canEdit && (
                        <div>
                          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                          <Button
                            variant="outline" size="sm" className="w-full gap-2"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                          >
                            <Upload className="w-4 h-4" />
                            {uploading ? "Enviando..." : "Adicionar anexo"}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>

              {/* Divisor: trabalho ↑  /  atividade ↓ */}
              <div className="flex items-center gap-3 pt-2">
                <Separator className="flex-1" />
                <span className="text-2xs font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
                  Atividade
                </span>
                <Separator className="flex-1" />
              </div>

              {/* Time tracking */}
              {task?.id && (
                <section>
                  <TaskTimer taskId={task.id} />
                </section>
              )}

              {/* Histórico */}
              {task?.id && (
                <section>
                  <SectionHeader icon={TaskHistoryIcon} label="Histórico" />
                  <TaskHistoryTimeline taskId={task.id} />
                </section>
              )}

              {/* Comments — wrapper sutil para alinhar densidade com descrição */}
              <section>
                <SectionHeader
                  icon={MessageSquare}
                  label="Comentários"
                  count={comments.length || undefined}
                />
                <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3.5">
                  {commentsLoading ? (
                    <p className="text-xs text-muted-foreground">Carregando...</p>
                  ) : comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum comentário ainda. Use @ para mencionar alguém.</p>
                  ) : (
                    comments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        currentEmployeeId={currentEmployeeId}
                        updateComment={updateComment}
                        deleteComment={deleteComment}
                        renderContent={renderRichTextWithImages}
                      />
                    ))
                  )}
                  {currentEmployeeId && (
                    <div className="flex items-start gap-2 pt-1">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 flex gap-1.5 relative">
                        {mentionQuery !== null && activeMentionEmployees.length > 0 && (
                          <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg w-56 max-h-48 overflow-y-auto">
                            {activeMentionEmployees.map((emp) => (
                              <button
                                key={emp.id}
                                type="button"
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
                                onMouseDown={(e) => { e.preventDefault(); insertMention(emp); }}
                              >
                                <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="truncate">{emp.full_name || "Usuário"}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <Textarea
                          ref={commentTextareaRef}
                          value={newComment}
                          onChange={handleCommentChange}
                          onPaste={handleCommentPaste}
                          placeholder="Escreva um comentário... Use @ para mencionar alguém"
                          rows={2}
                          className="min-h-[4.5rem] text-sm"
                          onKeyDown={async (e) => {
                            if (e.key === "Escape" && mentionQuery !== null) {
                              e.preventDefault();
                              setMentionQuery(null);
                              return;
                            }
                            if (e.key === "Enter" && !e.shiftKey && newComment.trim() && mentionQuery === null) {
                              e.preventDefault();
                              const text = newComment.trim();
                              setNewComment("");
                              setMentionQuery(null);
                              try {
                                await addComment.mutateAsync({ authorId: currentEmployeeId!, content: text });
                                await sendMentionNotifications(text);
                                await sendCommentNotifications(text);
                              } catch (err: any) {
                                setNewComment(text);
                                toast.error(err.message || "Erro ao salvar comentário");
                              }
                            }
                          }}
                        />
                        <Button
                          variant="ghost" size="sm" className="h-10 w-10 p-0 flex-shrink-0 self-end"
                          disabled={!newComment.trim() || addComment.isPending}
                          onClick={async () => {
                            if (newComment.trim()) {
                              const text = newComment.trim();
                              setNewComment("");
                              setMentionQuery(null);
                              try {
                                await addComment.mutateAsync({ authorId: currentEmployeeId!, content: text });
                                await sendMentionNotifications(text);
                                await sendCommentNotifications(text);
                              } catch (err: any) {
                                setNewComment(text);
                                toast.error(err.message || "Erro ao salvar comentário");
                              }
                            }
                          }}
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Sidebar — agrupada em "Atributos", "Cronograma" e "Visual & Recorrência" */}
            <aside className="flex flex-col gap-6">
              <SidebarGroup label="Atributos">
                <div className="grid grid-cols-2 gap-2">
                  <SidebarField label="Status">
                    <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)} disabled={!canEdit}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </SidebarField>

                  <SidebarField label="Prioridade">
                    <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)} disabled={!canEdit}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </SidebarField>
                </div>

                <SidebarField label="Responsáveis">
                  {assigneeIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {assigneeIds.map((aid) => {
                        const emp = employees.find((e) => e.id === aid);
                        return (
                          <Badge
                            key={aid}
                            variant="secondary"
                            className="text-2xs gap-1 cursor-pointer hover:bg-destructive/10"
                            onClick={() => canEdit && setAssigneeIds((prev) => prev.filter((id) => id !== aid))}
                          >
                            {emp?.full_name || "?"}
                            {canEdit && <X className="w-2.5 h-2.5" />}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {canEdit && (
                    <Select
                      value=""
                      onValueChange={(v) => {
                        if (v && !assigneeIds.includes(v)) {
                          setAssigneeIds((prev) => [...prev, v]);
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Adicionar responsável..." /></SelectTrigger>
                      <SelectContent>
                        {employees.filter((e) => e.status === "active" && !assigneeIds.includes(e.id)).map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </SidebarField>
              </SidebarGroup>

              <SidebarGroup label="Cronograma">
                <SidebarField label="Vencimento">
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 w-full justify-start text-xs font-normal"
                        disabled={!canEdit}
                      >
                        <Calendar className="mr-2 h-3 w-3 shrink-0" />
                        {dueDate && isValid(parseDateSafe(dueDate))
                          ? format(parseDateSafe(dueDate), "dd/MM/yyyy", { locale: ptBR })
                          : <span className="text-muted-foreground">Selecionar data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={dueDate && isValid(parseDateSafe(dueDate)) ? parseDateSafe(dueDate) : undefined}
                      onSelect={(date) => {
                        setDueDate(date ? format(date, "yyyy-MM-dd") : "");
                        setCalendarOpen(false);
                      }}
                      locale={ptBR}
                      initialFocus
                    />
                    {dueDate && (
                      <div className="p-2 border-t">
                        <Button
                          variant="ghost" size="sm"
                          className="w-full text-xs text-muted-foreground"
                          onClick={() => { setDueDate(""); setCalendarOpen(false); }}
                        >
                          Limpar data
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                  {dueDate && (() => {
                    const d = parseDateSafe(dueDate);
                    if (!isValid(d)) return null;
                    const isLate = dueDate && isTaskOverdue(dueDate) && status !== "done" && status !== "arquivado";
                    return (
                      <p className={`text-2xs mt-1 ${
                        isLate ? "text-danger font-medium" :
                        isToday(d) ? "text-warning" : "text-muted-foreground"
                      }`}>
                        {isLate ? "⚠ Atrasada" :
                         isToday(d) ? "Vence hoje" :
                         format(d, "'Vence' dd MMM", { locale: ptBR })}
                      </p>
                    );
                  })()}
                </SidebarField>

                {!projectId && (
                  <SidebarField label="Projeto">
                    <Select value={taskProjectId || "none"} onValueChange={(v) => handleProjectChange(v === "none" ? "" : v)} disabled={!canEdit}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem projeto</SelectItem>
                        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </SidebarField>
                )}
              </SidebarGroup>

              <SidebarGroup label="Visual & Recorrência">
                <SidebarField label="Etiquetas">
                  {canEdit && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full h-9 text-xs gap-1">
                          <Plus className="w-3 h-3" /> Adicionar etiqueta
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-3" align="start">
                        <div className="space-y-2">
                          <Input
                            value={newLabelText}
                            onChange={(e) => setNewLabelText(e.target.value)}
                            placeholder="Nome da etiqueta"
                            className="h-7 text-xs"
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }}
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {LABEL_COLORS.map((c) => (
                              <button
                                key={c}
                                className={`w-6 h-6 rounded-full border-2 transition-all ${newLabelColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                                style={{ backgroundColor: c }}
                                onClick={() => setNewLabelColor(c)}
                              />
                            ))}
                          </div>
                          <Button size="sm" className="w-full h-7 text-xs" onClick={addLabel} disabled={!newLabelText.trim()}>
                            Adicionar
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </SidebarField>

                {canEdit && (
                  <SidebarField label="Capa">
                    {normalizedCoverUrl ? (
                      <div className="relative rounded-lg overflow-hidden border border-border">
                        <img src={normalizedCoverUrl} alt="Capa" className="w-full h-16 object-cover" />
                        <Button
                          variant="secondary" size="sm"
                          className="absolute top-1 right-1 h-5 text-2xs px-1"
                          onClick={() => setCoverUrl("")}
                        >
                          <X className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-2xs text-muted-foreground">Anexe uma imagem e defina como capa</p>
                    )}
                  </SidebarField>
                )}

                <SidebarField label="Recorrência">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                    <RecurrenceConfig taskId={task!.id} canEdit={canEdit} />
                  </div>
                </SidebarField>
              </SidebarGroup>

              <Separator />

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <Button onClick={handleSave} size="sm" disabled={saving} className="w-full shadow-sm font-medium">
                  {saving ? "Salvando..." : "Salvar e fechar"}
                </Button>
                {canAskInChat && (
                  <Button
                    variant="outline" size="sm"
                    className="w-full text-xs"
                    onClick={() => setAskChatOpen(true)}
                  >
                    <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Perguntar no chat
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="ghost" size="sm"
                    className="w-full text-danger hover:text-danger hover:bg-danger/10 text-xs"
                    onClick={() => { onDelete(task!.id); onClose(); }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Excluir tarefa
                  </Button>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Dialog: perguntar sobre a tarefa no chat do responsável */}
      <Dialog open={askChatOpen} onOpenChange={setAskChatOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Perguntar no chat</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Envia o card desta tarefa para{" "}
            <span className="font-medium text-foreground">
              {assigneeEmployee?.full_name || "o responsável"}
            </span>{" "}
            no chat direto. Escreva sua pergunta (opcional).
          </p>
          <Textarea
            value={chatQuestion}
            onChange={(e) => setChatQuestion(e.target.value)}
            placeholder={`Sobre "${title.trim() || task!.title}"...`}
            rows={3}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAskChatOpen(false)} disabled={sendingToChat}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleAskInChat} disabled={sendingToChat || !canAskInChat}>
              {sendingToChat ? "Enviando..." : "Enviar no chat"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
          onClose={() => setLightbox(null)}
        />
      )}
    </ScrollArea>
  );
}
