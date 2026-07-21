import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// ─── useIntegrations ────────────────────────────────────────────────────────
// Central de Integrações: decide o que fica VISÍVEL no clone com base na chave
// de API conectada. Cada feature acende sozinha quando a chave existe; o admin
// pode desligar manualmente (override) o que está disponível.
//
// Regra efetiva:  isActive = (chave presente) E NOT manuallyDisabled
//
// SEGURANÇA/ESTABILIDADE — fail-open: se o status não puder ser lido (função não
// deployada no clone, rede, erro), assumimos DISPONÍVEL e mostramos tudo. Assim
// a produção atual (que tem todas as chaves) NUNCA some com nada; só escondemos
// uma feature quando temos certeza afirmativa de que a chave está ausente.

export type FeatureKey = "meetings" | "ai" | "recording" | "email" | "push";
export type FeatureHealth = "ok" | "missing" | "invalid" | "error" | "unknown";

export const FEATURE_KEYS: FeatureKey[] = ["meetings", "ai", "recording", "email", "push"];

interface FeatureStatus {
  available: boolean;
  health: FeatureHealth;
  missing: string[];
}

interface StatusResponse {
  features: Record<string, FeatureStatus>;
  probed: boolean;
}

interface TenantFeatureRow {
  feature_key: string;
  manually_disabled: boolean;
}

export interface FeatureInfo {
  key: FeatureKey;
  available: boolean;
  health: FeatureHealth;
  manuallyDisabled: boolean;
  /** Visível na UI: chave presente e não desligada manualmente */
  active: boolean;
  missing: string[];
}

export function useIntegrations(opts?: { probe?: boolean }) {
  const { profile, user } = useAuth();
  const tenantId = profile?.tenant_id;
  const probe = !!opts?.probe;
  const qc = useQueryClient();

  // Status das chaves (presença + probe opcional). Fail-open: erro → null.
  const statusQuery = useQuery({
    queryKey: ["integrations-status", tenantId, probe],
    staleTime: 1000 * 60 * 10,
    retry: false,
    queryFn: async (): Promise<StatusResponse | null> => {
      const { data, error } = await supabase.functions.invoke("integrations-status", {
        method: "GET",
        body: probe ? { probe: "1" } : undefined,
      });
      if (error) return null; // fail-open
      return data as StatusResponse;
    },
    enabled: !!tenantId,
  });

  // Override manual do admin (desligar feature disponível).
  const overridesQuery = useQuery({
    queryKey: ["tenant-features", tenantId],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_features")
        .select("feature_key, manually_disabled");
      if (error) throw error;
      return (data ?? []) as TenantFeatureRow[];
    },
    enabled: !!tenantId,
  });

  const status = statusQuery.data ?? null;
  const overrides = overridesQuery.data ?? [];
  const disabledSet = new Set(
    overrides.filter((o) => o.manually_disabled).map((o) => o.feature_key)
  );

  const getFeature = (key: FeatureKey): FeatureInfo => {
    const s = status?.features?.[key];
    // fail-open: sem status conclusivo → available=true
    const available = s ? s.available : true;
    const health: FeatureHealth = s ? s.health : "unknown";
    const manuallyDisabled = disabledSet.has(key);
    return {
      key,
      available,
      health,
      manuallyDisabled,
      active: available && !manuallyDisabled,
      missing: s?.missing ?? [],
    };
  };

  const isActive = (key: FeatureKey): boolean => getFeature(key).active;

  // Liga/desliga override (upsert por tenant+feature). Só admin passa no RLS.
  const setManuallyDisabled = useMutation({
    mutationFn: async ({ key, disabled }: { key: FeatureKey; disabled: boolean }) => {
      const { error } = await (supabase as any).from("tenant_features").upsert(
        {
          tenant_id: tenantId,
          feature_key: key,
          manually_disabled: disabled,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,feature_key" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant-features", tenantId] }),
  });

  return {
    features: FEATURE_KEYS.map(getFeature),
    getFeature,
    isActive,
    // Enquanto carrega, o gate deve tratar como fail-open (não esconder).
    loading: statusQuery.isLoading || overridesQuery.isLoading,
    probed: status?.probed ?? false,
    isError: overridesQuery.isError,
    refetch: () => {
      statusQuery.refetch();
      overridesQuery.refetch();
    },
    setManuallyDisabled,
  };
}
