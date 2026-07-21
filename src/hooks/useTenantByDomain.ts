import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantByDomain {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
}

/**
 * Domínios que NÃO devem tentar resolver tenant (são o "app raiz" do SaaS).
 * Tudo que não estiver aqui é tratado como possível custom_domain de cliente.
 */
const ROOT_HOSTS = new Set<string>([
  "localhost",
  "127.0.0.1",
  // Adicione aqui os seus domínios principais conforme forem definidos:
  // "gt3.omnx.pro",
  // "app.omnx.pro",
]);

function isRootHost(hostname: string): boolean {
  if (ROOT_HOSTS.has(hostname)) return true;
  // Previews da Vercel (*.vercel.app) — sempre raiz.
  if (hostname.endsWith(".vercel.app")) return true;
  return false;
}

/**
 * Resolve qual tenant carregar baseado no hostname atual.
 * - Em domínio raiz (localhost, vercel preview, app principal): retorna null
 *   e o app cai no fluxo padrão (tenant do usuário logado).
 * - Em domínio customizado: retorna os dados de branding do tenant correspondente.
 */
export function useTenantByDomain() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const enabled = !!hostname && !isRootHost(hostname);

  return useQuery({
    queryKey: ["tenant-by-domain", hostname],
    enabled,
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<TenantByDomain | null> => {
      const { data, error } = await supabase.rpc("get_tenant_by_domain", { p_domain: hostname });
      if (error) {
        console.warn("[tenant-by-domain] erro ao resolver tenant:", error.message);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return (row as TenantByDomain) ?? null;
    },
  });
}
