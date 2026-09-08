/**
 * Aniversários e convite do Google Agenda — a lógica que decide QUEM aparece
 * como aniversariante do dia e COMO o evento chega ao Google.
 *
 * O que estes testes protegem, em português claro:
 *  - quem faz aniversário hoje é reconhecido no fuso do usuário (o bug clássico
 *    de "apareceu um dia antes" nasce de converter `YYYY-MM-DD` com `new Date`);
 *  - o aniversariante sobe para o topo da lista de conversas;
 *  - o convite do Google leva data, hora e o link da sala do GT3.
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import { isBirthdayOn } from "@/hooks/useBirthdays";
import { buildGoogleCalendarUrl } from "@/lib/google-calendar";

afterEach(() => {
  vi.useRealTimers();
});

/** Congela o relógio num instante local (evita depender do dia real). */
function freeze(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("aniversariante do dia", () => {
  it("reconhece quem nasceu no mesmo dia/mês, ignorando o ano", () => {
    freeze("2026-09-04T09:00:00");
    expect(isBirthdayOn("1990-09-04")).toBe(true);
    expect(isBirthdayOn("2001-09-04")).toBe(true);
  });

  it("não confunde com o dia anterior nem com o seguinte", () => {
    freeze("2026-09-04T09:00:00");
    expect(isBirthdayOn("1990-09-03")).toBe(false);
    expect(isBirthdayOn("1990-09-05")).toBe(false);
  });

  it("não vira o dia por causa de fuso — 23h ainda é hoje", () => {
    freeze("2026-09-04T23:30:00");
    expect(isBirthdayOn("1988-09-04")).toBe(true);
    expect(isBirthdayOn("1988-09-05")).toBe(false);
  });

  it("aceita timestamp completo vindo do banco", () => {
    freeze("2026-09-04T09:00:00");
    expect(isBirthdayOn("1990-09-04T00:00:00.000Z")).toBe(true);
  });

  it("trata ausência e lixo sem quebrar", () => {
    expect(isBirthdayOn(null)).toBe(false);
    expect(isBirthdayOn(undefined)).toBe(false);
    expect(isBirthdayOn("")).toBe(false);
    expect(isBirthdayOn("data-invalida")).toBe(false);
  });
});

/**
 * Espelha o comparador da lista de conversas (`Chat.tsx`): Clara → aniversário
 * → fixados → resto por última atividade.
 */
describe("ordem da lista de conversas", () => {
  type Row = { key: string; kind: "clara" | "channel"; isBday: boolean; isFav: boolean; sortTs: number };
  const rank = (r: Row) => (r.kind === "clara" ? 0 : r.isBday ? 1 : r.isFav ? 2 : 3);
  const sort = (rows: Row[]) =>
    [...rows].sort((a, b) => (rank(a) !== rank(b) ? rank(a) - rank(b) : b.sortTs - a.sortTs));

  it("põe o aniversariante acima até dos fixados", () => {
    const rows: Row[] = [
      { key: "recente", kind: "channel", isBday: false, isFav: false, sortTs: 900 },
      { key: "fixado", kind: "channel", isBday: false, isFav: true, sortTs: 100 },
      { key: "aniversario", kind: "channel", isBday: true, isFav: false, sortTs: 1 },
      { key: "clara", kind: "clara", isBday: false, isFav: true, sortTs: Number.MAX_SAFE_INTEGER },
    ];
    expect(sort(rows).map((r) => r.key)).toEqual(["clara", "aniversario", "fixado", "recente"]);
  });

  it("sem aniversariante, a ordem de sempre continua valendo", () => {
    const rows: Row[] = [
      { key: "antigo", kind: "channel", isBday: false, isFav: false, sortTs: 10 },
      { key: "novo", kind: "channel", isBday: false, isFav: false, sortTs: 99 },
      { key: "fixado", kind: "channel", isBday: false, isFav: true, sortTs: 1 },
    ];
    expect(sort(rows).map((r) => r.key)).toEqual(["fixado", "novo", "antigo"]);
  });
});

describe("convite do Google Agenda", () => {
  const url = (extra = {}) =>
    buildGoogleCalendarUrl({
      title: "Reunião de resultados",
      startsAt: "2026-09-10T17:00:00.000Z",
      endsAt: "2026-09-10T18:30:00.000Z",
      details: "Sala da reunião no GT3: https://gt3.omnx.pro/meet/sala-123",
      location: "https://gt3.omnx.pro/meet/sala-123",
      ...extra,
    })!;

  it("manda início e fim em UTC, no formato que o Google espera", () => {
    expect(url()).toContain("dates=20260910T170000Z%2F20260910T183000Z");
  });

  it("assume 1 hora quando o evento não tem término", () => {
    expect(url({ endsAt: null })).toContain("dates=20260910T170000Z%2F20260910T180000Z");
  });

  it("corrige término anterior ao início em vez de gerar convite inválido", () => {
    expect(url({ endsAt: "2026-09-10T16:00:00.000Z" })).toContain(
      "dates=20260910T170000Z%2F20260910T180000Z",
    );
  });

  it("leva título, link da sala no local e no corpo", () => {
    // `URLSearchParams` codifica espaço como `+` — o Google decodifica de volta.
    const params = new URL(url()).searchParams;
    expect(params.get("text")).toBe("Reunião de resultados");
    expect(params.get("location")).toBe("https://gt3.omnx.pro/meet/sala-123");
    expect(params.get("details")).toContain("https://gt3.omnx.pro/meet/sala-123");
  });

  it("devolve null quando a data é inválida — quem chama avisa o usuário", () => {
    expect(buildGoogleCalendarUrl({ title: "X", startsAt: "não é data" })).toBeNull();
  });
});
