import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ChatChannel = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_dm: boolean;
  is_system: boolean;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  member_count?: number;
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  tenant_id: string;
  author_id: string;
  content: string;
  attachments: any[];
  parent_id: string | null;
  edited_at: string | null;
  created_at: string;
  author_name?: string | null;
  author_avatar?: string | null;
};

export type ChatReaction = {
  message_id: string;
  user_id: string;
  emoji: string;
};

// ─────────────────────────────────────────────
// Canais
// ─────────────────────────────────────────────
export function useChatChannels() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const query = useQuery({
    queryKey: ["chat_channels", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // Lista canais em que o usuário é membro
      if (!profile?.user_id) return [];
      const { data: memberships, error: memErr } = await supabase
        .from("chat_channel_members" as any)
        .select("channel_id")
        .eq("user_id", profile.user_id);
      if (memErr) throw memErr;
      const channelIds = (memberships || []).map((m: any) => m.channel_id);
      if (channelIds.length === 0) return [];
      const { data, error } = await supabase
        .from("chat_channels" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .in("id", channelIds)
        .order("is_dm", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;

      const channels = ((data || []) as any[]) as ChatChannel[];

      // Para DMs: descobre o nome do outro participante
      const dmIds = channels.filter((c) => c.is_dm).map((c) => c.id);
      if (dmIds.length > 0) {
        const { data: dmMembers } = await supabase
          .from("chat_channel_members" as any)
          .select("channel_id, user_id")
          .in("channel_id", dmIds);
        const otherIds = [...new Set(
          (dmMembers || [])
            .filter((m: any) => m.user_id !== profile.user_id)
            .map((m: any) => m.user_id)
        )];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", otherIds);
        const profMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
        // Aniversários em query SEPARADA e best-effort: se a coluna birth_date ainda
        // não existir no banco (migration não aplicada), isto falha isolado sem
        // quebrar os nomes/avatares dos DMs acima.
        const birthMap = new Map<string, string | null>();
        try {
          const { data: bds } = await supabase
            .from("profiles" as any)
            .select("user_id, birth_date")
            .in("user_id", otherIds);
          for (const b of (bds || []) as any[]) birthMap.set(b.user_id, b.birth_date ?? null);
        } catch { /* coluna pode não existir ainda */ }
        const dmOtherMap = new Map<string, any>();
        for (const m of (dmMembers || []) as any[]) {
          if (m.user_id !== profile.user_id) {
            dmOtherMap.set(m.channel_id, profMap.get(m.user_id));
          }
        }
        for (const c of channels) {
          if (c.is_dm) {
            const other = dmOtherMap.get(c.id) as any;
            if (other) {
              (c as any).display_name = other.full_name;
              (c as any).display_avatar = other.avatar_url;
              (c as any).other_user_id = other.user_id;
              (c as any).other_birth_date = birthMap.get(other.user_id) ?? null;
            }
          }
        }
      }
      return channels;
    },
  });

  return query;
}

// ─────────────────────────────────────────────
// Membros do canal
// ─────────────────────────────────────────────
export function useChatChannelMembers(channelId: string | undefined) {
  const { profile } = useAuth();
  const meId = profile?.user_id;
  const query = useQuery({
    queryKey: ["chat_channel_members", channelId, meId],
    enabled: !!channelId,
    queryFn: async () => {
      if (!channelId) return [];
      const { data: members, error } = await supabase
        .from("chat_channel_members" as any)
        .select("*")
        .eq("channel_id", channelId);
      if (error) throw error;
      const userIds = (members || []).map((m: any) => m.user_id);
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      // Posições dos employees pra trazer cargo
      const { data: emps } = await supabase
        .from("employees")
        .select("user_id, employee_positions(position:positions(title))")
        .in("user_id", userIds);
      const positionMap = new Map<string, string>();
      for (const e of (emps || []) as any[]) {
        const title = e.employee_positions?.[0]?.position?.title;
        if (title) positionMap.set(e.user_id, title);
      }
      return (members || [])
        .filter((m: any) => m.user_id !== meId) // esconde o próprio usuário (modo "ghost admin")
        .map((m: any) => {
          const p = profileMap.get(m.user_id) as any;
          return {
            ...m,
            full_name: p?.full_name ?? "Usuário",
            avatar_url: p?.avatar_url ?? null,
            position_title: positionMap.get(m.user_id) ?? null,
          };
        });
    },
  });
  return query;
}

// ─────────────────────────────────────────────
// Mensagens (com realtime)
// ─────────────────────────────────────────────
const PAGE_SIZE = 50;

export function useChatMessages(channelId: string | undefined) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const [limit, setLimit] = useState<number>(PAGE_SIZE);
  // Reseta o limite ao trocar de canal
  useEffect(() => { setLimit(PAGE_SIZE); }, [channelId]);

  const queryKey = ["chat_messages", channelId, limit];

  const query = useQuery({
    queryKey,
    enabled: !!channelId,
    // Fallback de atualização: mesmo que o Realtime do Supabase falhe em
    // produção (publication/RLS), o canal aberto se atualiza sozinho a cada
    // 5s sem precisar de F5. Quando o Realtime funciona, a invalidação abaixo
    // entrega a mensagem instantaneamente; o polling só cobre a lacuna.
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!channelId) return { items: [] as ChatMessage[], hasMore: false };
      // Pega as N mais recentes (DESC), depois reverte para ordem cronológica
      const { data: msgs, error } = await supabase
        .from("chat_messages" as any)
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(limit + 1); // pega 1 a mais para detectar hasMore
      if (error) throw error;
      const raw = (msgs || []) as ChatMessage[];
      const hasMore = raw.length > limit;
      const sliced = hasMore ? raw.slice(0, limit) : raw;
      const list = sliced.reverse(); // ordem cronológica (antiga → nova)
      const authorIds = [...new Set(list.map((m) => m.author_id))];
      if (authorIds.length === 0) return { items: list, hasMore };
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", authorIds);
      const map = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const items = list.map((m) => {
        const p = map.get(m.author_id) as any;
        return { ...m, author_name: p?.full_name ?? null, author_avatar: p?.avatar_url ?? null };
      });
      return { items, hasMore };
    },
  });

  const loadOlder = () => setLimit((l) => l + PAGE_SIZE);

  // Invalida todas as variantes de limit do canal
  const invalidateAll = () => qc.invalidateQueries({ queryKey: ["chat_messages", channelId], exact: false });

  // Realtime: novos messages no canal.
  // Robustez: além de invalidar a cada evento, fazemos um refetch de "catch-up"
  // toda vez que o canal (re)conecta (status SUBSCRIBED) — isso pega mensagens que
  // chegaram durante uma queda de conexão e resolve o "não recebi mesmo com a aba
  // aberta". Se o realtime cair (CHANNEL_ERROR/TIMED_OUT), reinscrevemos após um
  // pequeno atraso em vez de ficar mudo até o próximo polling.
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ch: ReturnType<typeof supabase.channel> | null = null;

    const cleanup = () => {
      if (retry) { clearTimeout(retry); retry = undefined; }
      if (ch) { supabase.removeChannel(ch); ch = null; }
    };

    const connect = () => {
      if (cancelled) return;
      ch = supabase
        .channel(`chat-msgs-${channelId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
          () => invalidateAll(),
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            invalidateAll();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            invalidateAll();
            if (!retry) retry = setTimeout(() => { retry = undefined; cleanup(); connect(); }, 3000);
          }
        });
    };
    connect();

    return () => { cancelled = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, qc]);

  const send = useMutation({
    mutationFn: async ({ content, attachments, parent_id }: { content: string; attachments?: any[]; parent_id?: string | null }) => {
      if (!channelId || !tenantId || !profile?.user_id) throw new Error("Sessão inválida");
      const { data: inserted, error } = await supabase.from("chat_messages" as any).insert({
        channel_id: channelId,
        tenant_id: tenantId,
        author_id: profile.user_id,
        content: content.trim(),
        attachments: attachments || [],
        ...(parent_id ? { parent_id } : {}),
      }).select("id").single();
      if (error) throw error;
      // Dispara push notifications fire-and-forget
      if ((inserted as any)?.id) {
        supabase.functions.invoke("send-chat-notification", {
          body: { message_id: (inserted as any).id },
        }).catch(() => {});
      }
    },
    onSuccess: () => invalidateAll(),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_messages" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  // Compat: expõe `data` como ChatMessage[] (cronológico)
  const items: ChatMessage[] = (query.data as any)?.items ?? [];
  const hasMore: boolean = (query.data as any)?.hasMore ?? false;

  return { ...query, data: items, hasMore, loadOlder, send, remove };
}

// ─────────────────────────────────────────────
// Reações
// ─────────────────────────────────────────────
export function useChatReactions(channelId: string | undefined) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const queryKey = ["chat_reactions", channelId];

  const query = useQuery({
    queryKey,
    enabled: !!channelId,
    queryFn: async () => {
      if (!channelId) return [] as ChatReaction[];
      const { data, error } = await supabase
        .from("chat_reactions" as any)
        .select("*, chat_messages!inner(channel_id)")
        .eq("chat_messages.channel_id", channelId);
      if (error) throw error;
      return (data || []) as ChatReaction[];
    },
  });

  useEffect(() => {
    if (!channelId) return;
    const ch = supabase
      .channel(`chat-reactions-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reactions" },
        () => qc.invalidateQueries({ queryKey })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, qc]);

  const toggle = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!profile?.user_id) throw new Error("Sessão inválida");
      // Regra: 1 reação por usuário por mensagem.
      // Se clicar no mesmo emoji → remove. Se clicar em emoji diferente → troca.
      const { data: existing } = await supabase
        .from("chat_reactions" as any)
        .select("emoji")
        .eq("message_id", messageId)
        .eq("user_id", profile.user_id);
      const had = (existing || []) as { emoji: string }[];
      const hasSame = had.some((r) => r.emoji === emoji);
      // Remove qualquer reação anterior do usuário nessa mensagem
      if (had.length > 0) {
        const { error: delErr } = await supabase
          .from("chat_reactions" as any)
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", profile.user_id);
        if (delErr) throw delErr;
      }
      // Se era a mesma, fica removida; senão, insere a nova
      if (!hasSame) {
        const { error } = await supabase
          .from("chat_reactions" as any)
          .insert({ message_id: messageId, user_id: profile.user_id, emoji });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { ...query, toggle };
}

