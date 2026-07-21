/**
 * ChatQuickPopover — leitura rápida das mensagens recebidas a partir do
 * botão de chat na sidebar. Lista as últimas N mensagens cujo autor não é
 * o usuário atual; click leva ao canal correspondente.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MessageSquare, Inbox, Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChatChannels, useChatUnread, useMutedChannels } from "@/hooks/useChat";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface IncomingMessage {
  id: string;
  channel_id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  author_name?: string;
  author_avatar?: string | null;
}

function useIncomingMessages(channelIds: string[], limit = 20) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["chat_quick_incoming", profile?.user_id, channelIds.join(",")],
    enabled: !!profile?.user_id && channelIds.length > 0,
    refetchInterval: 30_000,
    staleTime: 5_000,
    queryFn: async (): Promise<IncomingMessage[]> => {
      if (!profile?.user_id || channelIds.length === 0) return [];
      const { data: messages, error } = await supabase
        .from("chat_messages" as any)
        .select("id, channel_id, author_id, content, created_at")
        .in("channel_id", channelIds)
        .neq("author_id", profile.user_id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const list = (messages || []) as any[];
      const authorIds = Array.from(new Set(list.map((m) => m.author_id).filter(Boolean)));
      if (authorIds.length === 0) return list as IncomingMessage[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", authorIds);
      const byId = new Map<string, { name: string; avatar: string | null }>();
      (profs || []).forEach((p: any) => {
        byId.set(p.user_id, { name: p.full_name, avatar: p.avatar_url });
      });
      return list.map((m) => ({
        ...m,
        author_name: byId.get(m.author_id)?.name,
        author_avatar: byId.get(m.author_id)?.avatar ?? null,
      }));
    },
  });
}

function ChatList({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const { data: channels = [] } = useChatChannels();
  const { data: unreadMap } = useChatUnread();
  const { data: mutedSet } = useMutedChannels();
  const channelIds = useMemo(
    () => channels.filter((c) => !mutedSet?.has(c.id)).map((c) => c.id),
    [channels, mutedSet],
  );
  const { data: messages = [], isLoading } = useIncomingMessages(channelIds, 20);

  const channelById = useMemo(() => {
    const m = new Map<string, (typeof channels)[number]>();
    channels.forEach((c) => m.set(c.id, c));
    return m;
  }, [channels]);

  const totalUnread = useMemo(() => {
    if (!unreadMap) return 0;
    let sum = 0;
    unreadMap.forEach((count, cid) => {
      if (!mutedSet?.has(cid)) sum += count;
    });
    return sum;
  }, [unreadMap, mutedSet]);

  const open = (channelId: string) => {
    navigate(`/chat/${channelId}`);
    onClose?.();
  };

  return (
    <div className="flex flex-col max-h-[480px]">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Mensagens recebidas</h3>
        </div>
        {totalUnread > 0 && (
          <span className="text-2xs font-semibold bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5">
            {totalUnread} novas
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Inbox className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-sm">Nenhuma mensagem recebida</p>
          </div>
        ) : (
          <ul className="py-1">
            {messages.map((m) => {
              const channel = channelById.get(m.channel_id);
              const isDm = (channel as any)?.is_dm;
              const channelLabel = isDm
                ? ((channel as any)?.display_name || m.author_name || "Conversa")
                : `# ${channel?.name || "canal"}`;
              const channelUnread = unreadMap?.get(m.channel_id) || 0;
              const isUnread = (() => {
                // Considera não-lida se o canal tem unread > 0 e a mensagem é recente
                return channelUnread > 0;
              })();
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => open(m.channel_id)}
                    className={cn(
                      "w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left",
                      isUnread && "bg-primary/[0.04]",
                    )}
                  >
                    <div className="flex-shrink-0">
                      <AvatarBadge name={m.author_name || "?"} avatarUrl={m.author_avatar} size="sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm truncate", isUnread && "font-semibold text-foreground")}>
                          {m.author_name || "Alguém"}
                          <span className="ml-1.5 text-2xs font-normal text-muted-foreground/80">
                            {channelLabel}
                          </span>
                        </span>
                        <span className="text-[11px] tabular-nums text-muted-foreground/80 flex-shrink-0">
                          {format(new Date(m.created_at), "HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {m.content?.slice(0, 100) || "[anexo]"}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          navigate("/chat");
          onClose?.();
        }}
        className="px-4 py-2.5 border-t border-border text-xs font-medium text-primary hover:bg-muted/50 transition-colors text-center"
      >
        Abrir chat completo →
      </button>
    </div>
  );
}

export function ChatQuickPopover({ collapsed }: { collapsed?: boolean }) {
  const { data: unreadMap } = useChatUnread();
  const { data: mutedSet } = useMutedChannels();
  const isMobile = useIsMobile();
  const totalUnread = useMemo(() => {
    if (!unreadMap) return 0;
    let sum = 0;
    unreadMap.forEach((count, cid) => {
      if (!mutedSet?.has(cid)) sum += count;
    });
    return sum;
  }, [unreadMap, mutedSet]);
  const [open, setOpen] = useState(false);

  // Close handler para mobile/desktop
  useEffect(() => {
    if (!open) return;
    // Realtime force re-fetch when popover opens (já há refetchInterval mas é bom)
  }, [open]);

  const trigger = (
    <button
      data-notification-target="chat"
      className="relative p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      aria-label={`Mensagens${totalUnread > 0 ? `: ${totalUnread} não lida${totalUnread !== 1 ? "s" : ""}` : ""}`}
    >
      <MessageSquare className="w-5 h-5" />
      {totalUnread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
          {totalUnread > 9 ? "9+" : totalUnread}
        </span>
      )}
    </button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="p-0 rounded-t-xl max-h-[70vh]">
          <SheetHeader className="sr-only">
            <SheetTitle>Mensagens</SheetTitle>
          </SheetHeader>
          <ChatList onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-96 p-0"
        align={collapsed ? "start" : "end"}
        side={collapsed ? "right" : "top"}
      >
        <ChatList onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
