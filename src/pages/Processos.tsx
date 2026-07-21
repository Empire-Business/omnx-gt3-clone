import { useState, useEffect } from "react";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { useNavigate } from "react-router-dom";
import {
  FileText, Plus, Search, MoreHorizontal, Trash2,
  Sparkles, Eye, Building2, Users, Briefcase, Circle,
  Filter, Download, CheckCircle2, ArrowLeft, Layers, Clock, AlertTriangle,
  FolderOpen, PanelLeftClose, PanelLeftOpen, Tag, StickyNote,
} from "lucide-react";
import { exportAsCSV } from "@/lib/export-csv";
import { useProcesses, type ProcessWithSteps } from "@/hooks/useProcesses";
import { useProcessFolders } from "@/hooks/useProcessFolders";
import { useProcessTags } from "@/hooks/useProcessTags";
import { usePermissions } from "@/hooks/usePermissions";
import { useHierarchyFilter } from "@/hooks/useHierarchyFilter";
import { PermissionGuard } from "@/components/permissions/PermissionGuard";
import { HierarchyFilter, HierarchyFilterBadges } from "@/components/shared/HierarchyFilter";
import { EmptyState } from "@/components/shared/SharedComponents";
import { ProcessFolderTree } from "@/components/processes/ProcessFolderTree";
import { ProcessTagFilter } from "@/components/processes/ProcessTagFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/shared/SmartSkeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

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

function buildAutomaticProcessNote(prompt: string, previewSummary?: string | null) {
  const summary = previewSummary?.trim();
  if (summary) return summary;

  const normalizedPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!normalizedPrompt) return null;

  return normalizedPrompt.length > 5000
    ? `${normalizedPrompt.slice(0, 4997)}...`
    : normalizedPrompt;
}

