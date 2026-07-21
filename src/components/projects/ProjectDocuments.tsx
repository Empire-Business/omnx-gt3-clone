import { useState, useMemo } from "react";
import { Download, Share2, FolderOpen, Link2, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectDocuments } from "@/hooks/useProjectDocuments";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProcessDocTree } from "@/components/processes/ProcessDocTree";
import { ProcessDocEditor } from "@/components/processes/ProcessDocEditor";
import { ProcessDocUpload } from "@/components/processes/ProcessDocUpload";
import { ProcessDocShareDialog } from "@/components/processes/ProcessDocShareDialog";
import { exportDocumentAsMd, exportDocumentAsPdf, exportFolderAsZip } from "@/lib/export-document";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { DocFolder, DocDocument } from "@/types/documents";

interface Props {
  projectId: string;
}

export function ProjectDocuments({ projectId }: Props) {
  const isMobile = useIsMobile();
  const {
    folders, documents, isLoading,
    createFolder, updateFolder, deleteFolder, toggleFolderPublic,
    createDocument, updateDocument, deleteDocument, toggleDocPublic,
    reorderFolders, reorderDocs,
    bulkTogglePublic, bulkToggleFolderChildren,
    uploadFile, uploadImage,
    moveDocument, moveMultipleDocs,
  } = useProjectDocuments(projectId);
  const { canManageProjects } = usePermissions();

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFolderId, setImportFolderId] = useState<string | null>(null);
  const [shareItem, setShareItem] = useState<{ item: any; type: "folder" | "document" } | null>(null);
  const [shareProjectOpen, setShareProjectOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    await exportFolderAsZip(foldersCompat, documentsCompat, "documentos");
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
        /* Mobile Layout with toggled sidebar */
        <div className="flex h-[calc(100vh-12rem)] bg-card rounded-xl border border-border/50 overflow-hidden">
          <div className="flex-1 flex flex-col">
            {/* Mobile header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="gap-2 h-8"
              >
                <Menu className="w-4 h-4" />
                Documentos
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

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {selectedDoc ? (
                <ProcessDocEditor
                  document={selectedDoc}
                  onSave={handleSaveDoc}
                  onUploadImage={uploadImage}
                  readOnly={!canManageProjects}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <FolderOpen className="w-16 h-16" />
                  <p className="text-sm">Selecione um documento ou crie um novo</p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile sidebar sheet */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-full sm:w-80 p-0">
              <div className="h-full p-3 flex flex-col">
                <div className="mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs h-7"
                    onClick={() => setShareProjectOpen(true)}
                  >
                    <Share2 className="w-3.5 h-3.5" /> Compartilhar projeto
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
                  canManage={canManageProjects}
                  onMoveDoc={(docId, targetFolderId) => moveDocument.mutate({ docId, targetFolderId })}
                  onMoveMultipleDocs={(docIds, targetFolderId) => moveMultipleDocs.mutate({ docIds, targetFolderId })}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      ) : (
        /* Desktop Layout - unchanged */
        <div className="flex h-[calc(100vh-12rem)] md:h-[600px] bg-card rounded-xl border border-border/50 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            {/* Sidebar - Tree */}
            <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
              <div className="h-full p-3 flex flex-col">
                <div className="mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs h-7"
                    onClick={() => setShareProjectOpen(true)}
                  >
                    <Share2 className="w-3.5 h-3.5" /> Compartilhar projeto
                  </Button>
                </div>
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
                  canManage={canManageProjects}
                  onMoveDoc={(docId, targetFolderId) => moveDocument.mutate({ docId, targetFolderId })}
                  onMoveMultipleDocs={(docIds, targetFolderId) => moveMultipleDocs.mutate({ docIds, targetFolderId })}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Main content */}
            <ResizablePanel defaultSize={75}>
              <div className="h-full flex flex-col min-w-0">
                {selectedDoc ? (
                  <>
                    <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border justify-end overflow-x-auto">
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs flex-shrink-0"
                        onClick={() => setShareItem({ item: selectedDoc, type: "document" })}
                      >
                        <Share2 className="w-3.5 h-3.5" /> Compartilhar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs flex-shrink-0"
                        onClick={() => setShareItem({ item: selectedDoc, type: "document" })}
                        title="Gerenciar todos os links públicos"
                      >
                        <Link2 className="w-3.5 h-3.5" /> Links
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs flex-shrink-0">
                            <Download className="w-3.5 h-3.5" /> Exportar
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleExportDoc("md")}>Markdown (.md)</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportDoc("pdf")}>PDF</DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportAll}>Exportar tudo (ZIP)</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <ProcessDocEditor
                        document={selectedDoc}
                        onSave={handleSaveDoc}
                        onUploadImage={uploadImage}
                        readOnly={!canManageProjects}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <FolderOpen className="w-16 h-16" />
                    <p className="text-sm">Selecione um documento ou crie um novo</p>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      {/* Dialogs */}
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
      {/* Project-level share dialog (no item needed) */}
      <ProcessDocShareDialog
        open={shareProjectOpen}
        onOpenChange={setShareProjectOpen}
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