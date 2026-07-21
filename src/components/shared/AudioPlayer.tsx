import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, Languages, Loader2, Copy, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIntegrations } from "@/hooks/useIntegrations";

/* ══════════════════════════════════════════════════════════════════
   AudioPlayer — Player de áudio estilo WhatsApp (compartilhado)
   Usado por: Feed (posts/comentários) e Chat (mensagens).
   - Play/Pause circular + waveform (Web Audio API com fallback)
   - Velocidade 1x → 1.5x → 2x
   - Transcrição via edge function `feed-audio-transcribe`
   - Variantes: default | dense | chat
   ══════════════════════════════════════════════════════════════════ */

const BARS = 32;
const waveformCache = new Map<string, number[]>();
/** Promessas em voo de auto-transcrição, deduplicadas por URL para
 *  evitar múltiplos players (ex.: lista de comentários) dispararem
 *  a edge function várias vezes para o mesmo áudio. */
const pendingAutoTranscribe = new Map<string, Promise<string | null>>();

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Waveform determinística — usada como skeleton e fallback. */
function fakeWaveform(url: string): number[] {
  const seed = hashString(url);
  const peaks: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const v = Math.abs(Math.sin(seed * 0.013 + i * 0.7) * Math.cos(seed * 0.029 + i * 1.3));
    peaks.push(0.25 + v * 0.7);
  }
  return peaks;
}

async function decodeWaveform(url: string): Promise<number[]> {
  const cached = waveformCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 5 * 1024 * 1024) throw new Error("audio too large");
    const buf = await res.arrayBuffer();
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error("no AudioContext");
    const ctx = new Ctx();
    try {
      const audioBuf = await ctx.decodeAudioData(buf.slice(0));
      const channel = audioBuf.getChannelData(0);
      const bucket = Math.floor(channel.length / BARS);
      const peaks: number[] = [];
      let max = 0;
      for (let i = 0; i < BARS; i++) {
        let sum = 0;
        for (let j = 0; j < bucket; j++) {
          const v = channel[i * bucket + j] ?? 0;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / Math.max(bucket, 1));
        peaks.push(rms);
        if (rms > max) max = rms;
      }
      const norm = peaks.map((p) => (max ? Math.max(0.08, p / max) : 0.1));
      waveformCache.set(url, norm);
      return norm;
    } finally {
      ctx.close().catch(() => {});
    }
  } catch {
    const fb = fakeWaveform(url);
    waveformCache.set(url, fb);
    return fb;
  }
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export type AudioPlayerVariant = "default" | "dense" | "chat";

interface AudioPlayerProps {
  url: string;
  mime?: string;
  name?: string;
  variant?: AudioPlayerVariant;
  /** Apenas relevante para variant="chat" — afeta paleta (minha mensagem vs alheia) */
  isMine?: boolean;
  /** Se false, oculta o botão de transcrição (default: true) */
  enableTranscription?: boolean;
}

