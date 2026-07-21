export function formatBRL(value: number | null | undefined, opts?: { compact?: boolean }): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (opts?.compact && Math.abs(value) >= 1000) {
    if (Math.abs(value) >= 1_000_000) {
      return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
    }
    return `R$ ${(value / 1000).toFixed(0)} mil`;
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function parseBRLInput(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[R$\s.]/g, "")
    .replace(",", ".")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return n;
}
