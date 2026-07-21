import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./BottomNav";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useNotifications } from "@/hooks/useNotifications";
import { useChatUnread } from "@/hooks/useChat";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { SmartNotificationToaster } from "@/components/shared/SmartNotificationToaster";
import { KeyboardShortcutsDialog } from "@/components/shared/KeyboardShortcuts";
import { ScrollToTop } from "@/components/shared/ScrollToTop";
import { PageTransition } from "@/components/shared/PageTransition";
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { useEmployees } from "@/hooks/useEmployees";
import { PushNotificationOptIn } from "@/components/shared/PushNotificationOptIn";
// useChatPresenceHeartbeat removido — chat refatorado

// Rotas que NÃO mostram o botão voltar em mobile (raízes da BottomNav e fullscreen).
const ROOT_PATHS = ["/dashboard", "/tarefas", "/chat", "/feed", "/projetos", "/mais"];

function MobileBackButton() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isRoot = ROOT_PATHS.some((p) => pathname === p);
  const inFullscreen = /^\/chat\/[^/]+/.test(pathname) || /^\/reunioes\/[^/]+/.test(pathname) || /^\/meet\//.test(pathname);
  if (isRoot || inFullscreen) return null;

  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/mais"))}
      className="md:hidden fixed top-3 left-3 z-30 p-2 rounded-md bg-card shadow-sm border border-border hover:bg-muted transition-colors"
      aria-label="Voltar"
    >
      <ChevronLeft className="w-5 h-5 text-foreground" />
    </button>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const { tenant } = useTenantBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: employees } = useEmployees();
  const { unreadCount } = useNotifications();
  const { data: chatUnreadMap } = useChatUnread();
  const chatUnreadTotal = chatUnreadMap
    ? Array.from(chatUnreadMap.values()).reduce((a, b) => a + b, 0)
    : 0;
  const totalUnread = (unreadCount || 0) + chatUnreadTotal;
  const myEmployeeId = employees?.find((e) => e.user_id === user?.id)?.id ?? null;
  // Heartbeat de presença global (online/offline + last_seen) — Fase 1 v8.2.0
  // (presence heartbeat será reintroduzido no novo Chat)

  // Listen for keyboard navigation events
  useEffect(() => {
    const handler = (e: Event) => {
      const target = (e as CustomEvent).detail;
      if (target) navigate(target);
    };
    window.addEventListener("keyboard-navigate", handler);
    return () => window.removeEventListener("keyboard-navigate", handler);
  }, [navigate]);

  usePageTitle(location.pathname, tenant?.name, totalUnread);

  const isRootPath = ROOT_PATHS.some((p) => location.pathname === p);
  const inFullscreen = /^\/chat\/[^/]+/.test(location.pathname) || /^\/reunioes\/[^/]+/.test(location.pathname) || /^\/meet\//.test(location.pathname);
  const showBack = !isRootPath && !inFullscreen;

  const isChatPage = /^\/chat/.test(location.pathname);

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <AppSidebar tenant={tenant} />
      </div>

      {/* Hamburger removido em mobile — navegação principal via BottomNav */}
      <MobileBackButton />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Content — sem topbar global; cada página renderiza seu próprio header */}
        <main className={cn(
          isChatPage
            ? "flex-1 overflow-hidden p-0 md:px-5 md:py-4 md:pb-4 md:overflow-auto"
            : "flex-1 px-3 py-3 pb-20 md:pb-4 md:px-5 md:py-4 overflow-auto",
          !isChatPage && showBack && "pt-14 md:pt-4"
        )}>
          <ScrollToTop />
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <PageTransition key={location.pathname}>
                <Outlet />
              </PageTransition>
            </AnimatePresence>
          </ErrorBoundary>
        </main>
      </div>

      <BottomNav />
      <GlobalSearch />
      <KeyboardShortcutsDialog />
      <SmartNotificationToaster />
      <PushNotificationOptIn />
    </div>
  );
}
