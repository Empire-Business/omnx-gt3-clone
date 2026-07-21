import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Briefcase, FileText, Target, Users, ArrowUp, Workflow, ExternalLink, Loader2, Pencil, Save, X, Plus, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Position = Tables<"positions">;

interface PositionDetailModalProps {
  position: Position | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subareaName?: string;
  areaName?: string;
  onUpdated?: () => void;
}

interface LinkedProcess {
  process_id: string;
  name: string;
  status: string | null;
  is_primary: boolean | null;
}

interface ManagerInfo {
  position_id: string;
  position_title: string;
  employee_names: string[];
}

export function PositionDetailModal({ position, open, onOpenChange, subareaName, areaName, onUpdated }: PositionDetailModalProps) {
  const navigate = useNavigate();
  const [fullscreen, setFullscreen] = useState(false);
  const [linkedProcesses, setLinkedProcesses] = useState<LinkedProcess[]>([]);
  const [managerInfo, setManagerInfo] = useState<ManagerInfo | null>(null);
  const [employeesInPosition, setEmployeesInPosition] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editResponsibilities, setEditResponsibilities] = useState<string[]>([]);
  const [editGoals, setEditGoals] = useState<string[]>([]);

  const startEditing = useCallback(() => {
    if (!position) return;
    setEditDescription(position.description || "");
    setEditResponsibilities(position.responsibilities?.length ? [...position.responsibilities] : [""]);
    setEditGoals(position.goals?.length ? [...position.goals] : [""]);
    setEditing(true);
  }, [position]);

  const cancelEditing = () => setEditing(false);

  const handleSave = async () => {
    if (!position) return;
    setSaving(true);
    try {
      const cleanList = (arr: string[]) => arr.map(s => s.trim()).filter(Boolean);
      const { error } = await supabase
        .from("positions")
        .update({
          description: editDescription.trim() || null,
          responsibilities: cleanList(editResponsibilities),
          goals: cleanList(editGoals),
        })
        .eq("id", position.id);
      if (error) throw error;
      toast.success("Cargo atualizado com sucesso!");
      setEditing(false);
      onUpdated?.();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!position || !open) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: processLinks } = await supabase
          .from("process_positions")
          .select("process_id, is_primary, processes:process_id(name, status)")
          .eq("position_id", position.id);

        const processes: LinkedProcess[] = (processLinks || []).map((link: any) => ({
          process_id: link.process_id,
          name: link.processes?.name || "Sem nome",
          status: link.processes?.status || null,
          is_primary: link.is_primary,
        }));
        setLinkedProcesses(processes);

        // Get employees in this position — two queries to avoid FK join issue
        const { data: empPositions } = await supabase
          .from("employee_positions")
          .select("employee_id")
          .eq("position_id", position.id);

        const names: string[] = [];
        if (empPositions && empPositions.length > 0) {
          const empIds = empPositions.map((ep: any) => ep.employee_id).filter(Boolean);
          const { data: empsData } = await supabase
            .from("employees")
            .select("user_id")
            .in("id", empIds);
          const userIds = (empsData || []).map((e: any) => e.user_id).filter(Boolean);
          if (userIds.length > 0) {
            const { data: profilesData } = await supabase
              .from("profiles")
              .select("full_name")
              .in("user_id", userIds);
            for (const p of profilesData || []) {
              if (p.full_name) names.push(p.full_name);
            }
          }
        }
        setEmployeesInPosition(names);

        // Get manager info from position hierarchy (reports_to_id)
        const reportsToId = (position as any)?.reports_to_id;
        if (reportsToId) {
          const { data: parentPosition } = await supabase
            .from("positions")
            .select("id, title")
            .eq("id", reportsToId)
            .single();

          if (parentPosition) {
            const { data: parentEmpPositions } = await supabase
              .from("employee_positions")
              .select("employee_id")
              .eq("position_id", reportsToId)
              .eq("is_primary", true);

            const managerNames: string[] = [];
            if (parentEmpPositions && parentEmpPositions.length > 0) {
              const pEmpIds = parentEmpPositions.map((ep: any) => ep.employee_id).filter(Boolean);
              const { data: pEmpsData } = await supabase
                .from("employees")
                .select("user_id")
                .in("id", pEmpIds);
              const pUserIds = (pEmpsData || []).map((e: any) => e.user_id).filter(Boolean);
              if (pUserIds.length > 0) {
                const { data: pProfilesData } = await supabase
                  .from("profiles")
                  .select("full_name")
                  .in("user_id", pUserIds);
                for (const p of pProfilesData || []) {
                  if (p.full_name) managerNames.push(p.full_name);
                }
              }
            }

            setManagerInfo({
              position_id: parentPosition.id,
              position_title: parentPosition.title,
              employee_names: managerNames,
            });
          } else {
            setManagerInfo(null);
          }
        } else {
          setManagerInfo(null);
        }
      } catch (err) {
        console.error("Error fetching position details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [position?.id, open, position]);

  // Reset states when modal closes
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setFullscreen(false);
    }
  }, [open]);

  if (!position) return null;

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    active: "bg-primary/10 text-primary",
    archived: "bg-destructive/10 text-destructive",
  };

  const handleClose = () => {
    setFullscreen(false);
    onOpenChange(false);
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start gap-3 pb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Briefcase className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground truncate">{position.title}</h2>
          {(areaName || subareaName) && (
            <p className="text-sm text-muted-foreground">
              {areaName}{subareaName ? ` → ${subareaName}` : ""} · Nível {position.level || "—"}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {!editing ? (
            <Button variant="ghost" size="icon" onClick={startEditing} className="h-8 w-8">
              <Pencil className="w-4 h-4" />
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={cancelEditing} className="h-8 w-8" disabled={saving}>
                <X className="w-4 h-4" />
              </Button>
              <Button variant="default" size="icon" onClick={handleSave} className="h-8 w-8" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Job Description */}
            <Section icon={FileText} title="Job Description">
              {editing ? (
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Descreva o cargo..."
                  className="min-h-[80px] text-sm"
                />
              ) : position.description ? (
                <p className="text-sm text-foreground whitespace-pre-wrap">{position.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nenhuma descrição cadastrada.</p>
              )}
            </Section>

            {/* Responsibilities */}
            <Section icon={Briefcase} title="Responsabilidades">
              {editing ? (
                <EditableList
                  items={editResponsibilities}
                  onChange={setEditResponsibilities}
                  placeholder="Ex: Gerenciar equipe de vendas"
                />
              ) : position.responsibilities && position.responsibilities.length > 0 ? (
                <ul className="space-y-1.5">
                  {position.responsibilities.map((r, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nenhuma responsabilidade cadastrada.</p>
              )}
            </Section>

            {/* Goals */}
            <Section icon={Target} title="Metas">
              {editing ? (
                <EditableList
                  items={editGoals}
                  onChange={setEditGoals}
                  placeholder="Ex: Aumentar vendas em 20%"
                />
              ) : position.goals && position.goals.length > 0 ? (
                <ul className="space-y-1.5">
                  {position.goals.map((g, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <Target className="w-3 h-3 text-primary mt-1 flex-shrink-0" />
                      {g}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nenhuma meta cadastrada.</p>
              )}
            </Section>

            {/* Subordination */}
            <Section icon={ArrowUp} title="Subordinação">
              {managerInfo ? (
                <div className="text-sm text-foreground">
                  <p>
                    Reporta-se a:{' '}
                    <span
                      className="font-medium text-primary cursor-pointer hover:underline"
                      onClick={() => {
                        // Navigate to parent position detail
                        navigate(`/areas-cargos?position=${managerInfo.position_id}`);
                        onOpenChange(false);
                      }}
                    >
                      {managerInfo.position_title}
                    </span>
                  </p>
                  {managerInfo.employee_names.length > 0 && (
                    <p className="text-muted-foreground text-xs mt-0.5">
                      ({managerInfo.employee_names.join(", ")})
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {(position as any)?.reports_to_id === null
                    ? "Cargo de topo na hierarquia."
                    : position.level === 0
                      ? "Cargo de nível máximo — sem subordinação."
                      : "Sem informação de subordinação."}
                </p>
              )}
            </Section>

            {/* Employees in this position */}
            {employeesInPosition.length > 0 && (
              <Section icon={Users} title={`Colaboradores (${employeesInPosition.length})`}>
                <div className="flex flex-wrap gap-1.5">
                  {employeesInPosition.map((name, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{name}</Badge>
                  ))}
                </div>
              </Section>
            )}

            {/* Linked Processes */}
            <Section icon={Workflow} title={`Processos Vinculados (${linkedProcesses.length})`}>
              {linkedProcesses.length > 0 ? (
                <div className="space-y-2">
                  {linkedProcesses.map((proc) => (
                    <div
                      key={proc.process_id}
                      className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2 cursor-pointer hover:bg-muted transition-colors group"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/processos/${proc.process_id}`);
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Workflow className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-foreground truncate">{proc.name}</span>
                        {proc.is_primary && <Badge variant="outline" className="text-2xs">Principal</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        {proc.status && (
                          <Badge className={cn("text-2xs", statusColors[proc.status] || "")}>
                            {proc.status === "draft" ? "Rascunho" : proc.status === "active" ? "Ativo" : "Arquivado"}
                          </Badge>
                        )}
                        <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nenhum processo vinculado a este cargo.</p>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );

  // Fullscreen mode
  if (fullscreen) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  // Default: side panel (Sheet)
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent className="w-full sm:w-[420px] md:w-[480px] overflow-y-auto p-5">
        {content}
      </SheetContent>
    </Sheet>
  );
}

/* ── Section wrapper ── */
function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <Separator className="mb-2" />
      {children}
    </div>
  );
}

/* ── Editable list (for responsibilities / goals) ── */
function EditableList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const updateItem = (index: number, value: string) => {
    const next = [...items];
    next[index] = value;
    onChange(next);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(items.filter((_, i) => i !== index));
  };

  const addItem = () => onChange([...items, ""]);

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={placeholder}
            className="text-sm h-9"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeItem(i)}>
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem} className="text-xs gap-1">
        <Plus className="w-3 h-3" /> Adicionar
      </Button>
    </div>
  );
}
