/**
 * useMeetPreferences — v8.10.4
 * Persiste preferências do usuário para reuniões em localStorage:
 * - audioEnhanced: noiseSuppression / echoCancellation / AGC nativos do browser
 * - noiseFilter: Krisp AI noise cancellation (default true)
 * - backgroundType / backgroundImageUrl: fundo virtual
 *   • backgroundImageUrl pode ser "preset:<id>" (estável entre builds), uma
 *     URL externa (Unsplash) ou um data URL (upload do usuário). v8.10.4
 * - liveTranscriptionEnabled: transcrição ao vivo via Soniox
 * - audioInputDeviceId / videoInputDeviceId / audioOutputDeviceId: devices
 *   selecionados pelo usuário (persistidos para reaplicar em sessões futuras). v8.10.3
 * - displayName: nome exibido na PreJoin (lembrado entre sessões). v8.10.4
 */
import { useCallback, useEffect, useState } from "react";
import { migrateLegacyBackgroundUrl } from "@/components/meetings/backgroundPresets";

export type BackgroundType = "none" | "blur-light" | "blur-strong" | "image";
/**
 * Qualidade do recorte (segmentação) do fundo virtual:
 *  - "standard": modelo padrão da lib LiveKit (selfie_segmenter float16).
 *    Rápido, estável, baseline boa.
 *  - "high": modelo selfie_multiclass_256x256 (float32) — recorta cabelo,
 *    pele e roupa em classes separadas, bordas sensivelmente mais limpas
 *    em fios de cabelo, óculos e contornos finos. ~+10-15% CPU.
 */
export type BackgroundQuality = "standard" | "high";

export interface MeetPreferences {
  audioEnhanced: boolean;
  noiseFilter: boolean;
  backgroundType: BackgroundType;
  backgroundImageUrl: string | null;
  /** Qualidade do recorte do fundo virtual. v8.11.2 */
  backgroundQuality: BackgroundQuality;
  liveTranscriptionEnabled: boolean;
  /** Device IDs persistidos entre sessões. v8.10.3 */
  audioInputDeviceId: string | null;
  videoInputDeviceId: string | null;
  audioOutputDeviceId: string | null;
  /** Nome lembrado para PreJoin. v8.10.4 */
  displayName: string | null;
  /** Ganho de saída remoto (volume das vozes). 0..3.0, default 1.0. v8.11.1 */
  remoteAudioGain: number;
}

const STORAGE_KEY = "empire.meet.preferences.v1";

const DEFAULTS: MeetPreferences = {
  audioEnhanced: true,
  noiseFilter: true,
  backgroundType: "none",
  backgroundImageUrl: null,
  backgroundQuality: "standard",
  liveTranscriptionEnabled: false,
  audioInputDeviceId: null,
  videoInputDeviceId: null,
  audioOutputDeviceId: null,
  displayName: null,
  remoteAudioGain: 1.0,
};

function load(): MeetPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULTS, ...parsed };
    // v8.10.2: força noiseFilter ON por padrão para todos os usuários,
    // sobrescrevendo preferências antigas salvas como `false` antes desse default existir.
    if (typeof parsed.noiseFilter !== "boolean") {
      merged.noiseFilter = true;
    }
    // v8.10.4: migra URL absoluta antiga do asset Empire para "preset:empire"
    // (sobrevive a rebuilds que reemitem hashes diferentes no nome do arquivo).
    merged.backgroundImageUrl = migrateLegacyBackgroundUrl(merged.backgroundImageUrl);
    return merged;
  } catch {
    return DEFAULTS;
  }
}

function save(prefs: MeetPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode — silently ignore */
  }
}

export function useMeetPreferences() {
  const [prefs, setPrefs] = useState<MeetPreferences>(() => load());

  useEffect(() => {
    save(prefs);
  }, [prefs]);

  const update = useCallback((patch: Partial<MeetPreferences>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  return { prefs, update };
}
