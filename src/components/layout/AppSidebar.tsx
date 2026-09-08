import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";
import { OmnxLockup } from "@/components/shared/OmnxLockup";
import {
  LayoutDashboard,
  Network,
  Building2,
  Users,
  FolderKanban,
  FileText,
  CheckSquare,
  Repeat,
  Video,
  LogOut,
  ChevronDown,
  Settings,
  User,
  BookOpen,
  UserCog,
  Library,
  Megaphone,
  PartyPopper,
  Rss,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Monitor,
  Sun,
  Moon,
  ChevronRight,
  Plus,
  StickyNote,
  Check,
  Lock,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeedUnreadCount } from "@/hooks/useFeed";
import { useTasksUnreadCount } from "@/hooks/useNotifications";
import { useChatUnreadTotal } from "@/hooks/useChat";
import { useProjects } from "@/hooks/useProjects";
import { useEmployees } from "@/hooks/useEmployees";
import { useIntegrations, type FeatureKey } from "@/hooks/useIntegrations";
import { useTheme } from "@/hooks/useTheme";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getInitials } from "@/lib/avatar-initials";
import { toast } from "sonner";
import { normalizeSupabaseAssetUrl } from "@/integrations/supabase/config";
import { NotificationsPopover } from "@/components/shared/NotificationsPopover";
import { ChatQuickPopover } from "@/components/shared/ChatQuickPopover";

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  to: string;
  adminOnly?: boolean;
  /** Some do menu quando a integração correspondente não está conectada (fail-open). */
  feature?: FeatureKey;
};

const navItems: { section: string; items: NavItem[] }[] = [
  {
    section: "PRINCIPAL",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
      { label: "Tarefas", icon: CheckSquare, to: "/tarefas" },
      { label: "Agenda Semanal", icon: Repeat, to: "/tarefas/recorrentes" },
      { label: "Chat", icon: MessageSquare, to: "/chat" },
      { label: "Processos", icon: FileText, to: "/processos" },
    ],
  },
  {
    section: "COMUNICAÇÃO",
    items: [
      { label: "Feed", icon: Rss, to: "/feed" },
      { label: "Reuniões", icon: Video, to: "/reunioes", feature: "meetings" },
      { label: "Eventos", icon: PartyPopper, to: "/eventos" },
      { label: "Comunicados", icon: Megaphone, to: "/comunicados" },
    ],
  },
  {
    section: "GESTÃO",
    items: [
      { label: "Projetos", icon: FolderKanban, to: "/projetos" },
      { label: "Colaboradores", icon: Users, to: "/colaboradores" },
      { label: "Repositório", icon: Library, to: "/repositorio" },
      { label: "Organograma", icon: Network, to: "/organograma" },
      { label: "Áreas e Cargos", icon: Building2, to: "/areas-cargos" },
      { label: "Plataformas", icon: Monitor, to: "/plataformas" },
    ],
  },
];

/** Recorte mínimo do PostgrestFilterBuilder para filtrar por uma coluna que
 *  ainda não existe em `types.ts` (`parent_task_id`), sem recorrer a `any`. */
interface OpenTaskCountFilter {
  is(
    column: string,
    value: null
  ): PromiseLike<{
    data: { project_id: string | null }[] | null;
    error: { message: string } | null;
  }>;
}

interface AppSidebarProps {
  onNavigate?: () => void;
  tenant?: {
    name: string;
    logo_url: string | null;
  } | null;
}

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

// Fonte da palavra do produto no seletor de hub (próxima da wordmark OMNX).
const HUB_FONT =
  "'Chakra Petch','Space Grotesk','Segoe UI',system-ui,sans-serif";

