import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Pin, PinOff, Archive, ArchiveRestore, Trash2, Tag as TagIcon,
  Eye, Pencil, X, Loader2, FileText, Bold, Italic, ListChecks, List, Heading1,
  Heading2, Code, Link2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNotes, extractTagsFromBody } from "@/hooks/useNotes";

function formatNoteDate(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return `hoje · ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `ontem · ${format(d, "HH:mm")}`;
  return format(d, "dd MMM · HH:mm", { locale: ptBR });
}

const COLORS: { id: string; name: string; class: string; bar: string }[] = [
  { id: "default", name: "Padrão", class: "bg-card", bar: "bg-muted-foreground/30" },
  { id: "yellow",  name: "Amarelo", class: "bg-amber-50 dark:bg-amber-950/30", bar: "bg-amber-500" },
  { id: "green",   name: "Verde",   class: "bg-emerald-50 dark:bg-emerald-950/30", bar: "bg-emerald-500" },
  { id: "blue",    name: "Azul",    class: "bg-blue-50 dark:bg-blue-950/30", bar: "bg-blue-500" },
  { id: "purple",  name: "Roxo",    class: "bg-purple-50 dark:bg-purple-950/30", bar: "bg-purple-500" },
  { id: "pink",    name: "Rosa",    class: "bg-pink-50 dark:bg-pink-950/30", bar: "bg-pink-500" },
];
const colorFor = (id: string | null | undefined) =>
  COLORS.find((c) => c.id === id) || COLORS[0];

export function NotesView() {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: notes = [], isLoading, create, update, remove, togglePin, toggleArchive } = useNotes({
    archived: showArchived,
    search,
    tag,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, [notes, selectedId]);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) || null, [notes, selectedId]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of n.tags) set.add(t);
    return [...set].sort();
  }, [notes]);

  const editTitleRef = useRef<string>("");
  const editBodyRef = useRef<string>("");
  const editColorRef = useRef<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const saveTimer = useRef<any>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!selected) {
      setEditTitle(""); setEditBody(""); setEditColor(null);
      editTitleRef.current = ""; editBodyRef.current = ""; editColorRef.current = null;
      return;
    }
    setEditTitle(selected.title);
    setEditBody(selected.body_md);
    setEditColor(selected.color);
    editTitleRef.current = selected.title;
    editBodyRef.current = selected.body_md;
    editColorRef.current = selected.color;
    setSaveStatus("saved");
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    const titleDirty = editTitle !== editTitleRef.current;
    const bodyDirty = editBody !== editBodyRef.current;
    const colorDirty = editColor !== editColorRef.current;
    if (!titleDirty && !bodyDirty && !colorDirty) return;
    setSaveStatus("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const tags = extractTagsFromBody(editBody);
      setSaveStatus("saving");
      update.mutate(
        { id: selected.id, title: editTitle, body_md: editBody, color: editColor, tags },
        {
          onSuccess: () => {
            editTitleRef.current = editTitle;
            editBodyRef.current = editBody;
            editColorRef.current = editColor;
            setSaveStatus("saved");
          },
          onError: () => setSaveStatus("dirty"),
        }
      );
    }, 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [editTitle, editBody, editColor, selected]); // eslint-disable-line

  const handleNew = () => {
    create.mutate(
      { title: "Nova anotação", body_md: "" },
      {
        onSuccess: (n) => {
          setSelectedId(n.id);
          setPreviewMode(false);
          setTimeout(() => bodyTextareaRef.current?.focus(), 50);
        },
      }
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!confirm("Apagar esta anotação? Esta ação não pode ser desfeita.")) return;
    remove.mutate(selected.id, {
      onSuccess: () => { toast.success("Anotação apagada"); setSelectedId(null); },
    });
  };

  const handleTogglePin = () => {
    if (!selected) return;
    togglePin.mutate({ id: selected.id, pinned: !selected.pinned });
  };

  const handleToggleArchive = () => {
    if (!selected) return;
    toggleArchive.mutate({ id: selected.id, archived: !selected.archived });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line

  const wrapSelection = (before: string, after: string = before) => {
    const ta = bodyTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const v = editBody;
    const sel = v.slice(start, end) || "texto";
    const next = v.slice(0, start) + before + sel + after + v.slice(end);
    setEditBody(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + sel.length);
    }, 0);
  };
  const insertAtLineStart = (prefix: string) => {
    const ta = bodyTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const v = editBody;
    const lineStart = v.lastIndexOf("\n", start - 1) + 1;
    const next = v.slice(0, lineStart) + prefix + v.slice(lineStart);
    setEditBody(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  };

  return (
    <div className="flex flex-1 min-w-0 h-full">
      {/* Lista de notas */}
      <aside className="w-72 flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm font-semibold text-foreground">Anotações</h1>
            <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5" /> Nova
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar anotações..."
              className="h-8 text-xs pl-8"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex items-center flex-wrap gap-1">
              {tag && (
                <button
                  onClick={() => setTag(null)}
                  className="text-2xs px-2 py-0.5 rounded-full border border-primary bg-primary/10 text-primary inline-flex items-center gap-1"
                >
                  #{tag} <X className="w-2.5 h-2.5" />
                </button>
              )}
              {allTags.filter((t) => t !== tag).slice(0, 8).map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(t)}
                  className="text-2xs px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:bg-muted"
                >#{t}</button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="w-full text-2xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {showArchived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
            {showArchived ? "Mostrar ativas" : "Mostrar arquivadas"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Carregando...</div>
          ) : notes.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {search || tag ? "Nada encontrado." : "Nenhuma anotação ainda."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notes.map((n) => {
                const c = colorFor(n.color);
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => setSelectedId(n.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors flex gap-2 group",
                        selectedId === n.id && "bg-muted/60"
                      )}
                    >
                      <span className={cn("w-1 rounded-full flex-shrink-0", c.bar)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className={cn(
                            "text-xs font-semibold truncate",
                            n.title ? "text-foreground" : "text-muted-foreground italic"
                          )}>{n.title || "Sem título"}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {n.pinned && <Pin className="w-3 h-3 text-primary" />}
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {formatNoteDate(n.updated_at)}
                            </span>
                          </div>
                        </div>
                        <p className="text-2xs text-muted-foreground line-clamp-2 mt-0.5">
                          {n.body_md.slice(0, 140) || "Vazio"}
                        </p>
                        {n.tags.length > 0 && (
                          <div className="flex items-center flex-wrap gap-1 mt-1">
                            {n.tags.slice(0, 3).map((t) => (
                              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                #{t}
                              </span>
                            ))}
                            {n.tags.length > 3 && (
                              <span className="text-[9px] text-muted-foreground">+{n.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <main className={cn("flex-1 flex flex-col min-w-0", colorFor(editColor).class)}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <FileText className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <h2 className="text-sm font-semibold text-foreground">Nenhuma anotação selecionada</h2>
            <p className="text-xs text-muted-foreground mt-1">Crie uma nova ou selecione na lista ao lado.</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5" /> Nova anotação
            </Button>
            <p className="text-2xs text-muted-foreground mt-3 font-mono">Ctrl+Shift+N</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b border-border bg-card/40 backdrop-blur">
              <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                {saveStatus === "saving" && (
                  <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</span>
                )}
                {saveStatus === "saved" && <span>Salvo · {formatNoteDate(selected.updated_at)}</span>}
                {saveStatus === "dirty" && <span className="text-amber-500">Alterações não salvas</span>}
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5 mr-1">
                  {COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setEditColor(c.id === "default" ? null : c.id)}
                      title={c.name}
                      className={cn(
                        "w-4 h-4 rounded-full border transition-transform",
                        c.bar,
                        (editColor || "default") === c.id ? "border-foreground scale-110" : "border-border hover:scale-105"
                      )}
                    />
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewMode((v) => !v)} title={previewMode ? "Editar" : "Pré-visualizar"}>
                  {previewMode ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className={cn("h-7 w-7 p-0", selected.pinned && "text-primary")} onClick={handleTogglePin} title={selected.pinned ? "Desafixar" : "Fixar"}>
                  {selected.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleToggleArchive} title={selected.archived ? "Desarquivar" : "Arquivar"}>
                  {selected.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={handleDelete} title="Apagar">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {!previewMode && (
              <div className="flex items-center gap-0.5 px-5 py-1.5 border-b border-border bg-card/30">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Título 1" onClick={() => insertAtLineStart("# ")}><Heading1 className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Título 2" onClick={() => insertAtLineStart("## ")}><Heading2 className="w-3.5 h-3.5" /></Button>
                <span className="w-px h-4 bg-border mx-1" />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Negrito" onClick={() => wrapSelection("**")}><Bold className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Itálico" onClick={() => wrapSelection("*")}><Italic className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Código" onClick={() => wrapSelection("`")}><Code className="w-3.5 h-3.5" /></Button>
                <span className="w-px h-4 bg-border mx-1" />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Lista" onClick={() => insertAtLineStart("- ")}><List className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Checklist" onClick={() => insertAtLineStart("- [ ] ")}><ListChecks className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Link" onClick={() => { const url = prompt("URL:"); if (url) wrapSelection("[", `](${url})`); }}><Link2 className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Tag" onClick={() => {
                  const t = prompt("Nome da tag (sem #):");
                  if (t) {
                    const ta = bodyTextareaRef.current;
                    const cursor = ta?.selectionStart ?? editBody.length;
                    const next = editBody.slice(0, cursor) + ` #${t.trim()} ` + editBody.slice(cursor);
                    setEditBody(next);
                  }
                }}><TagIcon className="w-3.5 h-3.5" /></Button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Título"
                className="w-full bg-transparent text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground/60 mb-2"
              />
              {previewMode ? (
                editBody.trim() ? (
                  <article className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{editBody}</ReactMarkdown>
                  </article>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Sem conteúdo.</p>
                )
              ) : (
                <textarea
                  ref={bodyTextareaRef}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder={`Escreva sua anotação em markdown...\n\nUse # para títulos, **bold**, - para listas, - [ ] para checklists, #tags para organizar.`}
                  className="w-full min-h-[60vh] bg-transparent text-sm text-foreground outline-none resize-none leading-relaxed font-mono"
                />
              )}
              {selected.tags.length > 0 && (
                <div className="flex items-center flex-wrap gap-1 mt-4 pt-3 border-t border-border">
                  <span className="text-2xs text-muted-foreground mr-1">Tags:</span>
                  {selected.tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTag(t)}
                      className="text-2xs px-2 py-0.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                    >#{t}</button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
