/**
 * TwemojiIcon — renderiza um emoji como SVG via Twemoji CDN.
 * Garante consistência visual entre Windows/macOS/Linux/mobile, com
 * arte vetorial de alta qualidade (mesma usada por Twitter/Discord).
 *
 * Fallback: se a imagem falhar, exibe o caractere unicode original.
 */
import { useState } from "react";

const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/";

/** Converte um emoji unicode em sequência hex do Twemoji (ex: 👍 → "1f44d") */
function emojiToCodepoints(emoji: string): string {
  const codepoints: string[] = [];
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    if (cp == null) continue;
    // Twemoji omite o variation selector (FE0F) na maioria dos arquivos
    if (cp === 0xfe0f) continue;
    codepoints.push(cp.toString(16));
  }
  return codepoints.join("-");
}

interface TwemojiIconProps {
  emoji: string;
  size?: number;
  className?: string;
}

export function TwemojiIcon({ emoji, size = 18, className }: TwemojiIconProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1, display: "inline-block" }}
        aria-hidden
      >
        {emoji}
      </span>
    );
  }
  const code = emojiToCodepoints(emoji);
  return (
    <img
      src={`${TWEMOJI_BASE}${code}.svg`}
      alt={emoji}
      width={size}
      height={size}
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    />
  );
}