export function AppSidebar({ onNavigate, tenant }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navItems.map((g) => [g.section, true]))
  );
  const { signOut, user, profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const { isAdmin, isManager, loading: permissionsLoading } = usePermissions();
  const { isActive: isFeatureActive } = useIntegrations();
  const { count: feedUnread } = useFeedUnreadCount();
  const { count: tasksUnread } = useTasksUnreadCount();
  const chatUnread = useChatUnreadTotal(); // já exclui conversas silenciadas
  const { theme, toggleTheme } = useTheme();
  const { data: projectsData } = useProjects();
  // ATENÇÃO: este `useEmployees()` JÁ NÃO É de graça. Até 2026-08-31 o
  // `usePermissions()` (acima) montava a mesma query e o React Query deduplicava
  // pela queryKey — o comentário antigo dizia isso e estava certo na época.
  // Agora o `usePermissions` busca só a própria linha (`id, is_ceo`), porque
  // carregar os 39 colaboradores do tenant com os subselects de contagem da
  // `organograma_view` para ler UM booleano era custo global: o hook é usado em
  // 25+ arquivos.
  // Consequência: a lista inteira volta a custar 4 requisições, e aqui ela serve
  // só para achar o próprio `employee_id`. Trocar por `usePermissions().myEmployeeId`
  // (já exposto) elimina isso — a única diferença é que ele resolve apenas para
  // colaborador ATIVO, então precisa de uma conferida nos fluxos antes.
  const { data: employeesData } = useEmployees();
  const myEmployeeId = (employeesData || []).find((e) => e.user_id === user?.id)?.id ?? null;
  const projectsCanManage = isAdmin || isManager;
  const recentProjects = useMemo(
    () =>
      (projectsData || [])
        .filter((p) => p.status === "active" || p.status === "planning")
        .filter((p) => {
          // Admin/manager veem todos; demais veem só os que participam
          if (projectsCanManage) return true;
          if (!myEmployeeId) return false;
          const isMember = (p.members || []).some((m) => m.employee_id === myEmployeeId);
          const isOwner = p.created_by === user?.id;
          return isMember || isOwner;
        })
        .sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at || 0).getTime() -
            new Date(a.updated_at || a.created_at || 0).getTime()
        )
        .slice(0, 6),
    [projectsData, projectsCanManage, myEmployeeId, user?.id]
  );
  const recentProjectIds = useMemo(
    () => recentProjects.map((p) => p.id),
    [recentProjects]
  );

  // Contagem de tarefas abertas por projeto exibido na sidebar.
  //
  // Antes isto vinha de `useTasks()`, que baixa TODAS as tarefas do tenant e
  // ainda dispara 4 buscas de hidratação em batch (organograma_view, projects,
  // task_assignees, task_recurrence) — cinco requisições e um payload grande,
  // em toda página, só para somar um número ao lado de no máximo 6 projetos.
  // É o mesmo erro estrutural corrigido na v8.35.0.
  //
  // Agora: uma única requisição, uma coluna, restrita aos projetos visíveis e
  // já filtrada no servidor com os MESMOS critérios de antes (não concluída e
  // sem subtarefas), então o número exibido continua idêntico.
  const { data: projectTaskCounts } = useQuery({
    // Prefixo ["tasks", tenantId, ...] de propósito: todas as mutações de
    // tarefa já invalidam `["tasks", tenantId]`, então o contador continua
    // atualizando na hora ao criar/mover/concluir uma tarefa — exatamente como
    // acontecia quando ele vinha de `useTasks()`.
    queryKey: ["tasks", tenantId, "sidebar-open-counts", recentProjectIds],
    enabled: !!tenantId && recentProjectIds.length > 0,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const builder = supabase
        .from("tasks")
        .select("project_id")
        .eq("tenant_id", tenantId!)
        .in("project_id", recentProjectIds)
        .neq("status", "done");
      // `parent_task_id` ainda não existe em types.ts (gerado antes da coluna),
      // então o filtro final passa por uma interface mínima em vez de `any`.
      const { data, error } = await (
        builder as unknown as OpenTaskCountFilter
      ).is("parent_task_id", null);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const t of data || []) {
        if (t.project_id) out[t.project_id] = (out[t.project_id] || 0) + 1;
      }
      return out;
    },
  });

  const isActive = (to: string) => {
    if (to === "/dashboard") return location.pathname === "/dashboard" || location.pathname === "/";
    return location.pathname.startsWith(to);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/auth");
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
    }
  };

  const handleNav = () => {
    onNavigate?.();
  };

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const tenantName = tenant?.name ?? BRAND.appName;
  // Nome curto (sem o prefixo "OMNX ") para exibição no seletor de hub.
  const stripOmnx = (n: string) => n.replace(/^OMNX\s+/i, "").trim() || n;
  const shortAppName = stripOmnx(BRAND.appName);
  const userName = profile?.full_name ?? user?.email?.split("@")[0] ?? "Usuário";
  const userEmail = user?.email ?? "";
  const userAvatar = normalizeSupabaseAssetUrl(profile?.avatar_url ?? null);
  const userRole = isAdmin ? "Administrador" : isManager ? "Gestor" : "Colaborador";
  const userInitials = getInitials(userName);

  // Filtra grupos visíveis e detecta o último para suprimir divider
  const visibleGroups = navItems
    .map((g) => ({
      ...g,
      visibleItems: g.items.filter(
        (i) =>
          (!i.adminOnly || (!permissionsLoading && isAdmin)) &&
          (!i.feature || isFeatureActive(i.feature))
      ),
    }))
    .filter((g) => g.visibleItems.length > 0);

  return (
    <TooltipProvider delayDuration={250}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-sidebar border-r border-sidebar-border sticky top-0 transition-[width] duration-300 z-30",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Faixa de marca OMNX */}
        <div
          className={cn(
            "flex items-center pt-3.5 pb-3",
            // Recolhida: centralizada (a faixa é estreita). Expandida: alinhada
            // à esquerda, acompanhando o alinhamento dos itens do menu.
            collapsed ? "justify-center px-2" : "justify-start px-3"
          )}
        >
          <OmnxLockup height={collapsed ? 24 : 32} showWord={false} />
        </div>

        {/* Workspace card — GT3 */}
        <div className={cn("px-3 pt-2.5 pb-2", collapsed && "px-2")}>
          <div className={cn("flex items-center gap-2", collapsed && "flex-col gap-2")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-2 flex-1 min-w-0 rounded-[7px] bg-card shadow-[var(--shadow-sm)] py-[7px] px-[9px] hover:bg-muted/40 transition-colors text-left",
                    collapsed && "justify-center w-full"
                  )}
                >
                  <span
                    className="flex-1 min-w-0 truncate text-sidebar-foreground font-bold uppercase leading-none text-[15px]"
                    style={{ fontFamily: HUB_FONT, letterSpacing: "0.12em" }}
                  >
                    {shortAppName}
                  </span>
                  {!collapsed && (
                    <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="bottom" className="w-60">
                <DropdownMenuLabel className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide">
                  Trocar de hub
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="gap-2.5 py-2 opacity-100 focus:bg-muted/40">
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[13px] font-bold uppercase text-foreground leading-none" style={{ fontFamily: HUB_FONT, letterSpacing: "0.1em" }}>{shortAppName}</span>
                    <span className="text-[10.5px] text-muted-foreground leading-tight truncate mt-1">Gestão de times e projetos</span>
                  </div>
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { window.location.href = "https://desk.omnx.pro"; }}
                  className="gap-2.5 py-2 cursor-pointer"
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[13px] font-bold uppercase text-foreground leading-none" style={{ fontFamily: HUB_FONT, letterSpacing: "0.1em" }}>Desk</span>
                    <span className="text-[10.5px] text-muted-foreground leading-tight truncate mt-1">Atendimento ao cliente</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="gap-2.5 py-2">
                  <div className="flex flex-col flex-1 min-w-0 opacity-60">
                    <span className="text-[13px] font-bold uppercase text-foreground leading-none" style={{ fontFamily: HUB_FONT, letterSpacing: "0.1em" }}>CRM</span>
                    <span className="text-[10.5px] text-muted-foreground leading-tight truncate mt-1">Em breve</span>
                  </div>
                  <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!onNavigate && !collapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCollapsed((c) => !c)}
                    className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Recolher sidebar"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
              </Tooltip>
            )}
            {!onNavigate && collapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCollapsed((c) => !c)}
                    className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Expandir sidebar"
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expandir sidebar</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {visibleGroups.map((group, groupIdx) => {
            const sectionOpen = openSections[group.section] ?? true;
            const isLastGroup = groupIdx === visibleGroups.length - 1;

            return (
              <div key={group.section} className="mb-2">
                {/* Section header — GT3 */}
                {!collapsed && (
                  <div className="flex items-center justify-between px-2.5 mb-1 mt-3.5">
                    <button
                      onClick={() => toggleSection(group.section)}
                      className="flex items-center gap-1 group cursor-pointer"
                    >
                      <ChevronDown
                        className={cn(
                          "w-[11px] h-[11px] text-muted-foreground/60 transition-transform duration-200",
                          !sectionOpen && "-rotate-90"
                        )}
                      />
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.04em] group-hover:text-foreground transition-colors">
                        {group.section}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => toast.info("Adicionar item à seção em breve")}
                      className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded hover:bg-sidebar-accent transition-colors"
                      title="Adicionar"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {(sectionOpen || collapsed) && (
                  <ul className="flex flex-col gap-px">
                    {group.visibleItems.map((item) => {
                      const active = isActive(item.to);
                      const unread =
                        item.to === "/feed"
                          ? feedUnread
                          : item.to === "/chat"
                          ? chatUnread
                          : item.to === "/tarefas"
                          ? tasksUnread
                          : 0;
                      const hasUnread = unread > 0;
                      const badgeColor =
                        item.to === "/feed"
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-primary text-primary-foreground";

                      const link = (
                        <Link
                          to={item.to}
                          onClick={handleNav}
                          className={cn(
                            "relative flex items-center gap-[9px] rounded-md text-[13px] min-h-[30px]",
                            "transition-colors duration-100",
                            collapsed
                              ? "justify-center px-2 py-2"
                              : "px-2.5 py-1.5",
                            active
                              ? "bg-primary-light text-primary font-semibold"
                              : "text-sidebar-foreground font-[450] hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                          )}
                        >
                          <item.icon
                            className={cn(
                              "flex-shrink-0 w-[15px] h-[15px] transition-colors",
                              active ? "text-primary" : "text-muted-foreground"
                            )}
                          />
                          {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                          {/* Badge unread (expandida) — GT3: chip neutro fg-subtle bg-subtle */}
                          {!collapsed && hasUnread && (
                            <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-[5px] rounded-[4px] leading-[1.4]">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                          {/* Badge unread (colapsada) */}
                          {collapsed && hasUnread && (
                            <span
                              className={cn(
                                "absolute top-1 right-1 w-4 h-4 rounded-full text-2xs flex items-center justify-center font-bold leading-none",
                                badgeColor
                              )}
                            >
                              {unread > 9 ? "9+" : unread}
                            </span>
                          )}
                        </Link>
                      );

                      return (
                        <li key={item.to}>
                          {collapsed ? (
                            <Tooltip>
                              <TooltipTrigger asChild>{link}</TooltipTrigger>
                              <TooltipContent side="right" className="flex items-center gap-2">
                                <span>{item.label}</span>
                                {hasUnread && (
                                  <span
                                    className={cn(
                                      "min-w-[18px] h-[18px] rounded-full text-2xs flex items-center justify-center font-bold px-1 leading-none",
                                      badgeColor
                                    )}
                                  >
                                    {unread > 99 ? "99+" : unread}
                                  </span>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            link
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Sem divider entre seções — separação por espaço apenas */}

                {/* C — Seção dinâmica de Projetos (após PRINCIPAL) — GT3 */}
                {!collapsed && group.section === "PRINCIPAL" && recentProjects.length > 0 && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between px-2.5 mb-1 mt-3.5">
                      <button
                        onClick={() => toggleSection("PROJETOS_DYN")}
                        className="flex items-center gap-1 group cursor-pointer"
                      >
                        <ChevronDown
                          className={cn(
                            "w-[11px] h-[11px] text-muted-foreground/60 transition-transform duration-200",
                            !(openSections["PROJETOS_DYN"] ?? true) && "-rotate-90"
                          )}
                        />
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.04em] group-hover:text-foreground transition-colors">
                          PROJETOS
                        </p>
                      </button>
                      {projectsCanManage && (
                        <button
                          onClick={() => navigate("/projetos")}
                          className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded hover:bg-sidebar-accent transition-colors"
                          title="Novo projeto"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {(openSections["PROJETOS_DYN"] ?? true) && (
                      <ul className="flex flex-col gap-px">
                        {recentProjects.map((p) => {
                          const active = location.pathname === `/projetos/${p.id}`;
                          const taskCount = projectTaskCounts?.[p.id] || 0;
                          return (
                            <li key={p.id}>
                              <Link
                                to={`/projetos/${p.id}`}
                                onClick={handleNav}
                                className={cn(
                                  "relative flex items-center gap-[9px] rounded-md text-[13px] min-h-[30px] px-2.5 py-1.5",
                                  "transition-colors duration-100",
                                  active
                                    ? "bg-primary-light text-primary font-semibold"
                                    : "text-sidebar-foreground font-[450] hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                                )}
                              >
                                <CheckSquare className={cn("w-[15px] h-[15px] flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                                <span className="truncate flex-1">{p.name}</span>
                                {taskCount > 0 && (
                                  <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-[5px] rounded-[4px] leading-[1.4] tabular-nums">
                                    {taskCount}
                                  </span>
                                )}
                              </Link>
                            </li>
                          );
                        })}
                        <li>
                          <button
                            onClick={() => { navigate("/projetos"); handleNav(); }}
                            className="w-full flex items-center gap-[9px] rounded-md text-[13px] min-h-[30px] px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors font-[450]"
                          >
                            <Plus className="w-[15px] h-[15px] flex-shrink-0" />
                            <span>Novo projeto</span>
                          </button>
                        </li>
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Linha de utilitários: sino + chat + tema */}
        <div className={cn(
          "px-2 py-1.5 flex items-center gap-1",
          collapsed && "flex-col"
        )}>
          <NotificationsPopover />
          <ChatQuickPopover collapsed={collapsed} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? "right" : "top"}>
              {theme === "dark" ? "Tema claro" : "Tema escuro"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Footer com avatar + dropdown */}
        <div className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-2 rounded-md p-2 transition-colors cursor-pointer",
                  "hover:bg-sidebar-accent/60 text-sidebar-foreground"
                )}
                aria-label="Menu do usuário"
              >
                <Avatar className="h-[26px] w-[26px] flex-shrink-0">
                  <AvatarImage src={userAvatar ?? undefined} alt={userName} />
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                    {userInitials || <User className="h-3 w-3" />}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[12.5px] font-semibold truncate leading-tight">{userName}</p>
                      <p className="text-[10.5px] text-muted-foreground truncate leading-tight">{userRole} · {tenantName}</p>
                    </div>
                    <Settings className="w-[15px] h-[15px] text-muted-foreground flex-shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={collapsed ? "right" : "top"}
              align="end"
              sideOffset={8}
              className="w-60"
            >
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-semibold truncate">{userName}</span>
                  <span className="text-2xs text-muted-foreground truncate font-normal">
                    {userEmail}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/perfil")} className="cursor-pointer">
                <User className="w-3.5 h-3.5 mr-2" /> Meu perfil
              </DropdownMenuItem>
              {/* Aberto a todos: a aba "Notificações" de /configuracoes é do
                  usuário, não de admin. As abas administrativas seguem
                  condicionadas ao papel dentro da própria página. */}
              <DropdownMenuItem
                onClick={() => navigate("/configuracoes")}
                className="cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 mr-2" /> Configurações
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem
                  onClick={() => navigate("/configuracoes/usuarios")}
                  className="cursor-pointer"
                >
                  <UserCog className="w-3.5 h-3.5 mr-2" /> Gerenciar usuários
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate("/faq")} className="cursor-pointer">
                <BookOpen className="w-3.5 h-3.5 mr-2" /> FAQ & Tutoriais
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                {theme === "dark" ? (
                  <>
                    <Sun className="w-3.5 h-3.5 mr-2" /> Tema claro
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 mr-2" /> Tema escuro
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="w-3.5 h-3.5 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
