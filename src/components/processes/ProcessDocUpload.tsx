import { useState, useRef, useCallback } from "react";
import { Upload, FolderUp, X, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
  onUploadFile: (file: File, folderId?: string | null) => Promise<any>;
  onCreateFolder: (name: string, parentId?: string | null) => void;
  onCreateDocument: (params: { title: string; folderId?: string | null; content?: string }) => Promise<any>;
}

export function ProcessDocUpload({ open, onOpenChange, folderId, onUploadFile, onCreateFolder, onCreateDocument }: Props) {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    // Group by folder path for directory uploads
    const folderMap = new Map<string, File[]>();
    for (const file of files) {
      const path = (file as any).webkitRelativePath || "";
      const parts = path.split("/");
      const folderPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      if (!folderMap.has(folderPath)) folderMap.set(folderPath, []);
      folderMap.get(folderPath)!.push(file);
    }

    let successCount = 0;
    let errorCount = 0;

    try {
      for (const file of files) {
        try {
          const isMd = file.name.endsWith(".md") || file.type === "text/markdown";
          if (isMd) {
            const content = await file.text();
            await onCreateDocument({
              title: file.name.replace(/\.md$/, ""),
              folderId,
              content,
            });
          } else {
            await onUploadFile(file, folderId);
          }
          successCount++;
        } catch {
          errorCount++;
        }
      }

      if (successCount > 0) toast.success(`${successCount} arquivo(s) importado(s)!`);
      if (errorCount > 0) toast.error(`${errorCount} erro(s) na importação`);

      setFiles([]);
      onOpenChange(false);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Documentos</DialogTitle>
          <DialogDescription>
            Arraste arquivos ou pastas, ou selecione do computador. Qualquer tipo de arquivo é aceito — os .md viram documentos editáveis e os demais ficam disponíveis para visualizar ou baixar.
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium">Arraste arquivos aqui</p>
          <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" /> Arquivos
          </Button>
          <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={() => folderInputRef.current?.click()}>
            <FolderUp className="w-4 h-4" /> Pasta inteira
          </Button>
        </div>

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
        <input ref={folderInputRef} type="file" multiple className="hidden" onChange={handleFolderSelect}
          {...({ webkitdirectory: "", directory: "" } as any)}
        />

        {/* File list */}
        {files.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1">
            {files.map((file, i) => (
              <div key={i} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/50 text-sm">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1 text-foreground">{(file as any).webkitRelativePath || file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{(file.size / 1024).toFixed(1)} KB</span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => removeFile(i)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleUpload} disabled={uploading || files.length === 0} className="w-full gap-2">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Importando..." : `Importar ${files.length} arquivo(s)`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