// ─────────────────────────────────────────────
// Criar canal
// ─────────────────────────────────────────────
export function useCreateChannel() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ name, description, is_dm }: { name: string; description?: string; is_dm?: boolean }) => {
      if (!profile?.tenant_id || !profile?.user_id) throw new Error("Sessão inválida");
      const { data, error } = await supabase
        .from("chat_channels" as any)
        .insert({
          tenant_id: profile.tenant_id,
          name: name.trim().toLowerCase(),
          description: description?.trim() || null,
          is_dm: !!is_dm,
          created_by: profile.user_id,
        })
        .select()
        .single();
      if (error) throw error;
      // Auto-join do criador
      await supabase.from("chat_channel_members" as any).insert({
        channel_id: (data as any).id,
        user_id: profile.user_id,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat_channels"] });
    },
  });
}

// ─────────────────────────────────────────────
// Presença (heartbeat)
// ─────────────────────────────────────────────
export function useChatPresenceHeartbeat() {
  const { profile } = useAuth();
  useEffect(() => {
    if (!profile?.user_id || !profile?.tenant_id) return;
    const ping = async () => {
      await supabase.from("chat_presence" as any).upsert({
        user_id: profile.user_id,
        tenant_id: profile.tenant_id,
        last_seen_at: new Date().toISOString(),
      });
    };
    ping();
    const t = setInterval(ping, 30_000);
    return () => clearInterval(t);
  }, [profile?.user_id, profile?.tenant_id]);
}

