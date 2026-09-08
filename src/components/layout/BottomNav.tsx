import { Link } from "react-router-dom";
import { useLivePathname } from "@/hooks/useLivePathname";
import { cn } from "@/lib/utils";
import { LayoutDashboard, CheckSquare, MessageSquare, Rss, FolderKanban, PartyPopper } from "lucide-react";
import { useChatUnreadTotal } from "@/hooks/useChat";
import { useFeedUnreadCount } from "@/hooks/useFeed";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar-initials";
import { normalizeSupabaseAssetUrl } from "@/integrations/supabase/config";

type Item = {
  label: string;
  icon?: typeof LayoutDashboard;
  to: string;
  badgeKey?: "chat" | "feed";
  isProfile?: boolean;
};

const items: Item[] = [
  { label: "Início", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Tarefas", icon: CheckSquare, to: "/tarefas" },
  { label: "Chat", icon: MessageSquare, to: "/chat", badgeKey: "chat" },
  { label: "Feed", icon: Rss, to: "/feed", badgeKey: "feed" },
  { label: "Projetos", icon: FolderKanban, to: "/projetos" },
  { label: "Eventos", icon: PartyPopper, to: "/eventos" },
  { label: "Mais", to: "/mais", isProfile: true },
];

export function BottomNav() {
  // Pathname real: dentro de uma conversa a URL muda por replaceState, que o
  // useLocation() nao ve — era por isso que a nav continuava aparecendo por
  // cima do chat.
  const pathname = useLivePathname();
  const chatUnread = useChatUnreadTotal(); // já exclui conversas silenciadas
  // `useFeedUnreadCount()` devolve `{ count, markRead }` — não `{ data }`.
  // A desestruturação antiga lia uma propriedade inexistente, então o badge do
  // Feed no mobile ficava permanentemente zerado (a query pesada por trás dele
  // rodava do mesmo jeito).
  const { count: feedUnread } = useFeedUnreadCount();
  const { user, profile } = useAuth();

  const inChatConversation = /^\/chat\/[^/]+/.test(pathname);
  const inMeetingRoom = /^\/reunioes\/[^/]+/.test(pathname);
  if (inChatConversation || inMeetingRoom) {
    return null;
  }

  const feedCount = feedUnread || 0;

  const getBadge = (key?: "chat" | "feed") => {
    if (key === "chat") return chatUnread;
    if (key === "feed") return feedCount;
    return 0;
  };

  const userName = profile?.full_name ?? user?.email?.split("@")[0] ?? "Usuário";
  const userAvatar = normalizeSupabaseAssetUrl(profile?.avatar_url ?? null);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur-md border-t border-border shadow-[0_-2px_12px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegação principal"
    >
      <ul className="flex items-stretch justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const badge = getBadge(item.badgeKey);
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 py-2 px-0.5 min-h-[56px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <div className="relative">
                  {item.isProfile ? (
                    <Avatar
                      className={cn(
                        "w-6 h-6 ring-2 transition-colors",
                        active ? "ring-primary" : "ring-transparent"
                      )}
                    >
                      {userAvatar && <AvatarImage src={userAvatar} alt={userName} />}
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                        {getInitials(userName)}
                      </AvatarFallback>
                    </Avatar>
                  ) : Icon ? (
                    <Icon className={cn("w-5 h-5", active && "stroke-[2.4]")} />
                  ) : null}
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center leading-none">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
                <span className={cn("text-[10px] font-medium leading-tight", active && "font-semibold")}>
                  {item.label}
                </span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
