import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

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
  return useQuery({
    queryKey: ["meeting", id],
    enabled: !!id,
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
        .single();
      if (error) throw error;
      return data as Meeting;
    },
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

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
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Reunião criada com sucesso");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao criar reunião");
    },
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: MeetingUpdateInput }) => {
      const { data, error } = await supabase
        .from("meetings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
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

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["meeting", id] });
      toast.success("Reunião removida");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao remover reunião");
    },
  });
}

export function useProcessTranscript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ meeting_id, transcript }: { meeting_id: string; transcript?: string }) => {
      const { data, error } = await supabase.functions.invoke("meeting-ai", {
        body: { meeting_id, transcript },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["meeting", vars.meeting_id] });
      toast.success("Transcrição processada pela IA");
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
      queryClient.invalidateQueries({ queryKey: ["meetings", tenantId] });
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

      if (aiError) throw aiError;

      return meeting as Meeting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
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
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
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
      const { data: projectMembers, error: pmError } = await supabase
        .from("employee_projects")
        .select(`
          employee_id,
          role_in_project,
          employee:employees(
            id,
            profiles(full_name, avatar_url)
          )
        `)
        .in("employee_id", projectMemberIds);

      if (pmError) throw pmError;

      // Create attendees from project members
      const attendeesToInsert = (projectMembers || []).map(pm => ({
        meeting_id: meetingId,
        employee_id: pm.employee_id,
        name: ((pm.employee as any)?.profiles?.full_name) || 'Unknown',
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