export function useChatPresence() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["chat_presence", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_presence" as any)
        .select("*")
        .eq("tenant_id", profile!.tenant_id);
      if (error) throw error;
      const now = Date.now();
      // Retorna Map com info completa: {online, lastSeenAt}
      return new Map(
        (data || []).map((p: any) => [
          p.user_id,
          {
            online: now - new Date(p.last_seen_at).getTime() < 60_000,
            lastSeenAt: p.last_seen_at as string | null,
          },
        ])
      );
    },
  });
}

// Helper para formatar última hora online (estilo WhatsApp)
export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "ainda não acessou";
  const d = new Date(lastSeenAt);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const isSameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (sec < 60) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (isSameDay) return `hoje às ${hh}:${mm}`;
  if (isYesterday) return `ontem às ${hh}:${mm}`;
  if (day < 7) {
    const dias = ["dom","seg","ter","qua","qui","sex","sáb"];
    return `${dias[d.getDay()]} às ${hh}:${mm}`;
  }
  return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")} às ${hh}:${mm}`;
}

// Horário do preview de conversa (estilo WhatsApp): hoje → HH:mm, ontem → "Ontem", < 7 dias → dia da semana, antigo → dd/MM
export function formatChatPreviewTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  if (d.toDateString() === now.toDateString()) return `${hh}:${mm}`;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) {
    const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    return dias[d.getDay()];
  }
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

// Rótulo do separador de dia no thread: "Hoje" / "Ontem" / "" (vazio = usar formato dd MMM padrão)
export function formatChatDayLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoje";
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return "";
}

// Atualizar canal (nome / descrição / avatar)
export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; description?: string | null; avatar_url?: string | null }) => {
      const { id, ...patch } = input;
      const { error } = await supabase
        .from("chat_channels" as any)
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat_channels"] }),
  });
}

// Apagar canal (apenas o criador, conforme RLS)
export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_channels" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat_channels"] }),
  });
}

// Upload de avatar para canal
export async function uploadChannelAvatar(channelId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${channelId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("chat-avatars").upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from("chat-avatars").getPublicUrl(path);
  return data.publicUrl;
}

// Editar mensagem (autor)
export function useUpdateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from("chat_messages" as any)
        .update({ content: content.trim(), edited_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat_messages"] }),
  });
}

// Marca canal como lido (atualiza last_read_at)
export function useMarkRead() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (channelId: string) => {
      if (!profile?.user_id) return;
      const { error } = await supabase
        .from("chat_channel_members" as any)
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("user_id", profile.user_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat_unread"] }),
  });
}

// Contagem de não lidas por canal
export function useChatUnread() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["chat_unread", profile?.user_id],
    enabled: !!profile?.user_id,
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!profile?.user_id) return new Map<string, number>();
      const { data: memberships } = await supabase
        .from("chat_channel_members" as any)
        .select("channel_id, last_read_at")
        .eq("user_id", profile.user_id);
      const map = new Map<string, number>();
      for (const m of (memberships || []) as any[]) {
        const { count } = await supabase
          .from("chat_messages" as any)
          .select("id", { count: "exact", head: true })
          .eq("channel_id", m.channel_id)
          .neq("author_id", profile.user_id)
          .gt("created_at", m.last_read_at || "1970-01-01");
        map.set(m.channel_id, count || 0);
      }
      return map;
    },
  });
}

