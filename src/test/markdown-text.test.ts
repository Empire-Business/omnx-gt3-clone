import { describe, it, expect } from "vitest";
import { markdownToPlainText, markdownToSingleLine } from "@/lib/markdown-text";

describe("markdownToPlainText", () => {
  it("remove ênfase, títulos e listas", () => {
    const input = [
      "### Como vai funcionar",
      "",
      "**Obrigatório para todo o time de Entrega**",
      "",
      "- *primeiro* item",
      "1. segundo item",
    ].join("\n");

    const out = markdownToPlainText(input);
    expect(out).not.toMatch(/[*#]/);
    expect(out).toContain("Como vai funcionar");
    expect(out).toContain("Obrigatório para todo o time de Entrega");
    expect(out).toContain("primeiro item");
    expect(out).toContain("segundo item");
  });

  it("mantém o texto de links e imagens, descartando a URL", () => {
    expect(markdownToPlainText("veja [o curso](https://x.com/y) hoje")).toBe(
      "veja o curso hoje"
    );
    expect(markdownToPlainText("![capa](https://x.com/a.png)")).toBe("capa");
  });

  it("preserva emoji e acentuação", () => {
    expect(markdownToPlainText("🍵 **CUMBUCA — ASSUNTOS VIRAIS**")).toBe(
      "🍵 CUMBUCA — ASSUNTOS VIRAIS"
    );
  });

  it("devolve string vazia para nulo/indefinido", () => {
    expect(markdownToPlainText(null)).toBe("");
    expect(markdownToPlainText(undefined)).toBe("");
  });
});

describe("markdownToSingleLine", () => {
  it("junta parágrafos com separador e respeita o limite", () => {
    const out = markdownToSingleLine("**Título**\n\nCorpo do texto", 100);
    expect(out).toBe("Título · Corpo do texto");
  });

  it("trunca com reticências quando passa do limite", () => {
    const out = markdownToSingleLine("a".repeat(50), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });
});
