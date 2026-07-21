import { useState, useMemo } from "react";
import {
  BookOpen, FolderPlus, FilePlus, Link2, Search,
  Folder, FileText, ChevronRight, ChevronDown,
  MoreHorizontal, Pencil, Trash2, Shield, Share2,
  User, Users, Lock, Globe, ArrowLeft, ExternalLink,
  Loader2, Plus, FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { useKnowledgeBase, KBFolder, KBDocument } from "@/hooks/useKnowledgeBase";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ---- Tree Node Component ----
function TreeNode({
  folder,
  folders,
  documents,
  level,
  expandedIds,
  toggleExpand,
  selectedDocId,
  onSelectDoc,
  onSelectFolder,
  canManage,
  onRenameFolder,
  onDeleteFolder,
  onCreateSubfolder,
  onCreateDoc,
}: {
  folder: KBFolder;
  folders: KBFolder[];
  documents: KBDocument[];
  level: number;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  selectedDocId: string | null;
  onSelectDoc: (id: string) => void;
  onSelectFolder: (id: string) => void;
  canManage: boolean;
  onRenameFolder: (f: KBFolder) => void;
  onDeleteFolder: (id: string) => void;
  onCreateSubfolder: (parentId: string) => void;
  onCreateDoc: (folderId: string) => void;
}) {
  const isExpanded = expandedIds.has(folder.id);
  const children = folders.filter((f) => f.parent_id === folder.id);
  const docs = documents.filter((d) => d.folder_id === folder.id);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer group hover:bg-muted/50 transition-colors",
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          toggleExpand(folder.id);
          onSelectFolder(folder.id);
        }}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}
        {isExpanded ? (
          <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-sm text-foreground truncate flex-1">{folder.name}</span>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateDoc(folder.id); }}>
                <FilePlus className="w-4 h-4 mr-2" /> Novo documento
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateSubfolder(folder.id); }}>
                <FolderPlus className="w-4 h-4 mr-2" /> Nova subpasta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRenameFolder(folder); }}>
                <Pencil className="w-4 h-4 mr-2" /> Renomear
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }}
                className="text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {isExpanded && (
        <>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              folder={child}
              folders={folders}
              documents={documents}
              level={level + 1}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              selectedDocId={selectedDocId}
              onSelectDoc={onSelectDoc}
              onSelectFolder={onSelectFolder}
              canManage={canManage}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onCreateSubfolder={onCreateSubfolder}
              onCreateDoc={onCreateDoc}
            />
          ))}
          {docs.map((doc) => (
            <div
              key={doc.id}
              className={cn(
                "flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                selectedDocId === doc.id && "bg-accent"
              )}
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
              onClick={() => onSelectDoc(doc.id)}
            >
              {doc.type === "link" ? (
                <Link2 className="w-4 h-4 text-info flex-shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="text-sm text-foreground truncate">{doc.title}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function Repositorio() {
  const { user } = useAuth();
  const { isAdmin, isManager } = usePermissions();
  const canManage = isAdmin || isManager;
  const kb = useKnowledgeBase();

  const [activeTab, setActiveTab] = useState<"empresa" | "pessoal">("empresa");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string>("");
  const [editingTitle, setEditingTitle] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocType, setNewDocType] = useState<"document" | "link">("document");
  const [newDocLink, setNewDocLink] = useState("");
  const [newDocFolder, setNewDocFolder] = useState<string | null>(null);
  const [renameFolder, setRenameFolder] = useState<KBFolder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  // Share dialog
  const [shareDocId, setShareDocId] = useState<string | null>(null);
  const [shareUserId, setShareUserId] = useState("");

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Get the documents list based on active tab
  const allDocs = activeTab === "empresa" ? kb.documents : [...kb.personalDocs, ...kb.sharedWithMe];
  const rootFolders = kb.folders.filter((f) => !f.parent_id);
  const rootDocs = (activeTab === "empresa" ? kb.documents : kb.personalDocs).filter((d) => !d.folder_id);

  // Recents — 4 docs mais recentemente atualizados
  const recentDocs = useMemo(() => {
    return [...allDocs]
      .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
      .slice(0, 4);
  }, [allDocs]);

  // Filtered docs for search
  const filteredDocs = useMemo(() => {
    if (!search.trim()) return allDocs;
    const q = search.toLowerCase();
    return allDocs.filter((d) => d.title.toLowerCase().includes(q));
  }, [allDocs, search]);

  // Selected document
  const selectedDoc = allDocs.find((d) => d.id === selectedDocId) || null;

  // When selecting a document, load its content
  const handleSelectDoc = (id: string) => {
    if (hasChanges && selectedDocId) {
      if (!confirm("Você tem alterações não salvas. Deseja descartar?")) return;
    }
    const doc = allDocs.find((d) => d.id === id);
    if (doc) {
      setSelectedDocId(id);
      setEditingContent(doc.content || "");
      setEditingTitle(doc.title);
      setHasChanges(false);
    }
  };

  const handleSave = async () => {
    if (!selectedDocId) return;
    try {
      await kb.updateDocument.mutateAsync({
        id: selectedDocId,
        updates: { title: editingTitle, content: editingContent },
      });
      setHasChanges(false);
      toast.success("Documento salvo!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await kb.createFolder.mutateAsync({ name: newFolderName.trim(), parentId: newFolderParent });
      setNewFolderOpen(false);
      setNewFolderName("");
      setNewFolderParent(null);
      toast.success("Pasta criada!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCreateDoc = async () => {
    if (!newDocTitle.trim()) return;
    try {
      const doc = await kb.createDocument.mutateAsync({
        title: newDocTitle.trim(),
        folderId: newDocFolder,
        type: newDocType,
        linkUrl: newDocType === "link" ? newDocLink : undefined,
        isPersonal: activeTab === "pessoal",
      });
      setNewDocOpen(false);
      setNewDocTitle("");
      setNewDocLink("");
      setNewDocType("document");
      setNewDocFolder(null);
      if (doc) handleSelectDoc(doc.id);
      toast.success("Documento criado!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRenameFolder = async () => {
    if (!renameFolder || !renameFolderName.trim()) return;
    try {
      await kb.updateFolder.mutateAsync({ id: renameFolder.id, name: renameFolderName.trim() });
      setRenameFolder(null);
      toast.success("Pasta renomeada!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm("Excluir esta pasta e todo seu conteúdo?")) return;
    try {
      await kb.deleteFolder.mutateAsync(id);
      toast.success("Pasta excluída!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteDoc = async () => {
    if (!selectedDocId || !confirm("Excluir este documento?")) return;
    try {
      await kb.deleteDocument.mutateAsync(selectedDocId);
      setSelectedDocId(null);
      toast.success("Documento excluído!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const canEditSelectedDoc = selectedDoc
    ? selectedDoc.is_personal
      ? selectedDoc.owner_id === user?.id
      : canManage
    : false;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] mb-1">Documentos</p>
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Repositório de Conteúdos
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Base de conhecimento da empresa e documentos pessoais
          </p>
        </div>
      </div>

      {/* Recentes — 4 docs mais recentemente atualizados */}
      {recentDocs.length > 0 && (
        <div>
          <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-[0.08em] mb-2.5">Recentes</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {recentDocs.map((doc) => {
              const updated = new Date(doc.updated_at);
              const when = formatDistanceToNow(updated, { locale: ptBR, addSuffix: false });
              return (
                <button
                  key={doc.id}
                  onClick={() => { setActiveTab(doc.is_personal ? "pessoal" : "empresa"); handleSelectDoc(doc.id); }}
                  className="bg-card rounded-md shadow-sm hover:shadow-md transition-shadow p-3 text-left group"
                >
                  <div className="h-16 rounded-md mb-2 flex items-center justify-center bg-[repeating-linear-gradient(135deg,hsl(var(--primary)/0.08)_0,hsl(var(--primary)/0.08)_8px,transparent_8px,transparent_16px)] bg-secondary">
                    <FileText className="w-6 h-6 text-primary/70" />
                  </div>
                  <p className="text-[13px] font-semibold truncate group-hover:text-primary transition-colors">{doc.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">há {when}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs: Empresa / Pessoal */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setSelectedDocId(null); }}>
        <TabsList>
          <TabsTrigger value="empresa" className="gap-1.5">
            <Globe className="w-4 h-4" /> Empresa
          </TabsTrigger>
          <TabsTrigger value="pessoal" className="gap-1.5">
            <Lock className="w-4 h-4" /> Meus Documentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="empresa" className="mt-4">
          <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[500px]">
            {/* Sidebar */}
            <div className="w-72 flex-shrink-0 rounded-md bg-card shadow-sm flex flex-col">
              <div className="p-3 border-b border-border space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button
                      variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1"
                      onClick={() => { setNewFolderParent(null); setNewFolderOpen(true); }}
                    >
                      <FolderPlus className="w-3.5 h-3.5" /> Pasta
                    </Button>
                    <Button
                      variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1"
                      onClick={() => { setNewDocFolder(null); setNewDocOpen(true); }}
                    >
                      <FilePlus className="w-3.5 h-3.5" /> Documento
                    </Button>
                  </div>
                )}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1">
                  {search.trim() ? (
                    filteredDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className={cn(
                          "flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted/50",
                          selectedDocId === doc.id && "bg-accent"
                        )}
                        onClick={() => handleSelectDoc(doc.id)}
                      >
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm truncate">{doc.title}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      {rootFolders.map((folder) => (
                        <TreeNode
                          key={folder.id}
                          folder={folder}
                          folders={kb.folders}
                          documents={kb.documents}
                          level={0}
                          expandedIds={expandedIds}
                          toggleExpand={toggleExpand}
                          selectedDocId={selectedDocId}
                          onSelectDoc={handleSelectDoc}
                          onSelectFolder={setSelectedFolderId}
                          canManage={canManage}
                          onRenameFolder={(f) => { setRenameFolder(f); setRenameFolderName(f.name); }}
                          onDeleteFolder={handleDeleteFolder}
                          onCreateSubfolder={(parentId) => { setNewFolderParent(parentId); setNewFolderOpen(true); }}
                          onCreateDoc={(folderId) => { setNewDocFolder(folderId); setNewDocOpen(true); }}
                        />
                      ))}
                      {rootDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className={cn(
                            "flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted/50",
                            selectedDocId === doc.id && "bg-accent"
                          )}
                          onClick={() => handleSelectDoc(doc.id)}
                        >
                          {doc.type === "link" ? (
                            <Link2 className="w-4 h-4 text-info flex-shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="text-sm truncate">{doc.title}</span>
                        </div>
                      ))}
                      {rootFolders.length === 0 && rootDocs.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Nenhum conteúdo ainda</p>
                          {canManage && <p className="text-xs mt-1">Crie uma pasta ou documento para começar</p>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Editor */}
            <div className="flex-1 border border-border rounded-lg bg-card flex flex-col overflow-hidden">
              {selectedDoc ? (
                <>
                  {/* Doc header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {canEditSelectedDoc ? (
                        <Input
                          value={editingTitle}
                          onChange={(e) => { setEditingTitle(e.target.value); setHasChanges(true); }}
                          className="text-lg font-semibold border-none shadow-none px-0 focus-visible:ring-0 bg-transparent"
                        />
                      ) : (
                        <h2 className="text-lg font-semibold text-foreground truncate">{selectedDoc.title}</h2>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {selectedDoc.type === "link" && selectedDoc.link_url && (
                        <Button variant="outline" size="sm" className="gap-1" asChild>
                          <a href={selectedDoc.link_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-3.5 h-3.5" /> Abrir link
                          </a>
                        </Button>
                      )}
                      {canEditSelectedDoc && (
                        <>
                          <Button
                            size="sm" onClick={handleSave}
                            disabled={!hasChanges || kb.updateDocument.isPending}
                            className="gap-1"
                          >
                            {kb.updateDocument.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Salvar
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDeleteDoc}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Doc content */}
                  {selectedDoc.type === "document" ? (
                    <div className="flex-1 overflow-y-auto">
                      <RichTextEditor
                        content={editingContent}
                        onChange={(md) => { setEditingContent(md); setHasChanges(true); }}
                        onUploadImage={kb.uploadImage}
                        readOnly={!canEditSelectedDoc}
                        className="border-0 rounded-none"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <Link2 className="w-12 h-12 text-info mx-auto mb-3" />
                        <p className="text-foreground font-medium">{selectedDoc.title}</p>
                        {selectedDoc.link_url && (
                          <a href={selectedDoc.link_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline mt-1 block">
                            {selectedDoc.link_url}
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Selecione um documento para visualizar</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pessoal" className="mt-4">
          <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[500px]">
            {/* Personal sidebar */}
            <div className="w-72 flex-shrink-0 rounded-md bg-card shadow-sm flex flex-col">
              <div className="p-3 border-b border-border space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <Button
                  variant="outline" size="sm" className="w-full h-7 text-xs gap-1"
                  onClick={() => { setNewDocFolder(null); setNewDocOpen(true); }}
                >
                  <FilePlus className="w-3.5 h-3.5" /> Novo documento pessoal
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1">
                  {kb.personalDocs.length > 0 && (
                    <div className="mb-2">
                      <p className="text-2xs font-mono uppercase tracking-wider text-muted-foreground px-3 py-1.5">Meus documentos</p>
                      {kb.personalDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className={cn(
                            "flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted/50 group",
                            selectedDocId === doc.id && "bg-accent"
                          )}
                          onClick={() => handleSelectDoc(doc.id)}
                        >
                          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate flex-1">{doc.title}</span>
                          <Button
                            variant="ghost" size="sm"
                            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => { e.stopPropagation(); setShareDocId(doc.id); }}
                            title="Compartilhar"
                          >
                            <Share2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {kb.sharedWithMe.length > 0 && (
                    <div>
                      <p className="text-2xs font-mono uppercase tracking-wider text-muted-foreground px-3 py-1.5">Compartilhados comigo</p>
                      {kb.sharedWithMe.map((doc) => (
                        <div
                          key={doc.id}
                          className={cn(
                            "flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted/50",
                            selectedDocId === doc.id && "bg-accent"
                          )}
                          onClick={() => handleSelectDoc(doc.id)}
                        >
                          <Share2 className="w-4 h-4 text-info flex-shrink-0" />
                          <span className="text-sm truncate">{doc.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {kb.personalDocs.length === 0 && kb.sharedWithMe.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhum documento pessoal</p>
                      <p className="text-xs mt-1">Crie documentos que só você pode ver</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Personal editor (same as empresa) */}
            <div className="flex-1 border border-border rounded-lg bg-card flex flex-col overflow-hidden">
              {selectedDoc ? (
                <>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {canEditSelectedDoc ? (
                        <Input
                          value={editingTitle}
                          onChange={(e) => { setEditingTitle(e.target.value); setHasChanges(true); }}
                          className="text-lg font-semibold border-none shadow-none px-0 focus-visible:ring-0 bg-transparent"
                        />
                      ) : (
                        <h2 className="text-lg font-semibold text-foreground truncate">{selectedDoc.title}</h2>
                      )}
                      {selectedDoc.is_personal && selectedDoc.owner_id !== user?.id && (
                        <Badge variant="secondary" className="text-2xs gap-1">
                          <Share2 className="w-3 h-3" /> Compartilhado
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canEditSelectedDoc && (
                        <>
                          <Button
                            size="sm" onClick={handleSave}
                            disabled={!hasChanges || kb.updateDocument.isPending}
                            className="gap-1"
                          >
                            {kb.updateDocument.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Salvar
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDeleteDoc}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <RichTextEditor
                      content={editingContent}
                      onChange={(md) => { setEditingContent(md); setHasChanges(true); }}
                      onUploadImage={kb.uploadImage}
                      readOnly={!canEditSelectedDoc}
                      className="border-0 rounded-none"
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Selecione um documento para visualizar</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ---- DIALOGS ---- */}

      {/* New Folder */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Pasta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome da pasta</Label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ex: Políticas internas"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || kb.createFolder.isPending}>
              {kb.createFolder.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder */}
      <Dialog open={!!renameFolder} onOpenChange={(open) => { if (!open) setRenameFolder(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear Pasta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Novo nome</Label>
              <Input
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(); }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameFolder(null)}>Cancelar</Button>
            <Button onClick={handleRenameFolder} disabled={!renameFolderName.trim()}>Renomear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Document */}
      <Dialog open={newDocOpen} onOpenChange={setNewDocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeTab === "pessoal" ? "Novo Documento Pessoal" : "Novo Documento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Título</Label>
              <Input
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Título do documento"
                autoFocus
              />
            </div>
            {activeTab === "empresa" && (
              <div>
                <Label>Tipo</Label>
                <Select value={newDocType} onValueChange={(v) => setNewDocType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="document">Documento</SelectItem>
                    <SelectItem value="link">Link externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {newDocType === "link" && (
              <div>
                <Label>URL</Label>
                <Input
                  value={newDocLink}
                  onChange={(e) => setNewDocLink(e.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDocOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateDoc} disabled={!newDocTitle.trim() || kb.createDocument.isPending}>
              {kb.createDocument.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Document */}
      <Dialog open={!!shareDocId} onOpenChange={(open) => { if (!open) setShareDocId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compartilhar Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>ID do usuário para compartilhar</Label>
              <Input
                value={shareUserId}
                onChange={(e) => setShareUserId(e.target.value)}
                placeholder="Cole o ID do usuário..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Peça ao usuário o ID dele na página de Perfil
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDocId(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!shareDocId || !shareUserId.trim()) return;
                try {
                  await kb.shareDocument.mutateAsync({ documentId: shareDocId, sharedWith: shareUserId.trim() });
                  setShareDocId(null);
                  setShareUserId("");
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
              disabled={!shareUserId.trim() || kb.shareDocument.isPending}
            >
              {kb.shareDocument.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Compartilhar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