// Última msg de cada canal (preview)
export function useChatLastMessages(channelIds: string[]) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const queryKey = ["chat_last_messages", channelIds.sort().join(",")];

  // Realtime: ao inserir/editar/apagar mensagem em qualquer canal do usuário,
  // invalida o cache pra que o card no sidebar atualize sem refresh.
  useEffect(() => {
    if (!profile?.tenant_id || channelIds.length === 0) return;
    const ch = supabase
      .channel(`chat-last-msgs-${profile.tenant_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `tenant_id=eq.${profile.tenant_id}` },
        () => qc.invalidateQueries({ queryKey: ["chat_last_messages"] })
      )
      // Refetch de catch-up ao (re)conectar: mantém os previews da sidebar em dia
      // após uma queda de realtime, sem esperar o polling de 30s.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") qc.invalidateQueries({ queryKey: ["chat_last_messages"] });
      });
    return () => { supabase.removeChannel(ch); };
  }, [profile?.tenant_id, channelIds.join(","), qc]);

  return useQuery({
    queryKey,
    enabled: channelIds.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const map = new Map<string, { content: string; created_at: string; author_id: string; author_name: string | null }>();
      const authorIds = new Set<string>();
      for (const id of channelIds) {
        const { data } = await supabase
          .from("chat_messages" as any)
          .select("content, created_at, author_id")
          .eq("channel_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          map.set(id, { ...(data as any), author_name: null });
          authorIds.add((data as any).author_id);
        }
      }
      // Hidrata nomes
      if (authorIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", [...authorIds]);
        const pmap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
        for (const [k, v] of map) {
          map.set(k, { ...v, author_name: pmap.get(v.author_id) ?? null });
        }
      }
      return map;
    },
  });
}

// ─── Status de leitura por canal (para indicador "visto" na sidebar) ───
// Retorna Map<channelId, ISO string | null> com o MAIOR last_read_at entre os
// OUTROS membros do canal (exclui o próprio usuário). Em DMs, esse valor é o
// "visto" da outra pessoa: se >= created_at da minha última msg, ela já leu.
export function useChatOthersReads(channelIds: string[]) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const meId = profile?.user_id;
  const queryKey = ["chat_others_reads", channelIds.slice().sort().join(",")];

  // Realtime: quando alguém atualiza last_read_at (lê um canal), revalida.
  useEffect(() => {
    if (!profile?.tenant_id || channelIds.length === 0) return;
    const ch = supabase
      .channel(`chat-others-reads-${profile.tenant_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_channel_members" },
        () => qc.invalidateQueries({ queryKey: ["chat_others_reads"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.tenant_id, channelIds.join(","), qc]);

  return useQuery({
    queryKey,
    enabled: channelIds.length > 0 && !!meId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const map = new Map<string, string | null>();
      if (!meId) return map;
      const { data } = await supabase
        .from("chat_channel_members" as any)
        .select("channel_id, user_id, last_read_at")
        .in("channel_id", channelIds)
        .neq("user_id", meId);
      for (const row of (data || []) as any[]) {
        const cur = map.get(row.channel_id) ?? null;
        const t = row.last_read_at as string | null;
        if (t && (!cur || new Date(t) > new Date(cur))) {
          map.set(row.channel_id, t);
        } else if (!map.has(row.channel_id)) {
          map.set(row.channel_id, cur);
        }
      }
      return map;
    },
  });
}

// Upload de anexo
/**
 * Comprime/redimensiona imagens >1MB ou >2000px usando canvas
 * (mantém WebP quando suportado, JPEG como fallback).
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  if (file.size < 800 * 1024) return file; // <800KB: deixa passar
  const MAX_DIM = 2000;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);
  // Tenta WebP; se browser não suportar, cai pra JPEG
  const tryType = "image/webp";
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, tryType, 0.82));
  const finalBlob = blob || (await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82)));
  if (!finalBlob || finalBlob.size >= file.size) {
    URL.revokeObjectURL(img.src);
    return file;
  }
  const ext = finalBlob.type === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  URL.revokeObjectURL(img.src);
  return new File([finalBlob], `${baseName}.${ext}`, { type: finalBlob.type });
}

// Blocklist mantida em sincronia com a migration 20260610120000_chat_attachments_allow_all.sql
// Política: liberar TODOS os tipos de arquivo, exceto os que executam script no
// navegador — o bucket chat-attachments é PÚBLICO, então svg+xml e text/html
// abertos direto pela URL seriam vetor de XSS (motivo original da remoção do SVG).
const CHAT_ATTACHMENT_MIME_BLOCKLIST = new Set<string>([
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
]);
const CHAT_ATTACHMENT_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

function sanitizeAttachmentName(name: string): string {
  // Remove diretórios e caracteres de controle, limita comprimento
  const stripped = (name.split(/[\\/]/).pop() || "arquivo").replace(/[\u0000-\u001F\u007F]/g, "");
  const trimmed = stripped.trim() || "arquivo";
  if (trimmed.length <= 120) return trimmed;
  // Preserva extensão se houver
  const dot = trimmed.lastIndexOf(".");
  if (dot > 0 && trimmed.length - dot <= 10) {
    return trimmed.slice(0, 120 - (trimmed.length - dot)) + trimmed.slice(dot);
  }
  return trimmed.slice(0, 120);
}

export async function uploadChatAttachment(channelId: string, file: File): Promise<{ url: string; path: string; name: string; size: number; type: string }> {
  // Validação de tamanho ANTES da compressão (evita descomprimir um arquivo
  // gigante só pra rejeitar — embora a compressão possa reduzir, exigir aqui
  // dá feedback imediato e protege contra arquivos não-imagem grandes).
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error(`Arquivo muito grande. Limite: ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB`);
  }
  // Validação de MIME contra blocklist (libera tudo, exceto vetores de XSS)
  if (CHAT_ATTACHMENT_MIME_BLOCKLIST.has(file.type)) {
    throw new Error(`Tipo de arquivo não permitido por segurança${file.type ? ` (${file.type})` : ""}`);
  }
  const compressed = await compressImage(file).catch(() => file);
  // Re-checa após compressão (compressImage só reduz, nunca aumenta — defensivo)
  if (compressed.size > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error(`Arquivo muito grande mesmo após compressão. Limite: ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB`);
  }
  const safeName = sanitizeAttachmentName(compressed.name);
  const ext = (safeName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${channelId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("chat-attachments")
    .upload(path, compressed, { contentType: compressed.type, upsert: false });
  if (upErr) {
    // Mensagens mais úteis para os erros mais comuns
    const msg = upErr.message || "";
    if (/exceeded.*size|file.*too.*large|payload/i.test(msg)) {
      throw new Error(`Arquivo excede o limite do servidor (500 MB)`);
    }
    if (/mime.*type|not.*allowed/i.test(msg)) {
      throw new Error(`Tipo de arquivo bloqueado pelo servidor`);
    }
    throw upErr;
  }
  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return { url: data.publicUrl, path, name: safeName, size: compressed.size, type: compressed.type };
}

// Preferência de som de notificação (por dispositivo, via localStorage).
// Regra do produto: TODOS começam com o som ligado — só "0" desliga.
const CHAT_SOUND_KEY = "chat-sound-enabled";
export function isChatSoundEnabled(): boolean {
  try { return localStorage.getItem(CHAT_SOUND_KEY) !== "0"; } catch { return true; }
}
export function setChatSoundEnabled(on: boolean): void {
  try { localStorage.setItem(CHAT_SOUND_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}

// Verdadeiro quando a data de nascimento (YYYY-MM-DD) cai HOJE (compara mês+dia,
// ignora o ano). Usado no card do DM na sidebar pra mostrar "🎉 Aniversário hoje".
export function isBirthdayToday(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false;
  const parts = String(birthDate).slice(0, 10).split("-");
  if (parts.length < 3) return false;
  const now = new Date();
  return Number(parts[1]) === now.getMonth() + 1 && Number(parts[2]) === now.getDate();
}

// Notificações sonoras + toast de novas msgs em qualquer canal do usuário
let _notifAudioCtx: AudioContext | null = null;
function playNotifSound() {
  if (!isChatSoundEnabled()) return;
  try {
    if (!_notifAudioCtx) _notifAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = _notifAudioCtx!;
    const now = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.frequency.setValueAtTime(880, now);
    o1.frequency.exponentialRampToValueAtTime(660, now + 0.18);
    g1.gain.setValueAtTime(0.0001, now);
    g1.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    o1.connect(g1).connect(ctx.destination);
    o1.start(now);
    o1.stop(now + 0.35);
  } catch { /* silencioso */ }
}

export function useChatNotifications(
  activeChannelId: string | null | undefined,
  mutedSet?: Set<string>,
) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  // Ref para ler o conjunto de canais silenciados sem re-subscrever o realtime a cada refetch
  const mutedRef = useRef<Set<string> | undefined>(mutedSet);
  mutedRef.current = mutedSet;
  useEffect(() => {
    if (!profile?.user_id || !profile.tenant_id) return;
    const ch = supabase
      .channel(`chat-notif-${profile.user_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `tenant_id=eq.${profile.tenant_id}` },
        async (payload) => {
          const m: any = payload.new;
          if (!m || m.author_id === profile.user_id) return;
          // Verifica se sou membro do canal
          const { data: mem } = await supabase
            .from("chat_channel_members" as any)
            .select("channel_id")
            .eq("user_id", profile.user_id)
            .eq("channel_id", m.channel_id)
            .maybeSingle();
          if (!mem) return;
          // Não toca som se o canal está silenciado
          if (mutedRef.current?.has(m.channel_id)) return;
          // Toca som somente se o canal não está aberto
          if (m.channel_id !== activeChannelId) {
            playNotifSound();
            qc.invalidateQueries({ queryKey: ["chat_unread"] });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.user_id, profile?.tenant_id, activeChannelId, qc]);
}

// ─── Pinned messages ───
export function usePinnedMessages(channelId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["chat_pinned", channelId];
  const query = useQuery({
    queryKey,
    enabled: !!channelId,
    queryFn: async () => {
      if (!channelId) return [];
      const { data } = await supabase
        .from("chat_pinned_messages" as any)
        .select("*, chat_messages(*)")
        .eq("channel_id", channelId)
        .order("pinned_at", { ascending: false });
      return data || [];
    },
  });
  useEffect(() => {
    if (!channelId) return;
    const ch = supabase.channel(`chat-pin-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_pinned_messages", filter: `channel_id=eq.${channelId}` },
        () => qc.invalidateQueries({ queryKey }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, qc]);
  const pin = useMutation({
    mutationFn: async ({ messageId, channelId }: { messageId: string; channelId: string }) => {
      const { error } = await supabase.from("chat_pinned_messages" as any).insert({
        message_id: messageId, channel_id: channelId,
        pinned_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const unpin = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.from("chat_pinned_messages" as any).delete().eq("message_id", messageId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  return { ...query, pin, unpin };
}

// ─── Mutes ───
export function useMutedChannels() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const queryKey = ["chat_mutes", profile?.user_id];
  const query = useQuery({
    queryKey,
    enabled: !!profile?.user_id,
    refetchInterval: 60_000, // Re-checa expiração a cada minuto
    queryFn: async () => {
      if (!profile?.user_id) return new Set<string>();
      const { data, error } = await supabase
        .from("chat_channel_mutes" as any)
        .select("channel_id, expires_at")
        .eq("user_id", profile.user_id);
      if (error) throw error;
      const now = Date.now();
      const active = (data || []).filter((m: any) => {
        if (!m.expires_at) return true; // mute permanente
        return new Date(m.expires_at).getTime() > now;
      });
      return new Set(active.map((m: any) => m.channel_id));
    },
  });
  const toggleMute = useMutation({
    mutationFn: async ({
      channelId,
      mute,
      durationHours,
    }: { channelId: string; mute: boolean; durationHours?: number | null }) => {
      if (!profile?.user_id) throw new Error("Sessão inválida");
      if (mute) {
        const expiresAt = durationHours
          ? new Date(Date.now() + durationHours * 3600 * 1000).toISOString()
          : null;
        const { error } = await supabase
          .from("chat_channel_mutes" as any)
          .upsert(
            { channel_id: channelId, user_id: profile.user_id, expires_at: expiresAt },
            { onConflict: "channel_id,user_id" },
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("chat_channel_mutes" as any)
          .delete()
          .eq("channel_id", channelId)
          .eq("user_id", profile.user_id);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey });
      if (vars.mute) {
        const lbl = vars.durationHours
          ? vars.durationHours === 1
            ? "1 hora"
            : vars.durationHours === 8
              ? "8 horas"
              : vars.durationHours === 24
                ? "24 horas"
                : `${vars.durationHours}h`
          : "para sempre";
        toast.success(`Conversa silenciada por ${lbl}`);
      } else {
        toast.success("Conversa não está mais silenciada");
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || "Falha ao alterar silenciamento");
    },
  });
  return { ...query, toggleMute };
}

// ─── Starred messages ───
export function useStarredMessages() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const queryKey = ["chat_starred", profile?.user_id];
  const query = useQuery({
    queryKey,
    enabled: !!profile?.user_id,
    queryFn: async () => {
      if (!profile?.user_id) return new Set<string>();
      const { data } = await supabase
        .from("chat_starred_messages" as any)
        .select("message_id")
        .eq("user_id", profile.user_id);
      return new Set((data || []).map((m: any) => m.message_id));
    },
  });
  const toggleStar = useMutation({
    mutationFn: async ({ messageId, star }: { messageId: string; star: boolean }) => {
      if (!profile?.user_id) return;
      if (star) {
        await supabase.from("chat_starred_messages" as any).insert({ message_id: messageId, user_id: profile.user_id });
      } else {
        await supabase.from("chat_starred_messages" as any).delete().eq("message_id", messageId).eq("user_id", profile.user_id);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  return { ...query, toggleStar };
}

// ─── Typing indicator (Realtime broadcast) ───
export type TypingAction = "typing" | "uploading_image" | "uploading_video" | "uploading_audio" | "uploading_file" | "recording_audio";
export interface TypingState { name: string; action: TypingAction }

export function useTypingIndicator(channelId: string | undefined) {
  const { profile } = useAuth();
  const [typers, setTypers] = useState<Map<string, TypingState>>(new Map());
  const channelRef = useRef<any>(null);
  const lastBroadcast = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!channelId) return;
    const ch = supabase.channel(`typing-${channelId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, (payload: any) => {
      const { user_id, full_name, action } = payload.payload || {};
      if (!user_id || user_id === profile?.user_id) return;
      const state: TypingState = { name: full_name || "Alguém", action: (action as TypingAction) || "typing" };
      setTypers((prev) => {
        const next = new Map(prev);
        next.set(user_id, state);
        return next;
      });
      // remove após 3s sem novo broadcast
      setTimeout(() => {
        setTypers((prev) => {
          const next = new Map(prev);
          // só remove se ainda for o mesmo state (caso outro broadcast tenha chegado)
          if (next.get(user_id)?.action === state.action) next.delete(user_id);
          return next;
        });
      }, 3000);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, [channelId, profile?.user_id]);

  const sendTyping = (fullName: string, action: TypingAction = "typing") => {
    const now = Date.now();
    const last = lastBroadcast.current[action] || 0;
    if (now - last < 1500) return; // throttle por ação
    lastBroadcast.current[action] = now;
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: profile?.user_id, full_name: fullName, action },
    });
  };

  return { typers: [...typers.values()], sendTyping };
}

// ─── Read receipts: lista de membros + last_read_at, hidratada com profile ───
export type MemberRead = {
  user_id: string;
  last_read_at: string | null;
  full_name: string | null;
  avatar_url: string | null;
};
export function useReadReceipts(channelId: string | undefined) {
  return useQuery({
    queryKey: ["chat_reads", channelId],
    enabled: !!channelId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<MemberRead[]> => {
      if (!channelId) return [];
      const { data: members } = await supabase
        .from("chat_channel_members" as any)
        .select("user_id, last_read_at")
        .eq("channel_id", channelId);
      const list = (members || []) as any[];
      const ids = list.map((m) => m.user_id);
      if (ids.length === 0) return [];
      // Exclui usuários de teste (employees.is_test = true) de read receipts
      const { data: testEmps } = await supabase
        .from("employees")
        .select("user_id")
        .in("user_id", ids)
        .eq("is_test", true);
      const testIds = new Set((testEmps || []).map((e: any) => e.user_id));
      const filteredList = list.filter((m) => !testIds.has(m.user_id));
      const filteredIds = filteredList.map((m) => m.user_id);
      if (filteredIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", filteredIds);
      const pmap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return filteredList.map((m) => {
        const p = pmap.get(m.user_id) as any;
        return {
          user_id: m.user_id,
          last_read_at: m.last_read_at,
          full_name: p?.full_name ?? null,
          avatar_url: p?.avatar_url ?? null,
        };
      });
    },
  });
}

// ─── Chamadas (Huddles, áudio-first estilo WhatsApp) ───
export function useActiveHuddle(channelId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["chat_huddle", channelId];
  const query = useQuery({
    queryKey,
    enabled: !!channelId,
    queryFn: async () => {
      if (!channelId) return null;
      const { data } = await supabase
        .from("chat_huddles" as any)
        .select("*")
        .eq("channel_id", channelId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });
  useEffect(() => {
    if (!channelId) return;
    const ch = supabase.channel(`huddle-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_huddles", filter: `channel_id=eq.${channelId}` },
        () => qc.invalidateQueries({ queryKey }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, qc]);
  return query;
}

export function useStartHuddle() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (channelId: string) => {
      if (!profile?.user_id || !profile.tenant_id) throw new Error("Sessão");
      const roomName = `huddle_${channelId.slice(0, 8)}_${Date.now()}`;
      const { data, error } = await supabase.from("chat_huddles" as any).insert({
        channel_id: channelId,
        tenant_id: profile.tenant_id,
        room_name: roomName,
        started_by: profile.user_id,
      }).select().single();
      if (error) throw error;
      // Posta msg sistema no canal
      await supabase.from("chat_messages" as any).insert({
        channel_id: channelId,
        tenant_id: profile.tenant_id,
        author_id: profile.user_id,
        content: "📞 Iniciou uma chamada",
        attachments: [{ type: "huddle", huddle_id: (data as any).id, room_name: roomName }],
      });
      return data;
    },
    onSuccess: (_, channelId) => {
      qc.invalidateQueries({ queryKey: ["chat_huddle", channelId] });
      qc.invalidateQueries({ queryKey: ["chat_messages", channelId] });
    },
  });
}

export function useEndHuddle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (huddleId: string) => {
      const { error } = await supabase
        .from("chat_huddles" as any)
        .update({ ended_at: new Date().toISOString() })
        .eq("id", huddleId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat_huddle"] }),
  });
}

// ─── Encaminhar mensagem ───
export function useForwardMessage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ targetChannelId, sourceMessage }: { targetChannelId: string; sourceMessage: ChatMessage }) => {
      if (!profile?.user_id || !profile.tenant_id) throw new Error("Sessão");
      const prefix = `↪︎ Encaminhada de ${sourceMessage.author_name || "alguém"}\n`;
      const { error } = await supabase.from("chat_messages" as any).insert({
        channel_id: targetChannelId,
        tenant_id: profile.tenant_id,
        author_id: profile.user_id,
        content: prefix + sourceMessage.content,
        attachments: sourceMessage.attachments || [],
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chat_messages", vars.targetChannelId] });
    },
  });
}

// ─── Mensagens com paginação ───
export function useChatMessagesPaginated(channelId: string | undefined) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const PAGE = 50;

  const queryKey = ["chat_messages_page", channelId];
  const [oldestLoaded, setOldestLoaded] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useQuery({
    queryKey,
    enabled: !!channelId,
    queryFn: async () => {
      if (!channelId) return [];
      const { data: msgs, error } = await supabase
        .from("chat_messages" as any)
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (error) throw error;
      const list = ((msgs || []) as ChatMessage[]).reverse();
      setHasMore((msgs?.length || 0) === PAGE);
      if (list.length > 0) setOldestLoaded(list[0].created_at);
      const authorIds = [...new Set(list.map((m) => m.author_id))];
      if (authorIds.length === 0) return list;
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, full_name, avatar_url").in("user_id", authorIds);
      const pmap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return list.map((m) => {
        const p = pmap.get(m.author_id) as any;
        return { ...m, author_name: p?.full_name ?? null, author_avatar: p?.avatar_url ?? null };
      });
    },
  });

  const loadMore = async () => {
    if (!channelId || !oldestLoaded || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data: msgs } = await supabase
        .from("chat_messages" as any)
        .select("*")
        .eq("channel_id", channelId)
        .lt("created_at", oldestLoaded)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      const more = ((msgs || []) as ChatMessage[]).reverse();
      if (more.length === 0) { setHasMore(false); return; }
      setHasMore(more.length === PAGE);
      setOldestLoaded(more[0].created_at);
      const authorIds = [...new Set(more.map((m) => m.author_id))];
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, full_name, avatar_url").in("user_id", authorIds);
      const pmap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const hydrated = more.map((m) => {
        const p = pmap.get(m.author_id) as any;
        return { ...m, author_name: p?.full_name ?? null, author_avatar: p?.avatar_url ?? null };
      });
      qc.setQueryData<ChatMessage[]>(queryKey, (old) => [...hydrated, ...(old || [])]);
    } finally { setLoadingMore(false); }
  };

  // Realtime: novas msgs chegando
  useEffect(() => {
    if (!channelId) return;
    const ch = supabase.channel(`msgs-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        () => qc.invalidateQueries({ queryKey }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, qc]);

  const send = useMutation({
    mutationFn: async ({ content, attachments, parent_id }: { content: string; attachments?: any[]; parent_id?: string }) => {
      if (!channelId || !tenantId || !profile?.user_id) throw new Error("Sessão inválida");
      const { data: inserted, error } = await supabase.from("chat_messages" as any).insert({
        channel_id: channelId, tenant_id: tenantId, author_id: profile.user_id,
        content: content.trim(), attachments: attachments || [], parent_id,
      }).select("id").single();
      if (error) throw error;
      if ((inserted as any)?.id) {
        supabase.functions.invoke("send-chat-notification", {
          body: { message_id: (inserted as any).id },
        }).catch(() => {});
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_messages" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { ...query, send, remove, loadMore, hasMore, loadingMore };
}

// ─── Favoritos do usuário em canais ───
export function useChatFavorites() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["chat_user_favorites", profile?.user_id];

  const query = useQuery({
    queryKey,
    enabled: !!profile?.user_id,
    queryFn: async (): Promise<Set<string>> => {
      if (!profile?.user_id) return new Set();
      const { data, error } = await supabase
        .from("chat_user_favorites" as any)
        .select("channel_id")
        .eq("user_id", profile.user_id);
      if (error) throw error;
      return new Set((data || []).map((r: any) => r.channel_id));
    },
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async ({ channelId, favorite }: { channelId: string; favorite: boolean }) => {
      if (!profile?.user_id) throw new Error("Sessão inválida");
      if (favorite) {
        const { error } = await supabase
          .from("chat_user_favorites" as any)
          .insert({ user_id: profile.user_id, channel_id: channelId });
        if (error && !/duplicate|conflict/i.test(error.message)) throw error;
      } else {
        const { error } = await supabase
          .from("chat_user_favorites" as any)
          .delete()
          .eq("user_id", profile.user_id)
          .eq("channel_id", channelId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { favorites: query.data ?? new Set<string>(), toggleFavorite: toggle };
}

// ─── Busca global de mensagens em todos os canais do usuário ───
export interface GlobalSearchHit {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_is_dm: boolean | null;
  channel_avatar_url: string | null;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  content: string;
  created_at: string;
}

export function useChatGlobalSearch(query: string) {
  const { profile } = useAuth();
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["chat_global_search", profile?.user_id, profile?.tenant_id, trimmed],
    enabled: !!profile?.user_id && !!profile?.tenant_id && trimmed.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<GlobalSearchHit[]> => {
      if (!profile?.user_id || !profile?.tenant_id) return [];
      // 1) IDs dos canais em que o usuário é membro
      const { data: mem } = await supabase
        .from("chat_channel_members" as any)
        .select("channel_id")
        .eq("user_id", profile.user_id);
      const channelIds = (mem || []).map((m: any) => m.channel_id);
      if (channelIds.length === 0) return [];
      // 2) Busca em chat_messages restrita aos canais do usuário e ao tenant
      const escaped = trimmed.replace(/[%_]/g, (c) => `\\${c}`);
      const { data: msgs, error } = await supabase
        .from("chat_messages" as any)
        .select("id, channel_id, author_id, content, created_at")
        .eq("tenant_id", profile.tenant_id)
        .in("channel_id", channelIds)
        .ilike("content", `%${escaped}%`)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const messages = (msgs || []) as any[];
      if (messages.length === 0) return [];
      // 3) Hidrata canais e autores em batch
      const uniqueChannelIds = Array.from(new Set(messages.map((m) => m.channel_id)));
      const uniqueAuthorIds = Array.from(new Set(messages.map((m) => m.author_id)));
      const [{ data: channels }, { data: profiles }] = await Promise.all([
        supabase
          .from("chat_channels" as any)
          .select("id, name, is_dm, avatar_url")
          .in("id", uniqueChannelIds),
        supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", uniqueAuthorIds),
      ]);
      const chMap = new Map((channels || []).map((c: any) => [c.id, c]));
      const profMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return messages.map((m) => {
        const ch = chMap.get(m.channel_id) as any;
        const pf = profMap.get(m.author_id) as any;
        return {
          id: m.id,
          channel_id: m.channel_id,
          channel_name: ch?.name ?? null,
          channel_is_dm: ch?.is_dm ?? null,
          channel_avatar_url: ch?.avatar_url ?? null,
          author_id: m.author_id,
          author_name: pf?.full_name ?? null,
          author_avatar: pf?.avatar_url ?? null,
          content: m.content,
          created_at: m.created_at,
        } as GlobalSearchHit;
      });
    },
  });
}

// ─── Enquetes ───
export function useChatPolls(channelId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["chat_polls", channelId];

  const polls = useQuery({
    queryKey,
    enabled: !!channelId,
    queryFn: async () => {
      if (!channelId) return [];
      const { data: ps } = await supabase
        .from("chat_polls" as any)
        .select("*")
        .eq("channel_id", channelId);
      const ids = (ps || []).map((p: any) => p.id);
      if (ids.length === 0) return ps || [];
      const { data: vs } = await supabase
        .from("chat_poll_votes" as any)
        .select("*")
        .in("poll_id", ids);
      return (ps || []).map((p: any) => ({
        ...p,
        votes: (vs || []).filter((v: any) => v.poll_id === p.id),
      }));
    },
  });

  useEffect(() => {
    if (!channelId) return;
    const ch = supabase
      .channel(`chat-polls-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_poll_votes" }, () =>
        qc.invalidateQueries({ queryKey })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, qc]);

  const vote = useMutation({
    mutationFn: async ({ poll_id, option_idx }: { poll_id: string; option_idx: number }) => {
      const { data: existing } = await supabase
        .from("chat_poll_votes" as any)
        .select("*")
        .eq("poll_id", poll_id);
      const me = (await supabase.auth.getUser()).data.user?.id;
      const mine = (existing || []).find((v: any) => v.user_id === me && v.option_idx === option_idx);
      if (mine) {
        await supabase.from("chat_poll_votes" as any).delete().eq("poll_id", poll_id).eq("user_id", me).eq("option_idx", option_idx);
      } else {
        // Para multi=false (único), remove voto anterior
        await supabase.from("chat_poll_votes" as any).delete().eq("poll_id", poll_id).eq("user_id", me);
        await supabase.from("chat_poll_votes" as any).insert({ poll_id, user_id: me, option_idx });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { ...polls, vote };
}

export function useCreatePoll() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: { channel_id: string; question: string; options: string[] }) => {
      if (!profile?.user_id || !profile.tenant_id) throw new Error("Sessão inválida");
      // Cria a mensagem que carrega a enquete
      const { data: msg, error: mErr } = await supabase
        .from("chat_messages" as any)
        .insert({
          channel_id: input.channel_id,
          tenant_id: profile.tenant_id,
          author_id: profile.user_id,
          content: `📊 ${input.question}`,
        })
        .select()
        .single();
      if (mErr) throw mErr;
      const { error: pErr } = await supabase.from("chat_polls" as any).insert({
        message_id: (msg as any).id,
        channel_id: input.channel_id,
        tenant_id: profile.tenant_id,
        created_by: profile.user_id,
        question: input.question,
        options: input.options,
      });
      if (pErr) throw pErr;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chat_messages", vars.channel_id] });
      qc.invalidateQueries({ queryKey: ["chat_polls", vars.channel_id] });
    },
  });
}

// Adicionar/remover membros em canal
export function useAddChannelMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ channel_id, user_id }: { channel_id: string; user_id: string }) => {
      const { error } = await supabase
        .from("chat_channel_members" as any)
        .insert({ channel_id, user_id });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chat_channel_members", vars.channel_id] });
      qc.invalidateQueries({ queryKey: ["chat_channels"] });
    },
  });
}

