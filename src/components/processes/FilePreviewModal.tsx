import { useEffect, useState } from "react";
import { Download, Loader2, FileQuestion, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type PreviewKind = "image" | "pdf" | "html" | "video" | "audio" | "text" | "none";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
}

/** Decide como renderizar o preview a partir do MIME type e/ou extensão do arquivo. */
export function getPreviewKind(fileType?: string | null, fileName?: string): PreviewKind {
  const ext = (fileName?.split(".").pop() || "").toLowerCase();
  const t = (fileType || "").toLowerCase();

  if (t.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "avif"].includes(ext))
    return "image";
  if (t === "application/pdf" || ext === "pdf") return "pdf";
  if (t === "text/html" || ["html", "htm"].includes(ext)) return "html";
  if (t.startsWith("video/") || ["mp4", "webm", "ogv", "mov", "mkv"].includes(ext)) return "video";
  if (t.startsWith("audio/") || ["mp3", "wav", "oga", "ogg", "m4a", "aac", "flac"].includes(ext)) return "audio";
  if (
    t.startsWith("text/") ||
    ["txt", "md", "csv", "json", "xml", "js", "ts", "tsx", "jsx", "css", "yml", "yaml", "log", "sql"].includes(ext)
  )
    return "text";
  return "none";
}

/** Força o download do arquivo via blob (funciona mesmo cross-origin no storage do Supabase). */
export async function downloadFile(fileUrl: string, fileName: string) {
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error("Falha ao baixar");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = fileName;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Fallback: abre em nova aba caso o fetch falhe (ex.: CORS)
    window.open(fileUrl, "_blank", "noopener,noreferrer");
  }
}

export function FilePreviewModal({ open, onOpenChange, fileUrl, fileName, fileType, fileSize }: Props) {
  const kind = getPreviewKind(fileType, fileName);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  // Carrega conteúdo de arquivos de texto sob demanda
  useEffect(() => {
    if (!open || kind !== "text") {
      setTextContent(null);
      return;
    }
    let cancelled = false;
    setLoadingText(true);
    fetch(fileUrl)
      .then((r) => r.text())
      .then((t) => { if (!cancelled) setTextContent(t); })
      .catch(() => { if (!cancelled) setTextContent("Não foi possível carregar o conteúdo."); })
      .finally(() => { if (!cancelled) setLoadingText(false); });
    return () => { cancelled = true; };
  }, [open, kind, fileUrl]);

  const handleDownload = async () => {
    toast.promise(downloadFile(fileUrl, fileName), {
      loading: "Baixando...",
      success: "Download iniciado!",
      error: "Erro ao baixar arquivo",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-border flex-row items-center justify-between space-y-0">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">{fileName}</DialogTitle>
            <DialogDescription className="text-xs">
              {fileType || "Arquivo"}
              {typeof fileSize === "number" ? ` — ${(fileSize / 1024).toFixed(1)} KB` : ""}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0 pr-8">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" /> Baixar
            </Button>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Nova aba
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/30">
          {kind === "image" && (
            <div className="flex items-center justify-center h-full p-4">
              <img src={fileUrl} alt={fileName} className="max-w-full max-h-full object-contain" />
            </div>
          )}

          {kind === "pdf" && (
            <iframe src={fileUrl} title={fileName} className="w-full h-full border-0" />
          )}

          {kind === "html" && (
            <iframe
              src={fileUrl}
              title={fileName}
              sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
              className="w-full h-full border-0 bg-white"
            />
          )}

          {kind === "video" && (
            <div className="flex items-center justify-center h-full p-4">
              <video src={fileUrl} controls className="max-w-full max-h-full">
                Seu navegador não suporta reprodução de vídeo.
              </video>
            </div>
          )}

          {kind === "audio" && (
            <div className="flex items-center justify-center h-full p-8">
              <audio src={fileUrl} controls className="w-full max-w-lg">
                Seu navegador não suporta reprodução de áudio.
              </audio>
            </div>
          )}

          {kind === "text" && (
            loadingText ? (
              <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
              </div>
            ) : (
              <pre className="p-4 text-sm text-foreground whitespace-pre-wrap break-words font-mono">
                {textContent}
              </pre>
            )
          )}

          {kind === "none" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <FileQuestion className="w-16 h-16 text-muted-foreground" />
              <div>
                <p className="text-foreground font-medium">Pré-visualização não disponível</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Este tipo de arquivo não pode ser exibido aqui. Baixe para abrir no seu computador.
                </p>
              </div>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" /> Baixar arquivo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
