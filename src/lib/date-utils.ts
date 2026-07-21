/**
 * Normaliza uma string de data "YYYY-MM-DD" para salvar no banco como TIMESTAMPTZ
 * sem flip de timezone. Appenda T12:00:00 (meio-dia) para evitar que
 * fusos negativos (ex: UTC-3) mudem o dia.
 */
export function normalizeDateForSave(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // Se já tem horário, retorna como está
  if (dateStr.includes("T")) return dateStr;
  return `${dateStr}T12:00:00`;
}

/**
 * Extrai "YYYY-MM-DD" de uma string TIMESTAMPTZ para popular <input type="date">.
 * Usa substring para evitar conversão de timezone.
 */
export function extractDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return dateStr.substring(0, 10);
}

/**
 * Cria um Date que preserva o dia correto independente do fuso.
 * Para comparações de atraso/vencimento.
 */
export function parseDateSafe(dateStr: string): Date {
  // Extrai apenas YYYY-MM-DD e cria no meio-dia local
  const ymd = dateStr.substring(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Retorna true somente se a tarefa está atrasada (due_date ANTES de hoje).
 * Tarefas com vencimento hoje NÃO são consideradas atrasadas.
 */
export function isTaskOverdue(dueDateStr: string): boolean {
  const today = new Date().toISOString().substring(0, 10);
  return dueDateStr.substring(0, 10) < today;
}
