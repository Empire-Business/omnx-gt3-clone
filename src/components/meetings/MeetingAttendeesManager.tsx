import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  UserPlus,
  X,
  CheckCircle,
  Clock,
  Mail,
  Loader2,
  Crown,
  UserX,
  Trash2,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import {
  MeetingAttendee,
  useMeetingAttendees,
  useAddMeetingAttendee,
  useRemoveMeetingAttendee,
  useUpdateMeetingAttendee,
  useImportProjectMembers,
} from "@/hooks/useMeetings";
import { useEmployees } from "@/hooks/useEmployees";
import { useProjects } from "@/hooks/useProjects";
import { cn } from "@/lib/utils";

interface MeetingAttendeesManagerProps {
  meetingId: string;
  projectId?: string | null;
}

const roleLabels: Record<string, { label: string; color: string }> = {
  organizer: { label: "Organizador", color: "bg-primary/10 text-primary" },
  required: { label: "Obrigatório", color: "bg-info/10 text-info" },
  optional: { label: "Opcional", color: "bg-muted text-muted-foreground" },
};

const statusLabels: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "Pendente", icon: Clock, color: "text-warning" },
  confirmed: { label: "Confirmado", icon: CheckCircle, color: "text-success" },
  declined: { label: "Recusado", icon: X, color: "text-destructive" },
  attended: { label: "Presente", icon: CheckCircle, color: "text-success" },
};

