/**
 * ChatEmojiPicker — v8.44.1
 *
 * Wrapper único do emoji-mart para o app. Existe por dois motivos:
 *
 * 1. O emoji-mart renderiza em shadow DOM (<em-emoji-picker>) com paleta
 *    própria. A pintura vem das custom properties que ele expõe no :host
 *    (--rgb-background, --rgb-color, --rgb-accent, --rgb-input,
 *    --color-border, --border-radius, --font-family, ...), conectadas aos
 *    tokens do DS em `src/index.css` (bloco "EMOJI-MART"). Aqui só
 *    garantimos o `theme` explícito — `theme="auto"` lê
 *    prefers-color-scheme, que NÃO é a fonte de verdade do tema no GT3
 *    (o tema vive na classe `.dark` do <html>, via useTheme).
 *
 * 2. Centraliza o lazy-load: o pacote de dados do emoji-mart é pesado e
 *    não deve entrar no bundle inicial.
 */
import { lazy, Suspense, useState, type ReactElement, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "@/hooks/useTheme";

interface PickerBodyProps {
  theme: "light" | "dark";
  onEmojiSelect: (e: { native?: string }) => void;
}

/** Biblioteca + dataset só são baixados quando o picker abre pela 1ª vez. */
const EmojiMartPicker = lazy(async () => {
  const [react, data] = await Promise.all([
    import("@emoji-mart/react"),
    import("@emoji-mart/data"),
  ]);
  const Picker = react.default as unknown as (props: Record<string, unknown>) => ReactElement;
  const Wrapped = (props: PickerBodyProps) => (
    <Picker
      data={data.default}
      locale="pt"
      previewPosition="none"
      navPosition="top"
      perLine={9}
      emojiButtonSize={36}
      emojiSize={22}
      {...props}
    />
  );
  return { default: Wrapped };
});

interface ChatEmojiPickerProps {
  /** Elemento que abre o picker (normalmente um Button do DS). */
  trigger: ReactNode;
  /** Recebe o emoji nativo já pronto para inserir no texto. */
  onSelect: (emoji: string) => void;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function ChatEmojiPicker({
  trigger,
  onSelect,
  side = "top",
  align = "start",
}: ChatEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className="w-auto overflow-hidden rounded-xl border border-border bg-popover p-0 shadow-xl"
      >
        <Suspense
          fallback={
            <div className="flex h-[380px] w-[min(352px,90vw)] items-center justify-center text-xs text-muted-foreground">
              Carregando emojis...
            </div>
          }
        >
          <EmojiMartPicker
            theme={theme}
            onEmojiSelect={(e) => {
              if (e?.native) onSelect(e.native);
              setOpen(false);
            }}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
