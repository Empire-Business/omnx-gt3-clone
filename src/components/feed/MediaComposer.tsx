import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon, Film, Music, FileText as FileIcon,
  File as FileIconDoc, Mic, Square, X, Video, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { isVideoUrl } from "@/lib/feed-embeds";
import type { FeedAttachment } from "@/hooks/useFeed";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export function getAttachmentType(mime: string): FeedAttachment["type"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function formatRecordingTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export interface MediaComposerState {
  pendingFiles: File[];
  pendingVideoUrls: string[];
}

interface Props {
  tenantId: string | null | undefined;
  state: MediaComposerState;
  onChange: (next: MediaComposerState) => void;
  /** When true, hide labels and use a more compact layout (good for comment box) */
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Reutilizável: barra de ações para anexar mídia (imagens/vídeos),
 * arquivos, gravar áudio e adicionar links de vídeo (YouTube/Vimeo).
 * Mantém upload e UI consistentes entre post e comentário.
 */
export function MediaComposer({ tenantId, state, onChange, compact = false, disabled }: Props) {
  const [recordingReady, setRecordingReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const shouldSaveRef = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>("");
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`"${f.name}" excede 50 MB e não pode ser enviado.`);
        return false;
      }
      return true;
    });
    onChange({ ...state, pendingFiles: [...state.pendingFiles, ...valid] });
    e.target.value = "";
  };

  const removeFile = (idx: number) =>
    onChange({ ...state, pendingFiles: state.pendingFiles.filter((_, i) => i !== idx) });

  const removeVideoUrl = (idx: number) =>
    onChange({ ...state, pendingVideoUrls: state.pendingVideoUrls.filter((_, i) => i !== idx) });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      mimeTypeRef.current = mimeType;

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      shouldSaveRef.current = false;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.addEventListener("stop", () => {
        const chunks = audioChunksRef.current;
        if (shouldSaveRef.current) {
          if (chunks.length > 0) {
            const mt = mimeType || "audio/webm";
            const ext = mt.includes("mp4") ? "mp4" : mt.includes("ogg") ? "ogg" : "webm";
            const blob = new Blob(chunks, { type: mt });
            const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mt });
            onChange({ ...state, pendingFiles: [...state.pendingFiles, file] });
          } else {
            toast.error("Nenhum áudio capturado. Tente gravar por alguns segundos.");
          }
        }
        stream.getTracks().forEach((t) => t.stop());
      }, { once: true });

      mediaRecorder.start(100);
      setRecordingReady(false);
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      setRecordingReady(false);
      toast.error("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecording(false);
    setRecordingTime(0);
    shouldSaveRef.current = true;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
  };

  const discardAndStop = (mr: MediaRecorder | null) => {
    if (!mr || mr.state === "inactive") return;
    mr.stop();
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    discardAndStop(mediaRecorderRef.current);
    audioChunksRef.current = [];
    setRecording(false);
    setRecordingReady(false);
    setRecordingTime(0);
  };

  const restartRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    discardAndStop(mediaRecorderRef.current);
    audioChunksRef.current = [];
    setRecording(false);
    setRecordingTime(0);
    setRecordingReady(true);
  };

  const addVideoUrl = () => {
    const url = videoUrlInput.trim();
    if (!url) return;
    if (!isVideoUrl(url)) {
      toast.error("URL não reconhecida. Cole um link do YouTube ou Vimeo.");
      return;
    }
    if (state.pendingVideoUrls.includes(url)) {
      toast.info("Esse vídeo já foi adicionado.");
      return;
    }
    onChange({ ...state, pendingVideoUrls: [...state.pendingVideoUrls, url] });
    setVideoUrlInput("");
    setVideoDialogOpen(false);
    toast.success("Vídeo adicionado.");
  };

  const filePreviewIcon = (file: File) => {
    const type = getAttachmentType(file.type);
    if (type === "image") return <ImageIcon className="w-3.5 h-3.5" />;
    if (type === "video") return <Film className="w-3.5 h-3.5" />;
    if (type === "audio") return <Music className="w-3.5 h-3.5" />;
    return <FileIcon className="w-3.5 h-3.5" />;
  };

  const showLabel = !compact;

  return (
    <div className="space-y-2">
      {/* Recording panel */}
      {(recordingReady || recording) && (
        <div className="flex items-center gap-2 py-1 flex-wrap">
          {recording ? (
            <>
              <span className="flex items-center gap-1.5 text-xs font-medium text-destructive animate-pulse">
                <span className="w-2 h-2 rounded-full bg-destructive" />
                Gravando {formatRecordingTime(recordingTime)}
              </span>
              <button
                onClick={stopRecording}
                className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 border border-destructive/30 rounded-lg px-2 py-1 transition-colors"
              >
                <Square className="w-3 h-3 fill-destructive" /> Parar
              </button>
              <button
                onClick={restartRecording}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors"
              >
                <Mic className="w-3 h-3" /> Reiniciar
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mic className="w-3.5 h-3.5" /> Pronto para gravar
              </span>
              <button
                onClick={startRecording}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 border border-primary/30 bg-primary/5 rounded-lg px-2 py-1 transition-colors font-medium"
              >
                <Mic className="w-3 h-3" /> Iniciar
              </button>
              <button
                onClick={cancelRecording}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors"
              >
                <X className="w-3 h-3" /> Cancelar
              </button>
            </>
          )}
        </div>
      )}

      {/* Pending video URLs */}
      {state.pendingVideoUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.pendingVideoUrls.map((url, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-lg px-2 py-1.5 text-xs max-w-[260px]">
              <Video className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate flex-1">{url}</span>
              <button onClick={() => removeVideoUrl(i)} className="hover:text-destructive flex-shrink-0" aria-label="Remover vídeo">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending files */}
      {state.pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.pendingFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-muted rounded-lg px-2 py-1.5 text-xs max-w-[200px]">
              {filePreviewIcon(file)}
              <span className="truncate flex-1">{file.name}</span>
              <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={docInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap">
        <button
          type="button"
          onClick={() => mediaInputRef.current?.click()}
          disabled={recording || disabled}
          className={cn(
            "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors rounded-md",
            compact ? "p-1.5" : "px-2 py-1.5",
          )}
          title="Foto ou vídeo"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          {showLabel && <span className="hidden sm:inline">Mídia</span>}
        </button>

        <button
          type="button"
          onClick={() => docInputRef.current?.click()}
          disabled={recording || disabled}
          className={cn(
            "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors rounded-md",
            compact ? "p-1.5" : "px-2 py-1.5",
          )}
          title="Documento (PDF, Word, Excel…)"
        >
          <FileIconDoc className="w-3.5 h-3.5" />
          {showLabel && <span className="hidden sm:inline">Arquivo</span>}
        </button>

        <button
          type="button"
          onClick={() => setRecordingReady(true)}
          disabled={recording || recordingReady || disabled}
          className={cn(
            "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors rounded-md",
            compact ? "p-1.5" : "px-2 py-1.5",
          )}
          title="Gravar áudio"
        >
          <Mic className="w-3.5 h-3.5" />
          {showLabel && <span className="hidden sm:inline">Áudio</span>}
        </button>

        <button
          type="button"
          onClick={() => setVideoDialogOpen(true)}
          disabled={recording || disabled}
          className={cn(
            "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors rounded-md",
            compact ? "p-1.5" : "px-2 py-1.5",
          )}
          title="Adicionar vídeo do YouTube ou Vimeo"
        >
          <Video className="w-3.5 h-3.5" />
          {showLabel && <span className="hidden sm:inline">Vídeo</span>}
        </button>
      </div>

      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-4 h-4 text-primary" /> Adicionar vídeo
            </DialogTitle>
            <DialogDescription>
              Cole o link de um vídeo do YouTube ou Vimeo. Ele será embedado sem mostrar a URL no texto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              placeholder="https://www.youtube.com/watch?v=… ou https://vimeo.com/…"
              value={videoUrlInput}
              onChange={(e) => setVideoUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVideoUrl(); } }}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Suporta YouTube (watch, shorts, youtu.be) e Vimeo (incluindo links com hash de privacidade).
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setVideoDialogOpen(false); setVideoUrlInput(""); }}>
              Cancelar
            </Button>
            <Button onClick={addVideoUrl} disabled={!videoUrlInput.trim()}>
              Adicionar vídeo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Faz upload de arquivos para o bucket `feed-attachments` e devolve as
 * URLs públicas no formato esperado pelas mutations do feed.
 */
export async function uploadFeedFiles(
  files: File[],
  tenantId: string,
): Promise<FeedAttachment[]> {
  if (!files.length) return [];
  const results: FeedAttachment[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("feed-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(`Falha ao enviar "${file.name}": ${error.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from("feed-attachments")
      .getPublicUrl(path);

    results.push({
      url: publicUrl,
      name: file.name,
      type: getAttachmentType(file.type),
      mime: file.type,
      size: file.size,
    });
  }
  return results;
}

export const EMPTY_MEDIA_STATE: MediaComposerState = {
  pendingFiles: [],
  pendingVideoUrls: [],
};
