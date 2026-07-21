import { Image as ImageIcon, Film, Music, FileText as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioPlayer } from "@/components/shared/AudioPlayer";
import type { FeedAttachment } from "@/hooks/useFeed";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentIcon({ type }: { type: FeedAttachment["type"] }) {
  if (type === "image") return <ImageIcon className="w-4 h-4" />;
  if (type === "video") return <Film className="w-4 h-4" />;
  if (type === "audio") return <Music className="w-4 h-4" />;
  return <FileIcon className="w-4 h-4" />;
}


interface AttachmentRendererProps {
  attachments: FeedAttachment[];
  /** Versão compacta para usar dentro de comentários */
  dense?: boolean;
}

export function AttachmentRenderer({ attachments, dense = false }: AttachmentRendererProps) {
  if (!attachments?.length) return null;

  const images = attachments.filter((a) => a.type === "image");
  const others = attachments.filter((a) => a.type !== "image");
  const maxImg = dense ? "max-h-44" : "max-h-64";
  const maxVid = dense ? "max-h-44" : "max-h-64";

  return (
    <div className={cn("space-y-2", dense ? "mt-1.5" : "mt-3")}>
      {images.length > 0 && (
        <div className={cn("grid gap-1.5", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {images.map((att, i) => (
            <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
              <img
                src={att.url}
                alt={att.name}
                className={cn("rounded-lg object-cover w-full hover:opacity-90 transition-opacity", maxImg)}
              />
            </a>
          ))}
        </div>
      )}

      {attachments.filter((a) => a.type === "video").map((att, i) => (
        <video key={i} controls className={cn("w-full rounded-lg", maxVid)}>
          <source src={att.url} type={att.mime} />
        </video>
      ))}

      {attachments.filter((a) => a.type === "audio").map((att, i) => (
        <AudioPlayer
          key={i}
          url={att.url}
          mime={att.mime}
          name={att.name}
          variant={dense ? "dense" : "default"}
        />
      ))}

      {others.filter((a) => a.type === "file").map((att, i) => (
        <a
          key={i}
          href={att.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors",
            dense ? "px-2 py-1.5" : "px-3 py-2",
          )}
        >
          <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs truncate flex-1">{att.name}</span>
          <span className="text-2xs text-muted-foreground flex-shrink-0">{formatBytes(att.size)}</span>
        </a>
      ))}
    </div>
  );
}
