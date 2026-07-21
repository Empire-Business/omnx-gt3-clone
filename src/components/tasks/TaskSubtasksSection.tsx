/**
 * TaskSubtasksSection — v8.10.8
 * Subtarefas reais com edição inline.
 *
 * v8.10.8 — Cada subtarefa tem mini-controles editáveis no cartão:
 *   • Status (Select) • Prioridade (Select) • Responsável (Popover)
 *   • Prazo (Popover + Calendar)
 *   Para edição completa (descrição, anexos, comentários) clique no título
 *   e abra a subtarefa como task no modal pai.
 */
import { useState } from "react";
import {
  Plus, Loader2, Trash2, ArrowDownToLine, MoreHorizontal,
  User, Calendar as CalendarIcon, ListTree, X,
} from "lucide-react";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSubtasks } from "@/hooks/useSubtasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { parseDateSafe, normalizeDateForSave } from "@/lib/date-utils";

interface EmpLite {
  id: string;
  full_name: string | null;
  user_id?: string | null;
  status?: string | null;
}

interface TaskSubtasksSectionProps {
  parentTaskId: string;
  parentProjectId: string | null;
  canEdit: boolean;
  employees?: EmpLite[];
  onOpenSubtask?: (subtaskId: string) => void;
  onDemoteToStep?: (text: string) => void;
}

const STATUS_OPTIONS = [
  { value: "todo",      label: "A Fazer",       cls: "bg-muted text-foreground/80" },
  { value: "doing",     label: "Em Andamento",  cls: "bg-info/10 text-info" },
  { value: "review",    label: "Em Revisão",    cls: "bg-warning/10 text-warning" },
  { value: "ajustes",   label: "Ajustes",       cls: "bg-warning/10 text-warning" },
  { value: "done",      label: "Concluído",     cls: "bg-success/10 text-success" },
  { value: "backlog",   label: "Backlog",       cls: "bg-muted text-muted-foreground" },
  { value: "arquivado", label: "Arquivado",     cls: "bg-muted text-muted-foreground" },
];

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Baixa",   cls: "bg-muted text-muted-foreground" },
  { value: "medium", label: "Média",   cls: "bg-info/10 text-info" },
  { value: "high",   label: "Alta",    cls: "bg-warning/10 text-warning" },
  { value: "urgent", label: "Urgente", cls: "bg-danger/10 text-danger" },
];

