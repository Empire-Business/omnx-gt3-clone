import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type FeedVisibilityType = "all" | "specific";

export interface FeedVisibilityTarget {
  type: "employee" | "position" | "area" | "subarea";
  id: string;
  label?: string;
}

export interface FeedAttachment {
  url: string;
  name: string;
  type: "image" | "video" | "audio" | "file";
  mime: string;
  size: number;
}

export interface FeedPost {
  id: string;
  tenant_id: string;
  employee_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  visibility_type: FeedVisibilityType;
  visibility_targets: FeedVisibilityTarget[];
  tags: string[];
  attachments: FeedAttachment[];
  employee?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface FeedReaction {
  id: string;
  feed_post_id: string;
  employee_id: string;
  reaction: string;
}

export interface FeedComment {
  id: string;
  feed_post_id: string;
  employee_id: string;
  content: string;
  created_at: string;
  attachments: FeedAttachment[];
  employee?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

// Busca nome/avatar do colaborador via view (employees não tem full_name/avatar_url direto)
async function fetchEmployeeInfo(empIds: string[]): Promise<Record<string, { id: string; full_name: string | null; avatar_url: string | null }>> {
  if (empIds.length === 0) return {};
  const { data } = await (supabase as any)
    .from("employees_hierarchy_view")
    .select("employee_id, full_name, avatar_url")
    .in("employee_id", empIds);
  const map: Record<string, { id: string; full_name: string | null; avatar_url: string | null }> = {};
  for (const e of (data || []) as any[]) {
    if (!map[e.employee_id]) {
      map[e.employee_id] = { id: e.employee_id, full_name: e.full_name, avatar_url: e.avatar_url };
    }
  }
  return map;
}

// ── POSTS ─────────────────────────────────────────────────────

export function useFeedPosts() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ["feed_posts", tenantId],
    staleTime: 1000 * 60 * 2,
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: posts, error } = await supabase
        .from("feed_posts" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!posts || (posts as any[]).length === 0) return [] as FeedPost[];

      const empIds = [...new Set((posts as any[]).map((p: any) => p.employee_id).filter(Boolean))];
      const empMap = await fetchEmployeeInfo(empIds);

      return (posts as any[]).map((p: any) => ({
        ...p,
        attachments: Array.isArray(p.attachments) ? p.attachments : [],
        employee: empMap[p.employee_id] || null,
      })) as FeedPost[];
    },
  });
}

export interface CreateFeedPostPayload {
  content: string;
  visibility_type: FeedVisibilityType;
  visibility_targets: FeedVisibilityTarget[];
  tags: string[];
  attachments: FeedAttachment[];
}

export function useCreateFeedPost() {
  const { profile, user } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateFeedPostPayload) => {
      if (!profile?.tenant_id || !user?.id) throw new Error("Não autenticado");
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle();
      if (!emp) throw new Error("Colaborador não encontrado");
      const { error } = await supabase
        .from("feed_posts" as any)
        .insert({
          tenant_id: profile.tenant_id,
          employee_id: emp.id,
          content: payload.content,
          visibility_type: payload.visibility_type,
          visibility_targets: payload.visibility_targets,
          tags: payload.tags,
          attachments: payload.attachments,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed_posts", tenantId] }),
  });
}

export function useDeleteFeedPost() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("feed_posts" as any).delete().eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed_posts", tenantId] }),
  });
}

// ── REAÇÕES ───────────────────────────────────────────────────

export function useFeedReactions(postId: string) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["feed_reactions", postId],
    staleTime: 1000 * 30,
    enabled: !!postId && !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feed_reactions" as any)
        .select("*")
        .eq("tenant_id", profile!.tenant_id)
        .eq("feed_post_id", postId);
      if (error) throw error;
      return (data || []) as unknown as FeedReaction[];
    },
  });
}

export function useToggleFeedReaction() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, reaction, currentReactions }: { postId: string; reaction: string; currentReactions: FeedReaction[] }) => {
      if (!profile?.tenant_id || !user?.id) throw new Error("Não autenticado");
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle();
      if (!emp) return;
      const existing = currentReactions.find((r) => r.employee_id === emp.id && r.reaction === reaction);
      if (existing) {
        await supabase.from("feed_reactions" as any).delete().eq("id", existing.id);
      } else {
        await supabase.from("feed_reactions" as any).insert({
          tenant_id: profile.tenant_id,
          feed_post_id: postId,
          employee_id: emp.id,
          reaction,
        });
      }
    },
    onSuccess: (_, { postId }) => qc.invalidateQueries({ queryKey: ["feed_reactions", postId] }),
  });
}

// ── COMENTÁRIOS ───────────────────────────────────────────────