export function AudioPlayer({
  url,
  mime,
  name,
  variant = "default",
  isMine = false,
  enableTranscription = true,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  // Áudio webm/opus gravado no navegador (MediaRecorder) vem sem duração no
  // header → a.duration = Infinity no loadedmetadata. Flag para forçar o cálculo.
  const durationFixRef = useRef(false);
  const [peaks, setPeaks] = useState<number[]>(() => fakeWaveform(url));
  const [waveReady, setWaveReady] = useState<boolean>(() => waveformCache.has(url));
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);

  // Transcrição depende da IA (OpenRouter). Se não conectada, o botão some e a
  // auto-transcrição nem tenta chamar a edge function. Fail-open.
  const { isActive: isFeatureActive } = useIntegrations();
  const canTranscribe = enableTranscription && isFeatureActive("ai");

  const [transcription, setTranscription] = useState<string | null>(null);
  const [showTranscription, setShowTranscription] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  /* Decodifica waveform real em idle */
  useEffect(() => {
    if (waveformCache.has(url)) {
      setPeaks(waveformCache.get(url)!);
      setWaveReady(true);
      return;
    }
    const win = window as unknown as {
      requestIdleCallback?: (cb: () => void) => number;
    };
    const run = () => {
      decodeWaveform(url).then((p) => {
        setPeaks(p);
        setWaveReady(true);
      });
    };
    const id = win.requestIdleCallback ? win.requestIdleCallback(run) : window.setTimeout(run, 80);
    return () => {
      if (win.requestIdleCallback) {
        // best-effort cancel
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
      } else {
        clearTimeout(id);
      }
    };
  }, [url]);

  /* Cache hit silencioso + auto-transcrição em background ao montar.
     Se já há transcrição salva, mostra sem chamar a edge function.
     Caso contrário, dispara a transcrição automaticamente em idle
     (deduplicada globalmente por URL para o caso de múltiplos players
     do mesmo áudio na mesma página, ex.: lista de comentários). */
  useEffect(() => {
    if (!canTranscribe) return;
    let cancelled = false;

    (async () => {
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => {
              maybeSingle: () => Promise<{ data: { transcription: string } | null }>;
            };
          };
        };
      })
        .from("feed_audio_transcriptions")
        .select("transcription")
        .eq("attachment_url", url)
        .maybeSingle();

      if (cancelled) return;

      if (data?.transcription) {
        setTranscription(data.transcription);
        setShowTranscription(true);
        return;
      }

      // Sem cache → dispara automaticamente em idle.
      const win = window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      };
      const startAuto = () => {
        if (cancelled) return;
        setTranscribing(true);
        let promise = pendingAutoTranscribe.get(url);
        if (!promise) {
          promise = (async () => {
            try {
              const res = await supabase.functions.invoke("feed-audio-transcribe", {
                body: { audio_url: url, mime },
              });
              if (res.error) throw res.error;
              const text = (res.data as { transcription?: string } | null)?.transcription;
              return text ?? null;
            } catch (err) {
              console.warn("[AudioPlayer] auto-transcribe falhou silenciosamente:", err);
              return null;
            } finally {
              // Limpa após resolver para permitir retry manual no futuro
              setTimeout(() => pendingAutoTranscribe.delete(url), 1000);
            }
          })();
          pendingAutoTranscribe.set(url, promise);
        }
        promise.then((text) => {
          if (cancelled) return;
          if (text) {
            setTranscription(text);
            setShowTranscription(true);
          }
          setTranscribing(false);
        });
      };

      if (win.requestIdleCallback) {
        win.requestIdleCallback(startAuto, { timeout: 4000 });
      } else {
        setTimeout(startAuto, 600);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, mime, canTranscribe]);

  /* Sincroniza playbackRate */
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1));
  }, []);

  const handleSeek = useCallback((clientX: number) => {
    const el = waveRef.current;
    const a = audioRef.current;
    if (!el || !a || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setProgress(ratio);
    setCurrent(ratio * duration);
  }, [duration]);

  const handleTranscribe = useCallback(async () => {
    if (transcription) {
      setShowTranscription((v) => !v);
      return;
    }
    if (transcribing) {
      // Auto-transcrição já em curso → apenas marca para expandir quando chegar
      setShowTranscription(true);
      return;
    }
    setTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("feed-audio-transcribe", {
        body: { audio_url: url, mime },
      });
      if (error) throw error;
      const text = (data as { transcription?: string } | null)?.transcription;
      if (!text) throw new Error("Resposta vazia");
      setTranscription(text);
      setShowTranscription(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao transcrever áudio";
      toast.error(msg);
    } finally {
      setTranscribing(false);
    }
  }, [transcription, transcribing, url, mime]);

  // Força uma nova transcrição ignorando o cache (botão "Transcrever de novo").
  const handleRetranscribe = useCallback(async () => {
    if (transcribing) return;
    setTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("feed-audio-transcribe", {
        body: { audio_url: url, mime, force: true },
      });
      if (error) throw error;
      const text = (data as { transcription?: string } | null)?.transcription;
      if (!text) throw new Error("Resposta vazia");
      setTranscription(text);
      setShowTranscription(true);
      toast.success("Transcrição refeita");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao transcrever áudio";
      toast.error(msg);
    } finally {
      setTranscribing(false);
    }
  }, [transcribing, url, mime]);

  /* ── Estilos por variante ─────────────────────────────── */
  const isChatMine = variant === "chat" && isMine;
  const isDense = variant === "dense";

  const containerCls = cn(
    "rounded-xl flex items-center gap-2 w-full max-w-full min-w-0 overflow-hidden",
    isDense ? "p-1.5" : "p-2",
    variant === "chat"
      ? isMine
        ? "bg-transparent"
        : "bg-muted"
      : "bg-muted",
  );

  const playBtnSize = isDense ? "w-9 h-9" : variant === "chat" ? "w-10 h-10" : "w-11 h-11";
  const playBtnCls = cn(
    "rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-95",
    playBtnSize,
    isChatMine
      ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
      : "bg-primary text-primary-foreground hover:bg-primary/90",
  );

  const playedBarCls = isChatMine ? "bg-primary-foreground" : "bg-primary";
  const restBarCls = isChatMine ? "bg-primary-foreground/45" : "bg-muted-foreground/30";
  const timeCls = cn(
    "text-2xs tabular-nums flex-shrink-0",
    isChatMine ? "text-primary-foreground/85" : "text-muted-foreground",
  );

  const speedBtnCls = cn(
    "rounded-full text-2xs font-semibold flex-shrink-0 transition-colors px-2 py-1 min-w-[34px]",
    isChatMine
      ? "bg-primary-foreground/25 text-primary-foreground hover:bg-primary-foreground/40"
      : "bg-card text-foreground hover:bg-accent border border-border",
  );

  const transcribeBtnCls = cn(
    "flex items-center gap-1 text-2xs rounded-md px-2 py-1 transition-colors disabled:opacity-50 max-w-full truncate",
    isChatMine
      ? "bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 border border-transparent"
      : "text-muted-foreground hover:text-foreground border border-border",
  );

  const transcriptionTextCls = cn(
    "text-xs whitespace-pre-wrap leading-relaxed border-l-2 pl-2 mt-1.5",
    isChatMine
      ? "text-primary-foreground/95 border-primary-foreground/50"
      : "text-foreground/90 border-primary/40",
  );

  const playedCount = Math.round(progress * BARS);
  const visiblePeaks = useMemo(() => peaks.slice(0, BARS), [peaks]);

  return (
    <div className={cn("flex flex-col w-full min-w-0 max-w-full", isDense ? "gap-1" : "gap-1.5")} aria-label={name ?? "Áudio"}>
      <div className={containerCls}>
        <button
          type="button"
          onClick={togglePlay}
          className={playBtnCls}
          aria-label={playing ? "Pausar áudio" : "Tocar áudio"}
        >
          {playing
            ? <Pause className={isDense ? "w-4 h-4" : "w-5 h-5"} fill="currentColor" />
            : <Play className={cn(isDense ? "w-4 h-4" : "w-5 h-5", "translate-x-[1px]")} fill="currentColor" />}
        </button>

        <div
          ref={waveRef}
          role="slider"
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          className={cn("flex-1 min-w-0 flex items-center gap-px cursor-pointer h-9 select-none", !waveReady && "opacity-70")}
          onClick={(e) => handleSeek(e.clientX)}
          onKeyDown={(e) => {
            const a = audioRef.current;
            if (!a || !duration) return;
            if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 5);
            else if (e.key === "ArrowRight") a.currentTime = Math.min(duration, a.currentTime + 5);
            else if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              togglePlay();
            }
          }}
        >
          {visiblePeaks.map((p, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-full transition-colors min-w-[1px]",
                i < playedCount ? playedBarCls : restBarCls,
              )}
              style={{ height: `${Math.max(10, p * 100)}%` }}
            />
          ))}
        </div>

        <span className={timeCls}>
          {playing || progress > 0 ? formatTime(current) : formatTime(duration)}
        </span>

        <button
          type="button"
          onClick={cycleSpeed}
          className={speedBtnCls}
          aria-label={`Velocidade ${speed}x — clique para alterar`}
        >
          {speed === 1 ? "1x" : speed === 1.5 ? "1.5x" : "2x"}
        </button>

        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const a = e.currentTarget;
            if (isFinite(a.duration) && a.duration > 0) {
              setDuration(a.duration);
            } else {
              // Sem duração (webm/opus): força o navegador a ler até o fim e
              // calcular a duração — o valor real chega no onDurationChange.
              durationFixRef.current = true;
              try { a.currentTime = 1e101; } catch { /* noop */ }
            }
          }}
          onDurationChange={(e) => {
            const a = e.currentTarget;
            if (isFinite(a.duration) && a.duration > 0) {
              setDuration(a.duration);
              if (durationFixRef.current) {
                durationFixRef.current = false;
                try { a.currentTime = 0; } catch { /* noop */ }
                setCurrent(0);
                setProgress(0);
              }
            }
          }}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            if (durationFixRef.current) return; // ignora updates do seek forçado
            setCurrent(a.currentTime);
            if (a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
            setCurrent(0);
          }}
        >
          {mime ? <source src={url} type={mime} /> : null}
        </audio>
      </div>

      {canTranscribe && (
        <div className={cn("flex items-center gap-2 max-w-full", isChatMine ? "" : "px-1")}>
          <button
            type="button"
            onClick={handleTranscribe}
            disabled={transcribing}
            className={transcribeBtnCls}
            aria-label="Transcrever áudio"
          >
            {transcribing ? (
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
            ) : (
              <Languages className="w-3 h-3 flex-shrink-0" />
            )}
            <span className="truncate">
              {transcribing
                ? "Transcrevendo…"
                : transcription
                  ? showTranscription ? "Ocultar transcrição" : "Ver transcrição"
                  : "Transcrever áudio"}
            </span>
          </button>
        </div>
      )}

      {canTranscribe && showTranscription && transcription && (
        <div className="relative group/transcript mt-1.5">
          <p className={transcriptionTextCls}>{transcription}</p>
          <div className="absolute top-0 right-0 flex gap-0.5 opacity-0 group-hover/transcript:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRetranscribe(); }}
              disabled={transcribing}
              className={cn(
                "p-1 rounded transition-colors disabled:opacity-50",
                isChatMine
                  ? "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/15"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title="Transcrever de novo"
              aria-label="Transcrever de novo"
            >
              <RotateCw className={cn("w-3 h-3", transcribing && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await navigator.clipboard.writeText(transcription);
                  toast.success("Transcrição copiada");
                } catch {
                  toast.error("Não foi possível copiar");
                }
              }}
              className={cn(
                "p-1 rounded transition-colors",
                isChatMine
                  ? "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/15"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title="Copiar transcrição"
              aria-label="Copiar transcrição"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