export function TaskSubtasksSection({
  parentTaskId,
  parentProjectId,
  canEdit,
  employees = [],
  onOpenSubtask,
  onDemoteToStep,
}: TaskSubtasksSectionProps) {
  const {
    subtasks, isLoading, doneCount, totalCount, progress,
    createSubtask, updateSubtask, toggleSubtaskStatus, deleteSubtask,
  } = useSubtasks(parentTaskId);

  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [empSearch, setEmpSearch] = useState("");

  // Dialog completo para criação detalhada
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<{
    title: string;
    description: string;
    priority: string;
    status: string;
    assignee_id: string | null;
    due_date: string;
  }>({
    title: "",
    description: "",
    priority: "medium",
    status: "todo",
    assignee_id: null,
    due_date: "",
  });
  const [draftEmpSearch, setDraftEmpSearch] = useState("");

  const openDialog = () => {
    setDraft({
      title: newTitle.trim(),
      description: "",
      priority: "medium",
      status: "todo",
      assignee_id: null,
      due_date: "",
    });
    setDraftEmpSearch("");
    setDialogOpen(true);
  };

  const handleCreateDetailed = async () => {
    const title = draft.title.trim();
    if (!title) {
      toast.error("Título é obrigatório");
      return;
    }
    setAdding(true);
    try {
      await createSubtask.mutateAsync({
        title,
        description: draft.description.trim() || null,
        project_id: parentProjectId,
        priority: draft.priority,
        status: draft.status,
        assignee_id: draft.assignee_id,
        due_date: draft.due_date ? normalizeDateForSave(draft.due_date) : null,
      } as any);
      setNewTitle("");
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar subtarefa");
    } finally {
      setAdding(false);
    }
  };

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      await createSubtask.mutateAsync({
        title,
        project_id: parentProjectId,
        priority: "medium",
      } as any);
      setNewTitle("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar subtarefa");
    } finally {
      setAdding(false);
    }
  };

  const handleDemote = async (sub: any) => {
    if (!onDemoteToStep) return;
    if (!confirm(`Rebaixar "${sub.title}" a passo?`)) return;
    try {
      onDemoteToStep(sub.title);
      await deleteSubtask.mutateAsync(sub.id);
      toast.success("Convertida em passo.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao rebaixar");
    }
  };

  const patch = (id: string, p: Record<string, unknown>) =>
    updateSubtask.mutate({ id, patch: p });

  const activeEmployees = employees.filter((e) => e.status === "active");
  const filteredEmployees = empSearch.trim()
    ? activeEmployees.filter((e) =>
        (e.full_name || "").toLowerCase().includes(empSearch.toLowerCase()),
      )
    : activeEmployees;

  return (
    <div>
      {/* Eyebrow mono uppercase — alinhado com SectionHeader do TaskDetailModal */}
      <div className="flex items-center gap-2 mb-3">
        <ListTree className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-2xs font-mono font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Subtarefas
        </span>
        {totalCount > 0 && (
          <span className="text-2xs font-mono text-muted-foreground/70 tabular-nums">
            · {doneCount}/{totalCount}
          </span>
        )}
      </div>

      {totalCount > 0 && <Progress value={progress} className="h-1 mb-3" />}

      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Carregando...
          </div>
        ) : (
          subtasks.map((sub) => {
            const done = sub.status === "done";
            const assignee = employees.find((e) => e.id === sub.assignee_id);
            const due = sub.due_date ? parseDateSafe(sub.due_date) : null;
            const dueText = due && isValid(due) ? format(due, "dd MMM", { locale: ptBR }) : null;
            const status = STATUS_OPTIONS.find((s) => s.value === (sub.status || "todo")) ?? STATUS_OPTIONS[0];
            const prio = PRIORITY_OPTIONS.find((p) => p.value === (sub.priority || "medium")) ?? PRIORITY_OPTIONS[1];

            return (
              <div
                key={sub.id}
                className="group rounded-lg border border-border/60 bg-card hover:bg-muted/30 transition-colors p-2.5"
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={done}
                    disabled={!canEdit}
                    onCheckedChange={(checked) =>
                      toggleSubtaskStatus.mutate({ id: sub.id, done: !!checked })
                    }
                    className="mt-0.5"
                  />

                  <div className="flex-1 min-w-0">
                    {/* Título — clicável para abrir como task completa */}
                    <button
                      type="button"
                      onClick={() => onOpenSubtask?.(sub.id)}
                      className={`text-sm font-medium text-left truncate hover:underline w-full ${
                        done ? "line-through text-muted-foreground" : "text-foreground"
                      }`}
                      title="Abrir subtarefa em tela cheia para editar descrição, anexos, comentários"
                    >
                      {sub.title}
                    </button>

                    {/* Mini-controles editáveis inline */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {/* Status */}
                      <Select
                        value={sub.status || "todo"}
                        onValueChange={(v) => patch(sub.id, { status: v })}
                        disabled={!canEdit}
                      >
                        <SelectTrigger
                          className={`h-6 text-2xs px-1.5 border-0 gap-1 w-auto ${status.cls}`}
                        >
                          <SelectValue>{status.label}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Prioridade */}
                      <Select
                        value={sub.priority || "medium"}
                        onValueChange={(v) => patch(sub.id, { priority: v })}
                        disabled={!canEdit}
                      >
                        <SelectTrigger
                          className={`h-6 text-2xs px-1.5 border-0 gap-1 w-auto ${prio.cls}`}
                        >
                          <SelectValue>{prio.label}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Responsável */}
                      <Popover>
                        <PopoverTrigger asChild disabled={!canEdit}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 h-6"
                          >
                            <User className="w-3 h-3" />
                            <span className="truncate max-w-[120px]">
                              {assignee?.full_name || "Sem responsável"}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="start">
                          <Input
                            value={empSearch}
                            onChange={(e) => setEmpSearch(e.target.value)}
                            placeholder="Buscar..."
                            className="h-7 text-xs mb-2"
                          />
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {sub.assignee_id && (
                              <button
                                type="button"
                                onClick={() => patch(sub.id, { assignee_id: null })}
                                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground"
                              >
                                Limpar responsável
                              </button>
                            )}
                            {filteredEmployees.length === 0 ? (
                              <p className="text-2xs text-muted-foreground px-2 py-1">
                                Nenhum colaborador
                              </p>
                            ) : (
                              filteredEmployees.map((emp) => (
                                <button
                                  key={emp.id}
                                  type="button"
                                  onClick={() => {
                                    patch(sub.id, { assignee_id: emp.id });
                                    setEmpSearch("");
                                  }}
                                  className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-muted truncate ${
                                    sub.assignee_id === emp.id ? "bg-muted font-medium" : ""
                                  }`}
                                >
                                  {emp.full_name || "?"}
                                </button>
                              ))
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Prazo */}
                      <Popover>
                        <PopoverTrigger asChild disabled={!canEdit}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 h-6"
                          >
                            <CalendarIcon className="w-3 h-3" />
                            {dueText || "Sem prazo"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarPicker
                            mode="single"
                            selected={due && isValid(due) ? due : undefined}
                            onSelect={(d) =>
                              patch(sub.id, { due_date: d ? normalizeDateForSave(format(d, "yyyy-MM-dd")) : null })
                            }
                            locale={ptBR}
                            initialFocus
                          />
                          {sub.due_date && (
                            <div className="p-2 border-t">
                              <Button
                                variant="ghost" size="sm"
                                className="w-full text-xs text-muted-foreground"
                                onClick={() => patch(sub.id, { due_date: null })}
                              >
                                Limpar data
                              </Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
                          aria-label="Mais ações"
                        >
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {onDemoteToStep && (
                          <DropdownMenuItem onClick={() => handleDemote(sub)}>
                            <ArrowDownToLine className="w-3.5 h-3.5 mr-2" />
                            Rebaixar a passo
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            if (confirm(`Excluir subtarefa "${sub.title}"?`)) {
                              deleteSubtask.mutate(sub.id);
                            }
                          }}
                          className="text-danger focus:text-danger"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })
        )}

        {canEdit && (
          <div className="flex items-center gap-2 mt-1">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Digite e Enter para criar rápido, ou + para detalhar..."
              className="text-sm h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
              disabled={adding}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2"
              onClick={openDialog}
              disabled={adding}
              title="Criar subtarefa com responsável, prazo e prioridade"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Dialog de criação detalhada */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova subtarefa</DialogTitle>
            <DialogDescription>
              Configure responsável, prazo, prioridade e status na criação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Título *</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="O que precisa ser feito?"
                className="mt-1"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Contexto opcional..."
                rows={2}
                className="mt-1 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}
                >
                  <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Prioridade</Label>
                <Select
                  value={draft.priority}
                  onValueChange={(v) => setDraft((d) => ({ ...d, priority: v }))}
                >
                  <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Responsável</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-1 h-9 justify-start text-sm font-normal"
                  >
                    <User className="w-3.5 h-3.5 mr-2" />
                    {draft.assignee_id
                      ? employees.find((e) => e.id === draft.assignee_id)?.full_name || "?"
                      : "Sem responsável"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                  <Input
                    value={draftEmpSearch}
                    onChange={(e) => setDraftEmpSearch(e.target.value)}
                    placeholder="Buscar..."
                    className="h-7 text-xs mb-2"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {draft.assignee_id && (
                      <button
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, assignee_id: null }))}
                        className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground"
                      >
                        Limpar responsável
                      </button>
                    )}
                    {activeEmployees
                      .filter((e) => !draftEmpSearch.trim() || (e.full_name || "").toLowerCase().includes(draftEmpSearch.toLowerCase()))
                      .map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, assignee_id: emp.id }))}
                          className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-muted truncate ${
                            draft.assignee_id === emp.id ? "bg-muted font-medium" : ""
                          }`}
                        >
                          {emp.full_name || "?"}
                        </button>
                      ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Prazo</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-1 h-9 justify-start text-sm font-normal"
                  >
                    <CalendarIcon className="w-3.5 h-3.5 mr-2" />
                    {draft.due_date && isValid(parseDateSafe(draft.due_date))
                      ? format(parseDateSafe(draft.due_date), "dd MMM yyyy", { locale: ptBR })
                      : "Sem prazo"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={draft.due_date && isValid(parseDateSafe(draft.due_date)) ? parseDateSafe(draft.due_date) : undefined}
                    onSelect={(d) =>
                      setDraft((prev) => ({
                        ...prev,
                        due_date: d ? format(d, "yyyy-MM-dd") : "",
                      }))
                    }
                    locale={ptBR}
                    initialFocus
                  />
                  {draft.due_date && (
                    <div className="p-2 border-t">
                      <Button
                        variant="ghost" size="sm"
                        className="w-full text-xs text-muted-foreground"
                        onClick={() => setDraft((d) => ({ ...d, due_date: "" }))}
                      >
                        Limpar data
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleCreateDetailed()} disabled={adding || !draft.title.trim()}>
              {adding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Criar subtarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
