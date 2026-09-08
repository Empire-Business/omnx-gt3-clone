import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { edgeFunctionErrorMessage } from "@/lib/edge-function-error";

import type { Tables } from "@/integrations/supabase/types";

export interface MeetingAttendee {
  id: string;
  meeting_id: string;
  employee_id: string | null;
  name: string;
  email: string | null;
  role: 'organizer' | 'required' | 'optional';
  attendance_status: 'pending' | 'confirmed' | 'declined' | 'attended';
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_by: string | null;
  transcript_raw: string | null;
  transcript_final: string | null;
  summary_markdown: string | null;
  action_items: any[];
  key_points: any[];
  attention_points: any[];
  participants: any[];
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  generated_projects: any[];
  generated_tasks: any[];
  soniox_session_id: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
  // New fields
  scheduled_date: string | null;
  scheduled_time: string | null;
  project_id: string | null;
  location: string | null;
  // LiveKit / recording fields
  meeting_mode?: string | null;
  livekit_room_name?: string | null;
  recording_status?: string | null;
  recording_url?: string | null;
  // Joined data
  meeting_attendees?: MeetingAttendee[];
  project?: {
    id: string;
    name: string;
    status: string;
  };
}

export interface MeetingUpdateInput {
  title?: string;
  description?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  project_id?: string | null;
  location?: string | null;
  status?: string;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  transcript_raw?: string | null;
  transcript_final?: string | null;
  meeting_mode?: string | null;
  livekit_room_name?: string | null;
  recording_status?: string | null;
  recording_url?: string | null;
}

export interface AttendeeInput {
  meeting_id: string;
  employee_id?: string | null;
  name: string;
  email?: string | null;
  role?: 'organizer' | 'required' | 'optional';
}

/**
 * Invalida TODAS as listas de reuniões do tenant.
 *
 * ⚠️ Não basta invalidar `["meetings", tenantId]`: o match por prefixo do
 * TanStack compara elemento a elemento, e `useMeetingRecurrence` monta
 * `["meetings", "recurring", tenantId]` — com o discriminador ANTES do tenant.
 * O prefixo `["meetings", tenantId]` nunca alcança essa chave (na 2ª posição
 * `tenantId !== "recurring"`), então a lista de recorrentes ficaria parada.
 *
 * O formato ideal seria `["meetings", tenantId, "recurring"]`, mas a chave é
 * montada dentro de `useMeetingRecurrence.ts` — por isso invalidamos as duas
 * explicitamente aqui, em vez de reordenar.
 */
function invalidateMeetingLists(queryClient: QueryClient, tenantId: string | undefined) {
  queryClient.invalidateQueries({ queryKey: ["meetings", tenantId] });
  queryClient.invalidateQueries({ queryKey: ["meetings", "recurring", tenantId] });
}

