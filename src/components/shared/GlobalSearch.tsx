import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Network,
  Building2,
  Users,
  FolderKanban,
  FileText,
  CheckSquare,
  Settings,
  User,
  BookOpen,
  Search,
} from "lucide-react";
import { useEmployees } from "@/hooks/useEmployees";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { useProcesses } from "@/hooks/useProcesses";
import { usePermissions } from "@/hooks/usePermissions";

const pages = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard", keywords: "início home métricas" },
  { label: "Organograma", icon: Network, to: "/organograma", keywords: "hierarquia estrutura" },
  { label: "Áreas e Cargos", icon: Building2, to: "/areas-cargos", keywords: "departamentos subáreas" },
  { label: "Colaboradores", icon: Users, to: "/colaboradores", keywords: "funcionários equipe rh" },
  { label: "Projetos", icon: FolderKanban, to: "/projetos", keywords: "gestão projeto" },
  { label: "Processos", icon: FileText, to: "/processos", keywords: "fluxo etapas" },
  { label: "Tarefas", icon: CheckSquare, to: "/tarefas", keywords: "kanban board" },
  { label: "Configurações", icon: Settings, to: "/configuracoes", keywords: "admin roles", adminOnly: true },
  { label: "Meu Perfil", icon: User, to: "/perfil", keywords: "conta avatar nome" },
  { label: "FAQ & Tutoriais", icon: BookOpen, to: "/faq", keywords: "ajuda documentação" },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();

  // Data hooks - only fetch when dialog is open for performance
  const { data: employees } = useEmployees();
  const { data: projects } = useProjects();
  const { data: tasks } = useTasks();
  const { data: processes } = useProcesses();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const employeeItems = useMemo(() =>
    (employees || []).slice(0, 8).map((e) => ({
      label: e.full_name || "Sem nome",
      sublabel: e.position_title || "",
      to: "/colaboradores",
      id: e.id,
    })), [employees]);

  const projectItems = useMemo(() =>
    (projects || []).slice(0, 8).map((p: any) => ({
      label: p.name,
      sublabel: p.status || "",
      to: `/projetos/${p.project_id || p.id}`,
      id: p.project_id || p.id,
    })), [projects]);

  const taskItems = useMemo(() =>
    (tasks || []).slice(0, 8).map((t) => ({
      label: t.title,
      sublabel: t.status || "",
      to: "/tarefas",
      id: t.id,
    })), [tasks]);

  const processItems = useMemo(() =>
    (processes || []).slice(0, 8).map((p: any) => ({
      label: p.name,
      sublabel: p.status || "",
      to: `/processos/${p.process_id || p.id}`,
      id: p.process_id || p.id,
    })), [processes]);

  const visiblePages = useMemo(
    () => pages.filter((page) => !page.adminOnly || isAdmin),
    [isAdmin]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar páginas, colaboradores, projetos, tarefas..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Páginas">
          {visiblePages.map((page) => (
            <CommandItem
              key={page.to}
              value={`${page.label} ${page.keywords}`}
              onSelect={() => handleSelect(page.to)}
            >
              <page.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{page.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {employeeItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Colaboradores">
              {employeeItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`colaborador ${item.label} ${item.sublabel}`}
                  onSelect={() => handleSelect(item.to)}
                >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                  {item.sublabel && (
                    <span className="ml-2 text-xs text-muted-foreground">{item.sublabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {projectItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projetos">
              {projectItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`projeto ${item.label} ${item.sublabel}`}
                  onSelect={() => handleSelect(item.to)}
                >
                  <FolderKanban className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                  {item.sublabel && (
                    <span className="ml-2 text-xs text-muted-foreground capitalize">{item.sublabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {processItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Processos">
              {processItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`processo ${item.label} ${item.sublabel}`}
                  onSelect={() => handleSelect(item.to)}
                >
                  <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                  {item.sublabel && (
                    <span className="ml-2 text-xs text-muted-foreground capitalize">{item.sublabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {taskItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tarefas">
              {taskItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`tarefa ${item.label} ${item.sublabel}`}
                  onSelect={() => handleSelect(item.to)}
                >
                  <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                  {item.sublabel && (
                    <span className="ml-2 text-xs text-muted-foreground capitalize">{item.sublabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
