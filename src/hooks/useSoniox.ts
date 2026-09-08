/**
 * useSoniox — v8.7.7
 * Hook reutilizável que conecta áudio (mic local OU MediaStreams externas, ex.: LiveKit)
 * ao Soniox WebSocket de STT em tempo real, com diarização (Speaker 1/2/3...).
 *
 * Modos suportados:
 *  - { captureFromMic: true }  → faz getUserMedia do microfone padrão (uso de MeetingRecorder)
 *  - { externalStreams: ref }  → mixa um array de MediaStream em um único AudioContext
 *                                (uso de useLiveKitTranscription — local + remotos)
 *
 * Sempre retorna PCM 16kHz mono e gerencia:
 *  - AudioWorklet (com fallback ScriptProcessorNode)
 *  - Reconexão exponencial do WS
 *  - Pausa, EOF, cleanup
 *  - VU meter (audioLevel 0..100)
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SonioxToken {
  /** Identidade estável do segmento — serve de `key` no React (nunca usar índice). */
  id: string;
  speaker: string;
  text: string;
  timestamp: number;
}

export interface UseSonioxOptions {
  /** Inicia/encerra a captura. Se false, hook fica inerte. */
  enabled: boolean;
  /** Captura microfone padrão via getUserMedia. */
  captureFromMic?: boolean;
  /** Streams externas (ex.: LiveKit) — passar via ref pra evitar stale closure. */
  externalStreams?: RefObject<MediaStream[]>;
  /** Pausa o envio (mantém WS aberto). */
  paused?: boolean;
  /** Constraints customizadas pro getUserMedia. */
  audioConstraints?: MediaTrackConstraints;
  /**
   * Liga o medidor de volume (`audioLevel`). Custa um setInterval(100ms) que
   * dispara ~10 re-renders/s no componente que chama o hook. Default `true`
   * por compatibilidade; desligue quando a UI não desenha o medidor.
   */
  vuMeter?: boolean;
}

export interface UseSonioxReturn {
  transcript: SonioxToken[];
  liveText: string;
  liveSpeaker: string | null;
  isReady: boolean;
  isReconnecting: boolean;
  audioLevel: number;
  audioProcessedMs: number;
  error: string | null;
  /** Limpa transcript local (não desconecta). */
  clearTranscript: () => void;
  /** Encerra explicitamente: envia EOF + fecha WS + libera AudioContext. Retorna o transcript final acumulado (inclui tokens recebidos durante o flush do EOF). */
  stop: () => Promise<SonioxToken[]>;
}

const WS_RECONNECT_MAX_ATTEMPTS = 5;
const WS_RECONNECT_BASE_DELAY = 1000;

/**
 * Taxa de saída exigida pelo Soniox (pcm_s16le mono).
 */
const OUTPUT_SAMPLE_RATE = 16000;

/**
 * Tamanho do bloco acumulado dentro do worklet, em amostras da taxa NATIVA.
 * 4864 = 38 quanta de 128 frames → ~101 ms a 48 kHz, ~110 ms a 44,1 kHz.
 * Múltiplo exato de 128 para que os quanta encham o bloco sem sobra estrutural.
 *
 * Por que 100 ms: antes o worklet fazia um postMessage por quantum (128 frames),
 * ou seja ~375 msg/s a 48 kHz — e cada mensagem virava um ws.send() na main thread.
 * Acumulando ~100 ms caímos para ~10 msg/s e ~10 ws.send/s (37x menos), com um
 * custo de latência de ~100 ms — irrelevante para legenda ao vivo.
 */
const WORKLET_BLOCK_SAMPLES = 4864;

