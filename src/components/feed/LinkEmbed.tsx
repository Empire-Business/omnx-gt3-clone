import { Youtube, Video as VideoIcon } from "lucide-react";
import type { VideoEmbed } from "@/lib/feed-embeds";

interface Props {
  embeds: VideoEmbed[];
}

/**
 * Renderiza embeds responsivos de YouTube e Vimeo (16:9, lazy).
 */
export function LinkEmbed({ embeds }: Props) {
  if (!embeds.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {embeds.map((e) => (
        <div
          key={`${e.kind}:${e.videoId}`}
          className="rounded-lg overflow-hidden border border-border bg-muted"
        >
          <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
            <iframe
              src={e.embedUrl}
              title={
                e.kind === "youtube"
                  ? `YouTube video ${e.videoId}`
                  : `Vimeo video ${e.videoId}`
              }
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>
          <a
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-2xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {e.kind === "youtube" ? (
              <Youtube className="w-3 h-3" />
            ) : (
              <VideoIcon className="w-3 h-3" />
            )}
            <span className="truncate">
              {e.kind === "youtube" ? "Assistir no YouTube" : "Assistir no Vimeo"}
            </span>
          </a>
        </div>
      ))}
    </div>
  );
}
