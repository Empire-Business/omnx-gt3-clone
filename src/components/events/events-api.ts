/**
 * events-api — tipos de apresentação e helpers compartilhados pela UI de
 * Eventos Internos.
 *
 * Os dados vêm de `useInternalEvents` / `useEventRegistrations`; aqui ficam
 * apenas os rótulos, o parse defensivo do jsonb da ficha e os utilitários de
 * data usados pelos componentes.
 */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type {
  InternalEvent,
  InternalEventForm,
  InternalEventFormField,
  InternalEventFieldType,
  InternalEventScope,
  InternalEventStatus,
} from "@/hooks/useInternalEvents";
import type {
  EventRegistration,
  EventRegistrationAnswers,
} from "@/hooks/useEventRegistrations";

export type {
  InternalEvent,
  InternalEventForm,
  InternalEventFormField,
  InternalEventFieldType,
  InternalEventScope,
  InternalEventStatus,
  EventRegistration,
  EventRegistrationAnswers,
};

/**
 * Recorte mínimo de uma mutation do React Query — permite que a página faça
 * UMA única chamada de `useInternalEvents()` e repasse as mutations aos filhos,
 * em vez de cada componente chamar o hook de novo (regra do CLAUDE.md).
 */
export interface MutationLike<TInput, TOutput = unknown> {
  mutateAsync: (input: TInput) => Promise<TOutput>;
  isPending: boolean;
}

/* ════════════════════════════════════════════
   RÓTULOS
   ════════════════════════════════════════════ */

export const STATUS_LABELS: Record<InternalEventStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  cancelled: "Cancelado",
  done: "Encerrado",
};

export const STATUS_VARIANTS: Record<
  InternalEventStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  published: "default",
  cancelled: "destructive",
  done: "outline",
};

export const SCOPE_LABELS: Record<InternalEventScope, string> = {
  company: "Empresa toda",
  areas: "Setores específicos",
  custom: "Pessoas específicas",
};

export const FIELD_TYPE_LABELS: Record<InternalEventFieldType, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  number: "Número",
  date: "Data",
  select: "Escolha única",
  checkbox: "Sim / Não",
};

export const FIELD_TYPES: InternalEventFieldType[] = [
  "text",
  "textarea",
  "select",
  "checkbox",
  "number",
  "date",
];

export function isChoiceField(type: InternalEventFieldType): boolean {
  return type === "select";
}

/* ════════════════════════════════════════════
   PARSE DEFENSIVO DA FICHA (jsonb)
   ════════════════════════════════════════════ */

const VALID_FIELD_TYPES: InternalEventFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
];

/** Nunca confia no shape do jsonb vindo do banco. */
export function parseRegistrationForm(raw: unknown): InternalEventForm {
  if (!raw || typeof raw !== "object") return { fields: [] };
  const candidate = raw as { fields?: unknown };
  if (!Array.isArray(candidate.fields)) return { fields: [] };

  const fields = candidate.fields
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f, index): InternalEventFormField => {
      const rawType = String(f.type ?? "text") as InternalEventFieldType;
      const type = VALID_FIELD_TYPES.includes(rawType) ? rawType : "text";
      return {
        id: String(f.id ?? `f${index}`),
        label: String(f.label ?? ""),
        type,
        required: f.required === true,
        options: Array.isArray(f.options) ? f.options.map((o) => String(o)) : undefined,
        placeholder: typeof f.placeholder === "string" ? f.placeholder : undefined,
      };
    });

  return { fields };
}

/**
 * Marcação usada quando a resposta gravada não é compatível com o tipo atual
 * da pergunta (o tipo foi trocado depois que alguém já respondeu). Nesses casos
 * exibimos o valor CRU — nunca reinterpretado — para não colocar na boca do
 * inscrito uma resposta que ele não deu (ex: um texto virar "Sim").
 */
const LEGACY_ANSWER_SUFFIX = " (resposta em formato antigo)";

function legacy(value: string | number | boolean): string {
  return `${String(value)}${LEGACY_ANSWER_SUFFIX}`;
}

/** `2026-12-24` (ou ISO completo) -> `24/12/2026`; valor inválido devolve null. */
function formatDateAnswer(value: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "dd/MM/yyyy", { locale: ptBR });
}

/**
 * Texto legível para uma resposta da ficha.
 *
 * Defensivo por dois motivos: o jsonb do banco não tem garantia de shape e o
 * tipo da pergunta pode ter mudado depois da resposta. Nada é convertido à
 * força — o que não bate com o tipo sai cru e marcado.
 */
export function formatAnswer(
  value: string | number | boolean | null | undefined,
  type: InternalEventFieldType,
): string {
  if (value === null || value === undefined || value === "") return "—";

  if (type === "checkbox") {
    // Só um booleano de verdade vira Sim/Não. Texto, número ou "false" em
    // string são respostas de outro tipo e vão cruas.
    if (value === true) return "Sim";
    if (value === false) return "Não";
    return legacy(value);
  }

  // Um booleano em qualquer outro tipo de pergunta é resquício de um checkbox.
  if (typeof value === "boolean") return legacy(value);

  if (type === "date") {
    if (typeof value !== "string") return legacy(value);
    const formatted = formatDateAnswer(value);
    return formatted ?? legacy(value);
  }

  if (type === "number") {
    if (typeof value === "number") return String(value);
    const asNumber = Number(value);
    return value.trim() !== "" && !Number.isNaN(asNumber) ? String(asNumber) : legacy(value);
  }

  return String(value);
}

/** `true` somente para URLs absolutas em https — usado na capa do evento. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/* ════════════════════════════════════════════
   VALIDAÇÃO DA FICHA
   ════════════════════════════════════════════ */

/**
 * Valida a ficha antes de gravar. Devolve a mensagem de erro (já citando o
 * número da pergunta, para que o usuário ache o problema numa ficha longa) ou
 * `null` quando está tudo certo.
 */
export function validateRegistrationForm(form: InternalEventForm): string | null {
  for (let i = 0; i < form.fields.length; i++) {
    const field = form.fields[i];
    const position = i + 1;

    if (!field.label.trim()) {
      return `A pergunta ${position} está sem enunciado. Escreva o que será perguntado.`;
    }

    if (!isChoiceField(field.type)) continue;

    const options = field.options ?? [];
    if (options.length === 0) {
      return `A pergunta ${position} é de escolha única e precisa de ao menos uma opção.`;
    }
    if (options.some((opt) => !opt.trim())) {
      return `A pergunta ${position} tem uma opção sem texto. Preencha ou remova a opção.`;
    }
    const seen = new Set<string>();
    for (const opt of options) {
      const key = opt.trim().toLowerCase();
      if (seen.has(key)) {
        return `A pergunta ${position} tem a opção "${opt.trim()}" repetida. Cada opção precisa ser diferente.`;
      }
      seen.add(key);
    }
  }
  return null;
}

/* ════════════════════════════════════════════
   DATAS
   ════════════════════════════════════════════ */

/** ISO -> valor de `<input type="datetime-local">` no fuso local. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Intervalo aceito para as datas de um evento. Abaixo disso é quase sempre
 * digitação errada (ano 0999); acima, o Postgres rejeita o timestamp e o erro
 * cru do PostgREST vazaria para o toast.
 */
export const MIN_EVENT_YEAR = 2000;
export const MAX_EVENT_YEAR = 2100;

/** `true` quando o ISO cai num intervalo plausível para um evento. */
export function isEventDateInRange(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  return year >= MIN_EVENT_YEAR && year <= MAX_EVENT_YEAR;
}

/** Valor de `<input type="datetime-local">` -> ISO (UTC). */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
