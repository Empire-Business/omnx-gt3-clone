import { Fragment, type ReactNode } from "react";

/**
 * Converte URLs em texto plano em links clicáveis (azuis).
 * Reaproveitável em Feed, comentários e qualquer lugar que exiba texto livre.
 *
 * Suporta `http(s)://...` e `www.` (este último ganha prefixo https:// no href).
 * Pontuação final (. , ; : ! ? ) " ') não é incluída no link.
 */
const URL_REGEX =
  /(\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|\bwww\.[^\s<>()]+[^\s<>().,;:!?'"])/gi;

export function linkifyText(text: string): ReactNode[] {
  if (!text) return [];
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const href = part.startsWith("http") ? part : `https://${part}`;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-primary underline break-all hover:text-primary/80"
        >
          {part}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

interface LinkifiedTextProps {
  children: string;
  className?: string;
}

/**
 * Renderiza texto preservando quebras de linha (`whitespace-pre-wrap`)
 * e transformando URLs em links clicáveis.
 */
export function LinkifiedText({ children, className }: LinkifiedTextProps) {
  return <p className={className}>{linkifyText(children)}</p>;
}
