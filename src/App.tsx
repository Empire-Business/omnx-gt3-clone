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

const queryClient = new QueryClient();

function PageFallback() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
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
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
