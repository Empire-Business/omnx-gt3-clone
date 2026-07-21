import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileText, FolderOpen, Plus, Sparkles, Users, MoreHorizontal, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKnowledgeBase } from "@/hooks/useKnowledgeBase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

/* ════════════════════════════════════════════
   DOCUMENTO EDITOR — 3-col layout fiel ao design
   /documento/:id
   ════════════════════════════════════════════ */

interface OutlineItem {
  level: number; // 2 = h2, 3 = h3
  text: string;
  id: string;
}

function extractOutline(markdown: string): OutlineItem[] {
  const lines = markdown.split("\n");
  const out: OutlineItem[] = [];
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
      out.push({ level, text, id });
    }
  }
  return out;
}

export default function DocumentoEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const kb = useKnowledgeBase();

  const allDocs = [...kb.documents, ...kb.personalDocs, ...kb.sharedWithMe];
  const doc = useMemo(() => allDocs.find((d) => d.id === id) || null, [allDocs, id]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pagesCollapsed, setPagesCollapsed] = useState(false);
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title);
    setContent(doc.content || "");
    setHasChanges(false);
  }, [doc?.id]);

  // Auto-save 1.5s após mudança
  useEffect(() => {
    if (!hasChanges || !doc) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await kb.updateDocument.mutateAsync({ id: doc.id, updates: { title, content } });
        setHasChanges(false);
      } catch (e: any) {
        toast.error(e.message || "Erro ao salvar");
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [hasChanges, title, content]);

  const outline = useMemo(() => extractOutline(content), [content]);

  // Pasta atual + irmãos (mesma pasta)
  const currentFolder = doc?.folder_id ? kb.folders.find((f) => f.id === doc.folder_id) : null;
  const siblings = useMemo(() => {
    return allDocs
      .filter((d) => d.folder_id === doc?.folder_id && (doc?.is_personal === d.is_personal))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title));
  }, [allDocs, doc?.folder_id, doc?.is_personal]);

  // Permissões básicas
  const canEdit = !!doc && (
    doc.is_personal ? doc.owner_id === user?.id : true // simplificado; lógica completa fica no Repositorio
  );

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText className="w-12 h-12 text-muted-foreground/40 mb-3" />
        <p className="text-foreground font-medium">Documento não encontrado</p>
        <p className="text-sm text-muted-foreground mt-1">Pode ter sido excluído ou você não tem acesso.</p>
        <Button variant="ghost" size="sm" className="mt-4 gap-1.5" onClick={() => navigate("/repositorio")}>
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Repositório
        </Button>
      </div>
    );
  }

  const updated = new Date(doc.updated_at);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -mx-3 -my-3 md:-mx-5 md:-my-4 bg-background">
      {/* Coluna 1 — Pages tree */}
      {!pagesCollapsed && (
        <aside className="w-[230px] flex-shrink-0 border-r border-border flex flex-col">
          <div className="px-3 py-3 flex items-center justify-between">
            <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em]">Páginas</p>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPagesCollapsed(true)} title="Recolher">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1 px-1.5 pb-3">
            {/* Pasta atual */}
            {currentFolder && (
              <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] font-medium text-muted-foreground">
                <FolderOpen className="w-3.5 h-3.5" />
                {currentFolder.name}
              </div>
            )}
            <div className="flex flex-col gap-px mt-1">
              {siblings.map((d) => {
                const active = d.id === doc.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => navigate(`/documento/${d.id}`)}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1 rounded text-[12.5px] text-left transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <FileText className={cn("w-3 h-3 flex-shrink-0", active ? "text-primary" : "text-muted-foreground/60")} />
                    <span className="truncate flex-1">{d.title}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => navigate("/repositorio")}
              className="flex items-center gap-2 w-full px-2 py-1 mt-1 rounded text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Plus className="w-3 h-3" /> Nova página
            </button>
          </ScrollArea>
        </aside>
      )}

      {/* Botão pra reabrir pages tree quando colapsada */}
      {pagesCollapsed && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 self-start mt-3 ml-2"
          onClick={() => setPagesCollapsed(false)}
          title="Mostrar páginas"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      )}

      {/* Coluna 2 — Editor canvas */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Drawer header */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/repositorio")}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Repositório
          </Button>
          <span className="text-muted-foreground/50">/</span>
          {currentFolder && (
            <>
              <span className="text-[12px] text-muted-foreground">{currentFolder.name}</span>
              <span className="text-muted-foreground/50">/</span>
            </>
          )}
          <span className="text-[12px] font-medium truncate">{title || "Sem título"}</span>
          <div className="flex-1" />
          {saving && <span className="text-[11px] text-muted-foreground">Salvando…</span>}
          {!saving && hasChanges && <span className="text-[11px] text-warning">Alterações pendentes</span>}
          {!saving && !hasChanges && <span className="text-[11px] text-success">Salvo</span>}
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs ml-2" onClick={() => toast.info("Compartilhamento — em breve")}>
            <Users className="w-3.5 h-3.5" /> Compartilhar
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="IA">
            <Sparkles className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Mais">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Canvas */}
        <ScrollArea className="flex-1">
          <div className="max-w-[760px] mx-auto px-10 py-10">
            <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] mb-2">
              Documento · atualizado há {formatDistanceToNow(updated, { locale: ptBR, addSuffix: false })} · {format(updated, "dd/MM/yyyy 'às' HH:mm")}
            </p>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setHasChanges(true); }}
              placeholder="Título do documento"
              disabled={!canEdit}
              className="text-[36px] font-bold tracking-tight leading-tight border-0 bg-transparent shadow-none px-0 h-auto py-1 focus-visible:ring-0 placeholder:text-muted-foreground/40"
            />
            <div className="mt-6">
              {doc.type === "document" ? (
                <RichTextEditor
                  content={content}
                  onChange={(md) => { setContent(md); setHasChanges(true); }}
                  onUploadImage={kb.uploadImage}
                  readOnly={!canEdit}
                  className="border-0 rounded-none px-0"
                />
              ) : (
                <div className="text-center py-12">
                  <a
                    href={doc.link_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline text-[15px]"
                  >
                    {doc.link_url}
                  </a>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </main>

      {/* Coluna 3 — Outline */}
      {!outlineCollapsed && (
        <aside className="w-[220px] flex-shrink-0 border-l border-border flex flex-col">
          <div className="px-3 py-3 flex items-center justify-between">
            <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em]">Sumário</p>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setOutlineCollapsed(true)} title="Recolher">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1 px-3 pb-3">
            {outline.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 italic px-1">
                Adicione cabeçalhos (## ou ###) ao texto para gerar o sumário.
              </p>
            ) : (
              <div className="flex flex-col gap-px">
                {outline.map((it, i) => (
                  <a
                    key={i}
                    href={`#${it.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById(it.id);
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={cn(
                      "block py-1 text-[12px] truncate transition-colors hover:text-foreground",
                      it.level === 2 ? "pl-1 font-medium text-foreground/80" : "pl-4 text-muted-foreground"
                    )}
                  >
                    {it.text}
                  </a>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>
      )}

      {/* Botão pra reabrir outline quando colapsado */}
      {outlineCollapsed && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 self-start mt-3 mr-2"
          onClick={() => setOutlineCollapsed(false)}
          title="Mostrar sumário"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
