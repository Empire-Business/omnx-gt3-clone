import { useState } from "react";
import { useParams } from "react-router-dom";
import { FileText, FolderOpen, AlertCircle, Eye, Download } from "lucide-react";
import { usePublicDocument } from "@/hooks/usePublicDocument";
import { MarkdownViewer } from "@/components/shared/MarkdownViewer";
import { Button } from "@/components/ui/button";
import { FilePreviewModal, getPreviewKind, downloadFile } from "@/components/processes/FilePreviewModal";

function PublicFileItem({ doc }: { doc: any }) {
  const [open, setOpen] = useState(false);
  const canPreview = getPreviewKind(doc.file_type, doc.title) !== "none";
  return (
    <div className="flex items-center gap-2 mt-2">
      {canPreview && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <Eye className="w-3.5 h-3.5" /> Visualizar
        </Button>
      )}
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadFile(doc.file_path, doc.title)}>
        <Download className="w-3.5 h-3.5" /> Baixar
      </Button>
      <FilePreviewModal
        open={open}
        onOpenChange={setOpen}
        fileUrl={doc.file_path}
        fileName={doc.title}
        fileType={doc.file_type}
        fileSize={doc.file_size}
      />
    </div>
  );
}

export default function PublicDocument() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = usePublicDocument(token);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Documento não encontrado</h1>
          <p className="text-muted-foreground text-sm">Este link pode ter expirado ou o documento não é mais público.</p>
        </div>
      </div>
    );
  }

  // Single document
  if (data.type === "document" && data.document) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-12">
          <div className="flex items-center gap-2 mb-6">
            <FileText className="w-5 h-5 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Documento público</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-8">{data.document.title}</h1>
          <div className="prose max-w-none overflow-x-auto">
            <MarkdownViewer content={data.document.content || ""} variant="default" enableTOC />
          </div>
        </div>
      </div>
    );
  }

  // Folder with documents
  if (data.type === "folder" && data.folder) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-12">
          <div className="flex items-center gap-2 mb-6">
            <FolderOpen className="w-5 h-5 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Pasta pública</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-8">{data.folder.name}</h1>
          <div className="space-y-6">
            {data.documents.map((doc: any) => (
              <div key={doc.id} className="bg-card rounded-xl border border-border/50 p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">{doc.title}</h2>
                {doc.content && (
                  <div className="prose max-w-none overflow-x-auto">
                    <MarkdownViewer content={doc.content} variant="default" />
                  </div>
                )}
                {doc.type === "file" && doc.file_path && (
                  <PublicFileItem doc={doc} />
                )}
              </div>
            ))}
            {data.documents.length === 0 && (
              <p className="text-muted-foreground text-center py-8">Nenhum documento nesta pasta.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
