/*
 * ESTE ARQUIVO SUBSTITUI O `config.ts` NO REPOSITÓRIO-TEMPLATE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Não é usado no desenvolvimento daqui. A sincronização com o `omnx-gt3-clone`
 * (ver `scripts/sincronizar-template-local.mjs`) copia este conteúdo POR CIMA do
 * `config.ts` de lá. Quem clona a plataforma recebe esta versão.
 *
 * POR QUE OS DOIS PRECISAM SER DIFERENTES
 *
 * O `config.ts` de verdade traz, embutidos, o endereço e a chave pública do
 * banco de produção da OMNX — e PRECISA trazer: a produção do gt3.omnx.pro roda
 * na Vercel sem nenhuma variável de ambiente cadastrada, então o fallback é o
 * que sustenta o site no ar. Tirá-lo de lá derruba a produção no próximo deploy.
 *
 * Só que o mesmo arquivo ia para o template de clonagem, e ali o efeito é o
 * oposto: o cliente clona, esquece de preencher o `.env`, e o app DELE conecta
 * no banco de produção DA OMNX. Nada quebra — ele cria conta, usa o sistema, e
 * os dados dele entram na nossa base. É por não quebrar que ninguém descobre.
 *
 * Aqui os fallbacks estão vazios: sem `.env` configurado, o app para com uma
 * mensagem dizendo o que fazer. Falhar alto é melhor que funcionar no banco de
 * outra empresa.
 *
 * ⚠️ Este arquivo espelha o `config.ts`. Se lá mudar a lista de funções
 * exportadas, a sincronização avisa — mas o conteúdo daqui é seu para manter.
 */

const FALLBACK_SUPABASE_URL = "";
const FALLBACK_SUPABASE_PROJECT_ID = "";
const FALLBACK_SUPABASE_ANON_KEY = "";

// Chave VAPID PÚBLICA do Web Push. Mesma natureza da anon key: é entregue ao
// navegador de qualquer forma (vai como `applicationServerKey` na inscrição) e
// serve só para o serviço de push identificar o remetente. A chave PRIVADA
// continua exclusivamente nos Secrets das Edge Functions.
//
// Sem este fallback, o build do Lovable saía com VITE_VAPID_PUBLIC_KEY undefined,
// o que tornava `isSupported` constante `false` em usePushNotifications — o
// minificador então eliminava todo o código de inscrição como código morto e
// TODOS os usuários, em qualquer navegador, viam "este navegador não suporta
// notificações push". Confirmado no bundle publicado: 0 ocorrências da chave,
// de `applicationServerKey` e de `push_subscriptions`.
// IMPORTANTE: precisa ser o PAR da VAPID_PRIVATE_KEY configurada nos Secrets
// das Edge Functions. Se a privada for rotacionada, atualize aqui também —
// senão o serviço de push rejeita todos os envios.
const FALLBACK_VAPID_PUBLIC_KEY = "";

const DEFAULT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const DEFAULT_STORAGE_KEY_PREFIX =
  import.meta.env.VITE_SUPABASE_PROJECT_ID || FALLBACK_SUPABASE_PROJECT_ID;

// Hosts que têm proxy reverso configurado para encaminhar /auth/v1, /rest/v1, etc. ao Supabase.
// Em outros hosts (preview do Lovable, lovableproject.com, lovable.app, etc.) precisamos
// chamar o Supabase diretamente — caso contrário o servidor devolve o HTML da SPA e
// o cliente quebra com "Unexpected token '<', '<!doctype'".
//
// IMPORTANTE: só adicione um host aqui se ele estiver realmente atrás de um proxy
// reverso (ex.: Vercel com vercel.json) que encaminhe `/auth/v1/*`, `/rest/v1/*`,
// `/functions/v1/*`, `/storage/v1/*` e `/realtime/v1/*` ao projeto Supabase.
// Hospedagens Lovable NÃO fazem esse rewrite — usam SPA fallback que retorna HTML.

/*
 * Sem configuração, o app para aqui — de propósito.
 *
 * Um cliente que clona e roda sem preencher o `.env` merece uma frase que diz o
 * que fazer, e não uma tela branca com "failed to fetch" no console.
 */
if (!DEFAULT_SUPABASE_URL) {
  throw new Error(
    [
      "Faltam as credenciais do Supabase.",
      "",
      "Copie o arquivo .env.example para .env e preencha com os dados do SEU projeto:",
      "  VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co",
      "  VITE_SUPABASE_PUBLISHABLE_KEY=a chave anon public",
      "",
      "Onde achar: painel do Supabase, em Settings > API.",
      "Use a chave anon public — NUNCA a service_role, que passa por cima de toda a",
      "seguranca do banco e nao pode aparecer no navegador.",
      "",
      "Depois de salvar o .env, pare e suba o servidor de novo.",
    ].join(String.fromCharCode(10)),
  );
}

const SAME_ORIGIN_PROXY_HOSTS = new Set<string>([]);

function shouldUseSameOriginProxy() {
  if (typeof window === "undefined") return false;

  const { hostname, protocol } = window.location;

  if (protocol !== "https:" && protocol !== "http:") return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return false;

  return SAME_ORIGIN_PROXY_HOSTS.has(hostname);
}

export function getSupabaseUrl() {
  if (!DEFAULT_SUPABASE_URL) return DEFAULT_SUPABASE_URL;
  if (typeof window === "undefined") return DEFAULT_SUPABASE_URL;

  if (shouldUseSameOriginProxy()) {
    return window.location.origin;
  }

  return DEFAULT_SUPABASE_URL;
}

// URL real do Supabase (sem o proxy same-origin). Usada para o WebSocket do realtime,
// que não passa pelo proxy. Sempre resolve para o host do Supabase, nunca o origin do app.
export function getDirectSupabaseUrl() {
  return DEFAULT_SUPABASE_URL;
}

// Anon/publishable key (pública). Prioriza a env var; cai no fallback no build do Lovable.
export function getSupabaseAnonKey() {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_ANON_KEY;
}

// Chave VAPID pública (Web Push). Prioriza a env var; cai no fallback no Lovable.
export function getVapidPublicKey(): string {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY || FALLBACK_VAPID_PUBLIC_KEY;
}

export function getSupabaseStorageKey() {
  if (typeof window === "undefined") {
    return `sb-${DEFAULT_STORAGE_KEY_PREFIX}-auth-token`;
  }

  if (shouldUseSameOriginProxy()) {
    return `sb-${window.location.hostname.replace(/\./g, "-")}-auth-token`;
  }

  return `sb-${DEFAULT_STORAGE_KEY_PREFIX}-auth-token`;
}

export function normalizeSupabaseAssetUrl(url?: string | null) {
  if (!url) return url ?? null;
  if (typeof window === "undefined") return url;
  if (!shouldUseSameOriginProxy()) return url;
  if (url.startsWith("/")) return url;

  try {
    const parsed = new URL(url);
    const defaultOrigin = DEFAULT_SUPABASE_URL ? new URL(DEFAULT_SUPABASE_URL).origin : null;
    const isSupabaseHost = parsed.hostname.endsWith(".supabase.co") || parsed.origin === defaultOrigin;

    if (!isSupabaseHost) return url;

    if (
      parsed.pathname.startsWith("/storage/v1/") ||
      parsed.pathname.startsWith("/auth/v1/") ||
      parsed.pathname.startsWith("/functions/v1/") ||
      parsed.pathname.startsWith("/rest/v1/") ||
      parsed.pathname.startsWith("/realtime/v1/")
    ) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}`;
    }

    return url;
  } catch {
    return url;
  }
}
