/**
 * applyBackgroundToTrack — v8.36.0
 * Aplica um BackgroundType + URL/preset a uma LocalVideoTrack arbitrária.
 *
 * v8.36.0 — PERFORMANCE: `@livekit/track-processors` (que embute o MediaPipe
 *   tasks-vision + WASM, ~4 MB) passou a ser carregado por `import()` dinâmico,
 *   só quando o usuário realmente aplica um fundo/desfoque. Antes o import era
 *   estático e o bundle inteiro descia junto com a sala, travando celulares em
 *   4G antes mesmo de a call aparecer.
 *   O suporte do browser é detectado localmente (`supportsBackgroundProcessors`
 *   abaixo replica exatamente a checagem da lib, que é só feature-detection),
 *   para não precisar baixar 4 MB só para desenhar o botão.
 *
 * v8.11.3 — qualidade de recorte do fundo virtual:
 *  • "standard" (default): usa o modelo padrão do LiveKit
 *    (selfie_segmenter.tflite float16) — a única topologia disponível em
 *    float16 no CDN do MediaPipe. Boa baseline, rápida.
 *  • "high": selfie_multiclass_256x256.tflite (float32) — segmentação
 *    multiclass (cabelo, pele, roupa, fundo). Recorte sensivelmente melhor
 *    em fios de cabelo, óculos e contornos finos. ~+10-15% CPU.
 *
 * O modelo só é injetado quando "high" — pra "standard" deixamos o default
 * da lib (que já está em cache do browser e é estável).
 */
import { type LocalVideoTrack } from "livekit-client";
// Import SOMENTE de tipo: apagado na compilação, não puxa o pacote pro bundle.
import type { BackgroundProcessorWrapper } from "@livekit/track-processors";
import type { BackgroundType, BackgroundQuality } from "@/hooks/useMeetPreferences";
import { resolveBackgroundUrl } from "./backgroundPresets";

const HIGH_QUALITY_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

/**
 * Detecção de suporte SEM baixar o pacote.
 * Réplica fiel de `supportsBackgroundProcessors()` do @livekit/track-processors
 * (= BackgroundProcessor.isSupported && ProcessorWrapper.isSupported), que é
 * puramente feature-detection de APIs do browser.
 */
export function supportsBackgroundProcessors(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  // ProcessorWrapper.isSupported
  const hasStreamProcessor =
    typeof (globalThis as Record<string, unknown>).MediaStreamTrackGenerator !== "undefined" &&
    typeof (globalThis as Record<string, unknown>).MediaStreamTrackProcessor !== "undefined";
  const hasFallbackSupport =
    typeof HTMLCanvasElement !== "undefined" &&
    typeof (globalThis as Record<string, unknown>).VideoFrame !== "undefined" &&
    "captureStream" in HTMLCanvasElement.prototype;
  const processorWrapperSupported = hasStreamProcessor || hasFallbackSupport;
  if (!processorWrapperSupported) return false;

  // BackgroundProcessor.isSupported
  try {
    return (
      typeof OffscreenCanvas !== "undefined" &&
      typeof (globalThis as Record<string, unknown>).VideoFrame !== "undefined" &&
      typeof createImageBitmap !== "undefined" &&
      !!document.createElement("canvas").getContext("webgl2")
    );
  } catch {
    return false;
  }
}

type TrackProcessorsModule = typeof import("@livekit/track-processors");

/**
 * Promise memoizada — duas chamadas concorrentes (ex.: usuário clica em dois
 * chips seguidos, ou o efeito de reaplicação roda junto com um clique)
 * compartilham o MESMO download em vez de disparar dois.
 */
let trackProcessorsPromise: Promise<TrackProcessorsModule> | null = null;

export function loadTrackProcessors(): Promise<TrackProcessorsModule> {
  if (!trackProcessorsPromise) {
    trackProcessorsPromise = import("@livekit/track-processors").catch((err) => {
      // Não memoiza a falha: permite nova tentativa se a rede voltar.
      trackProcessorsPromise = null;
      throw err;
    });
  }
  return trackProcessorsPromise;
}

/** Já está em memória? Usado pela UI pra saber se precisa mostrar "baixando…". */
export function isTrackProcessorsLoaded(): boolean {
  return trackProcessorsPromise !== null;
}

function modelAssetsFor(quality: BackgroundQuality) {
  if (quality === "high") {
    return { modelAssetPath: HIGH_QUALITY_MODEL_URL };
  }
  // standard: usa default da lib (não injeta assetPaths)
  return undefined;
}

export interface ApplyBackgroundArgs {
  track: LocalVideoTrack;
  type: BackgroundType;
  /** URL crua, data URL, ou token "preset:<id>". */
  imageUrlOrPreset?: string | null;
  /** Processor já anexado (para reuso via switchTo, mais leve que recriar). */
  current?: BackgroundProcessorWrapper | null;
  /** Qualidade do modelo de segmentação. */
  quality?: BackgroundQuality;
  /** Chamado quando o download do pacote MediaPipe começa (só na 1ª vez). */
  onLoadStart?: () => void;
}

export interface ApplyBackgroundResult {
  processor: BackgroundProcessorWrapper | null;
}

export async function applyBackgroundToTrack({
  track,
  type,
  imageUrlOrPreset,
  current,
  quality = "standard",
  onLoadStart,
}: ApplyBackgroundArgs): Promise<ApplyBackgroundResult> {
  if (type === "none") {
    // Desligar não exige o pacote: `stopProcessor` é da própria livekit-client.
    await track.stopProcessor();
    return { processor: null };
  }

  // "switchTo" reusa o processor já vivo — nesse caminho o módulo já foi
  // carregado antes, então nem precisamos tocar no import.
  if (current) {
    if (type === "blur-light" || type === "blur-strong") {
      await current.switchTo({
        mode: "background-blur",
        blurRadius: type === "blur-strong" ? 15 : 8,
      });
      return { processor: current };
    }
    const switchUrl = resolveBackgroundUrl(imageUrlOrPreset);
    if (!switchUrl) return { processor: current };
    await current.switchTo({ mode: "virtual-background", imagePath: switchUrl });
    return { processor: current };
  }

  if (!isTrackProcessorsLoaded()) onLoadStart?.();
  const { BackgroundProcessor } = await loadTrackProcessors();

  if (type === "blur-light" || type === "blur-strong") {
    const blurRadius = type === "blur-strong" ? 15 : 8;
    const proc = BackgroundProcessor({
      mode: "background-blur",
      blurRadius,
      ...(modelAssetsFor(quality) ? { assetPaths: modelAssetsFor(quality)! } : {}),
    });
    await track.setProcessor(proc);
    return { processor: proc };
  }

  // type === "image"
  const url = resolveBackgroundUrl(imageUrlOrPreset);
  if (!url) {
    return { processor: null };
  }
  const proc = BackgroundProcessor({
    mode: "virtual-background",
    imagePath: url,
    assetPaths: modelAssetsFor(quality),
  });
  await track.setProcessor(proc);
  return { processor: proc };
}
