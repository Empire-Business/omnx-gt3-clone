/**
 * MeetPreJoin — v8.10.4
 * Tela pré-reunião custom, em PT-BR, dark theme, com:
 * - Preview de vídeo ao vivo com fundo virtual aplicado
 * - Medidor de volume do microfone (Web Audio API)
 * - Seletores de microfone e câmera (com persistência)
 * - Toggles para entrar com mic/cam off
 * - Campo de nome lembrado entre sessões
 *
 * Substitui o <PreJoin /> nativo do LiveKit (que era em inglês, sobre fundo
 * bege e sem prévia de fundo virtual).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from "livekit-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Loader2,
  ChevronDown,
  Check,
  Image as ImageIcon,
  Hand,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";
import { BackgroundPickerPopover } from "./BackgroundPickerPopover";

export interface MeetPreJoinChoices {
  username: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
}

interface Props {
  defaultName: string;
  /**
   * Nome já conhecido pelo sistema (perfil do colaborador autenticado). Quando
   * verdadeiro, a tela CONFIRMA a identidade em vez de pedir que a pessoa
   * digite o próprio nome — quem entra pelo GT3 logado já foi identificado, e o
   * campo aberto só criava trabalho e divergência de grafia na lista de
   * participantes. Continua editável por um clique em "usar outro nome".
   *
   * Para convidado externo (MeetGuest) fica `false`: aí o nome é a única
   * identificação que existe.
   */
  identityKnown?: boolean;
  onSubmit: (choices: MeetPreJoinChoices) => void;
}