/**
 * Worklet de captura: acumula ~100 ms de áudio, JÁ FAZ O DOWNSAMPLE para 16 kHz
 * e converte para Int16 na própria thread de áudio, e então envia UM único
 * postMessage com o ArrayBuffer transferível (zero cópia).
 *
 * Downsample no worklet (e não na main thread) porque:
 *  - o laço de reamostragem é O(n) sobre o áudio e roda 10x/s de forma sustentada;
 *    na main thread ele disputa frames com React/LiveKit/compositor (causa do travamento);
 *  - `AudioWorkletGlobalScope` expõe `sampleRate`, então o worklet sabe a taxa nativa;
 *  - a main thread passa a apenas repassar o ArrayBuffer pro WebSocket.
 *
 * Continuidade: a posição de leitura (`_readPos`) é fracionária e é CARREGADA entre
 * blocos, então não há perda de amostras nem silêncio nas bordas. Na última amostra
 * de cada bloco o vizinho da interpolação é clampado para a própria amostra (o bloco
 * seguinte ainda não existe) — erro sub-amostral uma vez a cada ~100 ms, inaudível
 * para STT e sem descartar nenhuma amostra.
 */
const WORKLET_CODE = `
const BLOCK = ${WORKLET_BLOCK_SAMPLES};
const OUT_RATE = ${OUTPUT_SAMPLE_RATE};

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._paused = false;
    this._buf = new Float32Array(BLOCK);
    this._filled = 0;
    this._ratio = sampleRate / OUT_RATE;
    // Posição de leitura fracionária, carregada entre blocos (sem perda de amostras).
    this._readPos = 0;
    // Buffer de saída reutilizado (tamanho máximo possível + folga).
    this._out = new Int16Array(Math.ceil(BLOCK / this._ratio) + 2);
    this.port.onmessage = (e) => {
      if (e.data.type === 'pause') {
        this._paused = e.data.value;
        // Ao pausar, descarta o parcial para não emendar áudio de antes/depois.
        if (this._paused) { this._filled = 0; this._readPos = 0; }
      }
    };
  }

  _flush() {
    const buf = this._buf;
    const len = this._filled;
    const ratio = this._ratio;
    const out = this._out;
    let n = 0;
    let pos = this._readPos;
    while (pos < len) {
      const i0 = pos | 0;
      const i1 = i0 + 1 < len ? i0 + 1 : len - 1;
      const frac = pos - i0;
      let s = buf[i0] * (1 - frac) + buf[i1] * frac;
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      out[n++] = s < 0 ? s * 32768 : s * 32767;
      pos += ratio;
    }
    // Carrega o resto fracionário para o próximo bloco (continuidade de fase).
    this._readPos = pos - len;
    this._filled = 0;
    if (n === 0) return;
    const pcm = new Int16Array(out.subarray(0, n));
    this.port.postMessage({ type: 'audio', pcm: pcm.buffer }, [pcm.buffer]);
  }

  process(inputs) {
    if (this._paused) return true;
    const input = inputs[0];
    const ch = input && input[0];
    if (!ch || ch.length === 0) return true;
    let offset = 0;
    while (offset < ch.length) {
      const room = BLOCK - this._filled;
      const take = Math.min(room, ch.length - offset);
      this._buf.set(ch.subarray(offset, offset + take), this._filled);
      this._filled += take;
      offset += take;
      if (this._filled === BLOCK) this._flush();
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
`;

function createWorkletBlobURL(): string {
  const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Int16Array {
  if (inputRate === outputRate) {
    const result = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      result[i] = Math.max(-32768, Math.min(32767, Math.floor(buffer[i] * 32768)));
    }
    return result;
  }
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, buffer.length - 1);
    const frac = srcIndex - srcIndexFloor;
    const sample = buffer[srcIndexFloor] * (1 - frac) + buffer[srcIndexCeil] * frac;
    result[i] = Math.max(-32768, Math.min(32767, Math.floor(sample * 32768)));
  }
  return result;
}

