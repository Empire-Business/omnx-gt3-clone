import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { BRAND } from "@/config/brand";
import {
  Repeat, FileText, Video, Megaphone, Users, Library, Network, Building2,
  Monitor, Settings, User, HelpCircle, LogOut, ChevronRight, Download,
  Share, SquarePlus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getInitials } from "@/lib/avatar-initials";
import { normalizeSupabaseAssetUrl } from "@/integrations/supabase/config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function usePwaInstall() {
  const [prompt, setPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    const handler = (e: Event) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt) return false;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPrompt(null);
    return outcome === "accepted";
  };

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());

  return { prompt, install, installed, isIos };
}

type Item = { label: string; icon: typeof Settings; to: string; adminOnly?: boolean };
type Group = { section: string; items: Item[] };

const groups: Group[] = [
  {
    section: "Trabalho",
    items: [
      { label: "Agenda Semanal", icon: Repeat, to: "/tarefas/recorrentes" },
      { label: "Processos", icon: FileText, to: "/processos" },
      { label: "Reuniões", icon: Video, to: "/reunioes" },
      { label: "Comunicados", icon: Megaphone, to: "/comunicados" },
    ],
  },
  {
    section: "Gestão",
    items: [
      { label: "Colaboradores", icon: Users, to: "/colaboradores" },
      { label: "Repositório", icon: Library, to: "/repositorio" },
      { label: "Organograma", icon: Network, to: "/organograma" },
      { label: "Áreas e Cargos", icon: Building2, to: "/areas-cargos" },
      { label: "Plataformas", icon: Monitor, to: "/plataformas" },
    ],
  },
  {
    section: "Conta",
    items: [
      { label: "Meu Perfil", icon: User, to: "/perfil" },
      { label: "Configurações", icon: Settings, to: "/configuracoes" },
      { label: "FAQ", icon: HelpCircle, to: "/faq" },
    ],
  },
];

export default function Mais() {
  const { user, profile } = useAuth();
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const { prompt, install, installed, isIos } = usePwaInstall();
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  const userName = profile?.full_name ?? user?.email?.split("@")[0] ?? "Usuário";
  const userEmail = user?.email ?? "";
  const userAvatar = normalizeSupabaseAssetUrl(profile?.avatar_url ?? null);
  const userRole = isAdmin ? "Administrador" : "Colaborador";

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (e) {
      toast.error("Erro ao sair");
    }
  };

  const showInstallCard = !installed && (!!prompt || isIos);

  return (
    <div className="md:hidden flex flex-col gap-5 -mx-3 -my-3 p-4 pb-24 min-h-screen bg-muted/20">
      {/* Cabeçalho do perfil */}
      <Link
        to="/perfil"
        className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border shadow-sm"
      >
        <Avatar className="w-14 h-14">
          {userAvatar && <AvatarImage src={userAvatar} alt={userName} />}
          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
            {getInitials(userName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{userName}</p>
          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          <p className="text-2xs text-primary font-medium uppercase tracking-wide mt-0.5">
            {userRole}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      </Link>

      {/* Card de instalação PWA */}
      {showInstallCard && (
        <button
          type="button"
          onClick={() => isIos ? setIosSheetOpen(true) : install()}
          className="flex items-center gap-3 p-4 rounded-2xl bg-primary/10 border border-primary/20 text-left hover:bg-primary/15 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <SquarePlus className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Instalar aplicativo</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isIos ? "Adicione à tela inicial pelo Safari" : "Instale para acesso rápido sem o navegador"}
            </p>
          </div>
          {isIos ? (
            <Share className="w-5 h-5 text-primary flex-shrink-0" />
          ) : (
            <Download className="w-5 h-5 text-primary flex-shrink-0" />
          )}
        </button>
      )}

      {/* Grupos */}
      {groups.map((group) => (
        <section key={group.section}>
          <h2 className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
            {group.section}
          </h2>
          <div className="rounded-2xl bg-card border border-border overflow-hidden divide-y divide-border">
            {group.items
              .filter((i) => !i.adminOnly || isAdmin)
              .map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon className="w-[18px] h-[18px] text-foreground" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                );
              })}
          </div>
        </section>
      ))}

      {/* Sair */}
      <button
        onClick={handleLogout}
        className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-card border border-border text-destructive font-medium text-sm hover:bg-destructive/5 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sair
      </button>

      <p className="text-center text-2xs text-muted-foreground pb-2">
        {BRAND.appName}
      </p>

      {/* Instruções iOS */}
      <Sheet open={iosSheetOpen} onOpenChange={setIosSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-10">
          <SheetHeader className="mb-4">
            <SheetTitle>Instalar no iPhone / iPad</SheetTitle>
          </SheetHeader>
          <ol className="flex flex-col gap-4 text-sm text-foreground">
            <li className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-primary-foreground font-semibold text-xs">1</div>
              <span>Toque no ícone de <strong>Compartilhar</strong> <Share className="inline w-4 h-4 align-middle" /> na barra inferior do Safari.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-primary-foreground font-semibold text-xs">2</div>
              <span>Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-primary-foreground font-semibold text-xs">3</div>
              <span>Confirme tocando em <strong>"Adicionar"</strong> no canto superior direito.</span>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground mt-5">
            Disponível no Safari no iOS 16.4 ou superior.
          </p>
        </SheetContent>
      </Sheet>
    </div>
  );
}
