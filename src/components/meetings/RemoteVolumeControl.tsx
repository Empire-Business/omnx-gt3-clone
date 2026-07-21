/**
 * RemoteVolumeControl
 * Slider para ajustar o ganho de saída das vozes alheias (0..10.0 = 0..1000%).
 * Limitador (DynamicsCompressor) no BoostedAudioRenderer evita clipping em ganhos altos.
 * Valor persiste em localStorage via useMeetPreferences.
 */
import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";

const DEFAULT_GAIN = 2.0;
const MAX_GAIN = 10.0;

export function RemoteVolumeControl() {
  const { prefs, update } = useMeetPreferences();
  const value = prefs.remoteAudioGain ?? DEFAULT_GAIN;

  const Icon = value === 0 ? VolumeX : value <= 1 ? Volume1 : Volume2;
  // Display: cada 100% real do ganho aparece como 10% para o usuario (10x = 100%)
  const pct = Math.round(value * 10);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Volume das vozes"
              className="h-11 w-11 rounded-full flex items-center justify-center bg-muted/40 hover:bg-muted/70 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            >
              <Icon className="w-5 h-5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Volume das vozes ({pct}%)</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="center" className="w-64 p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Volume das vozes</span>
            <span className="tabular-nums font-medium text-foreground">{pct}%</span>
          </div>
          <Slider
            value={[value]}
            min={0}
            max={MAX_GAIN}
            step={0.1}
            onValueChange={(v) => update({ remoteAudioGain: v[0] ?? DEFAULT_GAIN })}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
          {value > 3 && (
            <p className="text-[10px] text-warning leading-snug">
              Volume acima de 30% pode distorcer. Limitador automático ativado.
            </p>
          )}
          <div className="flex items-center justify-between mt-1">
            <button
              type="button"
              onClick={() => update({ remoteAudioGain: DEFAULT_GAIN })}
              className="text-xs text-primary hover:underline"
            >
              Padrão (20%)
            </button>
            <button
              type="button"
              onClick={() => update({ remoteAudioGain: MAX_GAIN })}
              className="text-xs text-primary hover:underline"
            >
              Turbo (100%)
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