export function useSoniox(opts: UseSonioxOptions): UseSonioxReturn {
  const {
    enabled,
    captureFromMic,
    externalStreams,
    paused = false,
    audioConstraints,
    vuMeter = true,
  } = opts;

  const [transcript, setTranscript] = useState<SonioxToken[]>([]);
  const transcriptRef = useRef<SonioxToken[]>([]);
  /** Contador monotônico para gerar `id` estável de segmento. */
  const segmentSeqRef = useRef(0);
  const [liveText, setLiveText] = useState("");
  const [liveSpeaker, setLiveSpeaker] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioProcessedMs, setAudioProcessedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
    workletNodeRef.current?.port.postMessage({ type: "pause", value: paused });
  }, [paused]);

  const wsRef = useRef<WebSocket | null>(null);
  const tempApiKeyRef = useRef<string | null>(null);
  const wsReconnectAttemptRef = useRef(0);
  const isStoppingRef = useRef(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const externalSourcesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const vuTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.total_audio_proc_ms != null) setAudioProcessedMs(msg.total_audio_proc_ms);

      if (msg.tokens && msg.tokens.length > 0) {
        let finalText = "";
        let nonFinalText = "";
        let lastSpeaker: string | null = null;

        for (const token of msg.tokens) {
          const speaker = token.speaker != null ? String(token.speaker) : null;
          if (speaker) lastSpeaker = speaker;
          if (token.is_final) finalText += token.text;
          else nonFinalText += token.text;
        }

        if (finalText) {
          const speakerLabel = lastSpeaker ? `Speaker ${lastSpeaker}` : "Speaker ?";
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            const next = last && last.speaker === speakerLabel
              // Continuação do mesmo falante: mantém o MESMO `id` — o React reconcilia
              // só o texto desse nó, sem remontar a lista.
              ? [...prev.slice(0, -1), { ...last, text: last.text + finalText }]
              : [
                  ...prev,
                  {
                    id: `${Date.now().toString(36)}-${segmentSeqRef.current++}`,
                    speaker: speakerLabel,
                    text: finalText.trim(),
                    timestamp: Date.now(),
                  },
                ];
            transcriptRef.current = next;
            return next;
          });
        }
        setLiveText(nonFinalText);
        if (lastSpeaker) setLiveSpeaker(`Speaker ${lastSpeaker}`);
      }
    } catch {
      /* non-JSON frame */
    }
  }, []);

  const connectWS = useCallback((apiKey: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
      ws.onopen = () => {
        ws.send(JSON.stringify({
          api_key: apiKey,
          model: "stt-rt-preview",
          audio_format: "pcm_s16le",
          sample_rate: 16000,
          num_channels: 1,
          enable_speaker_diarization: true,
          language_hints: ["pt", "en"],
        }));
        setIsReady(true);
        setIsReconnecting(false);
        wsReconnectAttemptRef.current = 0;
        resolve(ws);
      };
      ws.onmessage = handleMessage;
      ws.onerror = () => reject(new Error("WebSocket connection error"));
      ws.onclose = () => {
        setIsReady(false);
        if (!isStoppingRef.current && wsRef.current === ws) attemptReconnect();
      };
    });
  }, [handleMessage]);

  const attemptReconnect = useCallback(() => {
    if (isStoppingRef.current) return;
    const attempt = wsReconnectAttemptRef.current;
    if (attempt >= WS_RECONNECT_MAX_ATTEMPTS) {
      setError("Conexão perdida com Soniox após múltiplas tentativas.");
      return;
    }
    setIsReconnecting(true);
    wsReconnectAttemptRef.current = attempt + 1;
    const delay = WS_RECONNECT_BASE_DELAY * Math.pow(2, attempt);
    setTimeout(async () => {
      if (isStoppingRef.current) return;
      try {
        const apiKey = tempApiKeyRef.current;
        if (!apiKey) return;
        const newWs = await connectWS(apiKey);
        wsRef.current = newWs;
        toast.info("Conexão Soniox restabelecida.");
      } catch {
        attemptReconnect();
      }
    }, delay);
  }, [connectWS]);

  // Fetch temp key
  const getTempKey = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke("soniox-temp-key");
    if (error) {
      setError("Falha ao obter chave Soniox: " + error.message);
      return null;
    }
    const apiKey = (data as any)?.api_key;
    if (!apiKey) {
      setError("Chave Soniox vazia.");
      return null;
    }
    return apiKey;
  }, []);

  // Master start/stop driven by `enabled`
  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    isStoppingRef.current = false;

    (async () => {
      try {
        const apiKey = await getTempKey();
        if (!apiKey) return;
        tempApiKeyRef.current = apiKey;

        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC() as AudioContext;
        audioContextRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();

        const nativeRate = ctx.sampleRate;

        // Destination que recebe a mix de todas as fontes (mic + externos)
        const mixDest = ctx.createMediaStreamDestination();
        mixDestRef.current = mixDest;

        // Mic local opcional
        if (captureFromMic) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints ?? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            },
          });
          mediaStreamRef.current = stream;
          const micSource = ctx.createMediaStreamSource(stream);
          micSourceRef.current = micSource;
          micSource.connect(mixDest);
        }

        // Streams externas já presentes na ref no momento da init (ex.: participantes LiveKit
        // já na sala). O efeito [externalCount] dispara ANTES do AudioContext estar pronto,
        // então conectamos aqui para não perder os streams iniciais.
        if (externalStreams) {
          const initial = externalStreams.current ?? [];
          initial.forEach((stream) => {
            try {
              const src = ctx.createMediaStreamSource(stream);
              src.connect(mixDest);
              externalSourcesRef.current.push(src);
            } catch (err) {
              console.warn("[useSoniox] Falha ao conectar stream externa inicial:", err);
            }
          });
        }

        // Source pra capturar a mix → analyser (VU) + worklet/processor
        const mixSource = ctx.createMediaStreamSource(mixDest.stream);

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        mixSource.connect(analyser);
        analyserRef.current = analyser;

        const ws = await connectWS(apiKey);
        wsRef.current = ws;

        /** Envia PCM 16 kHz s16le já pronto. Não faz trabalho de DSP na main thread. */
        const sendPcm = (pcm: ArrayBuffer) => {
          if (wsRef.current?.readyState !== WebSocket.OPEN || pausedRef.current) return;
          wsRef.current.send(pcm);
        };

        let usingWorklet = false;
        if (typeof AudioWorkletNode !== "undefined" && ctx.audioWorklet) {
          try {
            const url = createWorkletBlobURL();
            await ctx.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            const node = new AudioWorkletNode(ctx, "recorder-processor");
            workletNodeRef.current = node;
            // ~10 mensagens/s (blocos de ~100 ms), já em Int16 16 kHz e transferidas
            // (sem clone). A main thread só repassa o ArrayBuffer para o WebSocket.
            node.port.onmessage = (e) => {
              if (e.data?.type === "audio") sendPcm(e.data.pcm as ArrayBuffer);
            };
            mixSource.connect(node);
            node.connect(ctx.destination);
            usingWorklet = true;
          } catch (err) {
            console.warn("[useSoniox] AudioWorklet falhou, usando ScriptProcessorNode:", err);
          }
        }

        // FALLBACK — só entra quando o AudioWorklet realmente falhou: ou o browser não
        // expõe AudioWorkletNode/ctx.audioWorklet, ou addModule()/new AudioWorkletNode()
        // lançou (o catch acima deixa `usingWorklet = false`). Em qualquer caminho de
        // sucesso do worklet, `usingWorklet` é true e este bloco não roda.
        // ScriptProcessorNode é API depreciada e roda NA MAIN THREAD por definição —
        // por isso aqui (e só aqui) o downsample volta a custar main thread.
        if (!usingWorklet) {
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          processor.onaudioprocess = (e) => {
            if (wsRef.current?.readyState !== WebSocket.OPEN || pausedRef.current) return;
            const pcm = downsampleBuffer(
              e.inputBuffer.getChannelData(0),
              nativeRate,
              OUTPUT_SAMPLE_RATE,
            );
            sendPcm(pcm.buffer as ArrayBuffer);
          };
          mixSource.connect(processor);
          processor.connect(ctx.destination);
        }

        // VU meter: 10 setState/s. Só liga quando o consumidor pede (`vuMeter`),
        // porque cada tick re-renderiza o componente que chama o hook — em telas
        // que não desenham o medidor isso é re-render puro desperdiçado.
        if (vuMeter) {
          const vuData = new Uint8Array(analyser.frequencyBinCount);
          vuTimerRef.current = setInterval(() => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(vuData);
            const avg = vuData.reduce((s, v) => s + v, 0) / vuData.length;
            setAudioLevel(Math.round((avg / 255) * 100));
          }, 100);
        }
      } catch (err: any) {
        console.error("[useSoniox] Erro start:", err);
        if (err.name === "NotAllowedError") {
          setError("Permissão de microfone negada.");
        } else {
          setError(err.message || "Erro ao iniciar captura de áudio.");
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Reconectar streams externas conforme a ref muda (pessoas entram/saem da call).
  // isReady como dependência garante que após a init assíncrona (que cria AudioContext)
  // as streams sejam re-sincronizadas se mudaram durante o período de conectando.
  const externalCount = externalStreams?.current?.length ?? 0;
  useEffect(() => {
    if (!enabled || !isReady || !externalStreams || !audioContextRef.current || !mixDestRef.current) return;
    const ctx = audioContextRef.current;
    const dest = mixDestRef.current;
    // Limpa fontes externas anteriores
    externalSourcesRef.current.forEach((s) => {
      try { s.disconnect(); } catch { /* noop */ }
    });
    externalSourcesRef.current = [];
    const list = externalStreams.current ?? [];
    list.forEach((stream) => {
      try {
        const src = ctx.createMediaStreamSource(stream);
        src.connect(dest);
        externalSourcesRef.current.push(src);
      } catch (err) {
        console.warn("[useSoniox] Falha ao anexar stream externa:", err);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalCount, enabled, isReady]);

  const stop = useCallback(async (): Promise<SonioxToken[]> => {
    isStoppingRef.current = true;

    // 1) Para captura de áudio (não envia mais áudio novo) mas mantém WS aberto
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    externalSourcesRef.current.forEach((s) => { try { s.disconnect(); } catch { /* noop */ } });
    externalSourcesRef.current = [];
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    analyserRef.current = null;
    mixDestRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    // 2) Envia EOF e aguarda flush dos tokens finais — o onmessage continua atualizando transcriptRef
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(""); } catch { /* noop */ }
      await new Promise((r) => setTimeout(r, 2500));
      try { wsRef.current?.close(); } catch { /* noop */ }
    }
    wsRef.current = null;

    // 3) Fecha AudioContext só depois (libera recursos)
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;

    if (vuTimerRef.current) clearInterval(vuTimerRef.current);
    vuTimerRef.current = null;
    setIsReady(false);
    setIsReconnecting(false);
    setAudioLevel(0);
    startedRef.current = false;

    return transcriptRef.current.slice();
  }, []);

  // Quando enabled vai pra false, encerra
  useEffect(() => {
    if (!enabled && startedRef.current) {
      void stop();
    }
  }, [enabled, stop]);

  // Cleanup no unmount
  useEffect(() => {
    return () => { void stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    transcriptRef.current = [];
    setLiveText("");
    setLiveSpeaker(null);
  }, []);

  return {
    transcript,
    liveText,
    liveSpeaker,
    isReady,
    isReconnecting,
    audioLevel,
    audioProcessedMs,
    error,
    clearTranscript,
    stop,
  };
}
