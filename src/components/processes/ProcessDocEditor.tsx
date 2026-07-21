import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Eye, Edit3, Save, Check,
  Maximize2, Minimize2, ZoomIn, ZoomOut, ListTree, Columns,
  Loader2, Download,
  File as FileIcon, FileImage, FileVideo, FileAudio, FileCode, FileText as FileTextIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MarkdownViewer } from "@/components/shared/MarkdownViewer";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { FilePreviewModal, getPreviewKind, downloadFile } from "@/components/processes/FilePreviewModal";
import { useMarkdownTOC } from "@/hooks/useMarkdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DocDocument } from "@/types/documents";

interface Props {
  document: DocDocument;
  onSave: (id: string, updates: { title?: string; content?: string }) => Promise<void>;
  onUploadImage: (file: File) => Promise<string>;
  readOnly?: boolean;
}

// Local storage key for zoom preference
const ZOOM_STORAGE_KEY = "process-doc-editor-zoom";
const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;
const AUTOSAVE_DELAY = 2000; // 2 seconds debounce

// Ícone do card conforme o tipo de preview do arquivo
function pickFileIcon(kind: ReturnType<typeof getPreviewKind>) {
  switch (kind) {
    case "image": return FileImage;
    case "video": return FileVideo;
    case "audio": return FileAudio;
    case "html": return FileCode;
    case "pdf":
    case "text": return FileTextIcon;
    default: return FileIcon;
  }
}

