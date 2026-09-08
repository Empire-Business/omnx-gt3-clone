/**
 * SmartNotificationToaster — toasts globais com animação de "sucção" para o ícone destino.
 *
 * Dispara quando:
 *   - Tarefa é atribuída ao usuário e ele NÃO está em /tarefas
 *   - Chat message recebida em canal do qual ele é membro e ele NÃO está em /chat
 *
 * Som curto + slide-in da direita; ao dismiss/auto-dismiss, animação encolhendo
 * em direção ao ícone alvo (data-notification-target="bell" ou "chat").
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, MessageSquare, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useMutedChannels } from "@/hooks/useChat";
import { useNotificationMutes } from "@/hooks/useNotifications";
import { playNotificationSound } from "@/lib/notification-sound";

type NotifKind = "task" | "chat";

interface SmartNotif {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  href: string;
  createdAt: number;
}

export function SmartNotificationToaster() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [toasts, setToasts] = useState<SmartNotif[]>([]);
  const myEmployeeIdRef = useRef<string | null>(null);

  // Silenciamento: por conversa (chat_channel_mutes) e por tipo
  // (notification_mutes). Guardados em ref para que o realtime não seja
  // re-subscrito a cada refetch dessas queries.
  const { data: mutedChannels } = useMutedChannels();
  const { isMuted } = useNotificationMutes();
  const mutedChannelsRef = useRef<Set<string> | undefined>(mutedChannels);
  mutedChannelsRef.current = mutedChannels;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const onTarefasPage = location.pathname.startsWith("/tarefas");
  const onChatPage = location.pathname.startsWith("/chat");

  const push = useCallback((n: Omit<SmartNotif, "id" | "createdAt">) => {
    const full: SmartNotif = { ...n, id: crypto.randomUUID(), createdAt: Date.now() };
    setToasts((prev) => [...prev.slice(-2), full]); // máx 3
    void playNotificationSound(n.kind);
    // Auto-dismiss
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== full.id));
    }, 6500);
  }, []);

  // Resolve employee_id do usuário (necessário p/ task_assignees)
  useEffect(() => {
    if (!user?.id) {
      myEmployeeIdRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) myEmployeeIdRef.current = data?.id ?? null;
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Realtime: novas atribuições de tarefa
  useEffect(() => {
    if (!user?.id || !profile?.tenant_id) return;
    const ch = supabase
      .channel(`smart-notif-tasks-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_assignees" },
        async (payload: any) => {
          if (onTarefasPage) return;
          if (isMutedRef.current("task")) return;
          const empId = myEmployeeIdRef.current;
          if (!empId || payload.new?.employee_id !== empId) return;
          const taskId = payload.new?.task_id;
          if (!taskId) return;
          const { data: task } = await supabase
            .from("tasks")
            .select("title, due_date")
            .eq("id", taskId)
            .maybeSingle();
          if (!task) return;
          const dueLabel = task.due_date
            ? ` · prazo ${new Date(task.due_date).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}`
            : "";
          push({
            kind: "task",
            title: "Nova tarefa atribuída",
            body: `${task.title}${dueLabel}`,
            href: "/tarefas",
          });
          // Invalidação restrita ao tenant/usuário atual (CLAUDE.md §3) — antes
          // era ["tasks"] e ["notifications"] puros, que varriam todos os tenants.
          qc.invalidateQueries({ queryKey: ["tasks", profile.tenant_id] });
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, profile?.tenant_id, onTarefasPage, push, qc]);

  // Realtime: novas mensagens de chat
  useEffect(() => {
    if (!user?.id || !profile?.tenant_id) return;
    const ch = supabase
      .channel(`smart-notif-chat-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `tenant_id=eq.${profile.tenant_id}`,
        },
        async (payload: any) => {
          if (onChatPage) return;
          if (payload.new?.author_id === user.id) return;
          const channelId = payload.new?.channel_id;
          if (!channelId) return;
          // Conversa silenciada (grupo ou DM) ou mute global de mensagens →
          // nada de toast nem som. Este era o ponto que continuava apitando
          // mesmo com o grupo silenciado.
          if (mutedChannelsRef.current?.has(channelId)) return;
          if (isMutedRef.current("chat")) return;
          // Confirma que sou membro do canal
          const { data: membership } = await supabase
            .from("chat_channel_members" as any)
            .select("channel_id")
            .eq("channel_id", channelId)
            .eq("user_id", user.id)
            .maybeSingle();
          if (!membership) return;
          // Resolve nome do autor + nome do canal
          const [{ data: channel }, { data: authorProfile }] = await Promise.all([
            supabase.from("chat_channels" as any).select("name, is_dm").eq("id", channelId).maybeSingle(),
            supabase.from("profiles").select("full_name").eq("user_id", payload.new.author_id).maybeSingle(),
          ]);
          const authorName = (authorProfile as any)?.full_name?.split(" ")[0] || "Alguém";
          const channelName = (channel as any)?.name || "";
          const isDm = (channel as any)?.is_dm;
          const title = isDm
            ? `${authorName} enviou uma mensagem`
            : `${authorName} em #${channelName.replace(/^dm_/, "")}`;
          const content = (payload.new.content as string) || "[anexo]";
          push({
            kind: "chat",
            title,
            body: content.slice(0, 140),
            href: `/chat/${channelId}`,
          });
          qc.invalidateQueries({ queryKey: ["chat_unread", user.id] });
          qc.invalidateQueries({ queryKey: ["chat_last_messages"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, profile?.tenant_id, onChatPage, push, qc]);

  // Realtime: alguém reagiu a uma mensagem minha.
  // Escuta `notifications` (e não `chat_reactions`) porque o trigger
  // notify_chat_reaction já resolve autor, mute e nome de quem reagiu.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`smart-notif-reactions-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          if (payload.new?.type !== "chat_reaction") return;
          if (isMutedRef.current("chat")) return;
          push({
            kind: "chat",
            title: payload.new.title,
            body: (payload.new.body as string | null)?.slice(0, 140) || "",
            href: payload.new.link || "/chat",
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, push]);

  const dismiss = (id: string, suckTo?: NotifKind) => {
    if (suckTo) {
      // Marca o toast como "sugando" para animar exit em direção ao alvo
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...({ _sucking: suckTo } as any) } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 380);
      return;
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getTargetCoords = (kind: NotifKind): { x: number; y: number } | null => {
    const target = document.querySelector(`[data-notification-target="${kind === "task" ? "bell" : "chat"}"]`);
    if (!target) return null;
    const rect = (target as HTMLElement).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]">
      <AnimatePresence>
        {toasts.map((t) => {
          const sucking = (t as any)._sucking as NotifKind | undefined;
          const target = sucking ? getTargetCoords(sucking) : null;
          // Anchor inicial: top-right aproximado do toast
          const anchor = { x: window.innerWidth - 180, y: 80 };
          const dx = target ? target.x - anchor.x : 0;
          const dy = target ? target.y - anchor.y : -40;

          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={
                sucking
                  ? { opacity: 0, scale: 0.1, x: dx, y: dy, rotate: 12 }
                  : { opacity: 0, x: 60, scale: 0.96 }
              }
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="pointer-events-auto"
            >
              <button
                type="button"
                onClick={() => {
                  navigate(t.href);
                  dismiss(t.id, t.kind);
                }}
                className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-card border border-border shadow-lg hover:shadow-xl hover:border-primary/40 transition-all backdrop-blur"
              >
                <div
                  className={
                    "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 " +
                    (t.kind === "task"
                      ? "bg-primary/10 text-primary"
                      : "bg-info/10 text-info")
                  }
                >
                  {t.kind === "task" ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : (
                    <MessageSquare className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground leading-tight">{t.title}</p>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismiss(t.id, t.kind);
                      }}
                      className="text-muted-foreground hover:text-foreground p-0.5 -mt-0.5 -mr-0.5 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                    {t.body}
                  </p>
                </div>
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
