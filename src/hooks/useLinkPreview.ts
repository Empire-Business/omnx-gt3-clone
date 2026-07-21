import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
  favicon: string | null;
}

export function useLinkPreview(url: string | null | undefined) {
  return useQuery({
    queryKey: ["link_preview", url],
    enabled: !!url,
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 24 * 60 * 60 * 1000, // 24h
    retry: false,
    queryFn: async (): Promise<LinkPreviewData | null> => {
      const { data, error } = await supabase.functions.invoke("link-preview", {
        body: { url },
      });
      if (error || !data || (data as any).error) return null;
      return data as LinkPreviewData;
    },
  });
}

const URL_RE = /https?:\/\/[^\s<>"]+/gi;

const VIDEO_HOSTS = [
  "youtube.com", "youtu.be", "vimeo.com", "loom.com", "twitch.tv",
];

export function extractFirstNonVideoUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = text.match(URL_RE);
  if (!matches) return null;
  for (const raw of matches) {
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, "");
      if (!VIDEO_HOSTS.some((v) => host.endsWith(v))) return raw;
    } catch {
      continue;
    }
  }
  return null;
}
