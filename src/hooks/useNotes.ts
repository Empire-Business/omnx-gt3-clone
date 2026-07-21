import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Note {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  body_md: string;
  tags: string[];
  color: string | null;
  pinned: boolean;
  archived: boolean;
  attachments: any[];
  created_at: string;
  updated_at: string;
}

export type NoteUpsertInput = Partial<Omit<Note, "id" | "user_id" | "tenant_id" | "created_at" | "updated_at">>;

export function useNotes(opts: { archived?: boolean; search?: string; tag?: string | null } = {}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["notes", profile?.user_id, opts.archived ?? false, opts.search ?? "", opts.tag ?? ""];

  const query = useQuery({
    queryKey,
    enabled: !!profile?.user_id && !!profile?.tenant_id,
    queryFn: async (): Promise<Note[]> => {
      if (!profile?.user_id) return [];
      let q = supabase
        .from("notes" as any)
        .select("*")
        .eq("user_id", profile.user_id)
        .eq("archived", opts.archived ?? false)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(200);
      if (opts.search && opts.search.trim()) {
        // Defesa em profundidade contra PostgREST filter injection no .or():
        // 1) remove caracteres com significado sintático no parser de filtros
        //    (vírgula separa condições, parênteses agrupam, '*' é curinga, etc.)
        // 2) escapa curingas do LIKE (% e _)
        // 3) limita o tamanho para evitar abuso/DoS
        // Mesmo sem isso o dado é protegido por .eq(user_id) + RLS, mas não
        // interpolamos input cru em string de filtro.
        const sanitized = opts.search
          .replace(/[(),*:\\]/g, " ")
          .slice(0, 100);
        const escaped = sanitized.replace(/[%_]/g, (c) => `\\${c}`);
        q = q.or(`title.ilike.%${escaped}%,body_md.ilike.%${escaped}%`);
      }
      if (opts.tag) {
        q = q.contains("tags", [opts.tag]);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as Note[];
    },
    staleTime: 5_000,
  });

  // Realtime
  useEffect(() => {
    if (!profile?.user_id) return;
    const ch = supabase
      .channel(`notes-${profile.user_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notes", filter: `user_id=eq.${profile.user_id}` },
        () => qc.invalidateQueries({ queryKey: ["notes", profile.user_id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.user_id, qc]);

  const create = useMutation({
    mutationFn: async (input: NoteUpsertInput): Promise<Note> => {
      if (!profile?.user_id || !profile?.tenant_id) throw new Error("Sessão inválida");
      const payload = {
        user_id: profile.user_id,
        tenant_id: profile.tenant_id,
        title: input.title ?? "",
        body_md: input.body_md ?? "",
        tags: input.tags ?? [],
        color: input.color ?? null,
        pinned: input.pinned ?? false,
        archived: input.archived ?? false,
        attachments: input.attachments ?? [],
      };
      const { data, error } = await supabase
        .from("notes" as any)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Note;
    },
    // Optimistic: insere a nova nota no topo da lista imediatamente,
    // antes do round-trip ao servidor (UX mais responsiva).
    onMutate: async (input) => {
      if (!profile?.user_id || !profile?.tenant_id) return;
      await qc.cancelQueries({ queryKey: ["notes", profile.user_id] });
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const tempNote: Note = {
        id: tempId,
        user_id: profile.user_id,
        tenant_id: profile.tenant_id,
        title: input.title ?? "",
        body_md: input.body_md ?? "",
        tags: input.tags ?? [],
        color: input.color ?? null,
        pinned: input.pinned ?? false,
        archived: input.archived ?? false,
        attachments: input.attachments ?? [],
        created_at: now,
        updated_at: now,
      };
      const previous = qc.getQueriesData<Note[]>({ queryKey: ["notes", profile.user_id] });
      qc.setQueriesData<Note[]>({ queryKey: ["notes", profile.user_id] }, (old) =>
        old ? [tempNote, ...old] : [tempNote]
      );
      return { previous, tempId };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) {
        for (const [key, val] of ctx.previous) qc.setQueryData(key, val);
      }
    },
    onSuccess: (created, _vars, ctx: any) => {
      // Substitui o tempNote pelo dado real (sem refetch desnecessário)
      if (ctx?.tempId) {
        qc.setQueriesData<Note[]>({ queryKey: ["notes", profile?.user_id] }, (old) =>
          old ? old.map((n) => (n.id === ctx.tempId ? created : n)) : old
        );
      }
      qc.invalidateQueries({ queryKey: ["notes", profile?.user_id] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: NoteUpsertInput & { id: string }): Promise<Note> => {
      const { data, error } = await supabase
        .from("notes" as any)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Note;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", profile?.user_id] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", profile?.user_id] }),
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from("notes" as any)
        .update({ pinned })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", profile?.user_id] }),
  });

  const toggleArchive = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("notes" as any)
        .update({ archived })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", profile?.user_id] }),
  });

  return { ...query, create, update, remove, togglePin, toggleArchive };
}

// Extrai tags `#xxx` do corpo da nota
export function extractTagsFromBody(body: string): string[] {
  const matches = body.match(/(?:^|\s)#([a-zA-Z0-9_\-áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]+)/g) || [];
  const tags = matches
    .map((m) => m.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(tags));
}
