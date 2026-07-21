import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSupabaseAssetUrl } from "@/integrations/supabase/config";
import { BRAND } from "@/config/brand";
import { useTenantByDomain } from "./useTenantByDomain";

export interface TenantBranding {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
}

/**
 * Converte hex (#RRGGBB) para o formato HSL usado pelas CSS vars
 * do app: "H S% L%" (sem o wrapper hsl()).
 */
function hexToHslString(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function useTenantBranding() {
  // 1) Tenta resolver pelo hostname (funciona ANTES do login,
  //    pra branding já aparecer na tela de Auth quando o cliente
  //    acessa pelo domínio próprio dele).
  const { data: domainTenant } = useTenantByDomain();

  // 2) Se logou, busca o tenant via RLS (caso de domínio raiz,
  //    onde o tenant vem do vínculo do usuário).
  const { data: userTenant, isLoading } = useQuery({
    queryKey: ["tenant-branding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, logo_url, logo_dark_url, favicon_url, primary_color")
        .single();
      if (error) throw error;
      return data as TenantBranding;
    },
    staleTime: 1000 * 60 * 5,
    // Só roda se não tiver resolvido pelo domínio
    enabled: !domainTenant,
  });

  const tenant = (domainTenant as TenantBranding | null) ?? userTenant ?? null;

  // Favicon — atualiza href sem remover o elemento (evita flash de ausência)
  useEffect(() => {
    const iconUrl = normalizeSupabaseAssetUrl(tenant?.favicon_url) || BRAND.favicon;
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      document.head.appendChild(link);
    }
    link.href = iconUrl;
  }, [tenant?.favicon_url]);

  // Cor da marca — apenas --primary é customizável pelo tenant.
  useEffect(() => {
    const root = document.documentElement;
    const primary = hexToHslString(tenant?.primary_color);
    if (primary) root.style.setProperty("--primary", primary);
    else root.style.removeProperty("--primary");
  }, [tenant?.primary_color]);

  // Título da aba — nome do tenant assim que carrega
  useEffect(() => {
    if (tenant?.name) document.title = tenant.name;
  }, [tenant?.name]);

  return { tenant, isLoading };
}
