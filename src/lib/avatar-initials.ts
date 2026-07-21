/**
 * Util compartilhado para iniciais de avatar.
 * Quando não há nome, devolve string vazia — o consumidor decide o ícone visual.
 */
const STOPWORDS = new Set([
  "de","da","do","das","dos","e","a","o","as","os","em","no","na","nos","nas",
  "ao","aos","às","um","uma","uns","umas","por","para","com","sem","sob","ou",
]);

export function getInitials(name?: string | null): string {
  const safe = (name ?? "").trim();
  if (!safe) return "";
  // Se for um email, usa o local-part (antes do @) e separa por . _ -
  const local = safe.includes("@") ? safe.split("@")[0] : safe;
  const words = local
    .trim()
    .split(/[\s._-]+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  if (!words.length) return local.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
