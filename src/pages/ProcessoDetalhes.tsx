import { useState, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, FileText, GitBranch, Sparkles, RefreshCw, Pencil, Save,
  Eye, Edit3, Building2, Users, Briefcase, Download, Paperclip, StickyNote,
  Share2, MoreHorizontal, MessageSquare, ChevronDown, ChevronRight, Settings2
} from "lucide-react";
import { useProcesses, useProcess } from "@/hooks/useProcesses";
import { useEmployees } from "@/hooks/useEmployees";
import { useProcessComments } from "@/hooks/useProcessComments";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { PermissionGuard } from "@/components/permissions/PermissionGuard";
import { MarkdownViewer } from "@/components/shared/MarkdownViewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DetailSkeleton } from "@/components/shared/SmartSkeleton";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { FlowData } from "@/components/processes/ProcessFlow";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

// Lazy: @xyflow/react é pesado (~500KB). Só carrega quando a aba/dialog for aberto.
const ProcessFlow = lazy(() => import("@/components/processes/ProcessFlow"));
const ProcessMarkdownEditor = lazy(() => import("@/components/processes/ProcessMarkdownEditor"));
const ProcessAttachments = lazy(() => import("@/components/processes/ProcessAttachments").then(m => ({ default: m.ProcessAttachments })));
const ProcessResponsaveisTab = lazy(() => import("@/components/processes/ProcessResponsaveisTab").then(m => ({ default: m.ProcessResponsaveisTab })));
const ExportDialog = lazy(() => import("@/components/processes/ExportDialog").then(m => ({ default: m.ExportDialog })));
const DiagramViewer = lazy(() => import("@/components/processes/DiagramViewer").then(m => ({ default: m.DiagramViewer })));
const DiagramEditor = lazy(() => import("@/components/processes/DiagramEditor").then(m => ({ default: m.DiagramEditor })));
const AIEditorMarkdown = lazy(() => import("@/components/processes/AIEditorMarkdown").then(m => ({ default: m.AIEditorMarkdown })));
const AIEditorDiagram = lazy(() => import("@/components/processes/AIEditorDiagram").then(m => ({ default: m.AIEditorDiagram })));

function TabFallback() {
  return <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Carregando...</div>;
}

type ProcessStatus = Database["public"]["Enums"]["process_status"];

const STATUS_MAP: Record<ProcessStatus, { label: string; variant: string }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  active: { label: "Ativo", variant: "default" },
  archived: { label: "Arquivado", variant: "outline" },
};

function formatRelativeShort(d: Date) {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `há ${day} dia${day !== 1 ? "s" : ""}`;
  if (day < 30) return `há ${Math.floor(day / 7)} semana${Math.floor(day / 7) !== 1 ? "s" : ""}`;
  return `há ${Math.floor(day / 30)} mês${Math.floor(day / 30) !== 1 ? "es" : ""}`;
}

