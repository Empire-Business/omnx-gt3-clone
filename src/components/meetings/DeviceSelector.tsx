/**
 * DeviceSelector — v8.10.3
 * Popover na MeetControlBar para trocar microfone, câmera e saída de áudio
 * em tempo real durante a reunião.
 *
 * - Lista devices via useMediaDeviceSelect() (oficial LiveKit)
 * - Persiste device IDs em useMeetPreferences (reaplicados em sessões futuras)
 * - Aplica setActiveDevice() na Room ativa imediatamente
 */
import { useEffect } from "react";
import { useMediaDeviceSelect } from "@livekit/components-react";
import { Settings2, Mic, Video, Volume2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";

export function DeviceSelector() {
  const { prefs, update } = useMeetPreferences();

  const mics = useMediaDeviceSelect({ kind: "audioinput" });
  const cams = useMediaDeviceSelect({ kind: "videoinput" });
  const speakers = useMediaDeviceSelect({ kind: "audiooutput" });

  // Reaplica devices salvos quando lista carrega
  useEffect(() => {
    if (prefs.audioInputDeviceId && mics.devices.some((d) => d.deviceId === prefs.audioInputDeviceId) && mics.activeDeviceId !== prefs.audioInputDeviceId) {
      void mics.setActiveMediaDevice(prefs.audioInputDeviceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mics.devices.length]);

  useEffect(() => {
    if (prefs.videoInputDeviceId && cams.devices.some((d) => d.deviceId === prefs.videoInputDeviceId) && cams.activeDeviceId !== prefs.videoInputDeviceId) {
      void cams.setActiveMediaDevice(prefs.videoInputDeviceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cams.devices.length]);

  useEffect(() => {
    if (prefs.audioOutputDeviceId && speakers.devices.some((d) => d.deviceId === prefs.audioOutputDeviceId) && speakers.activeDeviceId !== prefs.audioOutputDeviceId) {
      void speakers.setActiveMediaDevice(prefs.audioOutputDeviceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakers.devices.length]);

  const pickMic = (id: string) => {
    void mics.setActiveMediaDevice(id);
    update({ audioInputDeviceId: id });
  };
  const pickCam = (id: string) => {
    void cams.setActiveMediaDevice(id);
    update({ videoInputDeviceId: id });
  };
  const pickSpeaker = (id: string) => {
    void speakers.setActiveMediaDevice(id);
    update({ audioOutputDeviceId: id });
  };

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Dispositivos"
              className={cn(
                "h-11 w-11 rounded-full flex items-center justify-center transition-colors",
                "bg-muted/40 hover:bg-muted/70 text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Settings2 className="w-5 h-5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Trocar microfone, câmera e saída de áudio</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="center" className="w-80 p-0" sideOffset={8}>
        <ScrollArea className="max-h-[60vh]">
          <div className="p-3 space-y-3">
            <DeviceGroup
              icon={<Mic className="w-4 h-4" />}
              title="Microfone"
              devices={mics.devices}
              activeId={mics.activeDeviceId}
              onPick={pickMic}
            />
            <Separator />
            <DeviceGroup
              icon={<Video className="w-4 h-4" />}
              title="Câmera"
              devices={cams.devices}
              activeId={cams.activeDeviceId}
              onPick={pickCam}
            />
            <Separator />
            <DeviceGroup
              icon={<Volume2 className="w-4 h-4" />}
              title="Saída de áudio"
              devices={speakers.devices}
              activeId={speakers.activeDeviceId}
              onPick={pickSpeaker}
              emptyMessage="Seu navegador não permite trocar a saída."
            />
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function DeviceGroup({
  icon,
  title,
  devices,
  activeId,
  onPick,
  emptyMessage,
}: {
  icon: React.ReactNode;
  title: string;
  devices: MediaDeviceInfo[];
  activeId: string;
  onPick: (id: string) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
        {icon}
        {title}
      </div>
      {devices.length === 0 ? (
        <p className="text-xs text-muted-foreground px-1 py-2">
          {emptyMessage ?? "Nenhum dispositivo encontrado."}
        </p>
      ) : (
        <div className="space-y-0.5">
          {devices.map((d) => {
            const active = d.deviceId === activeId;
            return (
              <button
                key={d.deviceId}
                type="button"
                onClick={() => onPick(d.deviceId)}
                className={cn(
                  "w-full text-left text-sm px-2 py-1.5 rounded-md flex items-center gap-2 transition-colors",
                  active
                    ? "bg-primary/15 text-foreground"
                    : "hover:bg-muted text-foreground/90",
                )}
              >
                <span className="flex-1 truncate">{d.label || "Dispositivo sem nome"}</span>
                {active && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
