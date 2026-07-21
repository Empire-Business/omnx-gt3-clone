import { Bell, Check, CheckCheck, Trash2, ExternalLink } from "lucide-react";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

function NotificationItem({
  notification,
  onRead,
  onDelete,
  onNavigate,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (link: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer hover:bg-muted/50",
        !notification.is_read && "bg-primary/5"
      )}
      onClick={() => {
        if (!notification.is_read) onRead(notification.id);
        if (notification.link) onNavigate(notification.link);
      }}
    >
      <div className={cn(
        "w-2 h-2 rounded-full mt-2 flex-shrink-0",
        notification.is_read ? "bg-transparent" : "bg-primary"
      )} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug", !notification.is_read && "font-medium")}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        <p className="text-2xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
        </p>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {notification.link && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); onNavigate(notification.link!); }}>
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-danger" onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function NotificationsList() {
  const { data: notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();

  const handleNavigate = (link: string) => {
    if (link.startsWith("/")) navigate(link);
    else window.open(link, "_blank");
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Notificações</h3>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => markAllAsRead.mutate()}>
            <CheckCheck className="w-3 h-3" /> Marcar todas como lidas
          </Button>
        )}
      </div>
      <div className="overflow-y-auto max-h-[420px]">
        {(!notifications || notifications.length === 0) ? (
          <div className="py-8 text-center">
            <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={(id) => markAsRead.mutate(id)}
                onDelete={(id) => deleteNotification.mutate(id)}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationsPopover() {
  const { unreadCount } = useNotifications();
  const isMobile = useIsMobile();

  const trigger = (
    <button data-notification-target="bell" className="relative p-2 rounded-xl hover:bg-muted transition-colors" aria-label={`Notificações${unreadCount > 0 ? `: ${unreadCount} não lida${unreadCount !== 1 ? "s" : ""}` : ""}`}>
      <Bell className="w-5 h-5 text-muted-foreground" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="p-0 rounded-t-xl max-h-[70vh]">
          <SheetHeader className="sr-only">
            <SheetTitle>Notificações</SheetTitle>
          </SheetHeader>
          <NotificationsList />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <NotificationsList />
      </PopoverContent>
    </Popover>
  );
}
