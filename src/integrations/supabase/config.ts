// Credenciais públicas do Supabase usadas como fallback de build.
// A URL e a anon/publishable key são PÚBLICAS por design (vão para o bundle JS de
// qualquer forma e são protegidas por RLS) — não confundir com a service_role, que
// NUNCA pode aparecer no frontend.
//
// Por que o fallback existe: a publicação via Lovable (produção em gt3.omnx.pro,
// servida por Cloudflare) NÃO injeta variáveis VITE_* no build do frontend. Sem o
// fallback, o bundle publicado sai com import.meta.env.VITE_SUPABASE_* === undefined
// e o app quebra com "Missing Supabase environment variables".
// import.meta.env continua tendo prioridade, então Vercel/local seguem usando o .env.
// Exceção consciente à regra "sem fallback hardcoded" do CLAUDE.md — ver §2.
const FALLBACK_SUPABASE_URL = "https://opbdoulspzlabxzevffc.supabase.co";
const FALLBACK_SUPABASE_PROJECT_ID = "opbdoulspzlabxzevffc";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wYmRvdWxzcHpsYWJ4emV2ZmZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzEyNDgsImV4cCI6MjA4NzIwNzI0OH0.MTa39BraEgvkq0O2eKK9cnumxkAW-Vm5nwBkREMNurY";

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
