import { useState, useMemo } from "react";
import {
    Users, Search, Shield, ShieldOff, KeyRound, Trash2, MoreHorizontal,
    Filter, ChevronDown, Mail, Clock, Circle, Crown, AlertTriangle,
    CheckSquare, Square,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployees, type EmployeeWithDetails } from "@/hooks/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGuard } from "@/components/permissions/PermissionGuard";
import { EmptyState, StatusBadge } from "@/components/shared/SharedComponents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ListSkeleton } from "@/components/shared/SmartSkeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserInfo {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    tenant_id: string | null;
    last_sign_in_at: string | null;
    created_at: string | null;
    is_banned: boolean;
    banned_until: string | null;
    employee_status: string | null;
    status_reason: string | null;
    termination_date: string | null;
}

interface UserWithEmployee extends EmployeeWithDetails {
    user_info?: UserInfo;
}

/* ════════════════════════════════════════════
   ROLE CHANGE DIALOG
   ════════════════════════════════════════════ */

function RoleChangeDialog({
    open,
    onOpenChange,
    user,
    onConfirm,
    isLoading,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    user: UserWithEmployee | null;
    onConfirm: (role: "admin" | "manager" | "member") => void;
    isLoading: boolean;
}) {
    const [selectedRole, setSelectedRole] = useState<string>("member");

    const roleLabels: Record<string, string> = {
        admin: "Admin",
        manager: "Gerente",
        member: "Membro",
    };

    const roleDescriptions: Record<string, string> = {
        admin: "Acesso total ao sistema, incluindo gerenciamento de usuários e configurações",
        manager: "Pode gerenciar projetos, processos e visualizar relatórios",
        member: "Acesso básico para visualizar e editar próprias tarefas",
    };

    if (!user) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        Alterar Papel de Acesso
                    </DialogTitle>
                    <DialogDescription>
                        Altere o papel de acesso de <strong>{user.full_name}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 py-2">
                    {(["member", "manager", "admin"] as const).map((role) => (
                        <div
                            key={role}
                            onClick={() => setSelectedRole(role)}
                            className={cn(
                                "p-3 rounded-lg border cursor-pointer transition-all",
                                selectedRole === role
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50"
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-medium">{roleLabels[role]}</span>
                                <div className={cn(
                                    "w-4 h-4 rounded-full border-2",
                                    selectedRole === role ? "border-primary bg-primary" : "border-muted-foreground"
                                )} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{roleDescriptions[role]}</p>
                        </div>
                    ))}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button
                        onClick={() => onConfirm(selectedRole as "admin" | "manager" | "member")}
                        disabled={isLoading || selectedRole === user.user_info?.role}
                    >
                        {isLoading ? "Salvando..." : "Salvar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ════════════════════════════════════════════
   DELETE USER DIALOG
   ════════════════════════════════════════════ */

function DeleteUserDialog({
    open,
    onOpenChange,
    user,
    onConfirm,
    isLoading,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    user: UserWithEmployee | null;
    onConfirm: (hardDelete: boolean) => void;
    isLoading: boolean;
}) {
    const [hardDelete, setHardDelete] = useState(false);

    if (!user) return null;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <Trash2 className="w-5 h-5" />
                        Excluir Usuário
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Você está prestes a excluir <strong>{user.full_name}</strong> ({user.work_email}).
                        Esta ação não pode ser desfeita facilmente.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50 my-2">
                    <div>
                        <p className="text-sm font-medium">Exclusão permanente</p>
                        <p className="text-xs text-muted-foreground">
                            Remove completamente o usuário do sistema (não recomendado)
                        </p>
                    </div>
                    <Switch checked={hardDelete} onCheckedChange={setHardDelete} />
                </div>

                <div className="p-3 rounded-lg border border-warning/30 bg-warning/5">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-muted-foreground">
                            {hardDelete ? (
                                <p className="text-danger font-medium">
                                    O usuário será permanentemente removido do sistema. Todos os dados associados serão perdidos.
                                </p>
                            ) : (
                                <p>
                                    O usuário será desativado mas seus dados serão mantidos. Esta é a opção recomendada.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => onConfirm(hardDelete)}
                        disabled={isLoading}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isLoading ? "Excluindo..." : hardDelete ? "Excluir Permanentemente" : "Desativar Usuário"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/* ════════════════════════════════════════════
   BULK ACTIONS DIALOG
   ════════════════════════════════════════════ */

function BulkActionsDialog({
    open,
    onOpenChange,
    selectedCount,
    onConfirm,
    isLoading,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    selectedCount: number;
    onConfirm: (action: "ban" | "unban" | "reset_password" | "deactivate") => void;
    isLoading: boolean;
}) {
    const [selectedAction, setSelectedAction] = useState<"ban" | "unban" | "reset_password" | "deactivate">("deactivate");

    const actionLabels: Record<string, string> = {
        ban: "Bloquear login",
        unban: "Desbloquear login",
        reset_password: "Resetar senha",
        deactivate: "Desativar usuários",
    };

    const actionDescriptions: Record<string, string> = {
        ban: "Impedir que os usuários selecionados acessem o sistema",
        unban: "Permitir que os usuários selecionados façam login novamente",
        reset_password: "Enviar email de redefinição de senha para todos os selecionados",
        deactivate: "Marcar os usuários como inativos (soft delete)",
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Ações em Lote</DialogTitle>
                    <DialogDescription>
                        Aplicar ação para <strong>{selectedCount}</strong> usuário{selectedCount !== 1 ? "s" : ""} selecionado{selectedCount !== 1 ? "s" : ""}.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2 py-2">
                    {(["deactivate", "ban", "unban", "reset_password"] as const).map((action) => (
                        <div
                            key={action}
                            onClick={() => setSelectedAction(action)}
                            className={cn(
                                "p-3 rounded-lg border cursor-pointer transition-all",
                                selectedAction === action
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50"
                            )}
                        >
                            <span className="font-medium">{actionLabels[action]}</span>
                            <p className="text-xs text-muted-foreground">{actionDescriptions[action]}</p>
                        </div>
                    ))}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button
                        onClick={() => onConfirm(selectedAction)}
                        disabled={isLoading}
                        variant={selectedAction === "ban" || selectedAction === "deactivate" ? "destructive" : "default"}
                    >
                        {isLoading ? "Processando..." : "Confirmar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════ */

export default function UserManagement() {
    const { isAdmin, loading: permissionsLoading } = usePermissions();
    const { data: employees, isLoading, isFetching } = useEmployees();

    const {
        resetUserPassword,
        generateTempPassword,
        deleteUser,
        updateUserRole,
        changeEmployeeStatus,
        bulkChangeStatus,
    } = useEmployees();

    const [search, setSearch] = useState("");
    const [filterRole, setFilterRole] = useState<string>("all");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

    // Dialogs
    const [roleChangeUser, setRoleChangeUser] = useState<UserWithEmployee | null>(null);
    const [tempPwResult, setTempPwResult] = useState<{ name: string; password: string } | null>(null);
    const [deleteUser_, setDeleteUser] = useState<UserWithEmployee | null>(null);
    const [showBulkDialog, setShowBulkDialog] = useState(false);

    // Fetch user info for all employees
    const { data: usersInfo } = useQuery({
        queryKey: ["users-info", employees?.map(e => e.user_id).join(",")],
        // Segurança: só admin busca perfis/roles/emails dos colegas. Sem isto, um
        // membro comum puxava esses dados pela rede antes do guard de render.
        enabled: isAdmin && !!employees && employees.length > 0,
        queryFn: async () => {
            const userIds = employees?.map(e => e.user_id).filter(Boolean) as string[] || [];
            if (userIds.length === 0) return {};

            const results: Record<string, UserInfo> = {};

            // Get auth users info via profiles join
            const { data: profilesData } = await supabase
                .from("profiles")
                .select("user_id, full_name, tenant_id")
                .in("user_id", userIds);

            // Get roles from user_roles table
            const { data: rolesData } = await supabase
                .from("user_roles")
                .select("user_id, role")
                .in("user_id", userIds);

            // Create maps
            const profileMap = new Map((profilesData || []).map(p => [p.user_id, p]));
            const roleMap = new Map((rolesData || []).map(r => [r.user_id, r.role]));

            for (const emp of employees || []) {
                if (!emp.user_id) continue;
                const profile = profileMap.get(emp.user_id);
                results[emp.user_id] = {
                    id: emp.user_id,
                    email: emp.work_email || "",
                    full_name: profile?.full_name || emp.full_name || null,
                    role: roleMap.get(emp.user_id) || "member",
                    tenant_id: profile?.tenant_id || null,
                    last_sign_in_at: null,
                    created_at: null,
                    is_banned: false,
                    banned_until: null,
                    employee_status: emp.status || "active",
                    status_reason: emp.status_reason || null,
                    termination_date: emp.termination_date || null,
                };
            }

            return results;
        },
        staleTime: 1000 * 60 * 2,
    });

    // Merge employees with user info
    const users: UserWithEmployee[] = useMemo(() => {
        if (!employees) return [];
        return employees.map(emp => ({
            ...emp,
            user_info: emp.user_id ? usersInfo?.[emp.user_id] : undefined,
        }));
    }, [employees, usersInfo]);

    // Filter users
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchSearch = !search ||
                user.full_name?.toLowerCase().includes(search.toLowerCase()) ||
                user.work_email?.toLowerCase().includes(search.toLowerCase());

            const matchRole = filterRole === "all" || user.user_info?.role === filterRole;

            let matchStatus = filterStatus === "all";
            if (filterStatus === "active") matchStatus = user.status === "active";
            else if (filterStatus === "inactive") matchStatus = user.status === "inactive";
            else if (filterStatus === "banned") matchStatus = user.user_info?.is_banned === true;

            return matchSearch && matchRole && matchStatus;
        });
    }, [users, search, filterRole, filterStatus]);

    // Selection handlers
    const toggleSelect = (userId: string) => {
        setSelectedUsers(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedUsers.size === filteredUsers.length) {
            setSelectedUsers(new Set());
        } else {
            setSelectedUsers(new Set(filteredUsers.map(u => u.user_id || u.id)));
        }
    };

    const clearSelection = () => setSelectedUsers(new Set());

    // Role counts
    const roleCounts = useMemo(() => {
        const counts = { admin: 0, manager: 0, member: 0 };
        for (const user of users) {
            const role = user.user_info?.role || "member";
            if (role in counts) counts[role as keyof typeof counts]++;
        }
        return counts;
    }, [users]);

    // Handlers
    const handleRoleChange = async (role: "admin" | "manager" | "member") => {
        if (!roleChangeUser?.user_id) return;
        try {
            await updateUserRole.mutateAsync({ userId: roleChangeUser.user_id, role });
            toast.success(`Papel alterado para ${role === "admin" ? "Admin" : role === "manager" ? "Gerente" : "Membro"}`);
            setRoleChangeUser(null);
        } catch (err: any) {
            toast.error(err.message || "Erro ao alterar papel");
        }
    };

    const handleDeleteUser = async (hardDelete: boolean) => {
        if (!deleteUser_?.user_id) return;
        try {
            await deleteUser.mutateAsync({ userId: deleteUser_.user_id, hardDelete });
            toast.success(hardDelete ? "Usuário excluído permanentemente" : "Usuário desativado");
            setDeleteUser(null);
        } catch (err: any) {
            toast.error(err.message || "Erro ao excluir usuário");
        }
    };

    const handleResetPassword = async (user: UserWithEmployee) => {
        if (!user.user_id) return;
        try {
            await resetUserPassword.mutateAsync(user.user_id);
            toast.success("Email de redefinição de senha enviado");
        } catch (err: any) {
            toast.error(err.message || "Erro ao enviar email");
        }
    };

    const handleGenerateTempPassword = async (user: UserWithEmployee) => {
        if (!user.user_id) return;
        try {
            const res = await generateTempPassword.mutateAsync(user.user_id);
            setTempPwResult({ name: user.full_name || "Colaborador", password: res.temp_password });
        } catch (err: any) {
            toast.error(err.message || "Erro ao gerar senha");
        }
    };

    const handleBulkAction = async (action: "ban" | "unban" | "reset_password" | "deactivate") => {
        const userIds = Array.from(selectedUsers);
        let successCount = 0;
        let failCount = 0;

        try {
            if (action === "deactivate") {
                await bulkChangeStatus.mutateAsync({
                    employeeIds: userIds.filter(id => employees?.some(e => e.user_id === id)).map(id => {
                        const emp = employees?.find(e => e.user_id === id);
                        return emp?.id || id;
                    }),
                    newStatus: "inactive",
                    reason: "Desativação em lote via gerenciamento de usuários",
                    banUser: false,
                });
                successCount = userIds.length;
            } else {
                // For ban/unban/reset_password, call manage-access for each user with error tracking
                for (const userId of userIds) {
                    try {
                        const { error } = await supabase.functions.invoke("manage-access", {
                            body: { target_user_id: userId, action },
                        });
                        if (error) {
                            console.error(`Failed to ${action} user ${userId}:`, error);
                            failCount++;
                        } else {
                            successCount++;
                        }
                    } catch (err) {
                        console.error(`Exception during ${action} for user ${userId}:`, err);
                        failCount++;
                    }
                }
            }

            // Show detailed feedback
            if (failCount === 0) {
                toast.success(`${successCount} usuário${successCount !== 1 ? "s" : ""} atualizado${successCount !== 1 ? "s" : ""} com sucesso`);
            } else if (successCount === 0) {
                toast.error(`Falha ao atualizar ${failCount} usuário${failCount !== 1 ? "s" : ""}`);
            } else {
                toast.warning(`${successCount} bem-sucedido${successCount !== 1 ? "s" : ""}, ${failCount} falha${failCount !== 1 ? "s" : ""}`);
            }

            setShowBulkDialog(false);
            clearSelection();
        } catch (err: any) {
            toast.error(err.message || "Erro ao processar ação em lote");
        }
    };

    if (permissionsLoading || isLoading || employees === undefined) {
        return <ListSkeleton columns={1} count={8} />;
    }

    if (!isAdmin) {
        return (
            <div className="flex flex-col gap-6">
                <h1 className="text-h1 font-bold text-foreground">Gerenciamento de Usuários</h1>
                <p className="text-sm text-muted-foreground">Apenas administradores podem acessar esta página.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-h1 font-bold text-foreground">Gerenciamento de Usuários</h1>
                    <p className="text-sm text-muted-foreground">
                        {filteredUsers.length} usuário{filteredUsers.length !== 1 ? "s" : ""}
                        {selectedUsers.size > 0 && ` • ${selectedUsers.size} selecionado${selectedUsers.size !== 1 ? "s" : ""}`}
                    </p>
                </div>
            </div>

            {/* Role counts */}
            <div className="flex items-center gap-2 flex-wrap">
                <Badge
                    variant={filterRole === "all" ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setFilterRole("all")}
                >
                    Todos ({users.length})
                </Badge>
                <Badge
                    variant={filterRole === "admin" ? "default" : "outline"}
                    className="cursor-pointer gap-1"
                    onClick={() => setFilterRole(filterRole === "admin" ? "all" : "admin")}
                >
                    <Crown className="w-3 h-3" /> {roleCounts.admin} Admins
                </Badge>
                <Badge
                    variant={filterRole === "manager" ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setFilterRole(filterRole === "manager" ? "all" : "manager")}
                >
                    {roleCounts.manager} Gerentes
                </Badge>
                <Badge
                    variant={filterRole === "member" ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setFilterRole(filterRole === "member" ? "all" : "member")}
                >
                    {roleCounts.member} Membros
                </Badge>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nome ou email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        <SelectItem value="active">Ativos</SelectItem>
                        <SelectItem value="inactive">Inativos</SelectItem>
                        <SelectItem value="banned">Bloqueados</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Floating bulk action bar */}
            {selectedUsers.size > 0 && (
                <div className="sticky top-2 z-30 flex items-center justify-between px-4 py-3 rounded-lg bg-primary text-primary-foreground shadow-lg animate-fade-in">
                    <span className="text-sm font-medium">
                        {selectedUsers.size} usuário{selectedUsers.size !== 1 ? "s" : ""} selecionado{selectedUsers.size !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setShowBulkDialog(true)}>
                            Ações em Lote
                        </Button>
                        <Button size="sm" variant="ghost" onClick={clearSelection} className="text-primary-foreground hover:text-primary-foreground/80">
                            ✕
                        </Button>
                    </div>
                </div>
            )}

            {/* Table */}
            {!users || users.length === 0 ? (
                <EmptyState
                    icon={<Users className="w-8 h-8 text-muted-foreground" />}
                    title="Nenhum usuário encontrado"
                    description="Os usuários aparecerão aqui quando forem cadastrados."
                />
            ) : filteredUsers.length === 0 ? (
                <EmptyState
                    icon={<Search className="w-8 h-8 text-muted-foreground" />}
                    title="Nenhum resultado encontrado"
                    description="Tente ajustar os filtros ou a busca."
                />
            ) : (
                <Card className="border border-border/60 overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <Checkbox
                                        checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                                        onCheckedChange={toggleSelectAll}
                                        className="ml-2"
                                    />
                                </TableHead>
                                <TableHead>Nome</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Papel</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-10"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredUsers.map((user) => {
                                const isSelected = selectedUsers.has(user.user_id || user.id);
                                const role = user.user_info?.role || "member";

                                return (
                                    <TableRow
                                        key={user.id}
                                        className={cn(isSelected && "bg-primary/5")}
                                    >
                                        <TableCell>
                                            <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={() => toggleSelect(user.user_id || user.id)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                                                    {(user.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{user.full_name || "Sem nome"}</p>
                                                    {user.position_title && (
                                                        <p className="text-xs text-muted-foreground">{user.position_title}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm">{user.work_email || "-"}</span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={role === "admin" ? "default" : role === "manager" ? "secondary" : "outline"}>
                                                {role === "admin" ? "Admin" : role === "manager" ? "Gerente" : "Membro"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={user.status || "active"} size="sm" />
                                        </TableCell>
                                        <TableCell>
                                            <PermissionGuard allow={["admin"]}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setRoleChangeUser(user)}>
                                                            <Shield className="w-4 h-4 mr-2" />
                                                            Alterar Papel
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                                                            <KeyRound className="w-4 h-4 mr-2" />
                                                            Resetar Senha (e-mail)
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleGenerateTempPassword(user)}>
                                                            <KeyRound className="w-4 h-4 mr-2" />
                                                            Gerar senha temporária
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => setDeleteUser(user)}
                                                            className="text-destructive"
                                                        >
                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                            Excluir Usuário
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </PermissionGuard>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Card>
            )}

            {/* Role Change Dialog */}
            <RoleChangeDialog
                open={!!roleChangeUser}
                onOpenChange={(v) => { if (!v) setRoleChangeUser(null); }}
                user={roleChangeUser}
                onConfirm={handleRoleChange}
                isLoading={updateUserRole.isPending}
            />

            {/* Delete User Dialog */}
            <DeleteUserDialog
                open={!!deleteUser_}
                onOpenChange={(v) => { if (!v) setDeleteUser(null); }}
                user={deleteUser_}
                onConfirm={handleDeleteUser}
                isLoading={deleteUser.isPending}
            />

            {/* Bulk Actions Dialog */}
            <BulkActionsDialog
                open={showBulkDialog}
                onOpenChange={setShowBulkDialog}
                selectedCount={selectedUsers.size}
                onConfirm={handleBulkAction}
                isLoading={bulkChangeStatus.isPending}
            />

            {/* Senha temporária gerada */}
            <Dialog open={!!tempPwResult} onOpenChange={(v) => { if (!v) setTempPwResult(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound className="w-4 h-4 text-primary" />
                            Senha temporária
                        </DialogTitle>
                        <DialogDescription>
                            Senha gerada para <strong>{tempPwResult?.name}</strong>. Copie e entregue agora — ela não será exibida novamente.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
                        <code className="flex-1 text-sm font-mono break-all">{tempPwResult?.password}</code>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                                if (!tempPwResult) return;
                                try {
                                    await navigator.clipboard.writeText(tempPwResult.password);
                                    toast.success("Senha copiada");
                                } catch {
                                    toast.error("Não foi possível copiar");
                                }
                            }}
                        >
                            Copiar
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setTempPwResult(null)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