export function MeetingAttendeesManager({ meetingId, projectId }: MeetingAttendeesManagerProps) {
  const { data: attendees, isLoading } = useMeetingAttendees(meetingId);
  const addAttendee = useAddMeetingAttendee();
  const removeAttendee = useRemoveMeetingAttendee();
  const updateAttendee = useUpdateMeetingAttendee();
  const importProjectMembers = useImportProjectMembers();
  const { data: projects } = useProjects();
  const { data: allEmployees } = useEmployees({ status: 'active' });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"organizer" | "required" | "optional">("required");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);

  const availableEmployees = useMemo(() => {
    if (!allEmployees) return [];

    const withName = allEmployees.filter(e => e.full_name);

    if (!searchQuery) return withName;

    const q = searchQuery.toLowerCase();
    return withName.filter(e =>
      e.full_name?.toLowerCase().includes(q) ||
      e.work_email?.toLowerCase().includes(q)
    );
  }, [allEmployees, searchQuery]);

  const handleAddManual = async () => {
    if (!name.trim()) return;

    try {
      await addAttendee.mutateAsync({
        meeting_id: meetingId,
        name: name.trim(),
        email: email.trim() || null,
        role,
      });
      setName("");
      setEmail("");
      setRole("required");
      setAddDialogOpen(false);
      toast.success("Participante adicionado");
    } catch (error) {
      console.error("Error adding attendee:", error);
    }
  };

  const handleAddFromEmployees = async () => {
    const ids = Array.from(selectedEmployeeIds);
    if (ids.length === 0) return;

    setBulkAdding(true);
    let added = 0;
    let failed = 0;
    try {
      for (const empId of ids) {
        const employee = availableEmployees.find((e) => e.id === empId);
        if (!employee) continue;
        try {
          await addAttendee.mutateAsync({
            meeting_id: meetingId,
            employee_id: empId,
            name: employee.full_name || empId,
            email: employee.work_email || null,
            role: "required",
          });
          added++;
        } catch (err) {
          failed++;
          console.warn("Falha ao adicionar", empId, err);
        }
      }
      if (added > 0) {
        toast.success(`${added} participante${added === 1 ? "" : "s"} adicionado${added === 1 ? "" : "s"}`);
      }
      if (failed > 0) {
        toast.error(`${failed} não pôde${failed === 1 ? "" : "ram"} ser adicionado${failed === 1 ? "" : "s"}`);
      }
      setSelectedEmployeeIds(new Set());
      setSelectedEmployeeId("");
      setSearchQuery("");
      setAddDialogOpen(false);
    } finally {
      setBulkAdding(false);
    }
  };

  const handleRemove = async (attendeeId: string) => {
    try {
      await removeAttendee.mutateAsync({ id: attendeeId, meetingId });
    } catch (error) {
      console.error("Error removing attendee:", error);
    }
  };

  const handleUpdateStatus = async (attendeeId: string, status: string) => {
    try {
      await updateAttendee.mutateAsync({
        id: attendeeId,
        updates: { attendance_status: status as any },
      });
    } catch (error) {
      console.error("Error updating attendee:", error);
    }
  };

  const handleImportFromProject = async () => {
    if (!projectId) {
      toast.error("Nenhum projeto vinculado");
      return;
    }

    const project = projects?.find((p) => p.id === projectId);
    if (!project) {
      toast.error("Projeto não encontrado");
      return;
    }

    const memberIds = project.members?.map((m) => m.employee_id) || [];

    if (memberIds.length === 0) {
      toast.info("O projeto não tem membros");
      return;
    }

    try {
      await importProjectMembers.mutateAsync({
        meetingId,
        projectMemberIds: memberIds,
      });
    } catch (error) {
      console.error("Error importing project members:", error);
    }
  };

  const getAvatarUrl = (attendee: MeetingAttendee) => {
    const employee = (attendee as any).employee;
    if (employee?.profile?.avatar_url) {
      return employee.profile.avatar_url;
    }
    return null;
  };

  // Conta apenas quem efetivamente entrou na reunião (mesma regra da lista visível).
  const totalCount = (attendees || []).length;
  const attendedCount = (attendees || []).filter((a) => a.attendance_status === "attended").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Participantes</h3>
          <span className="text-sm text-muted-foreground">
            {totalCount} {totalCount === 1 ? "participante" : "participantes"}
            {attendedCount > 0 && (
              <span className="ml-1.5 text-success">· {attendedCount} {attendedCount === 1 ? "presente" : "presentes"}</span>
            )}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
            className="gap-1"
          >
            <UserPlus className="w-4 h-4" />
            Adicionar
          </Button>
          {projectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportFromProject}
              disabled={importProjectMembers.isPending}
              className="gap-1"
            >
              {importProjectMembers.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              Importar do Projeto
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Carregando participantes...</span>
        </div>
      ) : (() => {
        // Mostra todos os participantes adicionados/convidados, com indicador de status.
        const visibleAttendees = (attendees || []);
        return visibleAttendees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Users className="w-8 h-8 mb-2 opacity-50" />
          <p>Nenhum participante adicionado</p>
          <p className="text-sm">Adicione colaboradores ou importe do projeto.</p>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto pr-2">
          <div className="space-y-2">
            {visibleAttendees.map((attendee) => (
              <div
                key={attendee.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={getAvatarUrl(attendee)} />
                    <AvatarFallback>{attendee.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-medium text-sm truncate">{attendee.name}</p>
                      {attendee.role === "organizer" && (
                        <Badge
                          variant="default"
                          className="h-5 px-1.5 gap-1 text-[10px] font-semibold bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20"
                          title="Host da reunião"
                        >
                          <Crown className="w-3 h-3" />
                          Host
                        </Badge>
                      )}
                      {!attendee.employee_id && (
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 gap-1 text-[10px] font-medium bg-muted/50 text-muted-foreground border-border"
                          title="Convidado externo — não está cadastrado na plataforma"
                        >
                          <UserX className="w-3 h-3" />
                          Externo
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {attendee.attendance_status !== "pending" && attendee.attendance_status !== "attended" && (
                    <Badge variant="outline" className="text-2xs h-5 px-1.5">
                      {statusLabels[attendee.attendance_status]?.label}
                    </Badge>
                  )}
                  {attendee.attendance_status === "pending" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleUpdateStatus(attendee.id, "confirmed")}
                      className="text-success hover:opacity-80 h-7 w-7"
                      title="Confirmar presença"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(attendee.id)}
                    className="text-muted-foreground hover:text-destructive h-7 w-7"
                    title="Remover da reunião"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      })()}

      {/* Add participant dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Participante</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="search" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="search">Buscar Colaborador</TabsTrigger>
              <TabsTrigger value="manual">Digitar Manualmente</TabsTrigger>
            </TabsList>
            <TabsContent value="search">
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Buscar colaborador</Label>
                  <span className="text-2xs text-muted-foreground">
                    {selectedEmployeeIds.size} selecionado{selectedEmployeeIds.size === 1 ? "" : "s"}
                  </span>
                </div>
                <Input
                  placeholder="Digite o nome para buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                />
                <div className="flex items-center justify-between gap-2 -mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const visible = availableEmployees.slice(0, 50).map((e) => e.id);
                      setSelectedEmployeeIds(new Set(visible));
                    }}
                    className="text-2xs text-primary hover:underline"
                  >
                    Selecionar todos
                  </button>
                  {selectedEmployeeIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedEmployeeIds(new Set())}
                      className="text-2xs text-muted-foreground hover:text-foreground"
                    >
                      Limpar seleção
                    </button>
                  )}
                </div>
                <div className="max-h-[260px] overflow-auto mt-2 rounded-md border border-border">
                  <div className="space-y-0.5 p-1">
                  {availableEmployees.slice(0, 50).map((employee) => {
                    const checked = selectedEmployeeIds.has(employee.id);
                    return (
                      <label
                        key={employee.id}
                        className={cn(
                          "flex items-center gap-2.5 p-2 rounded cursor-pointer transition-colors",
                          checked ? "bg-primary/10" : "hover:bg-accent"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(ev) => {
                            const next = new Set(selectedEmployeeIds);
                            if (ev.target.checked) next.add(employee.id);
                            else next.delete(employee.id);
                            setSelectedEmployeeIds(next);
                          }}
                          className="w-4 h-4 rounded border-border accent-primary flex-shrink-0"
                        />
                        <Avatar className="h-7 w-7 flex-shrink-0">
                          <AvatarImage src={employee.avatar_url || undefined} />
                          <AvatarFallback>{(employee.full_name || "?").charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{employee.full_name}</p>
                          {employee.work_email && (
                            <p className="text-xs text-muted-foreground truncate">{employee.work_email}</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  {availableEmployees.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {searchQuery ? "Nenhum colaborador encontrado" : "Nenhum colaborador ativo"}
                    </p>
                  )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleAddFromEmployees}
                    disabled={selectedEmployeeIds.size === 0 || bulkAdding || addAttendee.isPending}
                  >
                    {(bulkAdding || addAttendee.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Adicionar {selectedEmployeeIds.size > 0 ? selectedEmployeeIds.size : ""}
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="manual">
              <div className="space-y-4 py-4">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome do participante"
                  />
                </div>
                <div>
                  <Label>Email (opcional)</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <Label>Papel</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as "organizer" | "required" | "optional")}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{roleLabels[role]?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="organizer">Organizador</SelectItem>
                      <SelectItem value="required">Obrigatório</SelectItem>
                      <SelectItem value="optional">Opcional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAddManual} disabled={!name.trim() || addAttendee.isPending}>
                    {addAttendee.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Adicionar
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
