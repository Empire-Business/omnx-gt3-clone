/**
 * Resolução do público de um evento interno.
 *
 * O banco NÃO tem `employees.area_id`: o vínculo colaborador → área é
 * `employee_positions → positions → COALESCE(subareas.area_id, positions.area_id)`
 * — o mesmo caminho usado pela policy `meetings_select` e por
 * `useSyncMeetingAttendees`. Este módulo centraliza esse caminho para que a
 * publicação do evento (aviso no Feed + notificações) e a sincronização de
 * participantes da reunião não divirjam.
 */
import { supabase } from "@/integrations/supabase/client";

export type EventAudienceScope = "company" | "areas" | "custom";

/** Uma pessoa do público, com o `user_id` necessário para notificar. */
export interface AudienceMember {
  employee_id: string;
  user_id: string | null;
}

export interface ResolveAudienceInput {
  tenantId: string;
  scope: EventAudienceScope;
  /** ids de `company_areas` — usado quando `scope === "areas"` */
  areaIds?: string[];
  /** ids de `employees` — usado quando `scope === "custom"` */
  employeeIds?: string[];
}

/** Linha de `employee_positions` com a área resolvida pelo embed. */
interface EmployeePositionRow {
  employee_id: string;
  position: { area_id: string | null; subarea: { area_id: string | null } | null } | null;
}

/**
 * Devolve os colaboradores ATIVOS alcançados pelo evento.
 *
 * Colaboradores sem `user_id` voltam na lista (contam como público) mas não
 * podem receber notificação — quem chama decide o que fazer com eles.
 */
export async function resolveEventAudience(
  input: ResolveAudienceInput
): Promise<AudienceMember[]> {
  const { tenantId, scope } = input;

  // Sempre partimos dos colaboradores ativos do tenant: é esse conjunto que
  // define quem "existe" para receber aviso, em qualquer escopo.
  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, user_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  if (error) throw error;

  const active = (employees ?? []).map((e) => ({
    employee_id: e.id as string,
    user_id: (e.user_id as string | null) ?? null,
  }));

  if (scope === "company") return active;

  if (scope === "custom") {
    const wanted = new Set(input.employeeIds ?? []);
    return active.filter((m) => wanted.has(m.employee_id));
  }

  // scope === "areas"
  const areaIds = Array.from(new Set(input.areaIds ?? []));
  if (areaIds.length === 0) return [];

  const { data: positions, error: posError } = await supabase
    .from("employee_positions")
    .select("employee_id, position:positions(area_id, subarea:subareas(area_id))");
  if (posError) throw posError;

  const inArea = new Set<string>();
  for (const row of (positions ?? []) as unknown as EmployeePositionRow[]) {
    const areaId = row.position?.subarea?.area_id ?? row.position?.area_id ?? null;
    if (areaId && areaIds.includes(areaId)) inArea.add(row.employee_id);
  }

  return active.filter((m) => inArea.has(m.employee_id));
}