export function ProcessDocEditor({ document, onSave, onUploadImage, readOnly }: Props) {
  const isMobile = useIsMobile();
  // Default to "edit" mode for a more Notion-like experience (always editing)
  const [mode, setMode] = useState<"view" | "edit" | "split">(readOnly ? "view" : "edit");
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content || "");
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOutline, setShowOutline] = useState(!isMobile);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [timeSinceSaved, setTimeSinceSaved] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Zoom state with localStorage persistence
  const [zoom, setZoom] = useState(() => {
    try {
      const saved = localStorage.getItem(ZOOM_STORAGE_KEY);
      return saved ? parseInt(saved, 10) : DEFAULT_ZOOM;
    } catch {
      return DEFAULT_ZOOM;
    }
  });

  const previewRef = useRef<HTMLDivElement>(null);
  const prevDocIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  titleRef.current = title;
  contentRef.current = content;

  // Debounce content for TOC
  const [debouncedContent, setDebouncedContent] = useState(content);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedContent(content), 300);
    return () => clearTimeout(t);
  }, [content]);

  const toc = useMarkdownTOC(debouncedContent);

  // Update time since saved
  useEffect(() => {
    if (!lastSaved) {
      setTimeSinceSaved("");
      return;
    }

    const updateTime = () => {
      const now = new Date();
      const diffMs = now.getTime() - lastSaved.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) {
        setTimeSinceSaved("Agora mesmo");
      } else if (diffMins < 60) {
        setTimeSinceSaved(`${diffMins} min atrás`);
      } else if (diffHours < 24) {
        setTimeSinceSaved(`${diffHours}h atrás`);
      } else {
        setTimeSinceSaved(`${diffDays}d atrás`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  // Persist zoom to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, zoom.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, [zoom]);

  // Reset only when document ID changes
  useEffect(() => {
    if (document.id && document.id !== prevDocIdRef.current) {
      prevDocIdRef.current = document.id;
      setTitle(document.title);
      setContent(document.content || "");
      setLastSaved(null);
      setHasUnsavedChanges(false);
      setAutoSaveStatus("idle");
    }
  }, [document.id]);

  // Handle ESC key for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
      // Ctrl+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && !readOnly) {
        e.preventDefault();
        performSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, readOnly]);

  // Auto-save with debounce
  const performSave = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    setAutoSaveStatus("saving");
    try {
      await onSave(document.id, { title: titleRef.current, content: contentRef.current });
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      setAutoSaveStatus("saved");
      // Reset status after 3s
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
      setAutoSaveStatus("idle");
    } finally {
      setSaving(false);
    }
  }, [document.id, onSave, readOnly]);

  // Schedule auto-save when content or title changes
  useEffect(() => {
    if (readOnly) return;
    if (!prevDocIdRef.current) return; // Don't auto-save on initial load

    // Check if there are actual changes
    const titleChanged = title !== document.title;
    const contentChanged = content !== (document.content || "");

    if (!titleChanged && !contentChanged) {
      setHasUnsavedChanges(false);
      return;
    }

    setHasUnsavedChanges(true);

    // Debounce auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      performSave();
    }, AUTOSAVE_DELAY);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [title, content, readOnly, performSave, document.title, document.content]);

  // Word and character count
  const stats = useMemo(() => {
    const text = content || "";
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { words, chars };
  }, [content]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  const handleZoomReset = () => setZoom(DEFAULT_ZOOM);

  const handleTOCClick = (id: string) => {
    const element = window.document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // File type document → show card with preview + download
  if (document.type === "file" && !document.content) {
    const previewKind = getPreviewKind(document.file_type, document.title);
    const canPreview = previewKind !== "none";
    const FileTypeIcon = pickFileIcon(previewKind);

    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="w-full max-w-md bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileTypeIcon className="w-7 h-7 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground font-semibold truncate" title={document.title}>{document.title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {document.file_type || "Arquivo"}
                {document.file_size ? ` — ${(document.file_size / 1024).toFixed(1)} KB` : ""}
              </p>
            </div>
          </div>

          {document.file_path && (
            <div className="flex items-center gap-2 mt-5">
              {canPreview && (
                <Button className="flex-1 gap-2" onClick={() => setPreviewOpen(true)}>
                  <Eye className="w-4 h-4" /> Visualizar
                </Button>
              )}
              <Button
                variant={canPreview ? "outline" : "default"}
                className="flex-1 gap-2"
                onClick={() => downloadFile(document.file_path!, document.title)}
              >
                <Download className="w-4 h-4" /> Baixar
              </Button>
            </div>
          )}
        </div>

        {document.file_path && (
          <FilePreviewModal
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            fileUrl={document.file_path}
            fileName={document.title}
            fileType={document.file_type}
            fileSize={document.file_size}
          />
        )}
      </div>
    );
  }

  const toolbarJSX = (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-card/80 backdrop-blur-sm flex-wrap">
      {/* Mode toggles */}
      {!readOnly && (
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          <Button
            variant={mode === "edit" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("edit")}
            className="h-7 gap-1 text-xs"
          >
            <Edit3 className="w-3.5 h-3.5" />
            {!isMobile && "Editar"}
          </Button>
          {!isMobile && (
            <Button
              variant={mode === "split" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("split")}
              className="h-7 gap-1 text-xs"
            >
              <Columns className="w-3.5 h-3.5" /> Dividido
            </Button>
          )}
          <Button
            variant={mode === "view" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("view")}
            className="h-7 gap-1 text-xs"
          >
            <Eye className="w-3.5 h-3.5" />
            {!isMobile && "Visualizar"}
          </Button>
        </div>
      )}

      {/* Fullscreen toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => setIsFullscreen(!isFullscreen)}
        title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
      >
        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </Button>

      {/* Outline toggle */}
      {!isMobile && (
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 w-7 p-0", showOutline && "bg-muted")}
          onClick={() => setShowOutline(!showOutline)}
          title="Mostrar/ocultar índice"
        >
          <ListTree className="w-3.5 h-3.5" />
        </Button>
      )}

      <Separator orientation="vertical" className="h-5" />

      {/* Zoom controls */}
      {!isMobile && (
        <>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM} title="Diminuir zoom">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center cursor-pointer hover:text-foreground transition-colors" onClick={handleZoomReset} title="Resetar zoom">
              {zoom}%
            </span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM} title="Aumentar zoom">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Separator orientation="vertical" className="h-5" />
        </>
      )}

      {/* Stats */}
      {!isMobile && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{stats.words} palavras</span>
          <span className="opacity-40">·</span>
          <span>{stats.chars} caracteres</span>
        </div>
      )}

      {/* Auto-save status indicator */}
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {autoSaveStatus === "saving" && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            Salvando...
          </span>
        )}
        {autoSaveStatus === "saved" && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-500">
            <Check className="w-3 h-3" />
            Salvo
          </span>
        )}
        {autoSaveStatus === "idle" && timeSinceSaved && (
          <span className="text-xs text-muted-foreground">
            Salvo {timeSinceSaved}
          </span>
        )}
        {autoSaveStatus === "idle" && hasUnsavedChanges && (
          <span className="text-xs text-amber-500">
            Alterações não salvas
          </span>
        )}

        {/* Manual save button */}
        {!readOnly && (mode === "edit" || mode === "split") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={performSave}
            disabled={saving || !hasUnsavedChanges}
            className="gap-1 h-7 text-xs"
            title="Salvar (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
            {!isMobile && "Salvar"}
          </Button>
        )}
      </div>
    </div>
  );

  const outlineJSX = showOutline && toc.length > 0 ? (
    <aside className="w-56 shrink-0 border-l border-border bg-card/50 hidden lg:block">
      <div className="p-3 border-b border-border">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ListTree className="w-4 h-4" />
          Índice
        </h4>
      </div>
      <ScrollArea className="h-[calc(100%-48px)]">
        <nav className="p-2 space-y-0.5">
          {toc.map((item, index) => (
            <button
              key={index}
              onClick={() => handleTOCClick(item.id)}
              className={cn(
                "block w-full text-left text-sm transition-colors hover:text-primary cursor-pointer",
                "text-muted-foreground hover:bg-muted rounded px-2 py-1",
                item.level === 1 && "font-medium text-foreground",
                item.level === 2 && "pl-4",
                item.level === 3 && "pl-6 text-xs",
                item.level >= 4 && "pl-8 text-xs"
              )}
            >
              {item.text}
            </button>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  ) : null;

  const proseStyle = { fontSize: `${zoom}%` };

  const titleJSX = (
    <div className="px-6 pt-5 pb-1">
      {mode !== "view" ? (
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-2xl font-bold border-none shadow-none px-0 h-auto py-1 focus-visible:ring-0 bg-transparent leading-tight"
          placeholder="Título do documento..."
          style={proseStyle}
        />
      ) : (
        <h2 className="text-2xl font-bold text-foreground leading-tight" style={proseStyle}>
          {title}
        </h2>
      )}
    </div>
  );

  const contentJSX = mode === "edit" ? (
    <div className="flex-1 overflow-y-auto" style={proseStyle}>
      <RichTextEditor
        content={content}
        onChange={setContent}
        onUploadImage={onUploadImage}
        placeholder="Digite '/' para comandos..."
        className="border-0 rounded-none min-h-[500px]"
      />
    </div>
  ) : mode === "split" ? (
    <div className="flex-1 flex overflow-hidden">
      {/* Visual editor side */}
      <div className="flex-1 overflow-y-auto border-r border-border" style={proseStyle}>
        <RichTextEditor
          content={content}
          onChange={setContent}
          onUploadImage={onUploadImage}
          placeholder="Digite '/' para comandos..."
          className="border-0 rounded-none"
        />
      </div>
      {/* Preview side */}
      <div ref={previewRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="prose max-w-none" style={proseStyle}>
          {content ? (
            <MarkdownViewer content={content} variant="compact" enableTOC={false} />
          ) : (
            <p className="text-muted-foreground text-center py-8">Preview aparecerá aqui...</p>
          )}
        </div>
      </div>
    </div>
  ) : (
    // View mode — click to edit
    <div
      className="flex-1 overflow-y-auto px-6 py-4 cursor-text"
      onClick={() => { if (!readOnly) setMode("edit"); }}
    >
      <div className="prose max-w-none" style={proseStyle}>
        {content ? (
          <MarkdownViewer content={content} variant="compact" enableTOC={false} />
        ) : (
          <p className="text-muted-foreground text-center py-8">
            {readOnly ? "Documento vazio." : "Clique para começar a escrever..."}
          </p>
        )}
      </div>
    </div>
  );

  const editorContent = (
    <div className="flex flex-col h-full">
      {toolbarJSX}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {titleJSX}
          {contentJSX}
        </div>
        {outlineJSX}
      </div>
    </div>
  );

  return (
    <>
      {editorContent}

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>Editor em tela cheia - {title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {editorContent}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
