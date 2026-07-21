import { useState, useMemo } from "react";
import { Download, Share2, FolderOpen, Menu, Upload, FilePlus2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProcessDocuments } from "@/hooks/useProcessDocuments";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProcessDocTree } from "@/components/processes/ProcessDocTree";
import { ProcessDocEditor } from "@/components/processes/ProcessDocEditor";
import { ProcessDocUpload } from "@/components/processes/ProcessDocUpload";
import { ProcessDocShareDialog } from "@/components/processes/ProcessDocShareDialog";
import { exportDocumentAsMd, exportDocumentAsPdf, exportFolderAsZip } from "@/lib/export-document";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { DocFolder, DocDocument } from "@/types/documents";

interface Props {
  processId: string;
}

export function ProcessAttachments({ processId }: Props) {
  const isMobile = useIsMobile();
  const {
    folders, documents, isLoading,
    createFolder, updateFolder, deleteFolder, toggleFolderPublic,
    createDocument, updateDocument, deleteDocument, toggleDocPublic,
    reorderFolders, reorderDocs,
    bulkTogglePublic, bulkToggleFolderChildren,
    uploadFile, uploadImage,
    moveDocument, moveMultipleDocs,
  } = useProcessDocuments(processId);
  const { canManageProcesses } = usePermissions();

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFolderId, setImportFolderId] = useState<string | null>(null);
  const [shareItem, setShareItem] = useState<{ item: any; type: "folder" | "document" } | null>(null);
  const [shareProcessOpen, setShareProcessOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  // Cast to shared types for reusable components
  const foldersCompat = folders as unknown as DocFolder[];
  const documentsCompat = documents as unknown as DocDocument[];

  const selectedDoc = useMemo(
    () => documentsCompat.find((d) => d.id === selectedDocId) || null,
    [documentsCompat, selectedDocId]
  );

  const handleCreateDoc = async (folderId?: string | null) => {
    const result = await createDocument.mutateAsync({
      title: "Novo documento",
      folderId,
      content: "",
    });
    setSelectedDocId(result.id);
  };

  const handleSaveDoc = async (id: string, updates: { title?: string; content?: string }) => {
    await updateDocument.mutateAsync({ id, ...updates });
  };

  const handleImport = (folderId?: string | null) => {
    setImportFolderId(folderId || null);
    setImportOpen(true);
  };

  const handleExportDoc = async (format: "md" | "pdf") => {
    if (!selectedDoc) return;
    if (format === "md") {
      exportDocumentAsMd(selectedDoc.title, selectedDoc.content || "");
    } else {
      await exportDocumentAsPdf(selectedDoc.title, selectedDoc.content || "");
    }
  };

  const handleExportAll = async () => {
    await exportFolderAsZip(foldersCompat, documentsCompat, "anexos");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {isMobile ? (
        <div className="flex h-[calc(100vh-12rem)] bg-card rounded-xl border border-border/50 overflow-hidden">
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="gap-2 h-8"
              >
                <Menu className="w-4 h-4" />
                Anexos
              </Button>
              {selectedDoc && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setShareItem({ item: selectedDoc, type: "document" })}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleExportDoc("md")}>Markdown (.md)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportDoc("pdf")}>PDF</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportAll}>Exportar tudo (ZIP)</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              {selectedDoc ? (
                <ProcessDocEditor
                  document={selectedDoc}
                  onSave={handleSaveDoc}
                  onUploadImage={uploadImage}
                  readOnly={!canManageProcesses}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <FolderOpen className="w-7 h-7" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-foreground">Nenhum anexo selecionado</p>
                    <p className="text-xs">Escolha um documento na lista ao lado ou crie um novo.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-full sm:w-80 p-0">
              <div className="h-full p-3 flex flex-col">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Anexos</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs px-2"
                    onClick={() => setShareProcessOpen(true)}
                  >
                    <Share2 className="w-3.5 h-3.5" /> Compartilhar
                  </Button>
                </div>
                <ProcessDocTree
                  folders={foldersCompat}
                  documents={documentsCompat}
                  selectedDocId={selectedDocId}
                  onSelectDoc={(id) => { setSelectedDocId(id); setSidebarOpen(false); }}
                  onCreateFolder={(name, parentId) => createFolder.mutate({ name, parentId })}
                  onRenameFolder={(id, name) => updateFolder.mutate({ id, name })}
                  onDeleteFolder={(id) => { deleteFolder.mutate(id); if (selectedDocId) setSelectedDocId(null); }}
                  onToggleFolderPublic={(id, isPublic) => toggleFolderPublic.mutate({ id, isPublic })}
                  onCreateDoc={(folderId) => { handleCreateDoc(folderId); setSidebarOpen(false); }}
                  onDeleteDoc={(id) => { deleteDocument.mutate(id); if (selectedDocId === id) setSelectedDocId(null); }}
                  onToggleDocPublic={(id, isPublic) => toggleDocPublic.mutate({ id, isPublic })}
                  onShareItem={(item, type) => setShareItem({ item, type })}
                  onReorderFolders={(items) => reorderFolders.mutate(items)}
                  onReorderDocs={(items) => reorderDocs.mutate(items)}
                  onImport={handleImport}
                  canManage={canManageProcesses}
                  onMoveDoc={(docId, targetFolderId) => moveDocument.mutate({ docId, targetFolderId })}
                  onMoveMultipleDocs={(docIds, targetFolderId) => moveMultipleDocs.mutate({ docIds, targetFolderId })}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      ) : (
        <div className="flex flex-col h-[calc(100vh-12rem)] md:h-[680px] bg-card rounded-xl border border-border/50 overflow-hidden">
          {/* Toolbar global de Anexos — paridade com Projetos */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 bg-muted/20">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setTreeCollapsed((v) => !v)}
              title={treeCollapsed ? "Mostrar lista de anexos" : "Ocultar lista de anexos"}
            >
              {treeCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </Button>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Anexos</span>
            <div className="flex-1" />
            {canManageProcesses && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs px-2"
                  onClick={() => handleCreateDoc(null)}
                  title="Criar novo documento em branco"
                >
                  <FilePlus2 className="w-3.5 h-3.5" /> Novo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs px-2"
                  onClick={() => handleImport(null)}
                  title="Importar arquivos (.md, .pdf, .docx)"
                >
                  <Upload className="w-3.5 h-3.5" /> Importar
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs px-2">
                  <Download className="w-3.5 h-3.5" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {selectedDoc && (
                  <>
                    <DropdownMenuItem onClick={() => handleExportDoc("md")}>Documento atual · Markdown (.md)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExportDoc("pdf")}>Documento atual · PDF</DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={handleExportAll}>Exportar tudo (ZIP)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs px-2"
              onClick={() => setShareProcessOpen(true)}
            >
              <Share2 className="w-3.5 h-3.5" /> Compartilhar
            </Button>
          </div>

          <div className="flex-1 min-h-0">
            <ResizablePanelGroup direction="horizontal">
              {!treeCollapsed && (
                <>
                  <ResizablePanel defaultSize={22} minSize={14} maxSize={40}>
                    <div className="h-full p-3 flex flex-col">
                      <ProcessDocTree
                        folders={foldersCompat}
                        documents={documentsCompat}
                        selectedDocId={selectedDocId}
                        onSelectDoc={setSelectedDocId}
                        onCreateFolder={(name, parentId) => createFolder.mutate({ name, parentId })}
                        onRenameFolder={(id, name) => updateFolder.mutate({ id, name })}
                        onDeleteFolder={(id) => { deleteFolder.mutate(id); if (selectedDocId) setSelectedDocId(null); }}
                        onToggleFolderPublic={(id, isPublic) => toggleFolderPublic.mutate({ id, isPublic })}
                        onCreateDoc={handleCreateDoc}
                        onDeleteDoc={(id) => { deleteDocument.mutate(id); if (selectedDocId === id) setSelectedDocId(null); }}
                        onToggleDocPublic={(id, isPublic) => toggleDocPublic.mutate({ id, isPublic })}
                        onShareItem={(item, type) => setShareItem({ item, type })}
                        onReorderFolders={(items) => reorderFolders.mutate(items)}
                        onReorderDocs={(items) => reorderDocs.mutate(items)}
                        onImport={handleImport}
                        canManage={canManageProcesses}
                        onMoveDoc={(docId, targetFolderId) => moveDocument.mutate({ docId, targetFolderId })}
                        onMoveMultipleDocs={(docIds, targetFolderId) => moveMultipleDocs.mutate({ docIds, targetFolderId })}
                      />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                </>
              )}

              <ResizablePanel defaultSize={treeCollapsed ? 100 : 78}>
                <div className="h-full flex flex-col min-w-0">
                  {selectedDoc ? (
                    <>
                      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/40 overflow-x-auto">
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <FolderOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs font-medium text-foreground truncate">{selectedDoc.title}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs flex-shrink-0"
                          onClick={() => setShareItem({ item: selectedDoc, type: "document" })}
                        >
                          <Share2 className="w-3.5 h-3.5" /> Compartilhar
                        </Button>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <ProcessDocEditor
                          document={selectedDoc}
                          onSave={handleSaveDoc}
                          onUploadImage={uploadImage}
                          readOnly={!canManageProcesses}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
                      <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                        <FolderOpen className="w-7 h-7" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-medium text-foreground">Nenhum anexo selecionado</p>
                        <p className="text-xs">
                          {canManageProcesses
                            ? "Use os botões acima para criar um novo documento ou importar arquivos."
                            : "Escolha um documento na lista ao lado."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      )}

      <ProcessDocUpload
        open={importOpen}
        onOpenChange={setImportOpen}
        folderId={importFolderId}
        onUploadFile={uploadFile}
        onCreateFolder={(name, parentId) => createFolder.mutate({ name, parentId })}
        onCreateDocument={(params) => createDocument.mutateAsync(params)}
      />
      <ProcessDocShareDialog
        open={!!shareItem}
        onOpenChange={(v) => { if (!v) setShareItem(null); }}
        item={shareItem?.item || null}
        itemType={shareItem?.type || "document"}
        onTogglePublic={(id, isPublic) => {
          if (shareItem?.type === "folder") toggleFolderPublic.mutate({ id, isPublic });
          else toggleDocPublic.mutate({ id, isPublic });
        }}
        allFolders={foldersCompat}
        allDocuments={documentsCompat}
        onToggleFolderPublic={(id, isPublic) => toggleFolderPublic.mutate({ id, isPublic })}
        onToggleDocPublic={(id, isPublic) => toggleDocPublic.mutate({ id, isPublic })}
        onBulkToggleAll={(isPublic) => bulkTogglePublic.mutate({ isPublic })}
        onBulkToggleFolderChildren={(folderId, isPublic) => bulkToggleFolderChildren.mutate({ folderId, isPublic })}
      />
      <ProcessDocShareDialog
        open={shareProcessOpen}
        onOpenChange={setShareProcessOpen}
        item={null}
        itemType="document"
        projectMode
        onTogglePublic={() => {}}
        allFolders={foldersCompat}
        allDocuments={documentsCompat}
        onToggleFolderPublic={(id, isPublic) => toggleFolderPublic.mutate({ id, isPublic })}
        onToggleDocPublic={(id, isPublic) => toggleDocPublic.mutate({ id, isPublic })}
        onBulkToggleAll={(isPublic) => bulkTogglePublic.mutate({ isPublic })}
        onBulkToggleFolderChildren={(folderId, isPublic) => bulkToggleFolderChildren.mutate({ folderId, isPublic })}
      />
    </>
  );
}