export function useRemoveChannelMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ channel_id, user_id }: { channel_id: string; user_id: string }) => {
      const { error } = await supabase
        .from("chat_channel_members" as any)
        .delete()
        .eq("channel_id", channel_id)
        .eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chat_channel_members", vars.channel_id] });
      qc.invalidateQueries({ queryKey: ["chat_channels"] });
    },
  });
}

// Helpers para achar/criar DM entre 2 users
export async function findOrCreateDM(meId: string, otherId: string, tenantId: string) {
  // Procura DM existente
  const { data: myDms } = await supabase
    .from("chat_channel_members" as any)
    .select("channel_id")
    .eq("user_id", meId);
  const myChannelIds = (myDms || []).map((m: any) => m.channel_id);
  if (myChannelIds.length > 0) {
    const { data: shared } = await supabase
      .from("chat_channel_members" as any)
      .select("channel_id, chat_channels!inner(is_dm)")
      .eq("user_id", otherId)
      .in("channel_id", myChannelIds);
    const dm = (shared || []).find((s: any) => s.chat_channels?.is_dm);
    if (dm) return dm.channel_id as string;
  }
  // Cria nova DM
  const { data: newCh, error } = await supabase
    .from("chat_channels" as any)
    .insert({
      tenant_id: tenantId,
      name: `dm_${meId}_${otherId}`,
      is_dm: true,
      created_by: meId,
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("chat_channel_members" as any).insert([
    { channel_id: (newCh as any).id, user_id: meId },
    { channel_id: (newCh as any).id, user_id: otherId },
  ]);
  return (newCh as any).id as string;
}