export function useMeetingsList() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  return useQuery({
    queryKey: ["meetings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select(`
          *,
          project:projects(id, name, status),
          meeting_attendees(
            id,
            meeting_id,
            employee_id,
            name,
            email,
            role,
            attendance_status,
            created_at,
            updated_at
          )
        `)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Meeting[];
    },
  });
}

export function useMeetingDetail(id: string | undefined, options?: { refetchInterval?: number | false }) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  return useQuery({
    queryKey: ["meeting", id],
    enabled: !!id && !!tenantId,
    refetchInterval: options?.refetchInterval,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select(`
          *,
          project:projects(id, name, status),
          meeting_attendees(
            id,
            meeting_id,
            employee_id,
            name,
            email,
            role,
            attendance_status,
            created_at,
            updated_at
          )
        `)
        .eq("id", id!)
        // CLAUDE.md §2 — RLS é a primeira linha, o filtro explícito é a segunda.
        .eq("tenant_id", tenantId!)
        .single();
      if (error) throw error;
      return data as Meeting;
    },
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async ({
      title,
      description,
      scheduled_date,
      scheduled_time,
      project_id,
      location,
      meeting_mode,
      estimated_duration_minutes,
    }: {
      title: string;
      description?: string;
      scheduled_date?: string;
      scheduled_time?: string;
      project_id?: string;
      location?: string;
      meeting_mode?: "in_person" | "external_link" | "livekit";
      estimated_duration_minutes?: number;
    }) => {
      const mode = meeting_mode ?? "livekit";
      // Reuniões livekit recebem um room name único na criação para que o
      // botão "Entrar" apareça imediatamente no card.
      const roomName =
        mode === "livekit" ? `meet-${crypto.randomUUID().slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}` : null;

      const { data, error } = await supabase
        .from("meetings")
        .insert({
          title,
          description: description || null,
          tenant_id: profile!.tenant_id,
          created_by: profile!.user_id,
          status: "scheduled",
          scheduled_date: scheduled_date || null,
          scheduled_time: scheduled_time || null,
          project_id: project_id || null,
          location: location || null,
          meeting_mode: mode,
          livekit_room_name: roomName,
          estimated_duration_minutes: estimated_duration_minutes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: () => {
      invalidateMeetingLists(queryClient, tenantId);
      toast.success("Reunião criada com sucesso");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao criar reunião");
    },
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: MeetingUpdateInput }) => {
      if (!tenantId) throw new Error("Tenant não identificado");
      const { data, error } = await supabase
        .from("meetings")
        .update(updates)
        .eq("id", id)
        // CLAUDE.md §2 — filtro explícito de tenant além do RLS.
        .eq("tenant_id", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: (data) => {
      invalidateMeetingLists(queryClient, tenantId);
      queryClient.invalidateQueries({ queryKey: ["meeting", data.id] });
      toast.success("Reunião atualizada com sucesso");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar reunião");
    },
  });
}

export interface MeetingAiJob {
  id: string;
  meeting_id: string;
  tenant_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  phase: string;
  progress: number;
  total_chunks: number;
  processed_chunks: number;
  failed_chunks: number;
  error_message: string | null;
  metadata: Record<string, any>;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useMeetingAiJob(meetingId: string | undefined, polling: boolean) {
  return useQuery({
    queryKey: ["meeting-ai-job", meetingId],
    enabled: !!meetingId,
    refetchInterval: polling ? 2000 : false,
    queryFn: async (): Promise<MeetingAiJob | null> => {
      const { data, error } = await (supabase as any)
        .from("meeting_ai_jobs")
        .select("*")
        .eq("meeting_id", meetingId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as MeetingAiJob | null) ?? null;
    },
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Tenant não identificado");
      const { error } = await supabase
        .from("meetings")
        .delete()
        .eq("id", id)
        // CLAUDE.md §2 — filtro explícito de tenant além do RLS.
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      invalidateMeetingLists(queryClient, tenantId);
      queryClient.invalidateQueries({ queryKey: ["meeting", id] });
      // Eventos internos embutem a reunião (`meeting:meetings(...)`). Sem esta
      // invalidação o card do evento continua exibindo a sala apagada — e o
      // botão de entrar faria o `livekit-token` provisionar uma sala nova.
      queryClient.invalidateQueries({ queryKey: ["internal-events", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["internal-event", tenantId] });
      toast.success("Reunião removida");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao remover reunião");
    },
  });
}

export function useProcessTranscript() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async ({ meeting_id, transcript }: { meeting_id: string; transcript?: string }) => {
      const { data, error } = await supabase.functions.invoke("meeting-ai", {
        body: { meeting_id, transcript },
      });
      // O motivo real do 400/404 vive no corpo da resposta, não em `error.message`.
      if (error) throw new Error(await edgeFunctionErrorMessage(error, "Erro ao processar transcrição"));
      return data;
    },
    onSuccess: (data: any, vars) => {
      invalidateMeetingLists(queryClient, tenantId);
      queryClient.invalidateQueries({ queryKey: ["meeting", vars.meeting_id] });
      if (data?.skipped) {
        toast.info("Esta reunião já havia sido processada.");
        return;
      }
      toast.success("Transcrição enviada para a IA — o processamento roda em background.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao processar transcrição");
    },
  });
}

export function useApproveItems() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async (payload: {
      meeting_id: string;
      approved_projects: any[];
      approved_tasks: any[];
    }) => {
      const { data, error } = await supabase.functions.invoke("meeting-approve", {
        body: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      invalidateMeetingLists(queryClient, tenantId);
      queryClient.invalidateQueries({ queryKey: ["meeting", vars.meeting_id] });
      queryClient.invalidateQueries({ queryKey: ["projects", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", tenantId] });
      toast.success("Itens aprovados e criados com sucesso");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao aprovar itens");
    },
  });
}

export function useSonioxTempKey() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("soniox-temp-key");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateMeetingWithTranscript() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async ({ title, transcript }: { title: string; transcript: string }) => {
      // 1. Criar reunião
      const { data: meeting, error } = await supabase
        .from("meetings")
        .insert({
          title,
          tenant_id: profile?.tenant_id,
          created_by: profile?.user_id,
          status: "processing",
          approval_status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Processar com IA
      const { error: aiError } = await supabase.functions.invoke("meeting-ai", {
        body: { meeting_id: meeting.id, transcript },
      });

      if (aiError) {
        throw new Error(await edgeFunctionErrorMessage(aiError, "Erro ao processar transcrição"));
      }

      return meeting as Meeting;
    },
    onSuccess: () => {
      invalidateMeetingLists(queryClient, tenantId);
      toast.success("Transcrição processada com sucesso");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao processar transcrição");
    },
  });
}

// ============ ATTENDEES HOOKS ============

export function useMeetingAttendees(meetingId: string | undefined) {
  return useQuery({
    queryKey: ["meeting-attendees", meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_attendees")
        .select(`
          *
        `)
        .eq("meeting_id", meetingId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as MeetingAttendee[];
    },
  });
}

export function useAddMeetingAttendee() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async (input: AttendeeInput) => {
      const payload = {
        meeting_id: input.meeting_id,
        employee_id: input.employee_id || null,
        name: input.name,
        email: input.email || null,
        role: input.role || 'required',
      };
      // Quando há employee_id, evita duplicatas via upsert idempotente
      if (payload.employee_id) {
        const { data, error } = await supabase
          .from("meeting_attendees")
          .upsert(payload, { onConflict: "meeting_id,employee_id", ignoreDuplicates: false })
          .select()
          .single();
        if (error) throw error;
        return data as MeetingAttendee;
      }
      const { data, error } = await supabase
        .from("meeting_attendees")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as MeetingAttendee;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-attendees", vars.meeting_id] });
      queryClient.invalidateQueries({ queryKey: ["meeting", vars.meeting_id] });
      invalidateMeetingLists(queryClient, tenantId);
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao adicionar participante");
    },
  });
}

export function useUpdateMeetingAttendee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<MeetingAttendee, 'role' | 'attendance_status' | 'name' | 'email'>> }) => {
      const { data, error } = await supabase
        .from("meeting_attendees")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as MeetingAttendee;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-attendees", data.meeting_id] });
      queryClient.invalidateQueries({ queryKey: ["meeting", data.meeting_id] });
    },
  });
}

export function useRemoveMeetingAttendee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, meetingId }: { id: string; meetingId: string }) => {
      const { error } = await supabase
        .from("meeting_attendees")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-attendees", vars.meetingId] });
      queryClient.invalidateQueries({ queryKey: ["meeting", vars.meetingId] });
      toast.success("Participante removido");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao remover participante");
    },
  });
}

export function useImportProjectMembers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ meetingId, projectMemberIds }: { meetingId: string; projectMemberIds: string[] }) => {
      // Get project members with their details
      // ⚠️ Sem embed `employees(profiles(...))`: não existe FK entre
      // `employees` e `profiles`, e o PostgREST rejeitava a consulta com
      // PGRST200 (HTTP 400) — a importação falhava inteira.
      const { data: projectMembers, error: pmError } = await supabase
        .from("employee_projects")
        .select("employee_id, role_in_project, employee:employees(id, user_id)")
        .in("employee_id", projectMemberIds);

      if (pmError) throw pmError;

      const nameByEmployee = await fetchEmployeeNames(
        (projectMembers ?? []).map(
          (pm) => (pm.employee as unknown as { id: string; user_id: string | null } | null)
        )
      );

      // Create attendees from project members
      const attendeesToInsert = (projectMembers || []).map(pm => ({
        meeting_id: meetingId,
        employee_id: pm.employee_id,
        name: nameByEmployee.get(pm.employee_id) || 'Unknown',
        email: null,
        role: 'required' as const,
      }));

      if (attendeesToInsert.length === 0) return [];

      const { error: insertError } = await supabase
        .from("meeting_attendees")
        .insert(attendeesToInsert);

      if (insertError) throw insertError;

      return attendeesToInsert;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-attendees", vars.meetingId] });
      queryClient.invalidateQueries({ queryKey: ["meeting", vars.meetingId] });
      toast.success("Membros do projeto importados");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao importar membros");
    },
  });
}

/* ════════════════════════════════════════════
   PÚBLICO DO EVENTO → PARTICIPANTES DA REUNIÃO
   ════════════════════════════════════════════ */

/**
 * Teto de segurança para eventos de escopo `company`.
 *
 * A policy `meetings_select` só libera a reunião para admin, criador,
 * participante em `meeting_attendees`, membro do projeto ou membro da área.
 * Não existe cláusula "toda a empresa" — então, para um evento `company`, a
 * única forma de tornar a sala visível SEM migration é inserir cada
 * colaborador como participante. Acima deste teto isso deixa de ser barato e
 * a operação é abortada com aviso explícito (nunca em silêncio).
 */
export const COMPANY_ATTENDEE_CAP = 300;

export type MeetingAudienceScope = "company" | "areas" | "custom";

export interface SyncMeetingAttendeesInput {
  meetingId: string;
  scope: MeetingAudienceScope;
  /** ids de `employees` — usado quando `scope === "custom"` */
  employeeIds?: string[];
  /** ids de `company_areas` — usado quando `scope === "areas"` */
  areaIds?: string[];
}

export interface SyncMeetingAttendeesResult {
  /** quantos colaboradores foram enviados para `meeting_attendees` */
  inserted: number;
  /** preenchido quando o público não pôde ser coberto por completo */
  warning?: string;
}

/** Linha de `employee_positions` com a área resolvida pelo embed. */
interface EmployeePositionRow {
  employee_id: string;
  position: { area_id: string | null; subarea: { area_id: string | null } | null } | null;
}

/**
 * Nome de cada colaborador, resolvido em duas consultas.
 *
 * O caminho natural seria o embed `employees(profiles(full_name))`, mas NÃO
 * existe FK entre `employees` e `profiles` no banco (`employees.user_id`
 * aponta para `auth.users`): o PostgREST devolvia PGRST200 (HTTP 400) e a
 * operação inteira falhava. Devolve um mapa `employee_id → nome`.
 */
async function fetchEmployeeNames(
  employees: ({ id: string; user_id: string | null } | null)[]
): Promise<Map<string, string>> {
  const rows = employees.filter(
    (e): e is { id: string; user_id: string | null } => !!e
  );
  const userIds = [...new Set(rows.map((e) => e.user_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", userIds);
  if (error) throw error;

  const byUser = new Map(
    (profiles ?? []).map((p) => [p.user_id, p.full_name?.trim() || ""])
  );
  for (const e of rows) {
    const name = e.user_id ? byUser.get(e.user_id) : "";
    names.set(e.id, name || "Colaborador");
  }
  return names;
}

/**
 * Sincroniza `meeting_attendees` com o público de um evento interno.
 *
 * Sem isso a sala criada pelo painel de eventos fica INVISÍVEL para o público
 * do evento (a policy `meetings_select` não conhece `internal_events`), e o
 * painel mostra "A reunião vinculada não está mais disponível".
 *
 * É idempotente: usa upsert em `(meeting_id, employee_id)`, então vincular a
 * mesma reunião duas vezes não duplica participante.
 */
export function useSyncMeetingAttendees() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useMutation({
    mutationFn: async (input: SyncMeetingAttendeesInput): Promise<SyncMeetingAttendeesResult> => {
      if (!tenantId) throw new Error("Tenant não identificado");

      let employeeIds: string[] = [];
      let warning: string | undefined;

      if (input.scope === "custom") {
        employeeIds = Array.from(new Set(input.employeeIds ?? []));
      } else if (input.scope === "areas") {
        const areaIds = Array.from(new Set(input.areaIds ?? []));
        if (areaIds.length > 0) {
          // O banco NÃO tem `employees.area_id`: o vínculo é
          // `employee_positions → positions → COALESCE(subareas.area_id, positions.area_id)`
          // — mesmo caminho da policy `meetings_select`.
          const { data, error } = await supabase
            .from("employee_positions")
            .select("employee_id, position:positions(area_id, subarea:subareas(area_id))");
          if (error) throw error;
          const rows = (data ?? []) as unknown as EmployeePositionRow[];
          const ids = new Set<string>();
          for (const row of rows) {
            const areaId = row.position?.subarea?.area_id ?? row.position?.area_id ?? null;
            if (areaId && areaIds.includes(areaId)) ids.add(row.employee_id);
          }
          employeeIds = Array.from(ids);
        }
      } else {
        // scope === "company" — ver COMPANY_ATTENDEE_CAP acima.
        const { data, error } = await supabase
          .from("employees")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .limit(COMPANY_ATTENDEE_CAP + 1);
        if (error) throw error;
        const ids = (data ?? []).map((e) => e.id);
        if (ids.length > COMPANY_ATTENDEE_CAP) {
          return {
            inserted: 0,
            warning:
              `A empresa tem mais de ${COMPANY_ATTENDEE_CAP} colaboradores ativos — ` +
              "os participantes não foram adicionados automaticamente. Adicione as " +
              "pessoas na aba Reuniões para que elas enxerguem a sala.",
          };
        }
        employeeIds = ids;
      }

      if (employeeIds.length === 0) {
        return {
          inserted: 0,
          warning:
            "Nenhum colaborador foi encontrado para o público deste evento — " +
            "só o criador e os administradores enxergarão a sala.",
        };
      }

      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("id, user_id")
        .eq("tenant_id", tenantId)
        .in("id", employeeIds);
      if (empError) throw empError;

      const employeeRows = (employees ?? []) as { id: string; user_id: string | null }[];
      const nameByEmployee = await fetchEmployeeNames(employeeRows);

      const rows = employeeRows.map((e) => ({
        meeting_id: input.meetingId,
        employee_id: e.id,
        name: nameByEmployee.get(e.id) || "Colaborador",
        email: null,
        role: "required" as const,
        attendance_status: "pending" as const,
        tenant_id: tenantId,
      }));

      if (rows.length === 0) {
        return {
          inserted: 0,
          warning:
            "Não foi possível ler os colaboradores do público deste evento — " +
            "adicione os participantes manualmente na aba Reuniões.",
        };
      }

      const { error: upsertError } = await supabase
        .from("meeting_attendees")
        .upsert(rows, { onConflict: "meeting_id,employee_id", ignoreDuplicates: true });
      if (upsertError) throw upsertError;

      return { inserted: rows.length, warning };
    },
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-attendees", vars.meetingId] });
      queryClient.invalidateQueries({ queryKey: ["meeting", vars.meetingId] });
      invalidateMeetingLists(queryClient, tenantId);
    },
    // Sem `onError` com toast aqui: quem chama decide como reportar (o painel
    // de eventos precisa diferenciar "reunião criada mas sem público" de
    // "reunião não criada").
  });
}
