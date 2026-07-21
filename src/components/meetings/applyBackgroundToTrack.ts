/**
 * applyBackgroundToTrack — v8.11.3
 * Aplica um BackgroundType + URL/preset a uma LocalVideoTrack arbitrária.
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
import {
  BackgroundProcessor,
  type BackgroundProcessorWrapper,
} from "@livekit/track-processors";
import type { BackgroundType, BackgroundQuality } from "@/hooks/useMeetPreferences";
import { resolveBackgroundUrl } from "./backgroundPresets";

const HIGH_QUALITY_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

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
}: ApplyBackgroundArgs): Promise<ApplyBackgroundResult> {
  if (type === "none") {
    await track.stopProcessor();
    return { processor: null };
  }

  if (type === "blur-light" || type === "blur-strong") {
    const blurRadius = type === "blur-strong" ? 15 : 8;
    if (current) {
      await current.switchTo({ mode: "background-blur", blurRadius });
      return { processor: current };
    }
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
    return { processor: current ?? null };
  }
  if (current) {
    await current.switchTo({ mode: "virtual-background", imagePath: url });
    return { processor: current };
  }
  const proc = BackgroundProcessor({
    mode: "virtual-background",
    imagePath: url,
    assetPaths: modelAssetsFor(quality),
  });
  await track.setProcessor(proc);
  return { processor: proc };
}
