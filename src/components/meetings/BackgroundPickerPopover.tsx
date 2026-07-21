/**
 * BackgroundPickerPopover — v8.10.4
 * UI compartilhada do seletor de fundo virtual.
 * Usado tanto na ControlBar (dentro da Room) quanto no PreJoin (fora da Room).
 *
 * Recebe a track via prop para ser desacoplado de LiveKitRoom.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalVideoTrack } from "livekit-client";
import {
  type BackgroundProcessorWrapper,
  supportsBackgroundProcessors,
} from "@livekit/track-processors";
import { Image as ImageIcon, Upload, Loader2, Check, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useMeetPreferences, type BackgroundType, type BackgroundQuality } from "@/hooks/useMeetPreferences";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { BACKGROUND_PRESETS, presetToken, resolveBackgroundUrl } from "./backgroundPresets";
import { applyBackgroundToTrack } from "./applyBackgroundToTrack";

interface Props {
  /** Track de câmera local (pode ser null enquanto não publicada). */
  track: LocalVideoTrack | null;
  /** Trigger custom (default: ícone padrão da ControlBar). */
  trigger?: React.ReactNode;
}

export function BackgroundPickerPopover({ track, trigger }: Props) {
  const { prefs, update } = useMeetPreferences();
  const { user } = useAuth();
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const supported = supportsBackgroundProcessors();
  const lowEnd =
    typeof navigator !== "undefined" &&
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency > 0 &&
    navigator.hardwareConcurrency < 4;

  // Convidados (sem cadastro no GT3) não acessam presets restritos
  const visiblePresets = user
    ? BACKGROUND_PRESETS
    : BACKGROUND_PRESETS.filter((img) => !img.restricted);

  const apply = useCallback(
    async (type: BackgroundType, imageUrlOrPreset?: string | null) => {
      if (!supported) {
        toast.error("Seu navegador não suporta fundo virtual.");
        return;
      }
      if (!track) {
        toast.error("Ative a câmera para aplicar o fundo virtual.");
        return;
      }

      setBusy(true);
      try {
        // Se vamos desligar (type=none), destrói o processor anterior para
        // liberar o WebGL context (track.stopProcessor sozinho não basta).
        if (type === "none" && processorRef.current) {
          const old = processorRef.current;
          processorRef.current = null;
          try { await old.destroy(); } catch { /* noop */ }
        }
        const { processor } = await applyBackgroundToTrack({
          track,
          type,
          imageUrlOrPreset,
          current: processorRef.current,
          quality: prefs.backgroundQuality,
        });
        processorRef.current = processor;
        update({
          backgroundType: type,
          backgroundImageUrl:
            type === "image" ? (imageUrlOrPreset ?? prefs.backgroundImageUrl) : prefs.backgroundImageUrl,
        });
      } catch (err) {
        console.error("[BackgroundPicker] apply failed", err);
        toast.error("Falha ao aplicar fundo virtual.");
      } finally {
        setBusy(false);
      }
    },
    [supported, track, update, prefs.backgroundImageUrl, prefs.backgroundQuality],
  );

  // Mudar qualidade exige recriar o processor (segmenterOptions/assetPaths não
  // são atualizáveis via update — precisam de restart, conforme types do lib).
  const handleQualityChange = useCallback(
    async (next: BackgroundQuality) => {
      update({ backgroundQuality: next });
      if (!supported || !track || prefs.backgroundType === "none") return;
      setBusy(true);
      try {
        // Destrói processor antigo antes de criar com novo modelo — evita
        // vazar WebGL context.
        if (processorRef.current) {
          const old = processorRef.current;
          processorRef.current = null;
          try { await old.destroy(); } catch { /* noop */ }
        }
        const { processor } = await applyBackgroundToTrack({
          track,
          type: prefs.backgroundType,
          imageUrlOrPreset: prefs.backgroundImageUrl,
          current: null, // força recriar com novo modelo
          quality: next,
        });
        processorRef.current = processor;
      } catch (err) {
        console.error("[BackgroundPicker] quality change failed", err);
        toast.error("Falha ao trocar qualidade do fundo.");
      } finally {
        setBusy(false);
      }
    },
    [supported, track, update, prefs.backgroundType, prefs.backgroundImageUrl],
  );

  // Reaplica preferência salva quando a track local muda (mic/cam re-publish
  // ou troca de device). Antes era só quando o participant mudava.
  //
  // Importante: destruímos o processor anterior antes de criar um novo —
  // se não fizermos isso, cada HMR/troca de track vaza um WebGL context,
  // levando ao warning "Too many active WebGL contexts" após ~16 contextos.
  const lastTrackRef = useRef<LocalVideoTrack | null>(null);
  useEffect(() => {
    if (!supported) return;
    if (!track) {
      processorRef.current = null;
      lastTrackRef.current = null;
      return;
    }
    if (prefs.backgroundType === "none") return;

    // Se a track é a mesma de antes e já temos processor, não recria — o
    // próprio LiveKit reusa o pipeline. Sem essa guarda, cada render que
    // pega a mesma track recria a pipeline WebGL inteira.
    if (lastTrackRef.current === track && processorRef.current) return;

    let alive = true;
    const previous = processorRef.current;
    // Marca como "ocupado" antes de iniciar para impedir overlaps em
    // chamadas concorrentes (HMR + StrictMode podem disparar em paralelo).
    processorRef.current = null;
    lastTrackRef.current = track;

    void (async () => {
      // Destrói o processor anterior (libera o WebGL context dele)
      if (previous) {
        try {
          await previous.destroy();
        } catch { /* noop */ }
      }
      try {
        const result = await applyBackgroundToTrack({
          track,
          type: prefs.backgroundType,
          imageUrlOrPreset: prefs.backgroundImageUrl,
          current: null,
          quality: prefs.backgroundQuality,
        });
        if (alive) processorRef.current = result.processor;
        else if (result.processor) {
          // Componente desmontou enquanto aplicávamos — destrói para não vazar
          try { await result.processor.destroy(); } catch { /* noop */ }
        }
      } catch (err) {
        console.warn("[BackgroundPicker] reaplicação falhou", err);
        if (alive) lastTrackRef.current = null; // permite retry numa nova render
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, supported]);

  const handleUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      void apply("image", dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const isActive = (t: BackgroundType, value?: string) => {
    if (prefs.backgroundType !== t) return false;
    if (t !== "image") return true;
    if (!value) return false;
    return prefs.backgroundImageUrl === value;
  };

  const defaultTrigger = (
    <button
      type="button"
      aria-label="Fundo virtual"
      title={supported ? "Fundo virtual" : "Fundo virtual (Chrome 94+ necessário)"}
      className={
        "h-11 w-11 rounded-full flex items-center justify-center transition-colors " +
        "bg-muted/40 hover:bg-muted/70 text-foreground " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        "disabled:opacity-50"
      }
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (!supported && v) {
          toast.error(
            "Fundo virtual requer Chrome 94+ ou Edge 94+. Tente em um navegador atualizado.",
          );
          return;
        }
        setOpen(v);
      }}
    >
      <PopoverTrigger asChild>{trigger ?? defaultTrigger}</PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-80 p-3" sideOffset={8}>
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Fundo virtual</h4>
            {lowEnd && (
              <p className="text-xs text-muted-foreground mt-1">
                Pode reduzir performance no seu dispositivo.
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <BackgroundChip
              label="Sem fundo"
              active={isActive("none")}
              onClick={() => apply("none")}
              disabled={busy || !track}
            >
              <div className="w-full h-full bg-muted rounded-md flex items-center justify-center text-xs text-muted-foreground">
                Off
              </div>
            </BackgroundChip>
            <BackgroundChip
              label="Desfoque leve"
              active={isActive("blur-light")}
              onClick={() => apply("blur-light")}
              disabled={busy || !track}
            >
              <div
                className="w-full h-full rounded-md bg-gradient-to-br from-muted to-card"
                style={{ filter: "blur(2px)" }}
              />
            </BackgroundChip>
            <BackgroundChip
              label="Desfoque forte"
              active={isActive("blur-strong")}
              onClick={() => apply("blur-strong")}
              disabled={busy || !track}
            >
              <div
                className="w-full h-full rounded-md bg-gradient-to-br from-muted to-card"
                style={{ filter: "blur(5px)" }}
              />
            </BackgroundChip>
          </div>

          <Separator />

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Imagens de fundo</p>
            <div className="grid grid-cols-4 gap-2">
              {visiblePresets.map((img) => {
                const token = presetToken(img.id);
                return (
                  <BackgroundChip
                    key={img.id}
                    label={img.label}
                    active={isActive("image", token)}
                    onClick={() => apply("image", token)}
                    disabled={busy || !track}
                  >
                    <img
                      src={img.url}
                      alt={img.label}
                      className="w-full h-full object-cover rounded-md"
                      loading="lazy"
                    />
                  </BackgroundChip>
                );
              })}
            </div>
          </div>

          <label className="block">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
              disabled={busy || !track}
            />
            <Button variant="outline" size="sm" className="w-full" asChild disabled={busy || !track}>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Enviar imagem
              </span>
            </Button>
          </label>

          <Separator />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">Alta qualidade</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Recorta cabelo e contornos com mais detalhe. Pode pesar em máquinas fracas.
              </p>
            </div>
            <Switch
              checked={prefs.backgroundQuality === "high"}
              disabled={busy || !supported}
              onCheckedChange={(v) => handleQualityChange(v ? "high" : "standard")}
              aria-label="Alternar qualidade alta do fundo virtual"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BackgroundChip({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative aspect-video rounded-md overflow-hidden border-2 transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? "border-primary" : "border-transparent hover:border-border",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {children}
      {active && (
        <span className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
          <Check className="w-3 h-3" />
        </span>
      )}
    </button>
  );
}

// Reexports (compat com importações antigas)
export { resolveBackgroundUrl };