export function MeetPreJoin({ defaultName, identityKnown = false, onSubmit }: Props) {
  const { prefs, update } = useMeetPreferences();

  const [name, setName] = useState(prefs.displayName || defaultName);
  const [nameEdited, setNameEdited] = useState(false);
  /** Só para `identityKnown`: abre o campo quando a pessoa pede outro nome. */
  const [editingName, setEditingName] = useState(false);

  // Sincroniza o campo de nome quando profile/employees carregam DEPOIS do
  // primeiro render (evita o usuário entrar com fallback literal "Participante"
  // por causa de race entre useAuth/useEmployees e o mount do PreJoin).
  useEffect(() => {
    if (nameEdited) return;
    const next = prefs.displayName || defaultName;
    if (next && next !== name) setName(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.displayName, defaultName]);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioDeviceId, setAudioDeviceId] = useState<string | undefined>(
    prefs.audioInputDeviceId ?? undefined,
  );
  const [videoDeviceId, setVideoDeviceId] = useState<string | undefined>(
    prefs.videoInputDeviceId ?? undefined,
  );
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(null);
  const [volume, setVolume] = useState(0); // 0..1

  // Lista devices (depois que o usuário concedeu permissão de mic/cam)
  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(list.filter((d) => d.kind === "audioinput"));
      setVideoDevices(list.filter((d) => d.kind === "videoinput"));
    } catch (err) {
      console.warn("[MeetPreJoin] enumerateDevices failed", err);
    }
  }, []);

  // Cria/atualiza track de vídeo conforme device escolhido / toggle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!videoEnabled) {
        videoTrackRef.current?.stop();
        videoTrackRef.current = null;
        setPreviewTrack(null);
        return;
      }
      try {
        const track = await createLocalVideoTrack({
          deviceId: videoDeviceId ? { ideal: videoDeviceId } : undefined,
          resolution: { width: 1280, height: 720 },
        });
        if (cancelled) {
          track.stop();
          return;
        }
        videoTrackRef.current?.stop();
        videoTrackRef.current = track;
        setPreviewTrack(track);
        if (videoRef.current) {
          track.attach(videoRef.current);
        }
        await refreshDevices();
      } catch (err) {
        console.warn("[MeetPreJoin] createLocalVideoTrack failed", err);
        setVideoEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoEnabled, videoDeviceId, refreshDevices]);

  // Cria/atualiza track de áudio + medidor
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!audioEnabled) {
        cleanupAudio();
        setVolume(0);
        return;
      }
      try {
        const track = await createLocalAudioTrack({
          deviceId: audioDeviceId ? { ideal: audioDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        if (cancelled) {
          track.stop();
          return;
        }
        cleanupAudio();
        audioTrackRef.current = track;

        // Web Audio: pega o MediaStreamTrack e analisa volume
        const stream = new MediaStream([track.mediaStreamTrack]);
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(data);
          // RMS-ish: média das amplitudes
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length / 255;
          // realça com curva (volumes baixos parecem maiores) e clamp
          setVolume(Math.min(1, Math.pow(avg, 0.6) * 1.4));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        await refreshDevices();
      } catch (err) {
        console.warn("[MeetPreJoin] createLocalAudioTrack failed", err);
        setAudioEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEnabled, audioDeviceId]);

  // Cleanup geral no unmount
  useEffect(() => {
    return () => {
      videoTrackRef.current?.stop();
      videoTrackRef.current = null;
      cleanupAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupAudio = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    audioTrackRef.current?.stop();
    audioTrackRef.current = null;
  };

  const handleJoin = () => {
    if (submitting) return;
    setSubmitting(true);
    // Persiste devices + nome para próximas sessões
    update({
      audioInputDeviceId: audioDeviceId ?? prefs.audioInputDeviceId,
      videoInputDeviceId: videoDeviceId ?? prefs.videoInputDeviceId,
      displayName: name.trim() || null,
    });
    // Para os tracks de preview — a Room vai criar tracks novos com base nas prefs
    videoTrackRef.current?.stop();
    cleanupAudio();
    onSubmit({
      username: name.trim() || defaultName,
      videoEnabled,
      audioEnabled,
      audioDeviceId,
      videoDeviceId,
    });
  };

  const canJoin = name.trim().length > 0 && !submitting;

  const segments = useMemo(() => Array.from({ length: 12 }), []);

  const greetingName = (prefs.displayName || defaultName).split(" ")[0];

  return (
    <div className="dark min-h-screen w-full bg-background text-foreground flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-12 items-center">
        {/* ===== Preview (esquerda em desktop) ===== */}
        <div className="space-y-4">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-2xl">
            {videoEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                <div className="size-24 rounded-full bg-muted flex items-center justify-center text-3xl font-semibold uppercase text-muted-foreground">
                  {(name || "?").trim().charAt(0)}
                </div>
                <p className="text-sm text-muted-foreground">Câmera desligada</p>
              </div>
            )}

            {/* Medidor de volume — canto superior esquerdo */}
            {audioEnabled && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/55 backdrop-blur px-2.5 py-1.5 rounded-lg">
                <Mic className="w-3.5 h-3.5 text-white/80" />
                <div className="flex items-center gap-0.5">
                  {segments.map((_, i) => {
                    const threshold = (i + 1) / segments.length;
                    const lit = volume >= threshold;
                    return (
                      <span
                        key={i}
                        className={cn(
                          "block w-1 h-3 rounded-sm transition-colors",
                          lit
                            ? i >= 9
                              ? "bg-destructive"
                              : i >= 6
                                ? "bg-amber-400"
                                : "bg-primary"
                            : "bg-white/20",
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Nome no canto inferior esquerdo (Meet-style) */}
            {name.trim() && (
              <div className="absolute bottom-3 left-3 bg-black/55 backdrop-blur px-2.5 py-1 rounded-lg">
                <span className="text-sm font-medium text-white truncate max-w-[40vw] inline-block">
                  {name.trim()}
                </span>
              </div>
            )}
          </div>

          {/* Toolbar inferior: mic / cam / fundo (circular, Meet-style) */}
          <div className="flex items-center justify-center gap-3">
            <PreviewToggle
              active={audioEnabled}
              onClick={() => setAudioEnabled((v) => !v)}
              onIcon={<Mic className="w-5 h-5" />}
              offIcon={<MicOff className="w-5 h-5" />}
              label={audioEnabled ? "Desligar microfone" : "Ligar microfone"}
            />
            <PreviewToggle
              active={videoEnabled}
              onClick={() => setVideoEnabled((v) => !v)}
              onIcon={<Video className="w-5 h-5" />}
              offIcon={<VideoOff className="w-5 h-5" />}
              label={videoEnabled ? "Desligar câmera" : "Ligar câmera"}
            />
            <div className="w-px h-8 bg-border/60" aria-hidden />
            <BackgroundPickerPopover
              track={previewTrack}
              trigger={
                <button
                  type="button"
                  aria-label="Fundo virtual"
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center transition-colors",
                    "bg-muted/40 hover:bg-muted/70 text-foreground border border-border/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
              }
            />
          </div>

          {/* Seletores de device — abaixo da toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <DevicePicker
              icon={<Mic className="w-4 h-4" />}
              label="Microfone"
              devices={audioDevices}
              activeId={audioDeviceId}
              onPick={(id) => setAudioDeviceId(id)}
              disabled={!audioEnabled}
            />
            <DevicePicker
              icon={<Video className="w-4 h-4" />}
              label="Câmera"
              devices={videoDevices}
              activeId={videoDeviceId}
              onPick={(id) => setVideoDeviceId(id)}
              disabled={!videoEnabled}
            />
          </div>
        </div>

        {/* ===== Painel direito: greeting + nome + entrar ===== */}
        <div className="space-y-6 lg:pl-4">
          <header className="space-y-2 text-center lg:text-left">
            {greetingName && (
              <p className="text-base text-muted-foreground inline-flex items-center gap-1.5">
                <Hand className="w-4 h-4 text-amber-400" aria-hidden="true" />
                Oi, <span className="text-foreground font-medium">{greetingName}</span>!
              </p>
            )}
            <h1 className="text-3xl font-semibold tracking-tight">Pronto para entrar?</h1>
            <p className="text-sm text-muted-foreground">
              Verifique seu áudio, vídeo e fundo antes de entrar na reunião.
            </p>
          </header>

          {identityKnown && !editingName ? (
            /* Colaborador logado: o sistema já sabe quem é — confirma, não pergunta. */
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Entrando como</p>
                <p className="text-base font-medium text-foreground truncate" title={name}>
                  {name}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => setEditingName(true)}
              >
                Usar outro nome
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="prejoin-name" className="text-sm">
                Seu nome
              </Label>
              <Input
                id="prejoin-name"
                value={name}
                autoFocus={editingName}
                onChange={(e) => {
                  setNameEdited(true);
                  setName(e.target.value);
                }}
                placeholder="Como você quer aparecer na reunião"
                autoComplete="name"
                className="h-12 text-base"
              />
            </div>
          )}

          <Button
            onClick={handleJoin}
            disabled={!canJoin}
            size="lg"
            className="w-full h-12 text-base font-semibold rounded-full"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
            Entrar na reunião
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewToggle({
  active,
  onClick,
  onIcon,
  offIcon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "h-12 w-12 rounded-full flex items-center justify-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-muted/40 hover:bg-muted/70 text-foreground border border-border/40"
          : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      )}
    >
      {active ? onIcon : offIcon}
    </button>
  );
}

function DevicePicker({
  icon,
  label,
  devices,
  activeId,
  onPick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  devices: MediaDeviceInfo[];
  activeId?: string;
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  const active = devices.find((d) => d.deviceId === activeId) ?? devices[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          disabled={disabled || devices.length === 0}
          className="w-full justify-between h-11 px-3"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">{icon}</span>
            <span className="truncate text-sm font-normal">
              {disabled
                ? `${label} desligado`
                : active?.label || `Selecionar ${label.toLowerCase()}`}
            </span>
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {devices.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">
                Nenhum dispositivo encontrado.
              </p>
            ) : (
              devices.map((d) => {
                const isActive = d.deviceId === activeId || (!activeId && d === active);
                return (
                  <button
                    key={d.deviceId}
                    type="button"
                    onClick={() => onPick(d.deviceId)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors",
                      isActive ? "bg-primary/15 text-foreground" : "hover:bg-muted",
                    )}
                  >
                    <span className="flex-1 truncate">
                      {d.label || "Dispositivo sem nome"}
                    </span>
                    {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
