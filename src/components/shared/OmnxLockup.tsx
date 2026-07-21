import { cn } from "@/lib/utils";

interface OmnxLockupProps {
  /**
   * "dark"  -> logo com texto preto (para fundo CLARO)
   * "light" -> logo com texto branco (para fundo ESCURO)
   * Se omitido, alterna automaticamente via classe `.dark` do Tailwind.
   */
  variant?: "dark" | "light";
  /** Altura da logo em px (base para todas as demais medidas). Default 28. */
  height?: number;
  /** Palavra do produto exibida ao lado da logo. Default "GT3". */
  word?: string;
  /** Exibir a palavra do produto. Default true. */
  showWord?: boolean;
  /**
   * Tamanho da palavra do produto relativo à altura da logo. Default 0.5.
   * Aumente (ex.: 0.9) para deixar o nome maior sem crescer a logo.
   */
  wordRatio?: number;
  className?: string;
}

/**
 * Lockup de marca OMNX — idêntico em todos os apps OMNX.
 * Renderiza: [logo OMNX] + [separador vertical sutil] + [palavra do produto].
 */
export function OmnxLockup({
  variant,
  height = 28,
  word = "GT3",
  showWord = true,
  wordRatio = 0.5,
  className,
}: OmnxLockupProps) {
  const gap = height * 0.45;
  const sepHeight = Math.round(height * 0.55);
  const wordSize = height * wordRatio;

  const wordStyle: React.CSSProperties = {
    // Fonte próxima da wordmark OMNX (geométrica/técnica, cantos chanfrados).
    fontFamily:
      "'Chakra Petch','Space Grotesk','Segoe UI',system-ui,sans-serif",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: wordSize,
    lineHeight: 1,
    whiteSpace: "nowrap",
    // cor = primário do app (graphite blue). --primary é HSL em componentes.
    color: "hsl(var(--primary))",
  };

  const imgClass = "block h-full w-auto select-none";
  const imgProps = {
    alt: "OMNX",
    draggable: false,
    style: { height, width: "auto" as const },
  };

  // Modo automático: renderiza ambas as imagens e alterna via CSS `.dark`.
  const auto = variant === undefined;

  return (
    <span
      className={cn("inline-flex items-center", className)}
      style={{ gap }}
    >
      {auto ? (
        <>
          <img
            src="/omnx-logo-dark.png"
            className={cn(imgClass, "dark:hidden")}
            {...imgProps}
          />
          <img
            src="/omnx-logo-light.png"
            className={cn(imgClass, "hidden dark:block")}
            {...imgProps}
          />
        </>
      ) : (
        <img
          src={variant === "light" ? "/omnx-logo-light.png" : "/omnx-logo-dark.png"}
          className={imgClass}
          {...imgProps}
        />
      )}

      {showWord && (
        <>
          {/* Separador vertical sutil */}
          {auto ? (
            <>
              <span
                aria-hidden
                className="dark:hidden"
                style={{
                  width: 1,
                  height: sepHeight,
                  borderRadius: 1,
                  background: "rgba(0,0,0,.18)",
                }}
              />
              <span
                aria-hidden
                className="hidden dark:block"
                style={{
                  width: 1,
                  height: sepHeight,
                  borderRadius: 1,
                  background: "rgba(255,255,255,.22)",
                }}
              />
            </>
          ) : (
            <span
              aria-hidden
              style={{
                width: 1,
                height: sepHeight,
                borderRadius: 1,
                background:
                  variant === "light"
                    ? "rgba(255,255,255,.22)"
                    : "rgba(0,0,0,.18)",
              }}
            />
          )}
          <span style={wordStyle}>{word}</span>
        </>
      )}
    </span>
  );
}

export default OmnxLockup;