export function useFeedComments(postId: string) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["feed_comments", postId],
    staleTime: 1000 * 30,
    enabled: !!postId && !!profile?.tenant_id,
    queryFn: async () => {
      const { data: comments, error } = await supabase
        .from("feed_comments" as any)
        .select("*")
        .eq("tenant_id", profile!.tenant_id)
        .eq("feed_post_id", postId)
        .order("created_at");
      if (error) throw error;
      if (!comments || (comments as any[]).length === 0) return [] as FeedComment[];

      const empIds = [...new Set((comments as any[]).map((c: any) => c.employee_id).filter(Boolean))];
      const empMap = await fetchEmployeeInfo(empIds);

      return (comments as any[]).map((c: any) => ({
        ...c,
        attachments: Array.isArray(c.attachments) ? c.attachments : [],
        employee: empMap[c.employee_id] || null,
      })) as FeedComment[];
    },
  });
}

export interface AddFeedCommentPayload {
  postId: string;
  content: string;
  attachments?: FeedAttachment[];
}

export function useAddFeedComment() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, content, attachments = [] }: AddFeedCommentPayload) => {
      if (!profile?.tenant_id || !user?.id) throw new Error("Não autenticado");
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle();
      if (!emp) throw new Error("Colaborador não encontrado");
      const { error } = await supabase.from("feed_comments" as any).insert({
        tenant_id: profile.tenant_id,
        feed_post_id: postId,
        employee_id: emp.id,
        content,
        attachments,
      });
      if (error) throw error;
    },
    onSuccess: (_, { postId }) => qc.invalidateQueries({ queryKey: ["feed_comments", postId] }),
  });
}

export function useDeleteFeedComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: string; postId: string }) => {
      const { error } = await supabase.from("feed_comments" as any).delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: (_, { postId }) => qc.invalidateQueries({ queryKey: ["feed_comments", postId] }),
  });
}

// ── CONTAGEM DE NÃO LIDOS ─────────────────────────────────────

// Estado de leitura do feed em BD (tabela feed_reads) — persiste entre dispositivos.
// Antes era localStorage, que não sincronizava celular ↔ desktop.
//
// PERF (mesmo erro da v8.35.0, um nível abaixo): este hook chamava `useFeedPosts()`
// só para CONTAR quantos posts são mais novos que o `last_read_at`. Isso baixava os
// 50 posts inteiros — `content`, `attachments` (JSON de anexos), tags — e ainda fazia
// uma segunda requisição em `employees_hierarchy_view` para hidratar nome/avatar dos
// autores. Tudo isso para produzir UM número. E como o `BottomNav` monta este hook,
// no celular isso acontecia em TODA página, a cada montagem/foco.
// Agora a contagem é feita no banco com `head: true` (nenhuma linha trafega, só o
// header `Content-Range`). `useFeedPosts()` continua sendo usado apenas por quem
// realmente renderiza o feed (`Feed.tsx`).
//
// O número exibido é idêntico ao anterior, critério a critério:
// - Visibilidade: `feed_posts` tem RLS (função SECURITY DEFINER — ver docs/FEED.md);
//   nada era filtrado no cliente, então a mesma regra vale para o COUNT.
// - Tenant: mesmo `.eq("tenant_id", ...)` da listagem.
// - Autor: posts do próprio usuário contavam antes e continuam contando.
// - Deletados: `feed_posts` não tem soft delete/arquivamento — delete é físico.
// - `last_read_at` nulo (nunca abriu o feed): sem filtro de data, conta todos.
// - Teto de 50: a listagem era `.limit(50)` ordenada por `created_at DESC`, e os não
//   lidos são justamente os mais recentes — logo o valor antigo era `min(total, 50)`.
//   O `Math.min` abaixo reproduz esse teto.
export function useFeedUnreadCount() {
  const { user, profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const { data: lastReadAt = null } = useQuery({
    queryKey: ["feed_read", user?.id],
    enabled: !!user?.id && !!tenantId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feed_reads" as any)
        .select("last_read_at")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.last_read_at ?? null;
    },
  });

  // Mesmo teto da listagem antiga (`.limit(50)`).
  const FEED_UNREAD_CAP = 50;

  const { data: rawCount = 0 } = useQuery({
    queryKey: ["feed_unread_count", tenantId, lastReadAt],
    staleTime: 1000 * 60,
    enabled: !!tenantId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("feed_posts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      if (lastReadAt) q = q.gt("created_at", lastReadAt as string);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const count = useMemo(
    () => Math.min(rawCount as number, FEED_UNREAD_CAP),
    [rawCount],
  );

  const markRead = useCallback(async () => {
    if (!user?.id || !tenantId) return;
    const now = new Date().toISOString();
    await supabase.from("feed_reads" as any).upsert(
      { user_id: user.id, tenant_id: tenantId, last_read_at: now },
      { onConflict: "user_id,tenant_id" },
    );
    // Atualiza imediatamente o cache (sidebar + página Feed compartilham a queryKey).
    qc.setQueryData(["feed_read", user.id], now);
  }, [user?.id, tenantId, qc]);

  return { count, markRead };
}
