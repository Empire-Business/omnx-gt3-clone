/**
 * smart-date-parser — extrai datas em pt-BR do texto livre.
 * Detecta: hoje, amanhã, depois de amanhã, em N dias, na sexta,
 *          dd/mm, dd/mm/yyyy, semana que vem, próxima segunda…
 * Retorna { date: ISO, cleanedText: string } se detectar; null caso contrário.
 */
const WEEKDAYS: Record<string, number> = {
  domingo: 0, dom: 0,
  segunda: 1, "segunda-feira": 1, seg: 1,
  terça: 2, "terça-feira": 2, ter: 2, terca: 2,
  quarta: 3, "quarta-feira": 3, qua: 3,
  quinta: 4, "quinta-feira": 4, qui: 4,
  sexta: 5, "sexta-feira": 5, sex: 5,
  sábado: 6, "sabado": 6, sab: 6,
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDate(d: Date): string {
  return startOfDay(d).toISOString().substring(0, 10);
}

function nextWeekday(target: number, base = new Date()): Date {
  const today = startOfDay(base);
  const todayDow = today.getDay();
  let diff = target - todayDow;
  if (diff <= 0) diff += 7;
  const r = new Date(today);
  r.setDate(today.getDate() + diff);
  return r;
}

export interface SmartDateMatch {
  date: string; // ISO yyyy-mm-dd
  cleanedText: string;
  matched: string;
}

export function parseSmartDate(input: string): SmartDateMatch | null {
  if (!input) return null;
  const text = input.trim();
  const lower = text.toLowerCase();

  // Padrão 1: "hoje"
  let m = lower.match(/\b(hoje)\b/);
  if (m) {
    return {
      date: isoDate(new Date()),
      cleanedText: removeMatch(text, m[0]),
      matched: m[0],
    };
  }

  // Padrão 2: "amanhã"
  m = lower.match(/\b(amanh[ãa])\b/);
  if (m) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return { date: isoDate(d), cleanedText: removeMatch(text, m[0]), matched: m[0] };
  }

  // Padrão 3: "depois de amanhã"
  m = lower.match(/\b(depois\s+de\s+amanh[ãa])\b/);
  if (m) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return { date: isoDate(d), cleanedText: removeMatch(text, m[0]), matched: m[0] };
  }

  // Padrão 4: "em N dias" / "em N semanas"
  m = lower.match(/\bem\s+(\d{1,3})\s+(dia|dias|semana|semanas|m[eê]s|m[eê]ses)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const d = new Date();
    if (unit.startsWith("dia")) d.setDate(d.getDate() + n);
    else if (unit.startsWith("semana")) d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    return { date: isoDate(d), cleanedText: removeMatch(text, m[0]), matched: m[0] };
  }

  // Padrão 5: "semana que vem" / "próxima semana"
  m = lower.match(/\b(semana\s+que\s+vem|pr[oó]xima\s+semana)\b/);
  if (m) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return { date: isoDate(d), cleanedText: removeMatch(text, m[0]), matched: m[0] };
  }

  // Padrão 6: "na/no/próxima/proxima <dia da semana>"
  m = lower.match(
    /\b(?:na|no|pr[oó]xima|pr[oó]ximo|essa|esse|esta|este)\s+(domingo|segunda(?:-feira)?|ter[çc]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[áa]bado)\b/
  );
  if (m) {
    const dayKey = m[1].replace("-feira", "").trim();
    const target = WEEKDAYS[dayKey];
    if (target !== undefined) {
      const d = nextWeekday(target);
      return { date: isoDate(d), cleanedText: removeMatch(text, m[0]), matched: m[0] };
    }
  }

  // Padrão 7: dd/mm ou dd/mm/yyyy
  m = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const d = new Date(year, month - 1, day);
      // Se a data já passou este ano, assume próximo ano (apenas quando ano não foi explícito)
      if (!m[3]) {
        const today = startOfDay(new Date());
        if (d < today) d.setFullYear(d.getFullYear() + 1);
      }
      return { date: isoDate(d), cleanedText: removeMatch(text, m[0]), matched: m[0] };
    }
  }

  return null;
}

function removeMatch(original: string, matched: string): string {
  // Remove case-insensitive, mantém espaçamento limpo
  const re = new RegExp(`\\s*${escapeRegex(matched)}\\s*`, "i");
  const cleaned = original.replace(re, " ").replace(/\s+/g, " ").trim();
  return cleaned;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
