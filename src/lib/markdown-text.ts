/**
 * Conversão de Markdown → texto puro, para pré-visualizações.
 *
 * Onde o conteúdo é renderizado de verdade usamos `ReactMarkdown`. Mas em
 * card, `title=""` e resumo de uma linha não dá para renderizar JSX: o texto
 * cru aparecia com os `**`, `###` e `-` à mostra ("**CUMBUCA — ASSUNTOS
 * VIRAIS**"), que foi exatamente o defeito relatado nos Eventos.
 *
 * Não é um parser de Markdown — é um "desmarcador" deliberadamente simples,
 * que cobre a sintaxe que aparece em texto escrito à mão (ênfase, títulos,
 * listas, links, código, citação e regra horizontal).
 */

/** Remove a marcação de Markdown, devolvendo o texto legível. */
export function markdownToPlainText(input: string | null | undefined): string {
  if (!input) return "";

  return (
    input
      // Blocos de código cercados: mantém o conteúdo, tira as cercas.
      .replace(/```[\w-]*\n?/g, "")
      // Código inline: `x` → x
      .replace(/`([^`]+)`/g, "$1")
      // Imagens antes dos links (a sintaxe é a mesma com `!` na frente).
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Links: [texto](url) → texto
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Títulos: ### Texto → Texto
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      // Citação: > Texto → Texto
      .replace(/^\s{0,3}>\s?/gm, "")
      // Regra horizontal (---, ***, ___) vira quebra de linha.
      .replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, "")
      // Marcadores de lista: "- ", "* ", "1. "
      .replace(/^\s{0,3}[-*+]\s+/gm, "")
      .replace(/^\s{0,3}\d+\.\s+/gm, "")
      // Ênfase: **negrito**, *itálico*, __x__, _x_, ~~riscado~~
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*\n]+)\*/g, "$1")
      .replace(/___([^_]+)___/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      // Aspas simples soltas que sobram de colagens tipo `'**TÍTULO**`.
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Versão de uma linha só, para `title=""` e resumos onde a quebra de linha
 * viraria espaço em branco estranho.
 */
export function markdownToSingleLine(
  input: string | null | undefined,
  maxLength?: number
): string {
  const flat = markdownToPlainText(input).replace(/\s*\n+\s*/g, " · ").trim();
  if (!maxLength || flat.length <= maxLength) return flat;
  return `${flat.slice(0, maxLength - 1).trimEnd()}…`;
}
