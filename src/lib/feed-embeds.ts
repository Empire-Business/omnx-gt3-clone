/**
 * Feed embeds — extrai vídeos do YouTube e Vimeo do conteúdo dos posts.
 */

export type EmbedKind = "youtube" | "vimeo";

export interface VideoEmbed {
  kind: EmbedKind;
  videoId: string;
  url: string; // URL original
  embedUrl: string; // URL para iframe
}

const URL_REGEX = /https?:\/\/[^\s<]+/gi;

const YOUTUBE_PATTERNS: RegExp[] = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/i,
];

// Vimeo: captura id + (opcional) hash de privacidade.
// Formatos: vimeo.com/123, vimeo.com/123/abc (hash), vimeo.com/video/123,
// player.vimeo.com/video/123?h=abc
const VIMEO_PATTERN = /(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?/i;

function detectVideo(url: string): VideoEmbed | null {
  for (const re of YOUTUBE_PATTERNS) {
    const m = url.match(re);
    if (m) {
      const id = m[1].split(/[?&#]/)[0];
      return {
        kind: "youtube",
        videoId: id,
        url,
        embedUrl: `https://www.youtube.com/embed/${id}`,
      };
    }
  }
  const vm = url.match(VIMEO_PATTERN);
  if (vm) {
    const id = vm[1];
    let hash = vm[2];
    if (!hash) {
      const qh = url.match(/[?&]h=([a-zA-Z0-9]+)/i);
      if (qh) hash = qh[1];
    }
    const embedUrl = hash
      ? `https://player.vimeo.com/video/${id}?h=${hash}`
      : `https://player.vimeo.com/video/${id}`;
    return {
      kind: "vimeo",
      videoId: hash ? `${id}:${hash}` : id,
      url,
      embedUrl,
    };
  }
  return null;
}

/**
 * Retorna `true` se a URL é um vídeo embedável (YouTube/Vimeo).
 */
export function isVideoUrl(url: string): boolean {
  return detectVideo(url) !== null;
}

/**
 * Remove do texto todas as URLs que são vídeos embedáveis (YouTube/Vimeo),
 * limpando espaços/quebras extras. Usado para esconder o link cru quando
 * o vídeo já está sendo renderizado como embed.
 */
export function stripVideoUrlsFromText(text: string): string {
  if (!text) return text;
  const cleaned = text.replace(URL_REGEX, (match) => {
    const trailing = match.match(/[),.;!?]+$/)?.[0] ?? "";
    const bare = trailing ? match.slice(0, -trailing.length) : match;
    return isVideoUrl(bare) ? trailing : match;
  });
  // colapsa espaços/linhas em excesso deixados pela remoção
  return cleaned
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extrai até `max` vídeos únicos (por id+kind) do texto.
 */
export function extractVideoEmbeds(text: string, max = 3): VideoEmbed[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX) ?? [];
  const seen = new Set<string>();
  const out: VideoEmbed[] = [];
  for (const raw of matches) {
    // remove pontuação trailing comum em texto colado
    const clean = raw.replace(/[),.;!?]+$/g, "");
    const v = detectVideo(clean);
    if (!v) continue;
    const key = `${v.kind}:${v.videoId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