export default function Processos() {
  const navigate = useNavigate();
  const { canManageProcesses } = usePermissions();

  // Filtros hierárquicos
  const {
    filters,
    setArea,
    setSubarea,
    setPosition,
    clearFilters,
    hasActiveFilters,
  } = useHierarchyFilter();

  // Estado de navegação por pastas e tags
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Buscar processos com filtros hierárquicos
  const {
    data: processes,
    isLoading,
    isFetching,
    createProcess,
    deleteProcess,
    moveToFolder,
    updateProcess,
  } = useProcesses({
    area_id: filters.area_id,
    subarea_id: filters.subarea_id,
    position_id: filters.position_id,
  });

  // Pastas
  const {
    data: folders,
    isLoading: foldersLoading,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
  } = useProcessFolders();

  // Tags
  const {
    data: tags,
    isLoading: tagsLoading,
    createTag,
    updateTag,
    deleteTag,
    assignTag,
    removeTag,
  } = useProcessTags();

  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [processName, setProcessName] = useState("");
  const [processNote, setProcessNote] = useState("");
  const [newProcessFolderId, setNewProcessFolderId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{
    summary: string;
    steps_count: number;
    steps_preview: string[];
    roles_involved: string[];
    estimated_phases: string[];
    complexity: string;
  } | null>(null);

  // Move to folder state
  const [moveTarget, setMoveTarget] = useState<{ processId: string; currentFolderId: string | null } | null>(null);
  const [movingToFolderId, setMovingToFolderId] = useState<string | "none">("none");

  // Paginação da lista
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Reset paginação quando filtros mudam
  useEffect(() => {
    setPage(1);
  }, [search, selectedFolderId, selectedTagIds.length, filters.area_id, filters.subarea_id, filters.position_id]);

  // Filtrar processos
  const filtered = (processes || []).filter((p) => {
    // Filtro de busca textual
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    // Filtro de pasta: null = todos, string = pasta específica
    const procFolderId = (p as any).folder_id ?? null;
    if (selectedFolderId !== null && procFolderId !== selectedFolderId) return false;
    // Filtro de tags: processo deve ter TODAS as tags selecionadas
    if (selectedTagIds.length > 0) {
      const procTagIds = (p.tags || []).map((t: any) => t.id);
      if (!selectedTagIds.every((tid) => procTagIds.includes(tid))) return false;
    }
    return true;
  });

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // Step 1: Generate preview
  const handlePreview = async () => {
    if (!prompt.trim()) { toast.error("Descreva o documento antes de gerar"); return; }
    if (!processName.trim()) { toast.error("Dê um nome ao documento"); return; }

    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-ai", {
        body: { action: "preview", prompt: prompt.trim() },
      });
      if (error) throw new Error(error.message || "Erro ao gerar prévia");
      if (data?.error) throw new Error(data.error);
      setPreview(data.preview);
    } catch (e: any) {
      console.error("Preview error:", e);
      toast.error(e.message || "Erro ao gerar prévia");
    } finally {
      setPreviewing(false);
    }
  };

  // Step 2: Generate full process (only after approval)
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: aiResult, error: aiError } = await supabase.functions.invoke("process-ai", {
        body: { action: "generate", prompt: prompt.trim() },
      });

      if (aiError) throw new Error(aiError.message || "Erro ao chamar IA");
      if (aiResult?.error) throw new Error(aiResult.error);

      const note = processNote.trim() || buildAutomaticProcessNote(prompt, preview?.summary);

      const newProcess = await createProcess.mutateAsync({
        name: processName.trim(),
        description: note,
        status: "draft",
        original_prompt: prompt.trim(),
        process_markdown: aiResult.markdown || "",
        flow_data: aiResult.flowData || null,
        ...(newProcessFolderId ? { folder_id: newProcessFolderId } as any : {}),
      });

      toast.success("Documento gerado com IA!");
      setDialogOpen(false);
      setPrompt("");
      setProcessName("");
      setProcessNote("");
      setPreview(null);
      setNewProcessFolderId(null);

      if (newProcess?.id) {
        navigate(`/documentos/${newProcess.id}`);
      }
    } catch (e: any) {
      console.error("Generate error:", e);
      toast.error(e.message || "Erro ao gerar processo");
    } finally {
      setGenerating(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setPreview(null);
      setNewProcessFolderId(null);
      setProcessNote("");
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [regeneratingAll, setRegeneratingAll] = useState(false);
  const [regenerateProgress, setRegenerateProgress] = useState<{ done: number; total: number } | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProcess.mutateAsync(deleteTarget);
      toast.success("Documento excluído!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleMoveToFolder = async () => {
    if (!moveTarget) return;
    const targetFolderId = movingToFolderId === "none" ? null : movingToFolderId;
    try {
      await moveToFolder.mutateAsync({ processId: moveTarget.processId, folderId: targetFolderId });
      toast.success("Documento movido!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMoveTarget(null);
      setMovingToFolderId("none");
    }
  };

  const handleRegenerateAllNotes = async () => {
    setRegeneratingAll(true);
    setRegenerateProgress({ done: 0, total: 0 });
    try {
      // Busca id + process_markdown de todos os processos do tenant (a lista não inclui markdown)
      const { data: fullList, error: fetchError } = await supabase
        .from("processes")
        .select("id, process_markdown")
        .not("process_markdown", "is", null);

      if (fetchError) throw fetchError;
      const withMarkdown = (fullList || []).filter((p) => p.process_markdown);

      if (withMarkdown.length === 0) {
        toast.error("Nenhum processo possui documento gerado para usar como base.");
        return;
      }

      setRegenerateProgress({ done: 0, total: withMarkdown.length });
      let success = 0;
      let errors = 0;

      for (let i = 0; i < withMarkdown.length; i++) {
        const p = withMarkdown[i];
        try {
          const { data: aiResult, error: aiError } = await supabase.functions.invoke("process-ai", {
            body: { action: "summarize", markdown: p.process_markdown },
          });
          if (aiError) throw new Error(aiError.message);
          if (aiResult?.error) throw new Error(aiResult.error);
          await updateProcess.mutateAsync({ id: p.id, description: aiResult.note });
          success++;
        } catch {
          errors++;
        }
        setRegenerateProgress({ done: i + 1, total: withMarkdown.length });
      }

      if (errors === 0) {
        toast.success(`${success} nota${success !== 1 ? "s" : ""} regenerada${success !== 1 ? "s" : ""} com sucesso!`);
      } else {
        toast.warning(`${success} nota${success !== 1 ? "s" : ""} regenerada${success !== 1 ? "s" : ""}, ${errors} com erro.`);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao regenerar notas");
    } finally {
      setRegeneratingAll(false);
      setRegenerateProgress(null);
    }
  };

  if (isLoading || processes === undefined) {
    return <ListSkeleton columns={3} count={6} />;
  }

  // Documentos recentes: 4 mais recentemente atualizados
  const recentes = [...(processes || [])]
    .sort((a, b) => new Date((b as any).updated_at || (b as any).created_at || 0).getTime() - new Date((a as any).updated_at || (a as any).created_at || 0).getTime())
    .slice(0, 4);

  const selectedFolderName = selectedFolderId
    ? (folders || []).find((f) => f.id === selectedFolderId)?.name || "Pasta"
    : "Geral";

  return (
    <div className="flex flex-col gap-4 animate-fade-in h-full">
      {/* Header — estilo mockup: breadcrumb à esquerda · Filtros + Novo à direita */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-foreground">Documentos</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">{selectedFolderName}</span>
          <span className="text-2xs text-muted-foreground ml-2 tabular-nums">
            · {filtered.length} {filtered.length === 1 ? "item" : "itens"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-8 gap-1.5 px-2.5 text-xs border-0",
              (showFilters || hasActiveFilters || selectedTagIds.length > 0)
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Filter className="w-3.5 h-3.5" /> Filtros
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen((v) => !v)}
            className="h-8 w-8 p-0 border-0 text-muted-foreground hover:text-foreground"
            title={sidebarOpen ? "Ocultar pastas" : "Mostrar pastas"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              exportAsCSV(filtered, [
                { key: "name", label: "Nome" },
                { key: "status", label: "Status" },
                { key: "area_name", label: "Área" },
                { key: "subarea_name", label: "Subárea" },
                { key: "position_title", label: "Cargo Principal" },
                { key: "created_at", label: "Criado em" },
              ], "documentos");
            }}
            className="h-8 w-8 p-0 border-0 text-muted-foreground hover:text-foreground"
            title="Exportar CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
          <PermissionGuard allow={["admin", "manager"]}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 border-0 text-muted-foreground hover:text-foreground"
                  title="Mais ações"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleRegenerateAllNotes} disabled={regeneratingAll}>
                  <Sparkles className="w-3.5 h-3.5 mr-2" />
                  {regeneratingAll
                    ? regenerateProgress ? `Regenerando ${regenerateProgress.done}/${regenerateProgress.total}` : "Regenerando..."
                    : "Regenerar notas (IA)"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5 h-8 font-medium">
              <Plus className="w-3.5 h-3.5" /> Novo
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* RECENTES — 4 cards de thumbnail (estilo mockup f6) */}
      {recentes.length > 0 && !selectedFolderId && !search && selectedTagIds.length === 0 && !hasActiveFilters && (
        <div className="flex flex-col gap-2">
          <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Recentes</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {recentes.map((doc) => {
              // Determinar tipo/cor do thumbnail (visual placeholder estilo mockup)
              const palette = [
                { bg: "bg-rose-50 dark:bg-rose-950/30", stripe: "bg-rose-100/50 dark:bg-rose-900/30", icon: "text-rose-500" },
                { bg: "bg-sky-50 dark:bg-sky-950/30", stripe: "bg-sky-100/50 dark:bg-sky-900/30", icon: "text-sky-500" },
                { bg: "bg-emerald-50 dark:bg-emerald-950/30", stripe: "bg-emerald-100/50 dark:bg-emerald-900/30", icon: "text-emerald-500" },
                { bg: "bg-violet-50 dark:bg-violet-950/30", stripe: "bg-violet-100/50 dark:bg-violet-900/30", icon: "text-violet-500" },
              ];
              const idx = recentes.indexOf(doc) % palette.length;
              const p = palette[idx];
              const updated = (doc as any).updated_at || (doc as any).created_at;
              const updatedLabel = updated
                ? formatRelativeShort(new Date(updated))
                : "—";
              return (
                <button
                  key={doc.id}
                  onClick={() => navigate(`/documentos/${doc.id}`)}
                  className="flex flex-col gap-2 text-left group"
                >
                  <div className={cn("relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-border/50 group-hover:border-border transition-colors", p.bg)}>
                    {/* listras diagonais sutis */}
                    <div
                      className={cn("absolute inset-0 opacity-50", p.stripe)}
                      style={{
                        backgroundImage: "repeating-linear-gradient(45deg, transparent 0 8px, currentColor 8px 9px)",
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <FileText className={cn("w-8 h-8", p.icon)} />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground truncate">{doc.name}</span>
                    <span className="text-2xs text-muted-foreground truncate">
                      {(doc as any).updated_by_name || (doc as any).created_by_name || "—"} · {updatedLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Two-column layout: sidebar + content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar de pastas */}
        {sidebarOpen && (
          <div className="w-60 flex-shrink-0">
            <div className="bg-background border border-border rounded-lg p-2 h-full min-h-[400px]">
              <ProcessFolderTree
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                folders={folders || []}
                isLoading={foldersLoading}
                canManage={canManageProcesses}
                onCreateFolder={async (name, parentId) => {
                  await createFolder.mutateAsync({ name, parentId });
                }}
                onRenameFolder={async (id, name) => {
                  await renameFolder.mutateAsync({ id, name });
                }}
                onDeleteFolder={async (id) => {
                  await deleteFolder.mutateAsync(id);
                }}
                onMoveFolder={async (id, parentId) => {
                  await moveFolder.mutateAsync({ id, parentId });
                }}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Busca compacta */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar documentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {/* Badges de filtros ativos */}
          {hasActiveFilters && !showFilters && (
            <HierarchyFilterBadges
              areaId={filters.area_id}
              subareaId={filters.subarea_id}
              positionId={filters.position_id}
              onClear={clearFilters}
            />
          )}

          {/* Filtros hierárquicos colapsáveis */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleContent>
              <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex flex-col gap-3">
                <HierarchyFilter
                  areaId={filters.area_id}
                  subareaId={filters.subarea_id}
                  positionId={filters.position_id}
                  onAreaChange={setArea}
                  onSubareaChange={setSubarea}
                  onPositionChange={setPosition}
                  onClear={clearFilters}
                />
                <ProcessTagFilter
                  tags={tags || []}
                  selectedTagIds={selectedTagIds}
                  onToggleTag={handleToggleTag}
                  isLoading={tagsLoading}
                  canManage={canManageProcesses}
                  onCreateTag={async (name, color) => {
                    await createTag.mutateAsync({ name, color });
                  }}
                  onUpdateTag={async (id, name, color) => {
                    await updateTag.mutateAsync({ id, name, color });
                  }}
                  onDeleteTag={async (id) => {
                    await deleteTag.mutateAsync(id);
                  }}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Lista de documentos — estilo mockup f6 */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-8 h-8 text-muted-foreground" />}
              title={
                selectedFolderId
                  ? "Nenhum documento nesta pasta"
                  : hasActiveFilters
                  ? "Nenhum documento encontrado com estes filtros"
                  : "Nenhum documento encontrado"
              }
              description={
                selectedFolderId
                  ? "Arraste documentos para esta pasta ou crie um novo aqui."
                  : hasActiveFilters
                  ? "Tente ajustar os filtros ou limpar a busca."
                  : canManageProcesses
                  ? "Descreva um documento e deixe a IA estruturá-lo para você."
                  : "Nenhum documento vinculado ao seu cargo, área ou subárea. Fale com um administrador para ser adicionado."
              }
            />
          ) : (
            <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
              {/* Cabeçalho */}
              <div className="hidden md:grid grid-cols-[minmax(0,1fr)_180px_140px_100px_40px] gap-3 px-4 py-2 border-b border-border/60 bg-muted/30 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                <div>Nome</div>
                <div>Autor</div>
                <div>Atualizado</div>
                <div className="text-right">Etapas</div>
                <div></div>
              </div>
              {/* Linhas */}
              <AnimatedList>
                {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((proc, i, pageArr) => {
                  const updated = (proc as any).updated_at || (proc as any).created_at;
                  const author = (proc as any).updated_by_name || (proc as any).created_by_name || "—";
                  const stepsCount = (proc as any).steps?.length ?? (proc as any).steps_count ?? 0;
                  const procTags = (proc as any).tags as { id: string; name: string; color: string | null }[] | undefined;
                  const isFolder = false; // documentos não têm subpastas inline aqui
                  return (
                    <div
                      key={proc.id}
                      onClick={() => navigate(`/documentos/${proc.id}`)}
                      className={cn(
                        "group grid grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(180px,1fr)_140px_110px_80px_36px] gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer items-center",
                        i !== pageArr.length - 1 && "border-b border-border/40"
                      )}
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-primary/70 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-foreground truncate block">{proc.name}</span>
                        </div>
                        {procTags && procTags.length > 0 && (
                          <div className="hidden lg:flex items-center gap-1 ml-2">
                            {procTags.slice(0, 2).map((t) => (
                              <span
                                key={t.id}
                                className="text-2xs px-1.5 py-0.5 rounded border whitespace-nowrap"
                                style={t.color ? { borderColor: t.color + "40", color: t.color, backgroundColor: t.color + "10" } : undefined}
                              >
                                {t.name}
                              </span>
                            ))}
                            {procTags.length > 2 && (
                              <span className="text-2xs text-muted-foreground">+{procTags.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="hidden md:flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                          {(author || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <span className="text-xs text-foreground truncate">{author}</span>
                      </div>
                      <div className="hidden md:block text-xs text-muted-foreground tabular-nums truncate">
                        {updated ? formatRelativeShort(new Date(updated)) : "—"}
                      </div>
                      <div className="hidden md:block text-xs text-muted-foreground tabular-nums text-right">
                        {stepsCount > 0 ? `${stepsCount} etapa${stepsCount !== 1 ? "s" : ""}` : "—"}
                      </div>
                      <div className="flex items-center justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Ações"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setMoveTarget({ processId: proc.id, currentFolderId: (proc as any).folder_id ?? null });
                              setMovingToFolderId((proc as any).folder_id ?? "none");
                            }}>
                              <FolderOpen className="w-3.5 h-3.5 mr-2" /> Mover para pasta
                            </DropdownMenuItem>
                            {canManageProcesses && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(proc.id); }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </AnimatedList>
              {/* Paginação */}
              {filtered.length > PAGE_SIZE && (() => {
                const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
                const from = (page - 1) * PAGE_SIZE + 1;
                const to = Math.min(page * PAGE_SIZE, filtered.length);
                return (
                  <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-muted/20">
                    <span className="text-2xs text-muted-foreground tabular-nums">
                      {from}–{to} de {filtered.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="h-7 px-2 text-xs"
                      >
                        ← Anterior
                      </Button>
                      <span className="text-2xs text-muted-foreground tabular-nums px-2">
                        {page} / {totalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={page === totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="h-7 px-2 text-xs"
                      >
                        Próxima →
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog — Two-step flow */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {preview ? "Prévia do Documento" : "Novo Documento com IA"}
            </DialogTitle>
          </DialogHeader>

          {!preview ? (
            /* Step 1: Input form */
            <>
              <div className="flex flex-col gap-4 py-4">
                <div>
                  <Label>Nome do documento *</Label>
                  <Input
                    value={processName}
                    onChange={(e) => setProcessName(e.target.value)}
                    placeholder="Ex: Onboarding de novos colaboradores"
                  />
                </div>
                <div>
                  <Label>Nota do documento (opcional)</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Use para registrar contexto, objetivo, regra importante ou qualquer observação que precisa acompanhar este documento.
                  </p>
                  <Textarea
                    value={processNote}
                    onChange={(e) => setProcessNote(e.target.value)}
                    placeholder="Ex: Este documento deve ser revisado mensalmente pelo RH antes de ativar novas turmas."
                    rows={6}
                    className="resize-y"
                  />
                </div>
                {/* Folder selector */}
                {folders && folders.length > 0 && (
                  <div>
                    <Label>Pasta (opcional)</Label>
                    <Select
                      value={newProcessFolderId ?? "none"}
                      onValueChange={(v) => setNewProcessFolderId(v === "none" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sem pasta" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem pasta</SelectItem>
                        {(folders || []).map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.parent_id ? "  └ " : ""}{f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Descreva o documento *</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Detalhe todas as etapas, responsáveis, prazos e regras. Quanto mais detalhado, melhor o resultado.
                  </p>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ex: O processo de onboarding começa quando o RH recebe a aprovação da contratação. Primeiro, o RH prepara a documentação (1 dia). Em seguida, o TI configura o acesso ao sistema (2 horas). O gestor direto agenda uma reunião de boas-vindas..."
                    rows={8}
                    className="resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogClose(false)} disabled={previewing}>
                  Cancelar
                </Button>
                <Button onClick={handlePreview} disabled={previewing} className="gap-2">
                  {previewing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" /> Gerar Prévia
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            /* Step 2: Preview & Approve */
            <>
              <div className="flex flex-col gap-4 py-4">
                {/* Summary */}
                <div className="p-4 bg-muted/40 rounded-lg border border-border/50">
                  <p className="text-sm text-foreground">{preview.summary}</p>
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2 p-3 bg-card rounded-lg border border-border/50">
                    <Layers className="w-4 h-4 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-lg font-bold text-foreground">{preview.steps_count}</p>
                      <p className="text-2xs text-muted-foreground">Etapas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-card rounded-lg border border-border/50">
                    <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                    <div>
                      <p className="text-lg font-bold text-foreground">{preview.estimated_phases?.length || 0}</p>
                      <p className="text-2xs text-muted-foreground">Fases</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-card rounded-lg border border-border/50">
                    <AlertTriangle className={cn("w-4 h-4 flex-shrink-0",
                      preview.complexity === "baixa" ? "text-success" :
                      preview.complexity === "alta" ? "text-destructive" : "text-warning"
                    )} />
                    <div>
                      <p className="text-sm font-bold text-foreground capitalize">{preview.complexity}</p>
                      <p className="text-2xs text-muted-foreground">Complexidade</p>
                    </div>
                  </div>
                </div>

                {/* Steps preview */}
                {preview.steps_preview?.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Etapas identificadas</Label>
                    <div className="flex flex-col gap-1.5">
                      {preview.steps_preview.map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 font-medium">{i + 1}</span>
                          <span className="text-foreground">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Roles & Phases */}
                <div className="flex flex-wrap gap-1.5">
                  {preview.roles_involved?.map((role, i) => (
                    <Badge key={`role-${i}`} variant="secondary" className="text-xs gap-1">
                      <Users className="w-3 h-3" /> {role}
                    </Badge>
                  ))}
                  {preview.estimated_phases?.map((phase, i) => (
                    <Badge key={`phase-${i}`} variant="outline" className="text-xs gap-1">
                      <Clock className="w-3 h-3" /> {phase}
                    </Badge>
                  ))}
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setPreview(null)} disabled={generating} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Voltar e Editar
                </Button>
                <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                  {generating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Gerando documento completo...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Aprovar e Gerar
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Move to Folder Dialog */}
      <Dialog open={!!moveTarget} onOpenChange={(open) => { if (!open) setMoveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              Mover para pasta
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Selecionar pasta</Label>
            <Select
              value={movingToFolderId}
              onValueChange={setMovingToFolderId}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem pasta (raiz)</SelectItem>
                {(folders || []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.parent_id ? "  └ " : ""}{f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>Cancelar</Button>
            <Button onClick={handleMoveToFolder} disabled={moveToFolder.isPending}>
              {moveToFolder.isPending ? "Movendo..." : "Mover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O processo, seu documento e diagrama serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ────────────────────────────────────────────────
// ProcessCard
// ────────────────────────────────────────────────

interface ProcessTag {
  id: string;
  name: string;
  color: string;
}

interface ProcessFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

interface ProcessCardProps {
  process: ProcessWithSteps;
  folders: ProcessFolder[];
  onClick: () => void;
  onDelete: () => void;
  onMoveToFolder: () => void;
  onAssignTag: (tagId: string) => Promise<void>;
  onRemoveTag: (tagId: string) => Promise<void>;
  allTags: ProcessTag[];
}

function ProcessCard({
  process,
  folders,
  onClick,
  onDelete,
  onMoveToFolder,
  onAssignTag,
  onRemoveTag,
  allTags,
}: ProcessCardProps) {
  const navigate = useNavigate();
  const { canManageProcesses, isAdmin } = usePermissions();

  const statusConfig = STATUS_MAP[process.status || "draft"];
  const tags: ProcessTag[] = (process as any).tags || [];
  const folderId: string | null = (process as any).folder_id ?? null;
  const folderName = folderId ? folders.find((f) => f.id === folderId)?.name : null;

  return (
    <Card
      className="cursor-pointer entity-card-hover border-border/50 group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Header com status */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {process.name}
            </h3>
            {folderName && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <FolderOpen className="w-3 h-3" />
                {folderName}
              </p>
            )}
          </div>
          <Badge
            variant={statusConfig.variant as any}
            className={cn(
              "flex-shrink-0 text-xs",
              process.status === "active" && "bg-success/10 text-success border-success/30"
            )}
          >
            {statusConfig.label}
          </Badge>
        </div>

        {/* Descrição */}
        {process.description && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground line-clamp-2 mb-3">
            <StickyNote className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{process.description}</span>
          </div>
        )}

        {/* Tags coloridas */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                style={{ borderColor: tag.color, color: tag.color, backgroundColor: `${tag.color}15` }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Badges de estrutura organizacional */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(process as any).area_name && (
            <Badge
              variant="secondary"
              className="text-xs flex items-center gap-1"
              style={{
                backgroundColor: `${(process as any).area_color}20`,
                color: (process as any).area_color,
              }}
            >
              <Circle className="w-2 h-2 fill-current" />
              {(process as any).area_name}
            </Badge>
          )}
          {(process as any).subarea_name && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Users className="w-3 h-3" />
              {(process as any).subarea_name}
            </Badge>
          )}
          {(process as any).linked_positions_count > 0 && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {(process as any).linked_positions_count} cargo{(process as any).linked_positions_count !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Footer com métricas */}
        <div className="flex items-center justify-between pt-3 border-t border-border/30">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {process.steps?.length || 0} etapa{process.steps?.length !== 1 ? "s" : ""}
            </span>
            {process.flow_data && (
              <Badge variant="outline" className="text-xs gap-1">
                <Eye className="w-3 h-3" /> Diagrama
              </Badge>
            )}
          </div>

          <PermissionGuard can="canManageProcesses">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => navigate(`/documentos/${process.id}`)}>
                  <Eye className="w-4 h-4 mr-2" /> Ver detalhes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveToFolder}>
                  <FolderOpen className="w-4 h-4 mr-2" /> Mover para pasta
                </DropdownMenuItem>
                {allTags.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {allTags.map((tag) => {
                      const hasTag = tags.some((t) => t.id === tag.id);
                      return (
                        <DropdownMenuItem
                          key={tag.id}
                          onClick={() => hasTag ? onRemoveTag(tag.id) : onAssignTag(tag.id)}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          {hasTag ? "Remover: " : "Adicionar: "}{tag.name}
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onDelete} className="text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </PermissionGuard>
        </div>
      </CardContent>
    </Card>
  );
}
