import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./BottomNav";
import { ChevronLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useNotifications } from "@/hooks/useNotifications";
import { useChatUnreadTotal } from "@/hooks/useChat";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { SmartNotificationToaster } from "@/components/shared/SmartNotificationToaster";
import { KeyboardShortcutsDialog } from "@/components/shared/KeyboardShortcuts";
import { ScrollToTop } from "@/components/shared/ScrollToTop";
import { PageTransition } from "@/components/shared/PageTransition";
import { useLivePathname } from "@/hooks/useLivePathname";
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { PushNotificationOptIn } from "@/components/shared/PushNotificationOptIn";
import { BirthDateGate } from "@/components/shared/BirthDateGate";
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
  const { tenant } = useTenantBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { unreadCount } = useNotifications();
  // Desconta conversas silenciadas — o título da aba não deve piscar por
  // canal mutado.
  const chatUnreadTotal = useChatUnreadTotal();
  const totalUnread = (unreadCount || 0) + chatUnreadTotal;
  // `useEmployees()` foi removido daqui: carregava a lista inteira de
  // colaboradores do tenant (com joins de perfil, cargo e área) só para
  // calcular um `myEmployeeId` que NÃO era usado em lugar nenhum — query cara
  // rodando em toda página e resultado descartado.
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

  // Layout le o pathname REAL: o Chat troca de conversa com replaceState, que
  // o router nao enxerga (ver useLivePathname). Sem isso, dentro da conversa o
  // layout continuava tratando a tela como a LISTA de conversas.
  const livePathname = useLivePathname();

  const isRootPath = ROOT_PATHS.some((p) => livePathname === p);
  const inFullscreen = /^\/chat\/[^/]+/.test(livePathname) || /^\/reunioes\/[^/]+/.test(livePathname) || /^\/meet\//.test(livePathname);
  const showBack = !isRootPath && !inFullscreen;

  const isChatPage = /^\/chat/.test(livePathname);

  // A BottomNav é `fixed bottom-0` e some dentro de uma conversa (ver
  // BottomNav.tsx: `inChatConversation`). Ou seja: ela flutua POR CIMA do
  // <main> exatamente nas mesmas condições em que `inFullscreen` é falso.
  // Nas páginas comuns isso já era compensado pelo `pb-20` do <main>, mas a
  // variante de chat usava `p-0` sem nenhum respiro — o resultado é a lista de
  // conversas terminando debaixo da barra, com as últimas conversas
  // inalcançáveis. Reservamos aqui a altura real da nav: os 56px de
  // `min-h-[56px]` dos itens + o `env(safe-area-inset-bottom)` que a própria
  // nav aplica (iPhone com notch). Nada de número mágico solto.
  const bottomNavVisible = isMobile && !inFullscreen;

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden">
      {/* Desktop sidebar.
          Renderizada só fora do mobile — antes ficava apenas escondida por CSS
          (`hidden md:block`), o que faz o React MONTAR o componente e executar
          todos os hooks dele (useEmployees, contadores de feed/tarefas/chat)
          no celular, para uma barra que nem aparece. */}
      {!isMobile && (
        <div className="hidden md:block">
          <AppSidebar tenant={tenant} />
        </div>
      )}

      {/* Hamburger removido em mobile — navegação principal via BottomNav */}
      <MobileBackButton />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Content — sem topbar global; cada página renderiza seu próprio header */}
        <main className={cn(
          isChatPage
            // `[&>div]:h-full` NÃO é enfeite: entre o <main> e a raiz do Chat
            // existe o motion.div do PageTransition, que não tem altura
            // própria. Sem esta linha, o `h-full` da raiz do Chat resolve
            // contra `auto` e vira altura automática — o container cresce com o
            // histórico da conversa, a sidebar de contatos perde o limite do
            // `overflow-y-auto` e as duas colunas passam a rolar juntas, sem
            // fim. Foi exatamente a regressão da v8.41.0.
            ? "flex-1 min-h-0 overflow-hidden p-0 md:px-5 md:py-4 md:pb-4 md:overflow-hidden [&>div]:h-full"
            : "flex-1 px-3 py-3 pb-20 md:pb-4 md:px-5 md:py-4 overflow-auto",
          !isChatPage && showBack && "pt-14 md:pt-4",
          // Chat na LISTA de conversas (mobile, fora de /chat/:id): encolhe a
          // área útil pela altura da BottomNav.
          // 56px é a altura real declarada nos itens da nav
          // (`min-h-[56px]`, BottomNav.tsx:71) + a mesma safe-area que ela usa.
          // Funciona porque a raiz do Chat é `h-full` e resolve contra a área de
          // conteúdo do <main>, que já desconta este padding.
          isChatPage && bottomNavVisible && "pb-[calc(56px+env(safe-area-inset-bottom))]"
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
      {/* Captura obrigatória da data de nascimento — some assim que preenchida. */}
      <BirthDateGate />
    </div>
  );
}
