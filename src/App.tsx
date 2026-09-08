import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { FeatureRoute } from "@/components/auth/FeatureRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

// Lazy-loaded pages for code splitting
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Organograma = lazy(() => import("./pages/Organograma"));
const AreasCargos = lazy(() => import("./pages/AreasCargos"));
const Colaboradores = lazy(() => import("./pages/Colaboradores"));
const Projetos = lazy(() => import("./pages/Projetos"));
const ProjetoDetalhes = lazy(() => import("./pages/ProjetoDetalhes"));
const Processos = lazy(() => import("./pages/Processos"));
const ProcessoDetalhes = lazy(() => import("./pages/ProcessoDetalhes"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Tarefas = lazy(() => import("./pages/Tarefas"));
const TarefasRecorrentes = lazy(() => import("./pages/TarefasRecorrentes"));
const Reunioes = lazy(() => import("./pages/Reunioes"));
const Eventos = lazy(() => import("./pages/Eventos"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Repositorio = lazy(() => import("./pages/Repositorio"));
const DocumentoEditor = lazy(() => import("./pages/DocumentoEditor"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PublicDocument = lazy(() => import("./pages/PublicDocument"));
const Comunicados = lazy(() => import("./pages/Comunicados"));
const Feed = lazy(() => import("./pages/Feed"));
const Chat = lazy(() => import("./pages/Chat"));
const ChatHuddle = lazy(() => import("./pages/ChatHuddle"));
const Plataformas = lazy(() => import("./pages/Plataformas"));
const Mais = lazy(() => import("./pages/Mais"));
const MeetRoom = lazy(() => import("./pages/MeetRoom"));
const MeetGuest = lazy(() => import("./pages/MeetGuest"));

// Defaults do React Query.
//
// Sem `defaultOptions`, a v5 assume `staleTime: 0` + `refetchOnWindowFocus: true`
// para TODA query que não define o seu próprio. Na prática: cada vez que o
// usuário volta para o app (troca de aba no desktop, volta do background no
// celular), toda query montada sem staleTime — chat_channels, chat_unread,
// chat_presence, chat_last_messages, chat_reads, notifications, tasks_unread,
// feed_read, user-role, kanban columns, etc. — refazia a requisição de uma vez.
// É a mesma classe de problema da v8.35.0 (enxurrada de requisições no celular
// do usuário mais extremo da base).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 60s: curto o bastante para que uma navegação normal (montar uma página
      // depois de um minuto) ainda traga dado fresco, e longo o bastante para
      // absorver o vaivém rápido entre telas e o retorno ao app. Não afeta
      // frescor pós-mutação: `invalidateQueries` refaz a query ativa
      // independentemente de staleTime. Também não afeta os hooks que fazem
      // polling — `refetchInterval` dispara independentemente de staleness.
      staleTime: 60_000,
      // Cache mantido 10min após a última tela que o usava desmontar: voltar
      // para uma página visitada há pouco pinta instantâneo em vez de refazer
      // tudo. Acima disso o custo de memória no celular não compensa.
      gcTime: 10 * 60_000,
      // A correção central: o app tem Realtime (chat, feed, aprovações) e
      // polling explícito nos hooks que precisam de frescor. Refazer tudo a
      // cada foco de janela é custo puro.
      refetchOnWindowFocus: false,
      // Reconexão é evento raro e realmente significa "os dados podem ter
      // mudado enquanto eu estava offline" — vale o refetch.
      refetchOnReconnect: true,
      // 3 tentativas com backoff (default) multiplicam a carga justamente
      // quando a rede está ruim. 1 retry cobre o blip e para por aí.
      retry: 1,
    },
    mutations: {
      // Mutação repetida às cegas pode duplicar escrita — falha explícita é melhor.
      retry: 0,
    },
  },
});

// Exceção pontual ao default acima: `useChatMessages` (useChat.ts) usa
// `refetchOnWindowFocus: true` de propósito, para que voltar ao app entregue as
// mensagens na hora. Como ele faz polling de 20s, o dado estaria sempre "fresco"
// sob o staleTime de 60s e o refetch de foco nunca dispararia. Este default por
// chave restaura o `staleTime: 0` só para o chat, sem tocar no hook.
queryClient.setQueryDefaults(["chat_messages"], { staleTime: 0 });

function PageFallback() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

// Destino da raiz "/". No desktop o Dashboard continua sendo a home — é ali que
// os KPIs e a visão de gestão fazem sentido, com a sidebar sempre à vista.
// No celular o app é usado majoritariamente para conversar: cair no Dashboard
// obriga o usuário a um toque extra na BottomNav toda vez que abre o app (e o
// PWA, cujo "start_url" é "/", sofre o mesmo). Por isso o mobile vai direto
// para "/chat".
// Precisa ser um COMPONENTE porque `useIsMobile()` é um hook — não pode ser
// chamado na definição da rota. E o hook já devolve o valor correto no PRIMEIRO
// render (lê `window.innerWidth` no initializer do useState), então não existe
// frame intermediário redirecionando para o destino errado.
function HomeRedirect() {
  const isMobile = useIsMobile();
  return <Navigate to={isMobile ? "/chat" : "/dashboard"} replace />;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/public/docs/:token" element={<PublicDocument />} />
              <Route path="/meet/:roomId/guest" element={<MeetGuest />} />

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                {/* Fullscreen routes (no AppLayout sidebar) */}
                <Route
                  path="/meet/:roomId"
                  element={
                    <FeatureRoute feature="meetings">
                      <MeetRoom />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="/chat/:channelId/huddle"
                  element={
                    <FeatureRoute feature="meetings">
                      <ChatHuddle />
                    </FeatureRoute>
                  }
                />

                <Route element={<AppLayout />}>
                  <Route path="/" element={<HomeRedirect />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/organograma" element={<Organograma />} />
                  <Route path="/areas-cargos" element={<AreasCargos />} />
                  <Route path="/colaboradores" element={<Colaboradores />} />
                  <Route path="/projetos" element={<Projetos />} />
                  <Route path="/projetos/:id" element={<ProjetoDetalhes />} />
                  <Route path="/processos" element={<Processos />} />
                  <Route path="/processos/:id" element={<ProcessoDetalhes />} />
                  <Route path="/documentos" element={<Processos />} />
                  <Route path="/documentos/:id" element={<ProcessoDetalhes />} />
                  <Route path="/tarefas" element={<Tarefas />} />
                  <Route path="/tarefas/recorrentes" element={<TarefasRecorrentes />} />
                  <Route path="/repositorio" element={<Repositorio />} />
                  <Route path="/documento/:id" element={<DocumentoEditor />} />
                  <Route
                    path="/reunioes"
                    element={
                      <FeatureRoute feature="meetings">
                        <Reunioes />
                      </FeatureRoute>
                    }
                  />
                  <Route path="/eventos" element={<Eventos />} />
                  <Route path="/comunicados" element={<Comunicados />} />
                  <Route path="/feed" element={<Feed />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/chat/:channelId" element={<Chat />} />
                  <Route path="/plataformas" element={<Plataformas />} />
                  <Route path="/mais" element={<Mais />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/configuracoes" element={<Configuracoes />} />
                  <Route path="/configuracoes/usuarios" element={<UserManagement />} />
                  <Route path="/api-docs" element={<ApiDocs />} />
                  <Route path="/perfil" element={<Perfil />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
