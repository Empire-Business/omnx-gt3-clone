import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckSquare, Loader2, Check, X, Send, Bot, Calendar, User, FolderOpen, AlertTriangle, ListChecks, GitBranch, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Meeting, useApproveItems } from "@/hooks/useMeetings";
import { useEmployees } from "@/hooks/useEmployees";
import { useProjects } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  meeting: Meeting;
  onApproved: () => void;
}

interface TaskStep {
  order: number;
  description: string;
  estimated_time?: string;
}

interface TaskDependency {
  task_title_ref: string;
  dependency_type: "blocks" | "blocked_by" | "related_to";
}

interface EditableTask {
  selected: boolean;
  title: string;
  description: string;
  priority: string;
  suggested_assignee: string;
  project_id?: string | null;
  project_name?: string;
  project_suggestion?: string;
  assignee_id?: string | null;
  due_date?: string | null;
  // Expanded fields
  effort_estimate?: "small" | "medium" | "large" | "extra_large";
  risk_level?: "low" | "medium" | "high";
  acceptance_criteria?: string[];
  steps?: TaskStep[];
  dependencies?: TaskDependency[];
  suggested_due_date?: string;
}

export function MeetingApproval({ meeting, onApproved }: Props) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  const toggleTaskExpansion = (index: number) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const [tasks, setTasks] = useState<EditableTask[]>(
    (meeting.generated_tasks || []).map((t: any) => ({
      selected: true,
      title: t.title || "",
      description: t.description || "",
      priority: t.priority || "medium",
      suggested_assignee: t.suggested_assignee || "",
      project_id: t.project_id || null,
      project_name: t.project_name || "",
      project_suggestion: t.project_suggestion || "",
      assignee_id: null,
      due_date: t.suggested_due_date || null,
      // Expanded fields
      effort_estimate: t.effort_estimate || "medium",
      risk_level: t.risk_level || "low",
      acceptance_criteria: t.acceptance_criteria || [],
      steps: t.steps || [],
      dependencies: t.dependencies || [],
      suggested_due_date: t.suggested_due_date || "",
    }))
  );

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const approveItems = useApproveItems();
  const { data: employees = [] } = useEmployees({ status: "active" });
  const { data: existingProjects = [] } = useProjects();

  // Project matching function - find similar project by name
  const findMatchingProject = (taskTitle: string): { id: string; name: string } | null => {
    if (!taskTitle || !existingProjects.length) return null;

    const normalize = (str: string) =>
      str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();

    const normalizedTaskTitle = normalize(taskTitle);
    const taskWords = normalizedTaskTitle.split(/\s+/);

    let bestMatch: { id: string; name: string; score: number } | null = null;

    for (const project of existingProjects) {
      if (project.status === "cancelled" || project.status === "completed") continue;

      const normalizedProjectName = normalize(project.name);
      const projectWords = normalizedProjectName.split(/\s+/);

      let score = 0;

      // Check if task title contains project name
      if (normalizedTaskTitle.includes(normalizedProjectName) && normalizedProjectName.length > 3) {
        score = 0.9;
      }
      // Check if project name contains task title
      else if (normalizedProjectName.includes(normalizedTaskTitle) && normalizedTaskTitle.length > 3) {
        score = 0.85;
      }
      // Calculate word overlap score
      else {
        const commonWords = taskWords.filter(word =>
          word.length > 2 && projectWords.some(pWord => pWord.includes(word) || word.includes(pWord))
        );
        if (commonWords.length > 0) {
          score = (commonWords.length / Math.max(taskWords.length, projectWords.length)) * 0.7;
        }
      }

      if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: project.id, name: project.name, score };
      }
    }

    return bestMatch && bestMatch.score >= 0.5 ? { id: bestMatch.id, name: bestMatch.name } : null;
  };

  // Find matching employee by name similarity
  const findMatchingEmployee = (suggestedName: string): string | null => {
    if (!suggestedName || !employees.length) return null;

    const normalize = (str: string) =>
      str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();

    const normalizedSuggestion = normalize(suggestedName);

    for (const emp of employees) {
      if (!emp.full_name) continue;
      const normalizedEmpName = normalize(emp.full_name);

      // Check for partial match (first name, last name, or contains)
      if (normalizedEmpName.includes(normalizedSuggestion) ||
          normalizedSuggestion.includes(normalizedEmpName)) {
        return emp.id;
      }

      // Check if names share significant words
      const empWords = normalizedEmpName.split(/\s+/);
      const suggestionWords = normalizedSuggestion.split(/\s+/);
      const commonWords = empWords.filter(word =>
        word.length > 2 && suggestionWords.some(sWord => sWord === word || sWord.includes(word))
      );

      if (commonWords.length >= 1) {
        return emp.id;
      }
    }

    return null;
  };

  // Auto-match projects and assignees on initial load
  useEffect(() => {
    if (existingProjects.length > 0 || employees.length > 0) {
      setTasks(prev => prev.map(task => {
        const updates: Partial<EditableTask> = {};

        // Auto-match project if not already set
        if (!task.project_id && !task.project_name) {
          const matchedProject = findMatchingProject(task.title);
          if (matchedProject) {
            updates.project_id = matchedProject.id;
            updates.project_name = matchedProject.name;
          } else if (task.project_suggestion) {
            updates.project_name = task.project_suggestion;
          }
        }

        // Auto-match assignee if suggestion exists and not already set
        if (!task.assignee_id && task.suggested_assignee) {
          const matchedEmployee = findMatchingEmployee(task.suggested_assignee);
          if (matchedEmployee) {
            updates.assignee_id = matchedEmployee;
          }
        }

        return Object.keys(updates).length > 0 ? { ...task, ...updates } : task;
      }));
    }
  }, [existingProjects, employees]);

  const updateTask = (i: number, updates: Partial<EditableTask>) => {
    setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, ...updates } : t));
  };

  const handleApprove = async () => {
    const selectedTasks = tasks.filter(t => t.selected);

    if (selectedTasks.length === 0) {
      toast.warning("Selecione pelo menos uma tarefa para aprovar");
      return;
    }

    await approveItems.mutateAsync({
      meeting_id: meeting.id,
      approved_projects: [],
      approved_tasks: selectedTasks.map(t => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        project_id: t.project_id,
        project_name: t.project_name || undefined,
        assignee_id: t.assignee_id,
        due_date: t.due_date,
        // Expanded fields
        effort_estimate: t.effort_estimate,
        risk_level: t.risk_level,
        acceptance_criteria: t.acceptance_criteria,
        steps: t.steps,
        dependencies: t.dependencies,
      })),
    });

    onApproved();
  };

  const handleRejectAll = async () => {
    setTasks(prev => prev.map(t => ({ ...t, selected: false })));
    toast.info("Todos os itens foram desmarcados");
  };

  // BUG 5 FIX: Use meeting-ai with mode "correction" instead of process-ai
  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    try {
      const context = JSON.stringify({ tasks }, null, 2);
      const { data, error } = await supabase.functions.invoke("meeting-ai", {
        body: {
          mode: "correction",
          meeting_id: meeting.id,
          context,
          user_message: userMsg,
        },
      });

      if (error) throw error;

      const responseMsg = data?.message || "Não consegui processar sua solicitação.";
      setChatMessages(prev => [...prev, { role: "assistant", content: typeof responseMsg === "string" ? responseMsg : JSON.stringify(responseMsg) }]);

      // Apply corrections if returned
      if (data?.updated_tasks) {
        setTasks(data.updated_tasks.map((t: any) => ({
          selected: t.selected ?? true,
          title: t.title || "",
          description: t.description || "",
          priority: t.priority || "medium",
          suggested_assignee: t.suggested_assignee || "",
          project_id: t.project_id || null,
          project_name: t.project_name || "",
          project_suggestion: t.project_suggestion || "",
          assignee_id: t.assignee_id || null,
          due_date: t.due_date || t.suggested_due_date || null,
          // Expanded fields
          effort_estimate: t.effort_estimate || "medium",
          risk_level: t.risk_level || "low",
          acceptance_criteria: t.acceptance_criteria || [],
          steps: t.steps || [],
          dependencies: t.dependencies || [],
          suggested_due_date: t.suggested_due_date || "",
        })));
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Erro ao processar: " + (err.message || "tente novamente") }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tasks */}
      {tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckSquare className="w-5 h-5" />
              Tarefas Sugeridas ({tasks.filter(t => t.selected).length}/{tasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tasks.map((task, i) => (
              <Collapsible key={i} open={expandedTasks.has(i)} onOpenChange={() => toggleTaskExpansion(i)}>
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <Checkbox
                    checked={task.selected}
                    onCheckedChange={(checked) => updateTask(i, { selected: !!checked })}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-2">
                      <Input
                        value={task.title}
                        onChange={(e) => updateTask(i, { title: e.target.value })}
                        placeholder="Título da tarefa"
                        className="font-medium flex-1"
                      />
                      {/* Risk Level Badge */}
                      {task.risk_level && task.risk_level !== "low" && (
                        <Badge
                          variant={task.risk_level === "high" ? "destructive" : "secondary"}
                          className="shrink-0"
                        >
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Risco {task.risk_level === "medium" ? "Médio" : "Alto"}
                        </Badge>
                      )}
                      {/* Expand/Collapse Button */}
                      {(task.steps?.length || task.acceptance_criteria?.length || task.dependencies?.length) ? (
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="shrink-0">
                            {expandedTasks.has(i) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      ) : null}
                    </div>
                    <Textarea
                      value={task.description}
                      onChange={(e) => updateTask(i, { description: e.target.value })}
                      placeholder="Descrição"
                      rows={2}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Select value={task.priority} onValueChange={(v) => updateTask(i, { priority: v })}>
                        <SelectTrigger className="w-28">
                          <SelectValue placeholder="Prioridade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baixa</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="urgent">Urgente</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Effort Estimate */}
                      <Select
                        value={task.effort_estimate || "medium"}
                        onValueChange={(v) => updateTask(i, { effort_estimate: v as any })}
                      >
                        <SelectTrigger className="w-32">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            <SelectValue placeholder="Esforço" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Pequeno</SelectItem>
                          <SelectItem value="medium">Médio</SelectItem>
                          <SelectItem value="large">Grande</SelectItem>
                          <SelectItem value="extra_large">Muito Grande</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Project Selection */}
                      <Select
                        value={task.project_id || "new"}
                        onValueChange={(v) => {
                          if (v === "none") {
                            updateTask(i, { project_id: null, project_name: "" });
                          } else if (v === "new") {
                            updateTask(i, { project_id: null, project_name: task.project_suggestion || "" });
                          } else {
                            const proj = existingProjects.find(p => p.id === v);
                            updateTask(i, { project_id: v, project_name: proj?.name || "" });
                          }
                        }}
                      >
                        <SelectTrigger className="w-40">
                          <div className="flex items-center gap-1 truncate">
                            <FolderOpen className="w-3 h-3 shrink-0" />
                            <SelectValue placeholder="Projeto" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted">Sem projeto</span>
                          </SelectItem>
                          {existingProjects.filter(p => p.status === "active" || p.status === "planning").map(project => (
                            <SelectItem key={project.id} value={project.id}>
                              <span className="truncate">{project.name}</span>
                            </SelectItem>
                          ))}
                          <SelectItem value="new">
                            <span className="text-primary font-medium">+ Criar novo projeto</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {/* New Project Name Input */}
                      {task.project_id === null && (
                        <Input
                          value={task.project_name || ""}
                          onChange={(e) => updateTask(i, { project_name: e.target.value })}
                          placeholder="Nome do projeto"
                          className="w-40"
                        />
                      )}

                      {/* Assignee Selection */}
                      <Select
                        value={task.assignee_id || "none"}
                        onValueChange={(v) => updateTask(i, { assignee_id: v === "none" ? null : v })}
                      >
                        <SelectTrigger className="w-36">
                          <div className="flex items-center gap-1 truncate">
                            <User className="w-3 h-3 shrink-0" />
                            <SelectValue placeholder="Responsável" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted">Sem responsável</span>
                          </SelectItem>
                          {employees.map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>
                              <span className="truncate">{emp.full_name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Due Date */}
                      <div className="relative">
                        <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                        <Input
                          type="date"
                          value={task.due_date || ""}
                          onChange={(e) => updateTask(i, { due_date: e.target.value || null })}
                          className="w-32 pl-7"
                        />
                      </div>

                      {/* AI Suggestion Badge */}
                      {task.suggested_assignee && !task.assignee_id && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                          IA: {task.suggested_assignee}
                        </Badge>
                      )}
                    </div>

                    {/* Expanded Details */}
                    <CollapsibleContent>
                      <div className="mt-3 space-y-3 pt-3 border-t">
                        {/* Steps */}
                        {task.steps && task.steps.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                              <ListChecks className="w-3 h-3" />
                              Passos
                            </div>
                            <ol className="list-decimal list-inside text-sm space-y-1 pl-2">
                              {task.steps.map((step, si) => (
                                <li key={si} className="text-muted-foreground">
                                  {step.description}
                                  {step.estimated_time && (
                                    <span className="text-xs ml-2 opacity-70">({step.estimated_time})</span>
                                  )}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {/* Acceptance Criteria */}
                        {task.acceptance_criteria && task.acceptance_criteria.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                              <Check className="w-3 h-3" />
                              Critérios de Aceite
                            </div>
                            <ul className="list-disc list-inside text-sm space-y-1 pl-2">
                              {task.acceptance_criteria.map((criteria, ci) => (
                                <li key={ci} className="text-muted-foreground">{criteria}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Dependencies */}
                        {task.dependencies && task.dependencies.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                              <GitBranch className="w-3 h-3" />
                              Dependências
                            </div>
                            <div className="flex flex-wrap gap-1 pl-2">
                              {task.dependencies.map((dep, di) => (
                                <Badge key={di} variant="outline" className="text-xs">
                                  {dep.dependency_type === "blocks" ? "Bloqueia" :
                                   dep.dependency_type === "blocked_by" ? "Bloqueada por" : "Relacionada a"}:
                                  {" "}{dep.task_title_ref}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </div>
              </Collapsible>
            ))}
          </CardContent>
        </Card>
      )}

      {/* AI Chat */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="w-4 h-4" />
            Chat de Correção IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {chatMessages.length > 0 && (
            <ScrollArea className="h-40 rounded-lg border p-3">
              <div className="space-y-2 text-sm">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={msg.role === "user" ? "text-right" : ""}>
                    <span className={`inline-block p-2 rounded-lg max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {msg.content}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          <div className="flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ex: Mude a prioridade da tarefa 1 para urgente..."
              onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
            />
            <Button size="icon" onClick={handleChatSend} disabled={chatLoading}>
              {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Action buttons */}
      <div className="flex items-center gap-3 justify-end">
        <Button variant="outline" onClick={handleRejectAll} className="gap-2">
          <X className="w-4 h-4" /> Rejeitar Todos
        </Button>
        <Button onClick={handleApprove} disabled={approveItems.isPending} className="gap-2">
          {approveItems.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Aprovar Selecionados
        </Button>
      </div>
    </div>
  );
}