export default function ProcessoDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    data: process,
    isPending,
    isFetching,
    isPlaceholderData,
    isError,
    error,
    refetch,
  } = useProcess(id);
  const { updateProcess, linkPosition, unlinkPosition } = useProcesses(undefined, { queryEnabled: false });
  const { data: allEmployees } = useEmployees();
  const { profile } = useAuth();
  const { comments, addComment, deleteComment } = useProcessComments(id);
  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState("document");
  const { canManageProcesses } = usePermissions();

  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
  const [reprocessing, setReprocessing] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaStatus, setMetaStatus] = useState<ProcessStatus>("draft");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [regeneratingNote, setRegeneratingNote] = useState(false);

  // Dialog states
  const [tocOpen, setTocOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [aiMarkdownOpen, setAiMarkdownOpen] = useState(false);
  const [aiDiagramOpen, setAiDiagramOpen] = useState(false);

  if (!id || isPending) {
    return <DetailSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">
          Erro ao carregar processo: {(error as Error)?.message || "tente novamente."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/processos")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
          <Button onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  if (!process) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">Processo não encontrado</p>
        <Button variant="outline" onClick={() => navigate("/processos")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  const markdown: string = process.process_markdown || "";
  const flowData: FlowData | null = (process.flow_data as unknown as FlowData) || null;

  const handleSaveMarkdown = async (newMarkdown: string) => {
    try {
      await updateProcess.mutateAsync({ id: process.id, process_markdown: newMarkdown } as any);
      toast.success("Documento salvo!");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReprocess = async () => {
    if (!markdown) { toast.error("Salve o documento antes de reprocessar"); return; }
    setReprocessing(true);
    try {
      const { data: aiResult, error: aiError } = await supabase.functions.invoke("process-ai", {
        body: { action: "reprocess", markdown },
      });
      if (aiError) throw new Error(aiError.message);
      if (aiResult?.error) throw new Error(aiResult.error);
      await updateProcess.mutateAsync({ id: process.id, flow_data: aiResult.flowData } as any);
      toast.success("Diagrama reprocessado!");
    } catch (e: any) { toast.error(e.message || "Erro ao reprocessar"); }
    finally { setReprocessing(false); }
  };

  const handleSaveFlowData = async (fd: FlowData) => {
    try {
      await updateProcess.mutateAsync({ id: process.id, flow_data: fd } as any);
      toast.success("Diagrama salvo!");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSaveMeta = async () => {
    try {
      await updateProcess.mutateAsync({
        id: process.id,
        name: metaName.trim() || process.name,
        description: metaDescription.trim() || null,
        status: metaStatus,
      });
      toast.success("Atualizado!");
      setEditingMeta(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSaveNote = async () => {
    try {
      await updateProcess.mutateAsync({
        id: process.id,
        description: noteDraft.trim() || null,
      });
      toast.success("Nota salva!");
      setEditingNote(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRegenerateNote = async () => {
    if (!markdown) { toast.error("Este processo não possui documento gerado para usar como base."); return; }
    setRegeneratingNote(true);
    try {
      const { data: aiResult, error: aiError } = await supabase.functions.invoke("process-ai", {
        body: { action: "summarize", markdown },
      });
      if (aiError) throw new Error(aiError.message);
      if (aiResult?.error) throw new Error(aiResult.error);
      const note = aiResult.note as string;
      await updateProcess.mutateAsync({ id: process.id, description: note } as any);
      toast.success("Nota regenerada com IA!");
    } catch (e: any) { toast.error(e.message || "Erro ao regenerar nota"); }
    finally { setRegeneratingNote(false); }
  };

  // Extrai headings (## e ###) do markdown para Páginas / Sumário
  const headings = (() => {
    if (!markdown) return [] as { level: number; text: string; id: string }[];
    const out: { level: number; text: string; id: string }[] = [];
    const lines = markdown.split("\n");
    for (const line of lines) {
      const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line.trim());
      if (m) {
        const text = m[2].replace(/[*_`]/g, "").trim();
        const id = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        out.push({ level: m[1].length, text, id });
      }
    }
    return out;
  })();

  const folderName = (process as any).folder_name || "Documentos";

  return (
    <div className="flex flex-col gap-3 animate-fade-in h-full">
      {/* Header — estilo mockup f7: breadcrumb + Compartilhar + IA + ⋯ */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <button
            onClick={() => navigate("/documentos")}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            <span>Documentos</span>
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground truncate">{folderName}</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold text-foreground truncate">{process.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs border-0 text-muted-foreground hover:text-foreground" title="Compartilhar">
            <Share2 className="w-3.5 h-3.5" /> Compartilhar
          </Button>
          {viewMode === 'edit' ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setViewMode('view');
                if (activeTab === 'responsaveis') setActiveTab('document');
              }}
              className="h-8 gap-1.5 px-2.5 text-xs"
            >
              <Eye className="w-3.5 h-3.5" /> Visualizar
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 border-0 text-muted-foreground hover:text-foreground" title="Mais ações">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {canManageProcesses && (
                <DropdownMenuItem
                  onSelect={() => {
                    setMetaName(process.name);
                    setMetaDescription(process.description || "");
                    setMetaStatus((process.status || "draft") as ProcessStatus);
                    setEditingMeta(true);
                  }}
                  disabled={isPlaceholderData}
                >
                  <Settings2 className="w-3.5 h-3.5 mr-2" /> Editar processo
                </DropdownMenuItem>
              )}
              {canManageProcesses && viewMode !== 'edit' && (
                <DropdownMenuItem onSelect={() => setViewMode('edit')} disabled={isPlaceholderData}>
                  <Edit3 className="w-3.5 h-3.5 mr-2" /> Editar documento
                </DropdownMenuItem>
              )}
              {canManageProcesses && (
                <DropdownMenuItem onSelect={() => setAiMarkdownOpen(true)}>
                  <Sparkles className="w-3.5 h-3.5 mr-2 text-primary" /> Editar com IA
                </DropdownMenuItem>
              )}
              {canManageProcesses && (
                <DropdownMenuItem onSelect={handleReprocess} disabled={reprocessing || !markdown}>
                  <RefreshCw className={cn("w-3.5 h-3.5 mr-2", reprocessing && "animate-spin")} /> Reprocessar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setExportOpen(true)}>
                <Download className="w-3.5 h-3.5 mr-2" /> Exportar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isPlaceholderData && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          Carregando detalhes...
        </div>
      )}

      {/* Header (legado — apenas botões de edição inline) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 hidden">
        <div className="flex-1 flex items-center gap-3 flex-wrap">
          {editingMeta ? (
            <div className="flex flex-col gap-2 flex-1 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <Input value={metaName} onChange={(e) => setMetaName(e.target.value)} className="max-w-xs" />
                <Select value={metaStatus} onValueChange={(v) => setMetaStatus(v as ProcessStatus)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="archived">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleSaveMeta} className="gap-1"><Save className="w-3 h-3" /> Salvar</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingMeta(false)}>Cancelar</Button>
              </div>
              <Textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Nota do processo..."
                rows={6}
                className="resize-y"
              />
            </div>
          ) : (
            <>
              <h1 className="text-h1 font-bold text-foreground">{process.name}</h1>
              <Badge variant={STATUS_MAP[process.status || "draft"].variant as any}
                style={{
                  backgroundColor: process.status === 'active' ? 'hsl(var(--primary) / 0.1)' : undefined,
                  color: process.status === 'active' ? 'hsl(var(--primary))' : undefined,
                }}
              >
                {STATUS_MAP[process.status || "draft"].label}
              </Badge>
              <PermissionGuard can="canManageProcesses">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => { setMetaName(process.name); setMetaDescription(process.description || ""); setMetaStatus((process.status || "draft") as ProcessStatus); setEditingMeta(true); }}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              </PermissionGuard>
            </>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1">
            <Download className="w-4 h-4" /> Exportar
          </Button>
          <PermissionGuard can="canManageProcesses">
            <Button variant="outline" size="sm" onClick={() => setAiMarkdownOpen(true)} className="gap-1">
              <Sparkles className="w-4 h-4" /> Editar com IA
            </Button>
            <Button variant="outline" size="sm" onClick={handleReprocess} disabled={reprocessing || !markdown} className="gap-1">
              {reprocessing ? <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Reprocessar
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* Structural links — escondido (movido para sidebar direito Colaboradores) */}
      <div className="hidden flex-wrap gap-2">
        {(process as any).area_name && (
          <Badge variant="secondary" className="flex items-center gap-1"
            style={{ backgroundColor: `${(process as any).area_color || 'hsl(var(--primary))'}20`, color: (process as any).area_color || 'hsl(var(--primary))' }}
          >
            <Building2 className="w-3 h-3" />{(process as any).area_name}
          </Badge>
        )}
        {(process as any).subarea_name && (
          <Badge variant="outline" className="flex items-center gap-1"><Users className="w-3 h-3" />{(process as any).subarea_name}</Badge>
        )}
        {(process as any).linked_positions_count > 0 && (
          <Badge variant="outline" className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{(process as any).linked_positions_count} cargo(s)</Badge>
        )}
      </div>

      <div className="hidden rounded-xl border border-border/50 bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <StickyNote className="w-4 h-4 text-primary" /> Nota do processo
          </div>
          {canManageProcesses && !editingNote && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1"
                onClick={handleRegenerateNote}
                disabled={regeneratingNote || !markdown}
                title={!markdown ? "Gere o documento do processo primeiro para usar esta função" : "Regenerar nota usando IA com base no documento do processo"}
              >
                {regeneratingNote ? (
                  <div className="w-3 h-3 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {regeneratingNote ? "Gerando..." : "Regenerar com IA"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1"
                onClick={() => {
                  setNoteDraft(process.description || "");
                  setEditingNote(true);
                }}
              >
                <Pencil className="w-3 h-3" /> Editar
              </Button>
            </div>
          )}
        </div>
        {editingNote ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Escreva uma nota para este processo..."
              rows={8}
              className="resize-y bg-background"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditingNote(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveNote} disabled={updateProcess.isPending} className="gap-1">
                <Save className="w-3 h-3" /> {updateProcess.isPending ? "Salvando..." : "Salvar nota"}
              </Button>
            </div>
          </div>
        ) : (
          <p className={cn(
            "text-sm whitespace-pre-wrap",
            process.description ? "text-muted-foreground" : "text-muted-foreground/70 italic"
          )}>
            {process.description || "Nenhuma nota adicionada ainda."}
          </p>
        )}
      </div>

      {/* Layout 3 colunas — estilo mockup f7 */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar esquerda: Páginas (sub-headings do documento) — oculto na aba Anexos para dar espaço ao editor */}
        <aside className={cn("hidden lg:block w-56 flex-shrink-0", activeTab === "attachments" && "lg:hidden")}>
          <div className="sticky top-0 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Páginas</div>
            <nav className="flex flex-col gap-0.5">
              <a
                href="#top"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm bg-primary/10 text-primary font-medium"
              >
                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{process.name}</span>
              </a>
              {headings.filter((h) => h.level >= 2).map((h) => (
                <a
                  key={h.id + h.level}
                  href={`#${h.id}`}
                  className={cn(
                    "flex items-center gap-2 pr-2 py-1.5 rounded-md text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors",
                    h.level === 2 && "pl-7",
                    h.level === 3 && "pl-12 text-foreground/70 text-[13px]"
                  )}
                >
                  <FileText className={cn("flex-shrink-0 text-muted-foreground", h.level === 2 ? "w-3 h-3" : "w-2.5 h-2.5")} />
                  <span className="truncate">{h.text}</span>
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Conteúdo central */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
      {/* Tabs — estilo subtle text-link (mockup f7 não usa pill tabs) */}
      <Tabs defaultValue="document" value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between border-b border-border/40">
          <TabsList className="bg-transparent p-0 h-auto gap-4">
            <TabsTrigger
              value="document"
              className="bg-transparent px-0 py-2 rounded-none gap-1.5 text-xs data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-muted-foreground -mb-px"
            >
              <FileText className="w-3.5 h-3.5" /> Documento
            </TabsTrigger>
            <TabsTrigger
              value="diagram"
              className="bg-transparent px-0 py-2 rounded-none gap-1.5 text-xs data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-muted-foreground -mb-px"
            >
              <GitBranch className="w-3.5 h-3.5" /> Diagrama
            </TabsTrigger>
            <TabsTrigger
              value="attachments"
              className="bg-transparent px-0 py-2 rounded-none gap-1.5 text-xs data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-muted-foreground -mb-px"
            >
              <Paperclip className="w-3.5 h-3.5" /> Anexos
            </TabsTrigger>
            {viewMode === 'edit' && (
              <TabsTrigger
                value="responsaveis"
                className="bg-transparent px-0 py-2 rounded-none gap-1.5 text-xs data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary text-muted-foreground -mb-px"
              >
                <Users className="w-3.5 h-3.5" /> Responsáveis
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="document" className="mt-6 flex-1 min-h-0 overflow-y-auto">
          {viewMode === 'view' ? (
            <article id="top" className="max-w-3xl mx-auto pb-16">
              {isPlaceholderData ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-full" />
                </div>
              ) : (
                <>
                  {/* Metadata header — estilo mockup */}
                  <div className="text-2xs text-muted-foreground uppercase tracking-[0.12em] mb-3">
                    Documento{(process as any).updated_at && ` · atualizado ${formatRelativeShort(new Date((process as any).updated_at))}`}
                    {(process as any).updated_by_name && ` por ${(process as any).updated_by_name}`}
                  </div>
                  {/* Big title */}
                  <h1 className="text-[36px] font-bold tracking-tight text-foreground leading-tight mb-3">
                    {process.name}
                  </h1>
                  {/* Description / subtitle */}
                  {process.description && (
                    <p className="text-base text-muted-foreground leading-relaxed mb-5">
                      {process.description}
                    </p>
                  )}
                  {/* Vinculado a — mostra link para a área/subárea/projeto */}
                  {((process as any).area_name || (process as any).subarea_name) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-8">
                      <span>Vinculado a</span>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border bg-muted"
                        style={(process as any).area_color ? {
                          backgroundColor: `${(process as any).area_color}15`,
                          borderColor: `${(process as any).area_color}30`,
                        } : undefined}
                      >
                        <Building2 className="w-3 h-3" />
                        <span className="text-foreground font-medium">
                          {(process as any).area_name || (process as any).subarea_name}
                        </span>
                      </span>
                    </div>
                  )}
                  {markdown ? (
                    <MarkdownViewer content={markdown} enableTOC={false} variant="default" />
                  ) : (
                    <div className="text-center py-12 border border-dashed border-border/50 rounded-lg">
                      <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Nenhum documento gerado ainda.</p>
                    </div>
                  )}
                  {/* Footer hint */}
                  {markdown && canManageProcesses && (
                    <div className="text-2xs text-muted-foreground/50 mt-12 italic select-none">
                      / para inserir bloco
                    </div>
                  )}
                </>
              )}
            </article>
          ) : (
            <ErrorBoundary variant="inline">
              <Suspense fallback={<TabFallback />}>
                <ProcessMarkdownEditor
                  markdown={markdown}
                  onSave={handleSaveMarkdown}
                  readOnly={!canManageProcesses}
                  isLoading={isPlaceholderData}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </TabsContent>

        <TabsContent value="diagram" className="mt-4">
          {activeTab === "diagram" && (
            <ErrorBoundary variant="inline">
            <Suspense fallback={<TabFallback />}>
              {viewMode === 'edit' ? (
                <>
                  <div className="flex gap-2 mb-3">
                    <Button variant="outline" size="sm" onClick={() => setAiDiagramOpen(true)} className="gap-1">
                      <Sparkles className="w-4 h-4" /> Editar com IA
                    </Button>
                  </div>
                  {flowData ? (
                    <div className="bg-card rounded-xl border border-border/50 overflow-hidden" style={{ height: 500 }}>
                      <ProcessFlow flowData={flowData} />
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-card rounded-xl border border-border/50">
                      <GitBranch className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Nenhum diagrama gerado ainda.</p>
                      <p className="text-xs text-muted-foreground mt-1">Reprocesse o documento para gerar o diagrama.</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex gap-2 mb-3">
                    <Button variant="outline" size="sm" onClick={() => setViewerOpen(true)} disabled={!flowData} className="gap-1">
                      <Eye className="w-4 h-4" /> Ver fullscreen
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} disabled={!flowData} className="gap-1">
                      <Download className="w-4 h-4" /> Exportar
                    </Button>
                  </div>
                  <ProcessFlow flowData={flowData} />
                </>
              )}
            </Suspense>
            </ErrorBoundary>
          )}
        </TabsContent>

        <TabsContent value="attachments" className="mt-4">
          {activeTab === "attachments" && (
            <ErrorBoundary variant="inline">
              <Suspense fallback={<TabFallback />}>
                <ProcessAttachments processId={process.id} />
              </Suspense>
            </ErrorBoundary>
          )}
        </TabsContent>

        <TabsContent value="responsaveis" className="mt-4">
          {activeTab === "responsaveis" && (
            <ErrorBoundary variant="inline">
              <Suspense fallback={<TabFallback />}>
                <ProcessResponsaveisTab
                  process={process}
                  canManageProcesses={canManageProcesses}
                  linkPosition={linkPosition}
                  unlinkPosition={unlinkPosition}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </TabsContent>

      </Tabs>
        </div>

        {/* Sidebar direita: Sumário · Colaboradores · Comentários — oculto na aba Anexos */}
        <aside className={cn("hidden lg:block w-60 flex-shrink-0", activeTab === "attachments" && "lg:hidden")}>
          <div className="sticky top-0 max-h-[calc(100vh-8rem)] overflow-y-auto flex flex-col gap-5 pl-4 border-l border-border/40">
            {/* Sumário — colapsado por padrão */}
            {headings.length > 0 && (
              <div>
                <button
                  onClick={() => setTocOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 mb-2 group"
                  aria-expanded={tocOpen}
                >
                  <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                    Sumário · {headings.length}
                  </span>
                  {tocOpen
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />}
                </button>
                {tocOpen && (
                  <nav className="flex flex-col gap-0.5 max-h-[40vh] overflow-y-auto pr-1">
                    {headings.map((h) => (
                      <a
                        key={h.id + h.level}
                        href={`#${h.id}`}
                        className={cn(
                          "block py-1 text-xs hover:text-foreground transition-colors border-l-2 border-transparent hover:border-primary",
                          h.level === 1 && "pl-2 font-medium text-foreground",
                          h.level === 2 && "pl-3 text-foreground/80",
                          h.level === 3 && "pl-5 text-muted-foreground"
                        )}
                      >
                        {h.text}
                      </a>
                    ))}
                  </nav>
                )}
              </div>
            )}

            {/* Colaboradores — avatares dos employees vinculados (mesma área/subárea, ou todos ativos como fallback) */}
            {(() => {
              const areaId = (process as any).area_id;
              const subareaId = (process as any).subarea_id;
              const scoped = (allEmployees || []).filter((e) => {
                if (e.status !== "active") return false;
                if (subareaId && e.subarea_id === subareaId) return true;
                if (areaId && e.area_id === areaId) return true;
                return false;
              });
              // Fallback: se não houver área vinculada, mostra todos os ativos
              const collaborators = scoped.length > 0
                ? scoped
                : (allEmployees || []).filter((e) => e.status === "active");
              const visible = collaborators.slice(0, 6);
              return (
                <div>
                  <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Colaboradores{collaborators.length > 0 && ` · ${collaborators.length}`}
                  </div>
                  {visible.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
                      <div className="flex -space-x-1.5">
                        {visible.map((e) => (
                          <AvatarBadge
                            key={e.id}
                            name={e.full_name || "?"}
                            avatarUrl={e.avatar_url}
                            size="sm"
                            className="ring-2 ring-background"
                          />
                        ))}
                      </div>
                      {collaborators.length > visible.length && (
                        <span className="text-2xs text-muted-foreground tabular-nums ml-1">
                          +{collaborators.length - visible.length}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/70 italic">
                      Nenhum colaborador vinculado.
                    </p>
                  )}
                  {/* Áreas/cargos vinculados */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(process as any).area_name && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-2xs"
                        style={{
                          backgroundColor: `${(process as any).area_color || 'hsl(var(--primary))'}15`,
                          color: (process as any).area_color || 'hsl(var(--primary))',
                          borderColor: `${(process as any).area_color || 'hsl(var(--primary))'}30`,
                        }}
                      >
                        <Building2 className="w-2.5 h-2.5" />
                        {(process as any).area_name}
                      </span>
                    )}
                    {(process as any).subarea_name && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-muted text-2xs text-foreground">
                        <Users className="w-2.5 h-2.5" />
                        {(process as any).subarea_name}
                      </span>
                    )}
                    {(process as any).linked_positions_count > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-muted text-2xs text-foreground">
                        <Briefcase className="w-2.5 h-2.5" />
                        {(process as any).linked_positions_count} cargo{(process as any).linked_positions_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Nota do documento (compacta) */}
            {process.description && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Nota</div>
                  {canManageProcesses && !editingNote && (
                    <button
                      onClick={() => { setNoteDraft(process.description || ""); setEditingNote(true); }}
                      className="text-2xs text-muted-foreground hover:text-foreground"
                    >
                      Editar
                    </button>
                  )}
                </div>
                {editingNote ? (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={5}
                      className="text-xs"
                    />
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-2xs" onClick={() => setEditingNote(false)}>Cancelar</Button>
                      <Button size="sm" className="h-6 text-2xs gap-1" onClick={handleSaveNote} disabled={updateProcess.isPending}>
                        <Save className="w-2.5 h-2.5" /> Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {process.description}
                  </p>
                )}
              </div>
            )}

            {/* Comentários — funcional com persistência no Supabase */}
            <div>
              <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Comentários{comments.length > 0 && ` · ${comments.length}`}
              </div>

              {comments.length === 0 ? (
                <p className="text-xs text-muted-foreground/70 italic mb-3">
                  Nenhum comentário ainda. Seja o primeiro.
                </p>
              ) : (
                <div className="flex flex-col gap-3 mb-3 max-h-[40vh] overflow-y-auto pr-1">
                  {comments.map((c) => {
                    const isMine = c.author_id === profile?.user_id;
                    return (
                      <div key={c.id} className="flex gap-2 group">
                        <AvatarBadge name={c.author_name || "?"} avatarUrl={c.author_avatar || undefined} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-medium text-foreground truncate">
                              {c.author_name || "Usuário"}
                            </span>
                            <span className="text-2xs text-muted-foreground">
                              {formatRelativeShort(new Date(c.created_at))}
                            </span>
                            {isMine && (
                              <button
                                onClick={() => {
                                  if (confirm("Excluir este comentário?")) {
                                    deleteComment.mutate(c.id);
                                  }
                                }}
                                className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-2xs text-muted-foreground hover:text-destructive"
                              >
                                Excluir
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                            {c.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Escreva um comentário..."
                  rows={2}
                  className="text-xs resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newComment.trim()) {
                      e.preventDefault();
                      addComment.mutate(newComment.trim(), {
                        onSuccess: () => setNewComment(""),
                        onError: (err: any) => toast.error(err.message || "Erro ao comentar"),
                      });
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-muted-foreground/70">Ctrl + Enter para enviar</span>
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    disabled={!newComment.trim() || addComment.isPending}
                    onClick={() => {
                      addComment.mutate(newComment.trim(), {
                        onSuccess: () => setNewComment(""),
                        onError: (err: any) => toast.error(err.message || "Erro ao comentar"),
                      });
                    }}
                  >
                    {addComment.isPending ? "Enviando..." : "Comentar"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Dialogs — só montam quando open=true */}
      {exportOpen && (
        <Suspense fallback={null}>
          <ExportDialog open={exportOpen} onOpenChange={setExportOpen} processName={process.name} hasMarkdown={!!markdown} hasDiagram={!!flowData} markdown={markdown} flowData={flowData} />
        </Suspense>
      )}
      {viewerOpen && (
        <Suspense fallback={null}>
          <DiagramViewer open={viewerOpen} onOpenChange={setViewerOpen} flowData={flowData} processName={process.name}
            onEdit={canManageProcesses ? () => { setViewerOpen(false); setEditorOpen(true); } : undefined} onExport={() => { setViewerOpen(false); setExportOpen(true); }}
          />
        </Suspense>
      )}
      {editorOpen && canManageProcesses && (
        <Suspense fallback={null}>
          <DiagramEditor open={editorOpen} onOpenChange={setEditorOpen} flowData={flowData} processName={process.name} onSave={handleSaveFlowData} />
        </Suspense>
      )}
      {aiMarkdownOpen && (
        <Suspense fallback={null}>
          <AIEditorMarkdown open={aiMarkdownOpen} onOpenChange={setAiMarkdownOpen} currentMarkdown={markdown}
            onApply={async (newMd) => { await handleSaveMarkdown(newMd); }}
          />
        </Suspense>
      )}
      {aiDiagramOpen && (
        <Suspense fallback={null}>
          <AIEditorDiagram open={aiDiagramOpen} onOpenChange={setAiDiagramOpen} currentFlowData={flowData} currentMarkdown={markdown}
            onApply={async (fd) => { await handleSaveFlowData(fd); }}
          />
        </Suspense>
      )}

      {/* Dialog: Editar processo (nome, status, nota) */}
      <Dialog open={editingMeta} onOpenChange={setEditingMeta}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar processo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proc-name" className="text-xs">Nome</Label>
              <Input
                id="proc-name"
                value={metaName}
                onChange={(e) => setMetaName(e.target.value)}
                placeholder="Nome do processo"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proc-status" className="text-xs">Status</Label>
              <Select value={metaStatus} onValueChange={(v) => setMetaStatus(v as ProcessStatus)}>
                <SelectTrigger id="proc-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="archived">Arquivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proc-desc" className="text-xs">Nota / descrição</Label>
              <Textarea
                id="proc-desc"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Nota visível na lateral do processo..."
                rows={5}
                className="resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingMeta(false)} disabled={updateProcess.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMeta} disabled={updateProcess.isPending || !metaName.trim()} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />
              {updateProcess.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
