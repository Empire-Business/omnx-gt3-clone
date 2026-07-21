/**
 * backgroundPresets — v8.10.4
 * Catálogo central de presets de fundo virtual.
 *
 * Por que: a URL de assets bundleados (ex: fundoEmpire) inclui um hash que muda
 * a cada build. Salvar essa URL absoluta no localStorage causa perda da
 * preferência entre sessões. Solução: identificar presets por chave estável
 * "preset:<id>" e resolver a URL real em runtime.
 */
import fundoEmpire from "@/assets/backgrounds/fundo-empire.png";

export type BackgroundPreset = {
  id: string;
  label: string;
  url: string;
  /** Restrito a usuários autenticados no GT3 (não exibido para convidados). */
  restricted?: boolean;
};

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "empire",
    label: "Sala Empire",
    url: fundoEmpire,
    restricted: true,
  },
  {
    id: "office",
    label: "Escritório",
    url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&q=80",
  },
  {
    id: "neutral-room",
    label: "Sala neutra",
    url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1280&q=80",
  },
  {
    id: "library",
    label: "Biblioteca",
    url: "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1280&q=80",
  },
  {
    id: "modern-office",
    label: "Escritório moderno",
    url: "https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=1280&q=80",
  },
  {
    id: "cozy-home",
    label: "Home office",
    url: "https://images.unsplash.com/photo-1593476550610-87baa860004a?w=1280&q=80",
  },
  {
    id: "warm-living",
    label: "Sala aconchegante",
    url: "https://images.unsplash.com/photo-1567016526105-22da7c13161a?w=1280&q=80",
  },
  {
    id: "blue-gradient",
    label: "Gradiente azul",
    url: "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1280&q=80",
  },
  {
    id: "purple-gradient",
    label: "Gradiente roxo",
    url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1280&q=80",
  },
];

const PRESET_PREFIX = "preset:";

/**
 * Resolve um valor salvo em prefs.backgroundImageUrl para a URL de imagem
 * efetiva. Aceita tanto "preset:empire" quanto URLs/data URLs literais.
 */
export function resolveBackgroundUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith(PRESET_PREFIX)) {
    const id = value.slice(PRESET_PREFIX.length);
    return BACKGROUND_PRESETS.find((p) => p.id === id)?.url ?? null;
  }
  return value;
}

/**
 * Converte uma URL de preset para o token estável "preset:<id>" se for uma
 * URL conhecida. Caso contrário retorna a URL original (upload do usuário,
 * Unsplash externo etc.).
 */
export function toStorableBackground(url: string): string {
  const preset = BACKGROUND_PRESETS.find((p) => p.url === url);
  return preset ? `${PRESET_PREFIX}${preset.id}` : url;
}

/** Token estável a partir de um id de preset conhecido. */
export function presetToken(id: string): string {
  return `${PRESET_PREFIX}${id}`;
}

/** Migra valores antigos (URL absoluta de assets bundleados) para preset:* */
export function migrateLegacyBackgroundUrl(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (value.startsWith(PRESET_PREFIX)) return value;
  // Antigo asset Empire: caminho /assets/fundo-empire-XXXX.png ou /src/assets/...
  if (/fundo-empire[\w.-]*\.png/i.test(value)) {
    return presetToken("empire");
  }
  return value;
}
