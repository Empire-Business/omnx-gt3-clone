/**
 * ReactionIcon — reações em ícones de linha (lucide), alinhadas ao DS Empire/GT3.
 * Mantém o emoji como chave persistida no banco (chat_reactions.emoji), mas
 * renderiza como ícone monocromático com cor semântica (token-based) — sem
 * cartum/colorido que destoa do design.
 *
 * Para reações antigas em formato unicode que não estão no mapa, faz fallback
 * para um span com o próprio caractere.
 */
import { ThumbsUp, Heart, Laugh, PartyPopper } from "lucide-react";
import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/** Ícone custom de "surpresa" — rosto redondo com olhos e boca em "O". */
function SurpriseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="9.5" />
      {/* Olhos como traços curtos (lucide-style) */}
      <line x1="9" y1="10" x2="9" y2="10.01" strokeWidth={2.5} />
      <line x1="15" y1="10" x2="15" y2="10.01" strokeWidth={2.5} />
      {/* Boca em "O" */}
      <circle cx="12" cy="15" r="2.2" />
    </svg>
  );
}

export interface ReactionMeta {
  /** Chave persistida no banco (mantemos os emojis para retro-compat) */
  key: string;
  label: string;
  /** Componente ícone (lucide) */
  Icon: typeof ThumbsUp;
  /** Classe Tailwind aplicada ao ícone (token-based) */
  colorClass: string;
}

export const REACTIONS: ReactionMeta[] = [
  { key: "👍", label: "Concordo",  Icon: ThumbsUp,    colorClass: "text-primary" },
  { key: "❤️", label: "Amei",      Icon: Heart,       colorClass: "text-destructive" },
  { key: "😂", label: "Engraçado", Icon: Laugh,       colorClass: "text-warning" },
  { key: "😮", label: "Surpresa",  Icon: SurpriseIcon as any, colorClass: "text-info" },
  { key: "🎉", label: "Comemorar", Icon: PartyPopper, colorClass: "text-success" },
];

const REACTIONS_BY_KEY = new Map(REACTIONS.map((r) => [r.key, r]));

interface ReactionIconProps {
  /** O emoji/chave persistido (ex: "👍") */
  emoji: string;
  size?: number;
  className?: string;
}

export function ReactionIcon({ emoji, size = 16, className }: ReactionIconProps) {
  const meta = REACTIONS_BY_KEY.get(emoji);
  if (!meta) {
    // Fallback: emoji legado fora do mapa
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
  const { Icon, colorClass, label } = meta;
  return (
    <Icon
      className={cn(colorClass, className)}
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-label={label}
    />
  );
}

/** Helper para uso em selects/picker */
export function getReactionLabel(emoji: string): string {
  return REACTIONS_BY_KEY.get(emoji)?.label || emoji;
}
