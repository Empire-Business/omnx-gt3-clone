/**
 * ─────────────────────────────────────────────────────────────────
 *  IDENTIDADE VISUAL — edite ESTE arquivo pra personalizar o app
 * ─────────────────────────────────────────────────────────────────
 *
 *  Tudo que define a "cara" do app vive aqui: nome, logo e cores.
 *  Trocar esses valores troca a marca em todo lugar (título da aba,
 *  header, e-mails, telas internas, etc.).
 *
 *  As cores são em HSL (formato "H S% L%") — você pode usar qualquer
 *  conversor online: https://hslpicker.com
 */

export const BRAND = {
  /** Nome curto do app — aparece no título da aba, header e e-mails. */
  appName: import.meta.env.VITE_APP_NAME || "OMNX GT3",

  /** Frase curta que descreve o app. */
  tagline: "Plataforma visual para gestão de times, projetos e processos.",

  /** Caminho do logo (PNG/SVG dentro de /public). */
  logo: "/logo.png",

  /** Favicon (ícone da aba) — chip OMNX com wordmark empilhada OM/NX (arte real). */
  favicon: "/favicon-omnx.png?v=5",

  /**
   * Cor da marca em HSL ("H S% L%" — sem o `hsl()` em volta).
   * Apenas `--primary` é customizável pelo branding. Tokens de superfície
   * (secondary, muted, accent) seguem o design system e adaptam-se sozinhos
   * a light/dark.
   * Use https://hslpicker.com pra pegar a sua.
   */
  colors: {
    primary: "230 50% 47%",   // graphite blue (design system OMNX)
  },
} as const;

/**
 * Aplica as cores do BRAND nas CSS variables do app, em runtime.
 * É chamada uma vez no main.tsx.
 */
export function applyBrand() {
  const root = document.documentElement;
  root.style.setProperty("--primary", BRAND.colors.primary);
  document.title = BRAND.appName;
}
