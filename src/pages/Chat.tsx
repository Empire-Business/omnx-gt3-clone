import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { notifyPathChange } from "@/hooks/useLivePathname";
import {
  Hash, MessageSquare, Search, Bell, BellOff, Users, MoreHorizontal, FolderKanban, CalendarDays,
  Plus, Send, Bold, Italic, Paperclip, Image as ImageIcon,
  CheckSquare, Sparkles, Trash2, Smile, Video, Check, CheckCheck, Mic,
  Crown, Target, Package, Settings, Megaphone, Bookmark,
  PanelRightOpen, PanelRightClose, X, Star, Link2, Volume2, Clock, FileText, ChevronRight,
  Info, ChevronLeft, ChevronDown, StickyNote, Pin,
  BarChart3, Play, Pause, Captions, Phone as PhoneIcon, Maximize2, Download, Loader2,
  ZoomIn, ZoomOut, MessageSquarePlus,
} from "lucide-react";

// Mapeia nome do canal → ícone + cor + bg quadrado
const CHANNEL_THEME: Record<string, { Icon: typeof Hash; tone: string; bg: string }> = {
  geral:      { Icon: Megaphone, tone: "text-blue-500",    bg: "bg-blue-100 dark:bg-blue-950/40" },
  diretoria:  { Icon: Crown,     tone: "text-amber-500",   bg: "bg-amber-100 dark:bg-amber-950/40" },
  aquisicao:  { Icon: Target,    tone: "text-rose-500",    bg: "bg-rose-100 dark:bg-rose-950/40" },
  operacao:   { Icon: Settings,  tone: "text-violet-500",  bg: "bg-violet-100 dark:bg-violet-950/40" },
  entrega:    { Icon: Package,   tone: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-950/40" },
};
// Margem em px para considerar que o usuário está "no fim" da conversa
const BOTTOM_THRESHOLD_PX = 80;

function getChannelTheme(name: string) {
  return CHANNEL_THEME[name] || { Icon: Bookmark, tone: "text-muted-foreground", bg: "bg-muted" };
}

// Helper para baixar arquivo (preserva nome quando possível)
async function downloadAttachment(url: string, suggestedName?: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = suggestedName || url.split("/").pop() || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } catch (e: any) {
    // Fallback: abre em nova aba
    window.open(url, "_blank");
  }
}

// Imagem com zoom/pan — funciona no desktop (scroll, duplo-clique, arrastar, botões)
// e no mobile (pinça pra ampliar, arrastar pra mover, toque duplo). Usa pointer events,
// que unificam mouse + toque.
function ZoomableImage({ src, alt }: { src: string; alt?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // pointers ativos (pra detectar pinça) e estado de gesto
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastDist = useRef<number | null>(null);
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  const lastTapTime = useRef(0);
  const movedRef = useRef(false);

  const MIN = 1;
  const MAX = 5;

  const clampT = (s: number, x: number, y: number): [number, number] => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return [x, y];
    const maxX = (rect.width * (s - 1)) / 2;
    const maxY = (rect.height * (s - 1)) / 2;
    return [Math.min(maxX, Math.max(-maxX, x)), Math.min(maxY, Math.max(-maxY, y))];
  };

  const commit = (s: number, x: number, y: number) => {
    const ns = Math.min(MAX, Math.max(MIN, s));
    if (ns <= MIN) {
      scaleRef.current = MIN;
      txRef.current = 0;
      tyRef.current = 0;
    } else {
      const [cx, cy] = clampT(ns, x, y);
      scaleRef.current = ns;
      txRef.current = cx;
      tyRef.current = cy;
    }
    rerender();
  };

  // Zoom mantendo o ponto focal (cursor/pinça) fixo na tela
  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fx = clientX - rect.left - rect.width / 2;
    const fy = clientY - rect.top - rect.height / 2;
    const prev = scaleRef.current;
    const ns = Math.min(MAX, Math.max(MIN, prev * factor));
    const ratio = ns / prev;
    const nx = fx - (fx - txRef.current) * ratio;
    const ny = fy - (fy - tyRef.current) * ratio;
    commit(ns, nx, ny);
  };

  const toggleZoom = (clientX: number, clientY: number) => {
    if (scaleRef.current > MIN) commit(MIN, 0, 0);
    else zoomAt(2.5, clientX, clientY);
  };

  // Wheel via listener nativo (não-passivo) pra poder chamar preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedRef.current = false;
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      lastDist.current = dist(p1, p2);
    } else if (pointers.current.size === 1) {
      lastPan.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      const d = dist(p1, p2);
      const m = mid(p1, p2);
      if (lastDist.current) {
        zoomAt(d / lastDist.current, m.x, m.y);
        movedRef.current = true;
      }
      lastDist.current = d;
    } else if (pointers.current.size === 1 && scaleRef.current > MIN && lastPan.current) {
      const dx = e.clientX - lastPan.current.x;
      const dy = e.clientY - lastPan.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
      commit(scaleRef.current, txRef.current + dx, tyRef.current + dy);
      lastPan.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) lastDist.current = null;
    if (pointers.current.size === 0) lastPan.current = null;
    // toque duplo (mobile) → alterna zoom
    if (wasSingle && !movedRef.current) {
      const now = e.timeStamp;
      if (now - lastTapTime.current < 300) {
        toggleZoom(e.clientX, e.clientY);
        lastTapTime.current = 0;
      } else {
        lastTapTime.current = now;
      }
    }
  };

  const zoomed = scaleRef.current > MIN;

  return (
    <div
      ref={containerRef}
      className="relative w-[90vw] h-[85vh] flex items-center justify-center overflow-hidden select-none"
      style={{ touchAction: "none", cursor: zoomed ? "grab" : "zoom-in" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => toggleZoom(e.clientX, e.clientY)}
    >
      <img
        src={src}
        alt={alt || ""}
        draggable={false}
        className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain will-change-transform"
        style={{
          transform: `translate(${txRef.current}px, ${tyRef.current}px) scale(${scaleRef.current})`,
          transition: pointers.current.size ? "none" : "transform 0.12s ease-out",
        }}
      />
      {/* Controles de zoom */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-2 py-1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => zoomAt(1 / 1.4, window.innerWidth / 2, window.innerHeight / 2)}
          className="w-9 h-9 rounded-full hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-40"
          disabled={!zoomed}
          title="Diminuir zoom"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => commit(MIN, 0, 0)}
          className="px-2 text-2xs text-white/90 tabular-nums min-w-[3ch]"
          title="Redefinir zoom"
        >
          {Math.round(scaleRef.current * 100)}%
        </button>
        <button
          onClick={() => zoomAt(1.4, window.innerWidth / 2, window.innerHeight / 2)}
          className="w-9 h-9 rounded-full hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-40"
          disabled={scaleRef.current >= MAX}
          title="Aumentar zoom"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Chips de filtro da lista de conversas (topo da sidebar), no lugar das antigas
// seções colapsáveis. A ordem é a do WhatsApp; "Canais" é nosso — é o que
// substitui a seção fixa que existia antes, sem esconder nada do usuário.
const CHAT_FILTERS = [
  { key: "all", label: "Tudo" },
  { key: "unread", label: "Não lidas" },
  { key: "favorites", label: "Favoritos" },
  { key: "groups", label: "Grupos" },
  { key: "channels", label: "Canais" },
] as const;
type ChatFilter = (typeof CHAT_FILTERS)[number]["key"];

// ─── Linha da lista de conversas ───
// Estrutura do WhatsApp: avatar à esquerda, nome + horário na primeira linha,
// prévia + status (silenciado / fixado / não lidas) na segunda. Sem linha
// divisória entre os itens: o que separa uma conversa da outra é o espaço e o
// realce de hover/seleção — régua de borda a cada 64px suja a lista inteira,
// ainda mais no tema claro, onde a borda tem contraste alto demais.
function ChatListRow({
  avatar, title, titleClassName, time, preview, unread = 0, muted, pinned,
  selected, onClick, onTogglePin, birthday, onCongratulate,
}: {
  avatar: React.ReactNode;
  title: string;
  titleClassName?: string;
  time?: string;
  preview: React.ReactNode;
  unread?: number;
  muted?: boolean;
  pinned?: boolean;
  selected?: boolean;
  onClick: () => void;
  onTogglePin?: () => void;
  /** Aniversariante do dia: a linha ganha destaque e o atalho de parabéns. */
  birthday?: boolean;
  onCongratulate?: () => void;
}) {
  const hasUnread = unread > 0 && !selected;
  // No aniversário, o pin cede o canto para o botão de parabenizar — dois
  // controles absolutos no mesmo ponto se cobririam.
  const showPin = !!onTogglePin && !birthday;
  return (
    <div className="relative group px-1.5">
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={cn(
          // Conversa aberta usa exatamente o realce do item ativo da AppSidebar
          // (`bg-primary-light` + texto primário): duas listas de navegação
          // dentro do mesmo app não podem marcar "onde estou" de jeitos
          // diferentes.
          "w-full flex items-stretch gap-3 px-2.5 rounded-lg text-left transition-colors duration-100",
          selected
            ? "bg-primary-light"
            : birthday
              // Aniversariante do dia: a linha inteira vira um cartão de festa.
              // É o mesmo âmbar que o chat já usa para "atenção positiva"
              // (mensagem fixada, rascunho), agora como fundo em degradê.
              ? "bg-gradient-to-r from-amber-100/90 to-amber-50/40 dark:from-amber-500/15 dark:to-amber-500/5 ring-1 ring-amber-300/70 dark:ring-amber-500/30 hover:from-amber-100 hover:to-amber-100/60"
              : "hover:bg-sidebar-accent/60 active:bg-sidebar-accent"
        )}
      >
        <div className="flex items-center py-2.5 flex-shrink-0">{avatar}</div>
        <div className="flex-1 min-w-0 py-2.5 flex flex-col justify-center gap-0.5">
          <div className="flex items-center gap-2">
            <span className={cn(
              "flex-1 min-w-0 truncate text-[15px] leading-tight",
              // Selecionado ganha peso, não cor: o fundo já marca onde estamos,
              // e pintar o nome de azul por cima do azul claro derruba o
              // contraste do texto — que é o que precisa ser lido.
              selected || hasUnread ? "font-semibold text-sidebar-foreground" : "font-medium text-sidebar-foreground",
              titleClassName
            )}>
              {title}
            </span>
            {time && (
              <span className={cn(
                "flex-shrink-0 text-[11px] tabular-nums leading-none",
                hasUnread ? "text-primary font-semibold" : "text-muted-foreground"
              )}>
                {time}
              </span>
            )}
          </div>
          <div className={cn(
            "flex items-center gap-2 text-[13px] leading-tight",
            hasUnread ? "text-foreground/80" : "text-muted-foreground"
          )}>
            <span className="flex-1 min-w-0 truncate">{preview}</span>
            <span className={cn(
              "flex-shrink-0 flex items-center gap-1.5",
              // O pin é um botão irmão, posicionado por cima desta linha (para
              // não aninhar <button> dentro de <button>). Aqui só reservamos o
              // espaço dele: sempre que está fixado, e no hover quando ainda não
              // está — senão ele cobriria o badge de não lidas.
              showPin && (pinned ? "pr-6" : "group-hover:pr-6"),
              // O botão "Parabéns" flutua sobre esta linha; reserva fixa.
              birthday && onCongratulate && "pr-[70px]"
            )}>
              {muted && <BellOff className="w-4 h-4 opacity-60" aria-label="Silenciado" />}
              {hasUnread && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center tabular-nums">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
          </div>
        </div>
      </button>
      {birthday && onCongratulate && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCongratulate(); }}
          className="absolute bottom-2.5 right-3 h-6 px-2 rounded-full bg-amber-500 text-white text-[10px] font-semibold shadow-sm hover:bg-amber-600 active:scale-95 transition-all"
          title="Abrir a conversa com a mensagem de parabéns pronta"
        >
          Parabéns
        </button>
      )}
      {showPin && onTogglePin && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={cn(
            "absolute bottom-2.5 right-2 p-1 rounded transition-opacity hover:bg-background/60",
            pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          title={pinned ? "Desafixar" : "Fixar"}
          aria-label={pinned ? "Desafixar conversa" : "Fixar conversa"}
        >
          <Pin className={cn("w-3.5 h-3.5 rotate-45", pinned ? "text-primary fill-primary" : "text-muted-foreground")} />
        </button>
      )}
    </div>
  );
}

// Avatar quadrado para grupos/canais (com bolinha de "grupo" no canto inferior direito)
function ChannelAvatar({ name, size = "md", noGroupIndicator, circle }: { name: string; size?: "sm" | "md" | "lg" | "xl"; noGroupIndicator?: boolean; circle?: boolean }) {
  const { Icon, tone, bg } = getChannelTheme(name);
  // "xl" (48px) existe para a LISTA de conversas, que segue a escala do
  // WhatsApp; "lg" (44px) continua sendo o do header e do painel de detalhes.
  const sz = size === "sm" ? "w-7 h-7" : size === "xl" ? "w-12 h-12" : size === "lg" ? "w-11 h-11" : "w-9 h-9";
  const ic = size === "sm" ? "w-3.5 h-3.5" : size === "xl" ? "w-[22px] h-[22px]" : size === "lg" ? "w-5 h-5" : "w-4 h-4";
  const dot = size === "sm" ? "w-3 h-3 -bottom-0.5 -right-0.5" : size === "xl" || size === "lg" ? "w-4 h-4 -bottom-1 -right-1" : "w-3.5 h-3.5 -bottom-0.5 -right-0.5";
  const dotIc = size === "sm" ? "w-2 h-2" : size === "xl" || size === "lg" ? "w-2.5 h-2.5" : "w-2 h-2";
  return (
    <div className="relative flex-shrink-0">
      <div className={cn("flex items-center justify-center", circle ? "rounded-full" : "rounded-md", sz, bg)}>
        <Icon className={cn(ic, tone)} />
      </div>
      {!noGroupIndicator && (
        <span className={cn("absolute rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground", dot)}>
          <Users className={dotIc} />
        </span>
      )}
    </div>
  );
}

// Avatar quadrado pra grupos custom (com indicador)
function GroupAvatar({ avatarUrl, size = "sm" }: { avatarUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-7 h-7" : size === "lg" ? "w-11 h-11" : "w-9 h-9";
  const px = size === "sm" ? 28 : size === "lg" ? 44 : 36;
  const dot = size === "sm" ? "w-3 h-3 -bottom-0.5 -right-0.5" : "w-3.5 h-3.5 -bottom-1 -right-1";
  const dotIc = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  // Pede versão 2x via Supabase image transformation
  const finalSrc = avatarUrl
    ? (() => {
        const rendered = avatarUrl.replace("/storage/v1/object/", "/storage/v1/render/image/");
        if (rendered === avatarUrl) return avatarUrl;
        return `${rendered}${rendered.includes("?") ? "&" : "?"}width=${px * 2}&height=${px * 2}&resize=cover&quality=85`;
      })()
    : null;
  return (
    <div className="relative flex-shrink-0">
      {finalSrc ? (
        <img
          src={finalSrc}
          alt=""
          width={px}
          height={px}
          loading="eager"
          decoding="async"
          className={cn("rounded-md object-cover", sz)}
        />
      ) : (
        <div className={cn("rounded-md bg-primary/10 text-primary flex items-center justify-center", sz)}>
          <Users className="w-3.5 h-3.5" />
        </div>
      )}
      <span className={cn("absolute rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground", dot)}>
        <Users className={dotIc} />
      </span>
    </div>
  );
}
import {
  useChatChannels, useChatMessages, useChatChannelMembers,
  useChatReactions, useCreateChannel, useChatPresenceHeartbeat, useChatPresence,
  useAddChannelMember, useRemoveChannelMember, useUpdateChannel, useDeleteChannel,
  useUpdateMessage, useMarkRead, useChatUnread, useChatLastMessages, useChatOthersReads,
  useChatPolls, useCreatePoll, useChatNotifications, useChatGlobalSearch, useChatFavorites,
  usePinnedMessages, useMutedChannels, useStarredMessages, formatChatPreviewTime, formatChatDayLabel,
  useTypingIndicator, useTenantTyping, useForwardMessage, useReadReceipts,
  useActiveHuddle, useStartHuddle, useEndHuddle,
  uploadChannelAvatar, uploadChatAttachment, findOrCreateDM, formatLastSeen, isBirthdayToday,
  type MemberRead,
  type ChatMessage,
} from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useEmployees } from "@/hooks/useEmployees";
import { useTasks } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/hooks/useProjects";
import { useMeetingsList, useCreateMeeting } from "@/hooks/useMeetings";
import { usePermissions } from "@/hooks/usePermissions";
import { useIntegrations } from "@/hooks/useIntegrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AvatarBadge } from "@/components/shared/SharedComponents";
import { AssigneeMultiSelect } from "@/components/shared/AssigneeMultiSelect";
import { VoiceTaskRecorder } from "@/components/tasks/VoiceTaskRecorder";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ReactionIcon, REACTIONS, getReactionLabel } from "@/components/shared/ReactionIcon";
import { CamiAvatar } from "@/components/shared/CamiAvatar";
import { CamiPanel } from "@/components/cami/CamiPanel";
import { ClaraConversation } from "@/components/cami/ClaraConversation";
import type { CamiContext } from "@/hooks/useCami";
import { NotesView } from "@/components/notes/NotesView";
import { useNotes } from "@/hooks/useNotes";
import { lazy as Rlazy, Suspense as RSuspense } from "react";
const EmojiPicker = Rlazy(() =>
  import("@emoji-mart/react").then((m) => ({ default: m.default as any }))
);
import emojiMartData from "@emoji-mart/data";
import { toast } from "sonner";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { isSystemBotEmployee } from "@/lib/system-bots";
import { useLongPress } from "@/hooks/useLongPress";
import { useSwipeToReply } from "@/hooks/useSwipeToReply";
import { MessageActionsSheet } from "@/components/chat/v2/MessageActionsSheet";
import { ComposerAttachMenu } from "@/components/chat/v2/ComposerAttachMenu";
import { ChannelInfoDrawer } from "@/components/chat/v2/ChannelInfoDrawer";
import { useIsMobile } from "@/hooks/use-mobile";

// Reações rápidas — sem categorias, só o set principal
const QUICK_EMOJIS = REACTIONS.map((r) => r.key);

// Durações de silenciamento — usadas no botão do header e no painel de detalhes
const MUTE_OPTIONS: Array<{ label: string; h: number | null }> = [
  { label: "1 hora", h: 1 },
  { label: "8 horas", h: 8 },
  { label: "24 horas", h: 24 },
  { label: "Para sempre", h: null },
];

export default function Chat() {
  const { channelId: urlChannelId } = useParams<{ channelId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { isAdmin, isManager } = usePermissions();
  const { data: channels = [], isLoading: loadingChannels } = useChatChannels();
  useChatPresenceHeartbeat();
  const { data: presence } = useChatPresence();

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  // Filtro da lista de conversas (chips no topo, estilo WhatsApp). Substituiu as
  // duas seções colapsáveis ("Canais" / "Mensagens diretas"): com seções, uma
  // conversa recente podia ficar abaixo da dobra só por estar no grupo errado —
  // a lista agora é única e ordenada por atividade, e quem quer recortar usa os
  // chips.
  const [chatFilter, setChatFilter] = useState<ChatFilter>(() => {
    try {
      const saved = localStorage.getItem("chat:sidebar:filter");
      return (CHAT_FILTERS.some((f) => f.key === saved) ? saved : "all") as ChatFilter;
    } catch { return "all"; }
  });
  useEffect(() => {
    try { localStorage.setItem("chat:sidebar:filter", chatFilter); } catch { /* */ }
  }, [chatFilter]);
  // Sincroniza só na montagem inicial e quando ainda não tem canal selecionado.
  // Trocas de canal acontecem via selectChannel() + history.replaceState — sem disparar router.
  useEffect(() => {
    if (selectedChannelId) return;
    if (urlChannelId) {
      setSelectedChannelId(urlChannelId);
    } else if (channels.length > 0) {
      // Em mobile (md breakpoint = 768px), não auto-seleciona — usuário precisa escolher na lista.
      const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
      if (isMobile) return;
      const first = channels.find((c) => !c.is_dm) || channels[0];
      setSelectedChannelId(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.length]);

  const channel = channels.find((c) => c.id === selectedChannelId);
  // `isLoading`/`isError`/`refetch` NÃO são opcionais aqui: sem eles, uma query
  // que ainda está buscando (ou que falhou) devolve `[]` e a tela afirma
  // "Nenhuma mensagem ainda / diga olá!" — ou seja, o app mente sobre uma
  // conversa cheia. Era isso que obrigava a recarregar a página na mão.
  const {
    data: messages = [],
    hasMore, loadOlder, send, remove,
    isLoading: loadingMessages,
    isError: messagesError,
    refetch: refetchMessages,
  } = useChatMessages(selectedChannelId || undefined);
  const { data: members = [] } = useChatChannelMembers(selectedChannelId || undefined);
  const { data: reactions = [], toggle: toggleReaction } = useChatReactions(selectedChannelId || undefined);

  // Drafts persistidos por canal no localStorage
  const draftKey = (cid: string) => `chat-draft:${cid}`;
  const [draft, setDraftRaw] = useState("");
  const setDraft = (v: string) => {
    setDraftRaw(v);
    if (selectedChannelId) {
      if (v.trim()) localStorage.setItem(draftKey(selectedChannelId), v);
      else localStorage.removeItem(draftKey(selectedChannelId));
    }
  };
  // Carrega rascunho ao trocar de canal
  useEffect(() => {
    if (!selectedChannelId) { setDraftRaw(""); return; }
    setDraftRaw(localStorage.getItem(draftKey(selectedChannelId)) || "");
  }, [selectedChannelId]);
  // Auto-grow do composer (até 160px) — reseta quando draft fica vazio
  useEffect(() => {
    const ta = composerRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    if (draft) ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [draft]);
  const [emojiOpen, setEmojiOpen] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Scroll da lista de mensagens: controla o auto-scroll e a pílula "X mensagens novas"
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  // Marcador por ID, não por contagem: carregar histórico antigo aumenta
  // `messages.length` sem que nada tenha chegado no fim — com contagem, abrir
  // mensagens antigas anunciava "20 mensagens novas".
  const lastSeenIdRef = useRef<string | null>(null);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const [showJumpToEnd, setShowJumpToEnd] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newMembers, setNewMembers] = useState<Set<string>>(new Set());
  const [newMemberSearch, setNewMemberSearch] = useState("");
  const createChannel = useCreateChannel();
  const [dmOpen, setDmOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [creatingDm, setCreatingDm] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  // Equivalente mobile do painel de detalhes: o `infoPanelOpen` acima só
  // monta em telas md+, então no celular não havia NENHUMA forma de ver ou
  // gerenciar os membros de um grupo.
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const isMobile = useIsMobile();
  const [soundOn, setSoundOn] = useState(true);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const addMember = useAddChannelMember();
  const removeMember = useRemoveChannelMember();
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const updateMessage = useUpdateMessage();
  const markRead = useMarkRead();
  const { data: polls = [], vote: votePoll } = useChatPolls(selectedChannelId || undefined);
  const createPoll = useCreatePoll();
  const { data: pinned = [], pin: pinMsg, unpin: unpinMsg } = usePinnedMessages(selectedChannelId || undefined);
  const { data: mutedSet, toggleMute } = useMutedChannels();
  const { data: starredSet, toggleStar } = useStarredMessages();
  const isCurrentMuted = selectedChannelId ? mutedSet?.has(selectedChannelId) ?? false : false;
  const { typers, sendTyping } = useTypingIndicator(selectedChannelId || undefined);
  // Atividade de QUALQUER conversa, para marcar o card na sidebar mesmo com
  // ela fechada. Um canal por tenant — assinar um canal por conversa da
  // lista não escala.
  const typingByChannel = useTenantTyping(profile?.tenant_id);
  const forward = useForwardMessage();
  const { data: activeHuddle } = useActiveHuddle(selectedChannelId || undefined);
  const startHuddle = useStartHuddle();
  const endHuddle = useEndHuddle();
  const { data: memberReads = [] } = useReadReceipts(selectedChannelId || undefined);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [readReceiptsFor, setReadReceiptsFor] = useState<ChatMessage | null>(null);
  const [pollVotersFor, setPollVotersFor] = useState<{ poll: any; optionIdx: number } | null>(null);
  // Busca global
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const { data: globalSearchHits = [], isFetching: globalSearchFetching } = useChatGlobalSearch(globalSearchQuery);
  const [lightbox, setLightbox] = useState<{ url: string; type: string; name?: string } | null>(null);
  // ESC fecha lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);
  // Ctrl/Cmd + K abre busca global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGlobalSearchOpen(true);
        setGlobalSearchQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Drafts em todos os canais (pra mostrar pílula 'rascunho' na sidebar)
  const [draftsByChannel, setDraftsByChannel] = useState<Record<string, string>>({});
  useEffect(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("chat-draft:")) {
        const v = localStorage.getItem(k);
        if (v) out[k.slice("chat-draft:".length)] = v;
      }
    }
    setDraftsByChannel(out);
  }, [draft, selectedChannelId]);
  const { data: unreadMap } = useChatUnread();
  // Quantas CONVERSAS têm mensagem não lida (não quantas mensagens) — é o
  // número que o chip "Não lidas" mostra, igual ao WhatsApp.
  const unreadConversationsCount = useMemo(() => {
    if (!unreadMap) return 0;
    let n = 0;
    unreadMap.forEach((v) => { if (v > 0) n++; });
    return n;
  }, [unreadMap]);
  const { data: lastMessagesMap } = useChatLastMessages(channels.map((c) => c.id));
  const { data: othersReadsMap } = useChatOthersReads(channels.map((c) => c.id));
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<any[]>([]);
  const [searchInChannel, setSearchInChannel] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIdx, setMentionIdx] = useState(0);
  // Resolve @firstName → user_id (acumulado quando usuário seleciona do popover)
  const [mentionedRefs, setMentionedRefs] = useState<Record<string, string>>({});
  const [slashOpen, setSlashOpen] = useState(false);
  const [camiOpen, setCamiOpen] = useState(false);
  const [camiContext, setCamiContext] = useState<CamiContext | null>(null);
  // Gate da IA (Clara/omnx-bot/transcrição): só aparece se OpenRouter conectado. Fail-open.
  const { isActive: isFeatureActive } = useIntegrations();
  const aiEnabled = isFeatureActive("ai");
  const [slashQuery, setSlashQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  // Criação de tarefa direto do chat
  const { createTask: createTaskFromChat } = useTasks();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>([]);
  const [taskDueDate, setTaskDueDate] = useState<string>("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [taskProjectId, setTaskProjectId] = useState<string>("");
  // A checklist ditada por voz vinha da IA e era jogada fora aqui: este dialog
  // nao tem editor de checklist, entao os itens sumiam sem aviso (no Kanban
  // funcionava). Guardamos em estado e salvamos junto com a tarefa.
  const [taskChecklistItems, setTaskChecklistItems] = useState<{ text: string; checked: boolean }[]>([]);
  // Reuniões direto do chat
  const createMeetingFromChat = useCreateMeeting();
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingMode, setMeetingMode] = useState<"now" | "schedule">("now");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [omnxThinking, setOmnxThinking] = useState(false);
  // Painel de Anotações dentro do Chat
  const [notesView, setNotesView] = useState(false);
  // Conversa fixa da Clara (assistente de IA) no painel central
  const [claraView, setClaraView] = useState(false);
  // Favoritos do usuário
  const { favorites, toggleFavorite } = useChatFavorites();
  // Notas — usado pra timestamp de "última atividade" do card Anotações
  const { data: notesData = [] } = useNotes({ archived: false });
  const lastNoteActivity = useMemo(() => {
    let max = 0;
    for (const n of notesData) {
      const t = new Date(n.updated_at).getTime();
      if (t > max) max = t;
    }
    return max;
  }, [notesData]);
  const [recording, setRecording] = useState(false);
  const [recordPaused, setRecordPaused] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordTimer = useRef<any>(null);
  const recordCancelledRef = useRef(false);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordStartingRef = useRef(false);
  const recordAudioCtxRef = useRef<AudioContext | null>(null);
  const recordAnalyserRef = useRef<AnalyserNode | null>(null);
  const recordRafRef = useRef<number | null>(null);
  const [recordLevels, setRecordLevels] = useState<number[]>(() => Array(28).fill(0));

  // Wrap selection with markdown markers (bold/italic)
  const wrapSelection = (mark: string) => {
    const ta = composerRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const v = draft;
    const before = v.slice(0, start);
    const sel = v.slice(start, end) || "texto";
    const after = v.slice(end);
    const next = `${before}${mark}${sel}${mark}${after}`;
    setDraft(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(before.length + mark.length, before.length + mark.length + sel.length);
    }, 0);
  };

  const insertEmoji = (emoji: string) => {
    const ta = composerRef.current;
    const start = ta?.selectionStart ?? draft.length;
    const before = draft.slice(0, start);
    const after = draft.slice(start);
    setDraft(before + emoji + after);
    setEmojiPickerOpen(false);
    setTimeout(() => {
      ta?.focus();
      ta?.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  // Gravação de áudio
  const startRecording = async () => {
    // Lock síncrono — bloqueia chamadas concorrentes ANTES do primeiro await,
    // que é onde o race acontecia (cliques duplos / StrictMode).
    if (recordStartingRef.current || recorderRef.current || recordStreamRef.current) return;
    recordStartingRef.current = true;
    // Limpa qualquer timer/rAF residual de uma sessão anterior
    if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null; }
    if (recordRafRef.current != null) { cancelAnimationFrame(recordRafRef.current); recordRafRef.current = null; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Defesa extra (não deveria acontecer com o lock acima)
      if (recorderRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        recordStartingRef.current = false;
        return;
      }
      recordStreamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recordChunks.current = [];
      recordCancelledRef.current = false;
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordChunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        // Se a gravação foi cancelada, descarta os chunks e não envia nada
        if (recordCancelledRef.current) {
          recordChunks.current = [];
          recordCancelledRef.current = false;
          return;
        }
        const blob = new Blob(recordChunks.current, { type: "audio/webm" });
        // Defesa extra: blob vazio (gravação cancelada antes de algum chunk) não é enviado
        if (blob.size === 0) {
          recordChunks.current = [];
          return;
        }
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
        if (selectedChannelId) {
          try {
            const att = await uploadChatAttachment(selectedChannelId, file);
            // Envia o áudio primeiro sem transcrição (rápido para o usuário ver)
            const finalAtt: any = { ...att, type: "audio/webm" };
            send.mutate(
              { content: "[áudio]", attachments: [finalAtt] } as any,
              {
                onSuccess: async () => {
                  // Pede transcrição em segundo plano e atualiza a msg
                  try {
                    const { data, error } = await supabase.functions.invoke("chat-transcribe", {
                      body: { audio_url: att.url, mime: "audio/webm" },
                    });
                    if (error) throw error;
                    const transcription = (data as any)?.transcription;
                    if (transcription) {
                      // Encontra a msg recém-criada (última msg do canal com este attachment) e atualiza attachments
                      const { data: latest } = await supabase
                        .from("chat_messages" as any)
                        .select("id, attachments")
                        .eq("channel_id", selectedChannelId)
                        .eq("author_id", profile?.user_id)
                        .order("created_at", { ascending: false })
                        .limit(5);
                      const target = ((latest || []) as any[]).find((mm) =>
                        Array.isArray(mm.attachments) &&
                        mm.attachments.some((aa: any) => aa.url === att.url)
                      );
                      if (target) {
                        const newAtts = (target.attachments as any[]).map((aa) =>
                          aa.url === att.url ? { ...aa, transcription } : aa
                        );
                        await supabase
                          .from("chat_messages" as any)
                          .update({ attachments: newAtts })
                          .eq("id", target.id);
                      }
                    }
                  } catch (e: any) {
                    console.warn("[chat] transcrição falhou:", e?.message || e);
                  }
                },
                onError: (e: any) => toast.error(e.message || "Erro ao enviar áudio"),
              }
            );
          } catch (e: any) {
            toast.error(e.message || "Erro no upload do áudio");
          }
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setRecordPaused(false);
      setRecordTime(0);
      if (recordTimer.current) clearInterval(recordTimer.current);
      recordTimer.current = setInterval(() => {
        setRecordTime((t) => t + 1);
        // Mantém a indicação "está gravando um áudio" viva (broadcast a cada ~2s graças ao throttle interno)
        if (profile) sendTyping(profile.full_name || "Alguém", "recording_audio" as any);
      }, 1000);
      if (profile) sendTyping(profile.full_name || "Alguém", "recording_audio" as any);
      // Analisador em tempo real para waveform (domínio do tempo)
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        const ctx = new Ctx();
        if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* ignora */ } }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        recordAudioCtxRef.current = ctx;
        recordAnalyserRef.current = analyser;
        runWaveformLoop(analyser);
      } catch { /* sem visualização se Web Audio falhar */ }
    } catch (e: any) {
      toast.error("Permissão de microfone negada ou erro: " + (e.message || ""));
    } finally {
      recordStartingRef.current = false;
    }
  };

  const runWaveformLoop = (analyser: AnalyserNode) => {
    const BARS = 28;
    const buf = new Uint8Array(analyser.fftSize);
    let lastEmit = 0;
    const tick = (now: number) => {
      analyser.getByteTimeDomainData(buf);
      const step = Math.floor(buf.length / BARS);
      const next: number[] = new Array(BARS);
      for (let i = 0; i < BARS; i++) {
        let peak = 0;
        const start = i * step;
        for (let j = 0; j < step; j++) {
          const v = Math.abs(buf[start + j] - 128);
          if (v > peak) peak = v;
        }
        // 0..128 → 0..100 com leve boost para voz humana
        next[i] = Math.min(100, Math.max(6, (peak / 128) * 130));
      }
      // Throttle render para ~30fps (suficiente, evita re-renders excessivos)
      if (now - lastEmit > 33) {
        setRecordLevels(next);
        lastEmit = now;
      }
      recordRafRef.current = requestAnimationFrame(tick);
    };
    recordRafRef.current = requestAnimationFrame(tick);
  };

  const stopAnalyser = () => {
    if (recordRafRef.current != null) { cancelAnimationFrame(recordRafRef.current); recordRafRef.current = null; }
    try { recordAnalyserRef.current?.disconnect(); } catch { /* ignora */ }
    recordAnalyserRef.current = null;
    try { recordAudioCtxRef.current?.close(); } catch { /* ignora */ }
    recordAudioCtxRef.current = null;
    setRecordLevels(Array(28).fill(0));
  };

  const pauseRecording = () => {
    const mr = recorderRef.current;
    if (!mr || mr.state !== "recording") return;
    try { mr.pause(); } catch { return; }
    setRecordPaused(true);
    if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null; }
    if (recordRafRef.current != null) { cancelAnimationFrame(recordRafRef.current); recordRafRef.current = null; }
    setRecordLevels(Array(28).fill(0));
  };

  const resumeRecording = () => {
    const mr = recorderRef.current;
    if (!mr || mr.state !== "paused") return;
    try { mr.resume(); } catch { return; }
    setRecordPaused(false);
    if (recordTimer.current) clearInterval(recordTimer.current);
    recordTimer.current = setInterval(() => setRecordTime((t) => t + 1), 1000);
    if (recordAnalyserRef.current) runWaveformLoop(recordAnalyserRef.current);
  };

  const stopRecording = (cancel = false) => {
    const mr = recorderRef.current;
    if (!mr) return;
    // Marca cancelamento ANTES de chamar stop() — evita race com onstop
    if (cancel) recordCancelledRef.current = true;
    try {
      if (mr.state !== "inactive") mr.stop();
    } catch { /* ignora */ }
    recorderRef.current = null;
    setRecording(false);
    setRecordPaused(false);
    if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null; }
    setRecordTime(0);
    stopAnalyser();
  };

  // Notificações sonoras de novas msgs (em qualquer canal exceto o aberto)
  useChatNotifications(selectedChannelId, mutedSet);
  // Solicita permissão de notificação do navegador (uma vez)
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);
  // Mostra notificação do navegador quando chega msg fora do canal aberto
  useEffect(() => {
    if (!profile?.user_id) return;
    const ch = supabase
      .channel(`browser-notif-${profile.user_id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `tenant_id=eq.${profile?.tenant_id}` },
        async (payload: any) => {
          const m = payload.new;
          if (!m || m.author_id === profile.user_id) return;
          if (m.channel_id === selectedChannelId) return;
          if (mutedSet?.has(m.channel_id)) return;
          // Verifica se sou membro
          const { data: mem } = await supabase
            .from("chat_channel_members" as any)
            .select("channel_id").eq("user_id", profile.user_id).eq("channel_id", m.channel_id).maybeSingle();
          if (!mem) return;
          // Busca nome do canal e autor
          const [{ data: cdata }, { data: pdata }] = await Promise.all([
            supabase.from("chat_channels" as any).select("name, is_dm").eq("id", m.channel_id).maybeSingle(),
            supabase.from("profiles").select("full_name").eq("user_id", m.author_id).maybeSingle(),
          ]);
          const channelName = (cdata as any)?.is_dm ? ((pdata as any)?.full_name || "DM") : `# ${(cdata as any)?.name || "canal"}`;
          if ("Notification" in window && Notification.permission === "granted") {
            const n = new Notification(channelName, {
              body: `${(pdata as any)?.full_name || "Alguém"}: ${m.content.slice(0, 100)}`,
              tag: m.channel_id,
              icon: "/favicon.ico",
            });
            n.onclick = () => {
              window.focus();
              selectChannel(m.channel_id);
              n.close();
            };
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.user_id, profile?.tenant_id, selectedChannelId, mutedSet]);

  // Marca canal como lido somente quando aba está visível e a última mensagem está no viewport
  useEffect(() => {
    if (!selectedChannelId) return;
    const target = messagesEndRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      // Fallback: marca direto
      if (document.visibilityState === "visible") markRead.mutate(selectedChannelId);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && document.visibilityState === "visible") {
            markRead.mutate(selectedChannelId);
          }
        }
      },
      { root: null, threshold: 0.1 },
    );
    obs.observe(target);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId, messages.length]);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const { data: employees = [] } = useEmployees();

  // Member só pode criar tarefas para si mesmo (mesma regra das tarefas normais).
  const isMember = !isAdmin && !isManager;
  const myEmployee = employees.find((e) => e.user_id === profile?.user_id) || null;

  // ── Scroll das mensagens ────────────────────────────────────────────────
  // Só rola sozinho quando o usuário já está no fim (ou quando a mensagem é
  // dele). Se ele estiver lendo mais acima, mantém a posição e conta as novas
  // para a pílula "X mensagens novas".
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    isAtBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior });
    setUnreadBelow(0);
    setShowJumpToEnd(false);
    lastSeenIdRef.current = messages[messages.length - 1]?.id ?? null;
  }, [messages]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
    isAtBottomRef.current = atBottom;
    // Botão de descer aparece bem antes do contador de novas: basta ter subido
    // uma tela para valer o atalho de voltar ao fim.
    setShowJumpToEnd(el.scrollHeight - el.scrollTop - el.clientHeight > el.clientHeight * 0.5);
    if (atBottom) {
      setUnreadBelow(0);
      lastSeenIdRef.current = messages[messages.length - 1]?.id ?? null;
    }
  }, [messages]);

  // Enquanto estivermos no fim, qualquer conteúdo que CRESÇA depois do scroll
  // precisa puxar a viewport de novo. Imagem e vídeo só passam a ocupar altura
  // quando carregam — o scroll já terminou e a mensagem recém-enviada fica
  // cortada, exigindo rolar na mão. `load` não borbulha, daí a fase de captura.
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const stick = () => {
      if (isAtBottomRef.current) el.scrollTop = el.scrollHeight;
    };
    el.addEventListener("load", stick, true);
    el.addEventListener("loadedmetadata", stick, true);
    return () => {
      el.removeEventListener("load", stick, true);
      el.removeEventListener("loadedmetadata", stick, true);
    };
  }, [selectedChannelId]);

  // Ao trocar de canal, começa sempre no fim (sem animação) e zera o contador
  useEffect(() => {
    isAtBottomRef.current = true;
    lastSeenIdRef.current = null;
    setUnreadBelow(0);
    setShowJumpToEnd(false);
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [selectedChannelId]);

  useEffect(() => {
    const last = messages[messages.length - 1] as { id?: string; author_id?: string } | undefined;
    if (!last?.id || last.id === lastSeenIdRef.current) return;

    // Mensagem enviada por mim sempre desce junto
    const isMine = last.author_id === profile?.user_id;

    if (isAtBottomRef.current || isMine) {
      // Enviar estando mais acima também recoloca no fim — sem isto o listener
      // de `load` acima não puxaria a imagem recém-enviada.
      isAtBottomRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadBelow(0);
      setShowJumpToEnd(false);
      lastSeenIdRef.current = last.id;
    } else {
      // Quantas chegaram depois da última vista. Imune à paginação: mensagens
      // antigas entram ANTES do marcador e não contam.
      const seenIdx = messages.findIndex((m) => m.id === lastSeenIdRef.current);
      setUnreadBelow(seenIdx >= 0 ? messages.length - 1 - seenIdx : messages.length);
    }
  }, [messages, profile?.user_id]);

  // ESC fecha a conversa atual e volta para a sidebar de contatos.
  // Só atua quando não há overlay/popover/edição ativos — esses tratam o ESC primeiro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const overlayOpen =
        lightbox || globalSearchOpen || createOpen || dmOpen || editOpen ||
        forwardOpen || pollDialogOpen || taskDialogOpen || meetingDialogOpen ||
        addMemberOpen || camiOpen || emojiPickerOpen || emojiOpen ||
        mentionOpen || slashOpen || readReceiptsFor || pollVotersFor || editingMsgId;
      if (overlayOpen) return;
      if (!selectedChannelId && !notesView && !claraView) return;
      setSelectedChannelId(null);
      setNotesView(false);
      setClaraView(false);
      if (window.location.pathname !== "/chat") {
        window.history.replaceState({}, "", "/chat");
        // Mesmo aviso do selectChannel(), na direção contrária: sem ele o
        // layout continua achando que estamos DENTRO da conversa e a BottomNav
        // some na lista.
        notifyPathChange();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    lightbox, globalSearchOpen, createOpen, dmOpen, editOpen, forwardOpen,
    pollDialogOpen, taskDialogOpen, meetingDialogOpen, addMemberOpen, camiOpen,
    emojiPickerOpen, emojiOpen, mentionOpen, slashOpen, readReceiptsFor,
    pollVotersFor, editingMsgId, selectedChannelId, notesView, claraView,
  ]);

  // Conjunto de user_ids de teste (employees.is_test = true) — invisíveis em todo o chat
  const testUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of employees) {
      if ((e as any).is_test && e.user_id) s.add(e.user_id);
    }
    return s;
  }, [employees]);

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Map<string, { count: number; mine: boolean; userIds: string[] }>>();
    for (const r of reactions) {
      if (testUserIds.has(r.user_id)) continue; // Ignora reações de usuários de teste
      if (!map.has(r.message_id)) map.set(r.message_id, new Map());
      const m = map.get(r.message_id)!;
      const cur = m.get(r.emoji) || { count: 0, mine: false, userIds: [] as string[] };
      cur.count += 1;
      cur.userIds.push(r.user_id);
      if (r.user_id === profile?.user_id) cur.mine = true;
      m.set(r.emoji, cur);
    }
    return map;
  }, [reactions, profile?.user_id, testUserIds]);

  // Mapa user_id → { name, avatar } para enriquecer chips de reação
  const userProfileMap = useMemo(() => {
    const m = new Map<string, { name: string; avatar: string | null }>();
    for (const e of employees) {
      if (e.user_id) {
        m.set(e.user_id, { name: e.full_name || "?", avatar: e.avatar_url || null });
      }
    }
    return m;
  }, [employees]);

  // Alterna mic/enviar no composer. Mesma condição que desabilitava o antigo
  // botão de enviar — em edição sempre há o que salvar, mesmo com o campo vazio.
  const hasComposerContent = !!draft.trim() || pendingAttachments.length > 0 || !!editingMsgId;

  const handleSend = () => {
    // Modo edição: salva alteração em vez de criar nova msg
    if (editingMsgId) {
      const t = editingMsgText.trim();
      if (!t) return;
      updateMessage.mutate(
        { id: editingMsgId, content: t },
        {
          onSuccess: () => {
            setEditingMsgId(null);
            setEditingMsgText("");
            toast.success("Mensagem atualizada");
          },
          onError: (e: any) => toast.error(e.message || "Erro ao editar"),
        }
      );
      return;
    }
    const t = draft.trim();
    if (!t && pendingAttachments.length === 0) return;
    // Placeholder semântico baseado no tipo (escondido na UI)
    const placeholderForAttachments = () => {
      if (pendingAttachments.length === 0) return "";
      const types = pendingAttachments.map((a) => a.type || "");
      if (types.every((t) => t.startsWith("image/"))) return "[imagem]";
      if (types.every((t) => t.startsWith("video/"))) return "[vídeo]";
      if (types.every((t) => t.startsWith("audio/"))) return "[áudio]";
      return "[anexo]";
    };
    // Extrai usuários mencionados (@PrimeiroNome) presentes no draft
    const mentionTokens = Array.from(t.matchAll(/(?:^|\s)@(\S+)/g)).map((m) => m[1]);
    const mentionedUserIds = Array.from(
      new Set(
        mentionTokens
          .map((tok) => {
            // 1) ref explícita (usuário escolheu do popover)
            const ref = mentionedRefs[tok.toLowerCase()];
            if (ref) return ref;
            // 2) match único pelo primeiro nome entre membros do canal
            const candidates = (employees || [])
              .filter((e: any) => e.user_id && e.status === "active")
              .filter((e: any) => (e.full_name || "").toLowerCase().split(/\s+/)[0] === tok.toLowerCase());
            if (candidates.length === 1) return candidates[0].user_id as string;
            return null;
          })
          .filter(Boolean) as string[]
      )
    ).filter((uid) => uid !== profile?.user_id);

    send.mutate(
      { content: t || placeholderForAttachments(), attachments: pendingAttachments, parent_id: replyTo?.id ?? null } as any,
      {
        onSuccess: async () => {
          // Notifica usuários mencionados
          if (mentionedUserIds.length > 0 && profile?.tenant_id && selectedChannelId && channel) {
            const authorName = profile.full_name || "Alguém";
            const channelLabel = channel.is_dm
              ? authorName
              : `# ${channel.name}`;
            const preview = (t || "[anexo]").slice(0, 140);
            const rows = mentionedUserIds.map((uid) => ({
              tenant_id: profile.tenant_id,
              user_id: uid,
              type: "chat_mention",
              title: `${authorName} mencionou você em ${channelLabel}`,
              body: preview,
              link: `/chat/${selectedChannelId}`,
            }));
            try {
              await supabase.from("notifications" as any).insert(rows);
            } catch {
              // silencioso — não bloqueia envio da mensagem
            }
          }
          setDraft("");
          setPendingAttachments([]);
          setReplyTo(null);
          setMentionedRefs({});
          // OMNX Bot desativado temporariamente — não dispara edge function
        },
        onError: (e: any) => toast.error(e.message || "Erro ao enviar"),
      }
    );
  };

  // Upload de arquivos (paperclip / image button / drag-drop)
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; size: number }[]>([]);
  const handleFiles = async (files: FileList | File[]) => {
    if (!selectedChannelId) return;
    const arr = Array.from(files);
    for (const f of arr) {
      const ticket = { name: f.name, size: f.size };
      setUploadingFiles((prev) => [...prev, ticket]);
      // Broadcast tipo de upload para a outra ponta
      if (profile) {
        const action = (f.type || "").startsWith("image/")
          ? "uploading_image"
          : (f.type || "").startsWith("video/")
            ? "uploading_video"
            : (f.type || "").startsWith("audio/")
              ? "uploading_audio"
              : "uploading_file";
        sendTyping(profile.full_name || "Alguém", action as any);
      }
      try {
        const att = await uploadChatAttachment(selectedChannelId, f);
        setPendingAttachments((prev) => [...prev, att]);
      } catch (e: any) {
        toast.error(`${f.name}: ${e.message || "Falha no upload"}`);
      } finally {
        setUploadingFiles((prev) => {
          const idx = prev.findIndex((p) => p.name === ticket.name && p.size === ticket.size);
          if (idx === -1) return prev;
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
      }
    }
  };

  // Detecta @ ou / pra abrir popover apropriado
  const handleDraftChange = (v: string) => {
    setDraft(v);
    if (v.trim().length > 0 && profile) {
      sendTyping(profile.full_name || "Alguém");
    }
    const cursor = composerRef.current?.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const at = /(?:^|\s)@(\S*)$/.exec(before);
    const slash = /^\/(\S*)$/.exec(before);
    if (at) {
      setMentionQuery(at[1]);
      setMentionOpen(true);
      setMentionIdx(0);
      setSlashOpen(false);
    } else if (slash) {
      setSlashQuery(slash[1]);
      setSlashOpen(true);
      setMentionOpen(false);
    } else {
      setMentionOpen(false);
      setSlashOpen(false);
    }
  };

  const SLASH_COMMANDS: { cmd: string; label: string; icon: any; desc: string; run: () => void }[] = [
    {
      cmd: "task",
      label: "/task",
      icon: CheckSquare,
      desc: "Criar uma nova tarefa",
      run: () => {
        const args = draft.replace(/^\/task\s*/, "").trim();
        const url = `/tarefas?title=${encodeURIComponent(args || "")}`;
        window.open(url, "_blank");
        setDraft("");
        setSlashOpen(false);
      },
    },
    {
      cmd: "meet",
      label: "/meet",
      icon: Video,
      desc: "Iniciar reunião",
      run: () => {
        if (selectedChannelId) navigate(`/meet/${selectedChannelId}`);
        setDraft("");
        setSlashOpen(false);
      },
    },
    {
      cmd: "poll",
      label: "/poll",
      icon: BarChart3,
      desc: "Criar uma enquete (em grupo)",
      run: () => {
        if (channel?.is_dm) { toast.error("Enquetes só em canais/grupos"); return; }
        setPollDialogOpen(true);
        setDraft("");
        setSlashOpen(false);
      },
    },
    {
      cmd: "ai",
      label: "/ai",
      icon: CamiAvatar as any,
      desc: "Pergunte a Clara",
      run: () => { setCamiContext(null); setCamiOpen(true); setDraft(""); setSlashOpen(false); },
    },
  ];
  const slashFiltered = SLASH_COMMANDS.filter((s) =>
    (s.cmd !== "ai" || aiEnabled) &&
    (!slashQuery.trim() || s.cmd.toLowerCase().includes(slashQuery.toLowerCase()))
  );

  const insertMention = (name: string, userId?: string) => {
    const v = draft;
    const cursor = composerRef.current?.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const after = v.slice(cursor);
    const replaced = before.replace(/(?:^|\s)@\S*$/, (m) => m.replace(/@\S*$/, `@${name} `));
    setDraft(replaced + after);
    setMentionOpen(false);
    if (userId) setMentionedRefs((prev) => ({ ...prev, [name.toLowerCase()]: userId }));
    composerRef.current?.focus();
  };

  const handleStartDM = async (otherUserId: string, otherName: string) => {
    if (!profile?.user_id || !profile?.tenant_id) return;
    setCreatingDm(true);
    try {
      const channelId = await findOrCreateDM(profile.user_id, otherUserId, profile.tenant_id);
      // Garante que a DM recém-criada esteja na lista antes de selecioná-la,
      // senão o header (que depende de `channel`) não renderiza.
      await qc.invalidateQueries({ queryKey: ["chat_channels"] });
      selectChannel(channelId);
      setDmOpen(false);
      setDmSearch("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar conversa");
    } finally {
      setCreatingDm(false);
    }
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createChannel.mutate(
      { name: newName, description: newDesc },
      {
        onSuccess: async (ch: any) => {
          // Adiciona membros selecionados (criador já entra automaticamente)
          const selectedIds = [...newMembers].filter((uid) => uid !== profile?.user_id);
          for (const uid of selectedIds) {
            try {
              await addMember.mutateAsync({ channel_id: ch.id, user_id: uid });
            } catch (e: any) {
              console.error("Erro adicionando membro", uid, e);
            }
          }
          selectChannel(ch.id);
          setCreateOpen(false);
          setNewName("");
          setNewDesc("");
          setNewMembers(new Set());
          setNewMemberSearch("");
          toast.success(
            selectedIds.length > 0
              ? `Canal criado com ${selectedIds.length + 1} membro${selectedIds.length + 1 !== 1 ? "s" : ""}`
              : "Canal criado"
          );
        },
        onError: (e: any) => toast.error(e.message || "Erro ao criar canal"),
      }
    );
  };

  // Troca de canal sem disparar PageTransition do AppLayout (replaceState mantém URL sem re-mount)
  const selectChannel = (id: string) => {
    setNotesView(false);
    setClaraView(false);
    setSelectedChannelId(id);
    if (window.location.pathname !== `/chat/${id}`) {
      window.history.replaceState({}, "", `/chat/${id}`);
      // O router nao observa replaceState. Sem este aviso, AppLayout e
      // BottomNav continuam achando que estamos na LISTA de conversas: a nav
      // fica visivel por cima do chat e o <main> segue reservando a altura
      // dela.
      notifyPathChange();
    }
  };

  /**
   * Cartão do MEU aniversário no topo da lista. Some sozinho quando o dia vira
   * — a chave de dispensa carrega a data de hoje, então amanhã ela já não bate
   * e um novo aniversário volta a mostrar o cartão sem nenhuma limpeza.
   */
  const myBirthdayToday = isBirthdayToday(profile?.birth_date);
  const birthdayCardKey = `birthday-card-dismissed:${new Date().toISOString().slice(0, 10)}`;
  const [birthdayCardDismissed, setBirthdayCardDismissed] = useState(() => {
    try { return localStorage.getItem(birthdayCardKey) === "1"; } catch { return false; }
  });
  const dismissBirthdayCard = () => {
    try { localStorage.setItem(birthdayCardKey, "1"); } catch { /* storage bloqueado */ }
    setBirthdayCardDismissed(true);
  };

  /**
   * Abre a conversa do aniversariante já com a mensagem de parabéns escrita —
   * o usuário revisa, completa e envia. Não enviamos nada por conta própria:
   * parabéns automático de robô é pior do que parabéns nenhum.
   *
   * O rascunho vai para o `localStorage` ANTES de trocar de canal porque o
   * efeito que carrega rascunhos roda na troca e sobrescreveria um `setDraft`
   * feito aqui.
   */
  const congratulate = (c: any) => {
    const firstName = String(c?.display_name || "").trim().split(/\s+/)[0];
    const message = firstName
      ? `Feliz aniversário, ${firstName}! 🎉🎂 Muitas felicidades!`
      : "Feliz aniversário! 🎉🎂 Muitas felicidades!";
    if (selectedChannelId === c.id) {
      setDraft(message);
    } else {
      try { localStorage.setItem(draftKey(c.id), message); } catch { /* storage cheio/bloqueado */ }
      selectChannel(c.id);
    }
    setTimeout(() => composerRef.current?.focus(), 150);
  };

  // Canais = canais oficiais (is_system); omnx-bot está oculto por enquanto
  const publicChannels = channels.filter((c) => !c.is_dm && c.is_system && c.name !== "omnx-bot");
  // OMNX Bot desativado temporariamente
  const omnxChannel: any = null;
  const customGroups = channels.filter((c) => !c.is_dm && !c.is_system);
  const dms = channels.filter((c) => c.is_dm);
  const meId = profile?.user_id;

  const { data: projects = [] } = useProjects();
  const { data: meetings = [] } = useMeetingsList();

  // Projetos e reuniões compartilhados (eu + outro user, em DM)
  const otherUserId = (channel as any)?.other_user_id as string | undefined;
  const myEmployeeId = (employees || []).find((e) => e.user_id === profile?.user_id)?.id ?? null;
  const otherEmployeeId = otherUserId ? (employees || []).find((e) => e.user_id === otherUserId)?.id ?? null : null;

  const sharedProjects = useMemo(() => {
    if (!myEmployeeId || !otherEmployeeId) return [] as any[];
    return (projects || []).filter((p: any) => {
      const ids = (p.members || []).map((m: any) => m.employee_id);
      return ids.includes(myEmployeeId) && ids.includes(otherEmployeeId);
    });
  }, [projects, myEmployeeId, otherEmployeeId]);

  const sharedMeetings = useMemo(() => {
    if (!myEmployeeId || !otherEmployeeId) return [] as any[];
    return (meetings || []).filter((m: any) => {
      const ids = (m.meeting_attendees || []).map((a: any) => a.employee_id).filter(Boolean);
      return ids.includes(myEmployeeId) && ids.includes(otherEmployeeId);
    });
  }, [meetings, myEmployeeId, otherEmployeeId]);

  const recentAttachments = useMemo(() => {
    const out: any[] = [];
    for (let i = messages.length - 1; i >= 0 && out.length < 5; i--) {
      const m = messages[i];
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        for (const a of m.attachments) out.push({ ...a, messageId: m.id });
      }
    }
    return out.slice(0, 5);
  }, [messages]);

  // `h-full`, não `h-[100dvh]`: o <main> do AppLayout já dimensiona a página.
  // Altura absoluta aqui ignorava o box do main — inclusive a reserva de espaço
  // da BottomNav —, e as últimas conversas da lista ficavam por baixo da barra,
  // inalcançáveis no celular.
  //
  // No desktop, `-mx-5 -my-4` cancela o padding do <main> para o chat sangrar
  // até a borda. Só que `h-full` resolve contra o CONTENT BOX do main, que já
  // desconta esse padding: o elemento subia 16px e continuava 16px mais curto,
  // deixando 32px de `bg-background` exposto na base — uma faixa branca atrás
  // das duas colunas, na largura inteira. A altura precisa devolver o que a
  // margem negativa tomou.
  return (
    <div className="flex h-full md:h-[calc(100%+2rem)] overflow-hidden md:-mx-5 md:-my-4">
      {/* ─── Sidebar de Canais ─── */}
      <aside className={cn(
        "w-full md:w-80 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col min-h-0 relative",
        (selectedChannelId || notesView || claraView) && "hidden md:flex"
      )}>
        {/* ─── Cabeçalho estilo WhatsApp ───
            Título grande + busca em pílula + chips de filtro. Antes o topo era
            só uma barra de busca de 28px de altura: a tela abria sem nome e sem
            nenhum controle de recorte da lista. */}
        <div className="flex-shrink-0 px-3 pt-3 pb-2 bg-sidebar">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h1 className="text-2xl md:text-lg font-bold tracking-tight text-sidebar-foreground">
              Conversas
            </h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="hidden md:flex w-9 h-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary items-center justify-center transition-colors"
                  aria-label="Nova conversa"
                  title="Nova conversa"
                >
                  <MessageSquarePlus className="w-[18px] h-[18px]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => setDmOpen(true)}>
                  <MessageSquare className="w-3.5 h-3.5 mr-2" /> Nova conversa
                </DropdownMenuItem>
                {(isAdmin || isManager) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
                      <Users className="w-3.5 h-3.5 mr-2" /> Criar grupo
                      <span className="ml-auto text-2xs text-muted-foreground">{isAdmin ? "admin" : "manager"}</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <button
            type="button"
            onClick={() => { setGlobalSearchOpen(true); setGlobalSearchQuery(""); }}
            className="w-full flex items-center gap-2.5 px-3.5 h-10 rounded-full bg-sidebar-accent/50 hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors text-sm"
            title="Buscar em todas as conversas (Ctrl+K)"
          >
            <Search className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">Buscar mensagens, pessoas...</span>
            <span className="ml-auto hidden md:inline text-[10px] font-mono opacity-60">Ctrl+K</span>
          </button>

          {/* Chips: rolam na horizontal quando não cabem, sem quebrar linha. */}
          <div className="flex items-center gap-2 mt-2.5 -mx-3 px-3 overflow-x-auto chat-chips-scroll">
            {CHAT_FILTERS.map((f) => {
              const active = chatFilter === f.key;
              const count = f.key === "unread" ? unreadConversationsCount : 0;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setChatFilter(f.key)}
                  aria-pressed={active}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-medium transition-colors border",
                    active
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-transparent text-muted-foreground border-sidebar-border hover:bg-sidebar-accent/50"
                  )}
                >
                  {f.label}
                  {count > 0 && (
                    <span className="tabular-nums opacity-80">{count > 99 ? "99+" : count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ─── Lista única de conversas ───
              Canais oficiais, grupos, DMs, Clara e Anotações no mesmo fluxo,
              ordenados por fixados → última atividade. */}
          {(() => {
            const ANOTACOES_KEY = "__anotacoes__";
            const CLARA_KEY = "__clara__";
            const BIRTHDAY_KEY = "__meu_aniversario__";

            type Row = {
              key: string;
              kind: "clara" | "anotacoes" | "channel" | "birthday";
              channel?: any;
              sortTs: number;
              isFav: boolean;
              unread: number;
              isGroup: boolean;
              isChannel: boolean;
              /** DM com alguém que faz aniversário hoje. */
              isBday: boolean;
            };

            const ts = (c: any) =>
              lastMessagesMap?.get(c.id)?.created_at
                ? new Date(lastMessagesMap.get(c.id)!.created_at).getTime()
                : new Date(c.created_at || 0).getTime();

            const allChannels: any[] = [
              ...publicChannels,
              ...customGroups,
              ...dms,
              ...(omnxChannel ? [omnxChannel] : []),
            ];

            const rows: Row[] = allChannels.map((c) => ({
              key: c.id,
              kind: "channel" as const,
              channel: c,
              sortTs: ts(c),
              isFav: favorites.has(c.id),
              unread: unreadMap?.get(c.id) || 0,
              isGroup: !c.is_dm && !c.is_system,
              isChannel: !!c.is_system,
              isBday: !!c.is_dm && isBirthdayToday((c as any).other_birth_date),
            }));

            rows.push({
              key: ANOTACOES_KEY,
              kind: "anotacoes",
              sortTs: lastNoteActivity || 0,
              isFav: favorites.has(ANOTACOES_KEY),
              unread: 0,
              isGroup: false,
              isChannel: false,
              isBday: false,
            });

            // Clara fica sempre no topo: é ferramenta, não conversa — ordená-la
            // por "última atividade" a faria sumir no meio da lista.
            if (aiEnabled) {
              rows.unshift({
                key: CLARA_KEY,
                kind: "clara",
                sortTs: Number.MAX_SAFE_INTEGER,
                isFav: true,
                unread: 0,
                isGroup: false,
                isChannel: false,
                isBday: false,
              });
            }

            // Cartão do MEU aniversário: aparece como se fosse uma mensagem
            // chegando, ocupa o topo absoluto da lista e some sozinho quando o
            // dia vira (ou quando a pessoa fecha no X).
            if (myBirthdayToday && !birthdayCardDismissed) {
              rows.unshift({
                key: BIRTHDAY_KEY,
                kind: "birthday",
                sortTs: Number.MAX_SAFE_INTEGER,
                isFav: false,
                unread: 0,
                isGroup: false,
                isChannel: false,
                isBday: true,
              });
            }

            // Ordem: meu aniversário → Clara (ferramenta) → aniversariantes do
            // dia → fixados → resto por última atividade. O aniversário sobe
            // acima dos fixados de propósito: é um lembrete que vale por um dia
            // só e some sozinho amanhã.
            const rank = (r: Row) =>
              r.kind === "birthday" ? -1 : r.kind === "clara" ? 0 : r.isBday ? 1 : r.isFav ? 2 : 3;
            const sorted = rows.sort((a, b) => {
              const ra = rank(a);
              const rb = rank(b);
              if (ra !== rb) return ra - rb;
              return b.sortTs - a.sortTs;
            });

            const visible = sorted.filter((r) => {
              // O cartão do próprio aniversário ignora os filtros: é um aviso
              // do dia, não uma conversa que se classifica em "grupos" ou
              // "não lidas".
              if (r.kind === "birthday") return true;
              if (chatFilter === "unread") return r.unread > 0;
              if (chatFilter === "favorites") return r.isFav && r.kind !== "clara";
              if (chatFilter === "groups") return r.isGroup;
              if (chatFilter === "channels") return r.isChannel;
              return true;
            });

            if (loadingChannels) {
              return (
                <div className="px-3 py-3 space-y-4">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-sidebar-accent/60 animate-pulse flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-1/3 rounded bg-sidebar-accent/60 animate-pulse" />
                        <div className="h-3 w-2/3 rounded bg-sidebar-accent/40 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            if (visible.length === 0) {
              return (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {chatFilter === "unread"
                      ? "Nenhuma conversa não lida."
                      : chatFilter === "favorites"
                        ? "Você ainda não fixou nenhuma conversa."
                        : chatFilter === "groups"
                          ? "Nenhum grupo por aqui."
                          : chatFilter === "channels"
                            ? "Nenhum canal disponível."
                            : "Nenhuma conversa ainda."}
                  </p>
                </div>
              );
            }

            return visible.map((row) => {
              // ── Cartão do meu aniversário ──
              // Chega como se fosse uma mensagem do GT3 para você: fica no topo
              // durante o dia e some sozinho amanhã (ou no X, que só vale hoje).
              if (row.kind === "birthday") {
                return (
                  <div key={row.key} className="px-1.5 pb-1">
                    <div className="relative flex items-center gap-3 px-2.5 py-2.5 rounded-lg bg-gradient-to-r from-amber-200/90 via-amber-100/70 to-amber-50/30 dark:from-amber-500/25 dark:via-amber-500/12 dark:to-amber-500/5 ring-1 ring-amber-300/70 dark:ring-amber-500/30">
                      <div className="w-12 h-12 rounded-full bg-amber-400/90 dark:bg-amber-500/80 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-2xl leading-none" aria-hidden="true">🎂</span>
                      </div>
                      <div className="flex-1 min-w-0 pr-5">
                        <p className="text-[15px] font-semibold text-amber-900 dark:text-amber-100 truncate">
                          Feliz aniversário, {String(profile?.full_name || "").trim().split(/\s+/)[0] || "você"}!
                        </p>
                        <p className="text-[13px] text-amber-800/80 dark:text-amber-200/70 truncate">
                          Hoje é o seu dia — o time inteiro está vendo isso. 🎉
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={dismissBirthdayCard}
                        className="absolute top-1.5 right-1.5 p-1 rounded text-amber-800/60 dark:text-amber-200/60 hover:bg-amber-300/40 dark:hover:bg-amber-500/20"
                        title="Dispensar por hoje"
                        aria-label="Dispensar o aviso de aniversário"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              }

              // ── Clara ──
              if (row.kind === "clara") {
                return (
                  <ChatListRow
                    key={row.key}
                    selected={claraView}
                    onClick={() => {
                      setClaraView(true);
                      setNotesView(false);
                      setSelectedChannelId(null);
                      if (window.location.pathname !== "/chat") {
                        window.history.replaceState({}, "", "/chat");
                        notifyPathChange();
                      }
                    }}
                    avatar={
                      <div className="relative flex-shrink-0">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <CamiAvatar className="w-[22px] h-[22px]" />
                        </div>
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center">
                          <span className="text-[8px] font-bold text-primary">IA</span>
                        </span>
                      </div>
                    }
                    title="Clara"
                    preview={<span className="truncate">Assistente de IA</span>}
                  />
                );
              }

              // ── Anotações ──
              if (row.kind === "anotacoes") {
                return (
                  <ChatListRow
                    key={row.key}
                    selected={notesView}
                    onClick={() => { setNotesView(true); setClaraView(false); setSelectedChannelId(null); }}
                    title="Anotações"
                    preview={<span className="truncate">Bloco pessoal</span>}
                    pinned={row.isFav}
                    onTogglePin={() => toggleFavorite.mutate({ channelId: ANOTACOES_KEY, favorite: !row.isFav })}
                    avatar={
                      <div className="relative flex-shrink-0">
                        {/* Stack visual — duas folhas atrás criando profundidade */}
                        <span className="absolute -bottom-0.5 -right-0.5 w-12 h-12 rounded-lg bg-amber-200/60 dark:bg-amber-900/40 rotate-3" />
                        <span className="absolute -bottom-0.5 right-0 w-12 h-12 rounded-lg bg-amber-300/70 dark:bg-amber-800/50 -rotate-2" />
                        <div className="relative w-12 h-12 rounded-lg bg-gradient-to-br from-amber-300 to-amber-400 dark:from-amber-500 dark:to-amber-700 shadow-md overflow-hidden flex items-center justify-center">
                          <div className="absolute inset-0 flex flex-col justify-center gap-[3px] px-2 opacity-40">
                            <span className="block h-[2px] rounded-full bg-amber-900/80 dark:bg-amber-50/80 w-3/4" />
                            <span className="block h-[2px] rounded-full bg-amber-900/80 dark:bg-amber-50/80 w-full" />
                            <span className="block h-[2px] rounded-full bg-amber-900/80 dark:bg-amber-50/80 w-2/3" />
                            <span className="block h-[2px] rounded-full bg-amber-900/80 dark:bg-amber-50/80 w-5/6" />
                          </div>
                          <StickyNote className="relative w-[22px] h-[22px] text-amber-900 dark:text-amber-50 drop-shadow-sm" />
                        </div>
                      </div>
                    }
                  />
                );
              }

              // ── Canal / grupo / DM ──
              const c = row.channel;
              const isOmnx = c.name === "omnx-bot" && c.is_system;
              const isSelected = !notesView && !claraView && selectedChannelId === c.id;
              const last = lastMessagesMap?.get(c.id);
              const unread = row.unread;

              // Pessoa → círculo; grupo/canal → quadrado arredondado. É a
              // distinção visual que o GT3 já usava e que continua valendo: o
              // formato do avatar diz, antes da leitura, se é gente ou espaço.
              const avatar = isOmnx ? (
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center shadow-sm">
                    <Sparkles className="w-[22px] h-[22px]" />
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center">
                    <span className="text-[8px] font-bold text-primary">AI</span>
                  </span>
                </div>
              ) : c.is_dm ? (
                <AvatarBadge
                  name={(c as any).display_name || c.name}
                  avatarUrl={(c as any).display_avatar}
                  size="lg"
                  className="w-12 h-12 flex-shrink-0"
                />
              ) : c.avatar_url ? (
                <img src={c.avatar_url} alt={c.name} className="w-12 h-12 rounded-lg object-cover border border-border flex-shrink-0" />
              ) : (
                <ChannelAvatar name={c.name} size="xl" />
              );

              const title = isOmnx
                ? "OMNX Bot"
                : c.is_dm
                  ? ((c as any).display_name || "Conversa")
                  : c.name;

              // ── Prévia da última linha ──
              let preview: React.ReactNode;
              const activity = typingByChannel.get(c.id);
              if (c.is_dm && isBirthdayToday((c as any).other_birth_date)) {
                preview = (
                  <span className="truncate flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                    <span aria-hidden="true">🎉</span>
                    <span className="truncate">Aniversário hoje</span>
                  </span>
                );
              } else if (activity) {
                // Alguém digitando/gravando vence o preview: é informação do
                // agora, o preview é do passado.
                const isAudioAct = activity.action === "recording_audio" || activity.action === "uploading_audio";
                const actLabel = activity.action === "uploading_image" ? "enviando uma foto"
                  : activity.action === "uploading_video" ? "enviando um vídeo"
                  : activity.action === "uploading_audio" ? "enviando um áudio"
                  : activity.action === "uploading_file" ? "enviando um arquivo"
                  : activity.action === "recording_audio" ? "gravando um áudio"
                  : "digitando";
                preview = (
                  <span className="truncate flex items-center gap-1.5 text-primary">
                    {isAudioAct ? (
                      <Mic className="chat-mic-pulse w-3.5 h-3.5 flex-shrink-0" />
                    ) : (
                      <span className="flex items-center gap-0.5 flex-shrink-0" aria-hidden>
                        <span className="chat-typing-dot h-1 w-1 rounded-full bg-primary" />
                        <span className="chat-typing-dot h-1 w-1 rounded-full bg-primary" />
                        <span className="chat-typing-dot h-1 w-1 rounded-full bg-primary" />
                      </span>
                    )}
                    <span className="truncate font-medium">
                      {c.is_dm ? actLabel : `${activity.name.split(" ")[0]} ${actLabel}`}
                    </span>
                  </span>
                );
              } else if (isOmnx && omnxThinking && isSelected) {
                preview = <span className="truncate">Pensando...</span>;
              } else if (draftsByChannel[c.id] && !isSelected) {
                preview = (
                  <span className="truncate flex items-center gap-1">
                    <span className="text-amber-600 dark:text-amber-400 font-semibold flex-shrink-0">rascunho:</span>
                    <span className="truncate">{draftsByChannel[c.id].slice(0, 40)}</span>
                  </span>
                );
              } else if (last) {
                // Ícone + rótulo do tipo de anexo, para o card indicar o que foi
                // enviado mesmo quando a mensagem não é texto.
                const atts = Array.isArray(last.attachments) ? last.attachments : [];
                const firstAtt = atts[0];
                const attType = (firstAtt?.type || "") as string;
                let AttIcon: typeof ImageIcon | null = null;
                let attLabel = "";
                if (firstAtt) {
                  if (attType.startsWith("image/")) { AttIcon = ImageIcon; attLabel = "Imagem"; }
                  else if (attType.startsWith("video/")) { AttIcon = Video; attLabel = "Vídeo"; }
                  else if (attType.startsWith("audio/")) { AttIcon = Mic; attLabel = "Áudio"; }
                  else if (attType === "task") { AttIcon = CheckSquare; attLabel = "Tarefa"; }
                  else if (attType === "meeting_invite") { AttIcon = Video; attLabel = "Reunião"; }
                  else if (attType === "huddle") { AttIcon = PhoneIcon; attLabel = "Chamada"; }
                  else if (attType === "poll") { AttIcon = BarChart3; attLabel = "Enquete"; }
                  else if (attType === "feed_post") { AttIcon = Megaphone; attLabel = "Publicação"; }
                  else { AttIcon = Paperclip; attLabel = "Anexo"; }
                }
                const placeholderRe = /^(\[imagem\]|\[vídeo\]|\[áudio\]|\[anexo\])$/i;
                const caption = (!last.content || placeholderRe.test(last.content)) ? "" : last.content;
                const previewText = (caption || attLabel || last.content || "").slice(0, 60);
                // Status da minha última mensagem em DM, estilo WhatsApp:
                //   ✓ cinza  → enviado · ✓✓ cinza → entregue · ✓✓ azul → lido
                const isMyLast = last.author_id === profile?.user_id;
                const showReadTicks = c.is_dm && isMyLast && !isOmnx;
                const sentMs = new Date(last.created_at).getTime();
                const otherReadAt = othersReadsMap?.get(c.id) ?? null;
                const wasRead = !!otherReadAt && new Date(otherReadAt).getTime() >= sentMs;
                const otherId = (c as any).other_user_id as string | undefined;
                const pres = otherId ? presence?.get(otherId) : undefined;
                const wasDelivered = wasRead || !!pres?.online
                  || (!!pres?.lastSeenAt && new Date(pres.lastSeenAt).getTime() >= sentMs);
                // Quem falou: em DM os ticks já dizem que a última é minha, então
                // o prefixo só aparece quando não há ticks.
                const authorPrefix = isMyLast
                  ? "Você:"
                  : isOmnx
                    ? "OMNX:"
                    : c.is_dm
                      ? ""
                      : `${last.author_name?.split(" ")[0] || "—"}:`;
                preview = (
                  <span className="flex items-center gap-1 min-w-0">
                    {showReadTicks && (
                      wasRead ? (
                        <CheckCheck className="w-4 h-4 flex-shrink-0 text-chat-check-read" strokeWidth={2.75} aria-label="Lido" />
                      ) : wasDelivered ? (
                        <CheckCheck className="w-4 h-4 flex-shrink-0 opacity-60" aria-label="Entregue" />
                      ) : (
                        <Check className="w-4 h-4 flex-shrink-0 opacity-60" aria-label="Enviado" />
                      )
                    )}
                    {!showReadTicks && authorPrefix && (
                      <span className="flex-shrink-0">{authorPrefix}</span>
                    )}
                    {AttIcon && <AttIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-70" aria-label={attLabel} />}
                    <span className="truncate">{previewText}</span>
                  </span>
                );
              } else {
                preview = (
                  <span className="truncate">
                    {isOmnx ? "Assistente operacional" : c.is_dm ? "Sem mensagens" : "Nenhuma mensagem ainda"}
                  </span>
                );
              }

              return (
                <ChatListRow
                  key={row.key}
                  selected={isSelected}
                  onClick={() => selectChannel(c.id)}
                  avatar={avatar}
                  title={title}
                  titleClassName={!c.is_dm && !isOmnx ? "capitalize" : undefined}
                  time={last ? formatChatPreviewTime(last.created_at) : undefined}
                  unread={unread}
                  muted={mutedSet?.has(c.id)}
                  preview={preview}
                  pinned={row.isFav}
                  onTogglePin={() => toggleFavorite.mutate({ channelId: c.id, favorite: !row.isFav })}
                  birthday={row.isBday}
                  onCongratulate={row.isBday ? () => congratulate(c) : undefined}
                />
              );
            });
          })()}
        </div>

        {/* FAB de nova conversa (mobile). O único ponto de entrada até agora
            era um "+" de ~24px escondido ao lado do título de uma seção — alvo
            pequeno demais e sem nenhuma pista visual de que ali se começa uma
            conversa. Ancorado no <aside>, que já termina acima da BottomNav. */}
        {isAdmin || isManager ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="md:hidden absolute bottom-4 right-4 z-20 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
                aria-label="Nova conversa"
              >
                <MessageSquarePlus className="w-6 h-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-48">
              <DropdownMenuItem onSelect={() => setDmOpen(true)}>
                <MessageSquare className="w-4 h-4 mr-2" /> Nova conversa
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
                <Users className="w-4 h-4 mr-2" /> Criar grupo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            onClick={() => setDmOpen(true)}
            className="md:hidden absolute bottom-4 right-4 z-20 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Nova conversa"
          >
            <MessageSquarePlus className="w-6 h-6" />
          </button>
        )}
      </aside>

                {/* Input de avatar do canal — vive AQUI, fora do painel de detalhes.
          Antes morava dentro de `{infoPanelOpen && ...}`, que só monta em telas
          grandes: no celular o "Trocar foto" do diálogo de edição chamava
          getElementById e não achava nada, falhando calado. */}
      <input
        id="channel-avatar-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (ev) => {
          const f = ev.target.files?.[0];
          if (!f || !channel) return;
          setUploadingAvatar(true);
          try {
            const url = await uploadChannelAvatar(channel.id, f);
            await updateChannel.mutateAsync({ id: channel.id, avatar_url: url });
            toast.success("Foto atualizada");
          } catch (e: any) {
            toast.error(e.message || "Erro ao enviar foto");
          } finally {
            setUploadingAvatar(false);
            ev.target.value = "";
          }
        }}
      />

      {/* ─── Conteúdo Principal ─── */}
      <main className={cn(
        "flex-1 flex flex-col min-w-0 min-h-0",
        !selectedChannelId && !notesView && !claraView && "hidden md:flex"
      )}>
        {claraView && aiEnabled ? (
          <>
            {/* Header da conversa fixa da Clara */}
            <div className="px-3 md:px-6 py-3 border-b border-border bg-card">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => { setClaraView(false); navigate("/chat"); }}
                  className="md:hidden -ml-1 p-1.5 rounded-md hover:bg-muted text-foreground flex-shrink-0"
                  aria-label="Voltar"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <CamiAvatar className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base font-semibold text-foreground truncate">Clara</h1>
                  <p className="text-2xs text-muted-foreground truncate">Assistente de IA · tira dúvidas, acha processos e ajuda nas tarefas</p>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ClaraConversation variant="page" channelId={selectedChannelId} />
            </div>
          </>
        ) : notesView ? (
          <NotesView />
        ) : (
        <>
        {channel && (
          <div className="px-3 md:px-6 py-3 border-b border-border bg-card">
            <div className="flex items-center justify-between gap-3">
              {/* Voltar (mobile) + identidade da conversa */}
              <div className="flex items-center gap-1 md:gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => { setSelectedChannelId(null); navigate("/chat"); }}
                  className="md:hidden -ml-1 p-1.5 rounded-md hover:bg-muted text-foreground flex-shrink-0"
                  aria-label="Voltar"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                {/* Avatar + nome + status formam UM alvo clicável só, como no
                    WhatsApp: tocar em qualquer parte da identidade abre os dados
                    da conversa. Antes o único ponto de entrada era o "N membros"
                    — um link de 12px que não parecia clicável, e que nem existia
                    em DMs. Precisa ser um <button> ÚNICO (nada de button dentro
                    de button, que é HTML inválido e quebra o teclado). */}
                <button
                  type="button"
                  onClick={() => { if (isMobile) setInfoDrawerOpen(true); else setInfoPanelOpen(true); }}
                  className="flex items-center gap-2 md:gap-3 min-w-0 flex-1 text-left rounded-md px-1 -mx-1 py-0.5 hover:bg-muted/60 transition-colors"
                  aria-label={`Ver dados de ${channel.is_dm ? (channel.display_name || "conversa") : channel.name}`}
                >
                  {channel.is_dm ? (
                    <div className="relative flex-shrink-0">
                      <AvatarBadge
                        name={channel.display_name || channel.name}
                        avatarUrl={channel.display_avatar}
                        size="md"
                      />
                      {channel.other_user_id && presence?.get(channel.other_user_id)?.online && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success rounded-full ring-2 ring-card" />
                      )}
                    </div>
                  ) : channel.avatar_url ? (
                    <img
                      src={channel.avatar_url}
                      alt=""
                      className="w-9 h-9 rounded-md object-cover flex-shrink-0 border border-border"
                    />
                  ) : (
                    <ChannelAvatar name={channel.name} size="md" />
                  )}
                  <div className="min-w-0">
                    <h1 className={cn(
                      "text-base font-semibold text-foreground truncate leading-tight",
                      !channel.is_dm && "capitalize"
                    )}>
                      {channel.is_dm
                        ? (channel.display_name || "Conversa")
                        : channel.name}
                    </h1>
                    {/* Segunda linha: presença na DM, contagem de membros no grupo.
                        O status saiu de ao lado do nome para debaixo dele — em
                        telas estreitas os dois competiam pela mesma linha e o
                        nome era truncado cedo demais. */}
                    {channel.is_dm ? (() => {
                      const otherId = channel.other_user_id;
                      const p = otherId ? presence?.get(otherId) : undefined;
                      if (p?.online) {
                        return (
                          <p className="text-xs text-success truncate flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                            online
                          </p>
                        );
                      }
                      if (p?.lastSeenAt) {
                        return (
                          <p className="text-xs text-muted-foreground truncate">
                            visto por último {formatLastSeen(p.lastSeenAt)}
                          </p>
                        );
                      }
                      const emp = otherId ? (employees || []).find((e) => e.user_id === otherId) : null;
                      const parts: string[] = [];
                      if (emp?.position_title) parts.push(emp.position_title);
                      const team = emp?.subarea_name || emp?.area_name;
                      if (team) parts.push(team);
                      return (
                        <p className="text-xs text-muted-foreground truncate">
                          {parts.length > 0 ? parts.join(" · ") : "Mensagem direta"}
                        </p>
                      );
                    })() : (
                      <p className="text-xs text-muted-foreground truncate">
                        {members.length} membro{members.length !== 1 ? "s" : ""}
                        {channel.description && ` · ${channel.description}`}
                      </p>
                    )}
                  </div>
                </button>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {activeHuddle ? (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 px-3 text-xs bg-green-600 hover:bg-green-700"
                    onClick={() => navigate(`/chat/${channel.id}/huddle`)}
                    title="Entrar na chamada"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" />
                    Entrar
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title="Iniciar chamada"
                        disabled={startHuddle.isPending}
                      >
                        <PhoneIcon className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-sm">
                      <AlertDialogHeader>
                        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-1">
                          Iniciar chamada
                        </div>
                        <AlertDialogTitle className="text-base">
                          {channel.is_dm
                            ? `Chamar ${(channel as any).display_name || "este contato"}?`
                            : `Iniciar chamada em # ${channel.name}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs">
                          {channel.is_dm
                            ? "Será aberta uma sala de áudio. A outra pessoa receberá uma notificação para entrar."
                            : "Os membros do canal poderão entrar na chamada a qualquer momento. A sala fica ativa enquanto houver participantes."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={startHuddle.isPending}>
                          Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction
                          disabled={startHuddle.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            startHuddle.mutate(channel.id, {
                              onSuccess: () => navigate(`/chat/${channel.id}/huddle`),
                              onError: (err: any) =>
                                toast.error(err.message || "Erro ao iniciar chamada"),
                            });
                          }}
                          className="gap-1.5"
                        >
                          {startHuddle.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Video className="w-3.5 h-3.5" />
                          )}
                          Iniciar agora
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {searchOpen ? (
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={searchInChannel}
                      onChange={(e) => setSearchInChannel(e.target.value)}
                      placeholder="Buscar..."
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setSearchOpen(false); setSearchInChannel(""); }
                      }}
                      className="h-8 w-36 sm:w-56 pl-8 pr-7 text-xs"
                    />
                    <button
                      onClick={() => { setSearchOpen(false); setSearchInChannel(""); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground"
                    onClick={() => { if (isMobile) setInfoDrawerOpen(true); else setSearchOpen(true); }}
                    title="Buscar"
                    aria-label="Buscar nesta conversa"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </Button>
                )}
                {/* Silenciar — atalho direto no header (grupo e DM). Antes só
                    existia enterrado no painel de detalhes e ninguém achava. */}
                {isCurrentMuted ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-primary bg-primary/10 hover:bg-primary/20"
                    onClick={() => {
                      if (!selectedChannelId) return;
                      toggleMute.mutate({ channelId: selectedChannelId, mute: false });
                    }}
                    disabled={toggleMute.isPending}
                    title="Silenciado · clique para reativar as notificações"
                    aria-label="Reativar notificações desta conversa"
                  >
                    <BellOff className="w-4 h-4" />
                  </Button>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground"
                        disabled={toggleMute.isPending}
                        title="Silenciar conversa"
                        aria-label="Silenciar esta conversa"
                      >
                        <Bell className="w-4 h-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-56 p-1">
                      <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide px-2 py-1.5">
                        Silenciar por
                      </div>
                      {MUTE_OPTIONS.map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => {
                            if (!selectedChannelId) return;
                            toggleMute.mutate({
                              channelId: selectedChannelId,
                              mute: true,
                              durationHours: opt.h,
                            });
                          }}
                          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
                {!channel.is_dm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex h-8 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={() => { if (isMobile) setInfoDrawerOpen(true); else setInfoPanelOpen(true); }}
                    title="Ver membros"
                    aria-label={`Ver os ${members.length} membros do grupo`}
                  >
                    <Users className="w-3.5 h-3.5" /> {members.length}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { if (isMobile) setInfoDrawerOpen(true); else setInfoPanelOpen((v) => !v); }}
                  className={cn(
                    "flex h-8 w-8 p-0",
                    infoPanelOpen ? "text-primary bg-primary/10" : "text-muted-foreground"
                  )}
                  title={infoPanelOpen ? "Fechar detalhes" : "Detalhes da conversa"}
                >
                  {infoPanelOpen
                    ? <ChevronRight className="w-4 h-4" />
                    : <ChevronLeft className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            {/* Banner de chamada ativa */}
            {activeHuddle && (
              <div className="border-b border-border bg-green-50 dark:bg-green-950/30 px-4 py-2 flex items-center gap-2">
                <span className="relative flex-shrink-0">
                  <span className="absolute inset-0 rounded-full bg-green-500/30 animate-ping" />
                  <span className="relative w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center">
                    <Video className="w-3.5 h-3.5" />
                  </span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                    Chamada em andamento
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    Iniciada {formatLastSeen(activeHuddle.started_at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-7 gap-1 px-3 text-xs bg-green-600 hover:bg-green-700"
                  onClick={() => navigate(`/chat/${selectedChannelId}/huddle`)}
                >
                  <Video className="w-3 h-3" /> Entrar
                </Button>
                {activeHuddle.started_by === profile?.user_id && (
                  <button
                    onClick={() => endHuddle.mutate(activeHuddle.id)}
                    className="p-1 rounded hover:bg-green-200/50 text-green-700"
                    title="Encerrar chamada"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Aviso de aniversário — dentro da conversa, para quem abriu a DM
                sem passar pela lista. Só aparece no dia e some sozinho. */}
            {channel?.is_dm && isBirthdayToday((channel as any).other_birth_date) && (
              <div className="border-b border-amber-300/60 dark:border-amber-500/25 bg-gradient-to-r from-amber-100/90 to-amber-50/50 dark:from-amber-500/15 dark:to-amber-500/5 px-4 py-2 flex items-center gap-2.5">
                <span className="text-base leading-none flex-shrink-0" aria-hidden="true">🎂</span>
                <p className="flex-1 min-w-0 truncate text-[13px] font-medium text-amber-900 dark:text-amber-200">
                  Hoje é aniversário de{" "}
                  <strong className="font-semibold">
                    {String((channel as any).display_name || "").trim().split(/\s+/)[0] || "quem está do outro lado"}
                  </strong>
                </p>
                <button
                  type="button"
                  onClick={() => congratulate(channel)}
                  className="flex-shrink-0 h-7 px-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold transition-colors"
                >
                  Parabenizar
                </button>
              </div>
            )}

            {/* Barra de mensagem fixada */}
            {pinned.length > 0 && (
              <div className="border-b border-border bg-amber-50 dark:bg-amber-950/30 px-4 py-2 flex items-center gap-2">
                <Pin className="w-3.5 h-3.5 text-amber-600 fill-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                  const el = document.getElementById(`msg-${pinned[0].message_id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}>
                  <span className="text-2xs text-amber-700 dark:text-amber-400 font-semibold">📌 Fixada</span>
                  <p className="text-xs text-foreground truncate">
                    {(pinned[0] as any).chat_messages?.content?.slice(0, 100) || "(mensagem fixada)"}
                  </p>
                </div>
                {pinned.length > 1 && (
                  <span className="text-2xs text-amber-700">+{pinned.length - 1}</span>
                )}
                <button
                  onClick={() => unpinMsg.mutate(pinned[0].message_id)}
                  className="p-1 rounded hover:bg-amber-200/50 text-amber-700"
                  title="Desafixar"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {/* Wrapper posicionado: o botão de "voltar ao fim" flutua sobre a
                lista e precisa de um ancestral `relative` que tenha a altura
                dela. */}
            <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              ref={messagesScrollRef}
              onScroll={handleMessagesScroll}
              className="chat-canvas flex-1 min-h-0 overflow-y-auto px-3 md:px-6 py-4 space-y-1"
            >
              {hasMore && messages.length > 0 && (
                <div className="flex justify-center py-2">
                  <button
                    onClick={() => loadOlder()}
                    className="text-2xs font-medium text-primary hover:bg-primary/5 rounded-full px-3 py-1.5 border border-primary/20 transition-colors"
                  >
                    ↑ Carregar mensagens antigas
                  </button>
                </div>
              )}
              {loadingMessages ? (
                // Esqueleto de conversa: dá para ver que ALGO está vindo, em vez
                // de olhar para um "seja o primeiro a falar" que pode ser falso.
                <div className="py-4 space-y-4" aria-busy="true" aria-label="Carregando mensagens">
                  {[68, 45, 80, 52, 72].map((w, i) => (
                    <div key={i} className={cn("flex gap-2", i % 2 ? "justify-end" : "justify-start")}>
                      {i % 2 === 0 && <div className="w-8 h-8 rounded-full bg-muted animate-pulse flex-shrink-0" />}
                      <div
                        className="h-14 rounded-2xl bg-muted animate-pulse max-w-[75%]"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  ))}
                </div>
              ) : messagesError ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                    <X className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-foreground">Não consegui carregar as mensagens</h2>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      A conexão falhou no meio do caminho. Suas mensagens estão salvas — é só tentar de novo.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => refetchMessages()}>
                    Tentar de novo
                  </Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
                  {channel?.is_dm ? (
                    <>
                      <AvatarBadge
                        name={(channel as any).display_name || channel.name}
                        avatarUrl={(channel as any).display_avatar}
                        size="lg"
                      />
                      <div className="space-y-1">
                        <h2 className="text-base font-semibold text-foreground">
                          {(channel as any).display_name || "Conversa"}
                        </h2>
                        <p className="text-sm text-muted-foreground max-w-xs">
                          Este é o começo da sua conversa com{" "}
                          <span className="font-medium text-foreground">
                            {((channel as any).display_name || "esta pessoa").split(" ")[0]}
                          </span>
                          . Ainda não há mensagens — diga olá! 👋
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      {channel?.avatar_url ? (
                        <img
                          src={channel.avatar_url}
                          alt={channel.name}
                          className="w-14 h-14 rounded-md object-cover border border-border"
                        />
                      ) : channel ? (
                        <ChannelAvatar name={channel.name} size="lg" />
                      ) : null}
                      <div className="space-y-1">
                        <h2 className={cn("text-base font-semibold text-foreground", !channel?.is_system && "capitalize")}>
                          {channel?.name}
                        </h2>
                        <p className="text-sm text-muted-foreground max-w-xs">
                          Nenhuma mensagem ainda. Seja o primeiro a falar neste {channel?.is_system ? "canal" : "grupo"}.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                messages
                  .filter((m) => !searchInChannel.trim() || m.content.toLowerCase().includes(searchInChannel.toLowerCase()))
                  .map((m, i, arr) => {
                  const prev = arr[i - 1];
                  const showDay = !prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at));
                  // bloco: mesma autoria + < 5min do anterior
                  const sameBlock = prev
                    && prev.author_id === m.author_id
                    && !showDay
                    && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000;
                  const isMine = m.author_id === meId;
                  // isLastMine = última mensagem da conversa (de qualquer um)
                  const isLastMine = i === arr.length - 1;
                  const reactionMap = reactionsByMessage.get(m.id);
                  const parent = m.parent_id ? messages.find((x) => x.id === m.parent_id) : null;
                  const poll = (polls as any[]).find((p: any) => p.message_id === m.id);
                  // Entregue: algum outro membro está/esteve online após o envio
                  const sentMs = new Date(m.created_at).getTime();
                  const deliveredToAny = (members || []).some((mb: any) => {
                    if (mb.user_id === m.author_id) return false;
                    const p = presence?.get(mb.user_id);
                    if (p?.online) return true;
                    if (p?.lastSeenAt && new Date(p.lastSeenAt).getTime() >= sentMs) return true;
                    return false;
                  });
                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div className="sticky top-0 z-10 flex items-center justify-center my-4 pointer-events-none">
                          <span className="text-2xs text-chat-meta bg-chat-bubble-in/95 backdrop-blur px-3 py-1 rounded-full tabular-nums shadow-sm">
                            {formatChatDayLabel(m.created_at) || format(new Date(m.created_at), "EEE · dd MMM", { locale: ptBR })}
                          </span>
                        </div>
                      )}
                      <MessageRow
                        message={m}
                        isMine={isMine}
                        sameBlock={sameBlock}
                        parent={parent}
                        editing={editingMsgId === m.id}
                        editingText={editingMsgText}
                        onEditStart={() => { setEditingMsgId(m.id); setEditingMsgText(m.content); }}
                        onEditChange={setEditingMsgText}
                        onEditCancel={() => { setEditingMsgId(null); setEditingMsgText(""); }}
                        onEditSave={() => {
                          updateMessage.mutate(
                            { id: m.id, content: editingMsgText },
                            { onSuccess: () => { setEditingMsgId(null); setEditingMsgText(""); } }
                          );
                        }}
                        onReply={() => setReplyTo(m)}
                        onPin={() => pinMsg.mutate({ messageId: m.id, channelId: m.channel_id })}
                        onUnpin={pinned.some((p: any) => p.message_id === m.id) ? () => unpinMsg.mutate(m.id) : undefined}
                        isPinned={pinned.some((p: any) => p.message_id === m.id)}
                        onStar={() => toggleStar.mutate({ messageId: m.id, star: !starredSet?.has(m.id) })}
                        isStarred={starredSet?.has(m.id) || false}
                        onForward={() => { setForwardMsg(m); setForwardOpen(true); }}
                        onCreateTask={() => {
                          setTaskTitle("");
                          setTaskDescription(m.content || "");
                          setTaskAssigneeIds([]);
                          setTaskDueDate("");
                          setTaskPriority("medium");
                          setTaskProjectId("");
                          setTaskChecklistItems([]);
                          setTaskDialogOpen(true);
                        }}
                        onAskCami={aiEnabled ? () => {
                          setCamiContext({
                            type: "suggest_reply",
                            message_text: m.content || "",
                            author_name: userProfileMap.get(m.author_id)?.name,
                          });
                          setCamiOpen(true);
                        } : undefined}
                        onShowReads={isMine ? () => setReadReceiptsFor(m) : undefined}
                        memberReads={memberReads}
                        meId={meId}
                        isDm={!!channel?.is_dm}
                        onOpenLightbox={(a) => setLightbox(a)}
                        reactions={reactionMap}
                        userProfileMap={userProfileMap}
                        onReact={(emoji) => toggleReaction.mutate({ messageId: m.id, emoji })}
                        onDelete={isMine ? () => remove.mutate(m.id) : undefined}
                        emojiOpen={emojiOpen === m.id}
                        setEmojiOpen={(v) => setEmojiOpen(v ? m.id : null)}
                        poll={poll}
                        onVotePoll={(option_idx: number) =>
                          poll && votePoll.mutate({ poll_id: poll.id, option_idx })
                        }
                        onShowPollVoters={(option_idx: number) =>
                          poll && setPollVotersFor({ poll, optionIdx: option_idx })
                        }
                        deliveredToAny={deliveredToAny}
                        isLastMine={isLastMine}
                      />
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Voltar ao fim. Com mensagens novas vira pílula contada; sem elas,
                é só um botão redondo — o atalho vale mesmo sem novidade.
                Vive DENTRO do wrapper da lista, não num irmão de altura zero
                como antes: ali o `absolute bottom-2` ancorava num elemento sem
                altura, e o botão caía atrás do composer. */}
            {(unreadBelow > 0 || showJumpToEnd) && (
              <button
                type="button"
                onClick={() => scrollToBottom("smooth")}
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 bottom-3 z-20 flex items-center gap-1.5",
                  "rounded-full shadow-lg transition-all hover:scale-105 active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  unreadBelow > 0
                    ? "bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                    : "h-10 w-10 justify-center bg-card text-foreground border border-border"
                )}
                aria-label={
                  unreadBelow > 0
                    ? `Ir para ${unreadBelow} ${unreadBelow === 1 ? "mensagem nova" : "mensagens novas"}`
                    : "Ir para a mensagem mais recente"
                }
              >
                <ChevronDown className="h-4 w-4" />
                {unreadBelow > 0 && (
                  <>{unreadBelow} {unreadBelow === 1 ? "mensagem nova" : "mensagens novas"}</>
                )}
              </button>
            )}
            </div>

            {/* Indicador "digitando..." */}
            {typers.length > 0 && (() => {
              // Balão com pontinhos, como no WhatsApp. Quem grava ou envia
              // áudio ganha um microfone pulsando no lugar dos pontos — a ação
              // é diferente e merece sinal diferente.
              const isAudio = typers.some(
                (t) => t.action === "recording_audio" || t.action === "uploading_audio",
              );
              const verb = (a: string) => {
                if (a === "uploading_image") return "está enviando uma foto";
                if (a === "uploading_video") return "está enviando um vídeo";
                if (a === "uploading_audio") return "está enviando um áudio";
                if (a === "uploading_file") return "está enviando um arquivo";
                if (a === "recording_audio") return "está gravando um áudio";
                return "está digitando";
              };
              const label = (() => {
                if (typers.length === 1) return `${typers[0].name} ${verb(typers[0].action)}`;
                const allSame = typers.every((t) => t.action === typers[0].action);
                if (allSame) {
                  const names = typers.slice(0, 2).map((t) => t.name).join(", ");
                  return `${names} ${verb(typers[0].action).replace("está", "estão")}`;
                }
                return `${typers.slice(0, 2).map((t) => t.name).join(", ")} estão ativos`;
              })();
              return (
                <div className="bg-chat-canvas flex items-center gap-2 px-3 md:px-6 pt-1 pb-2">
                  <span
                    className="chat-bubble-in relative inline-flex items-center gap-1 rounded-xl rounded-tl-none bg-chat-bubble-in px-3 py-2 shadow-sm"
                    aria-hidden
                  >
                    {isAudio ? (
                      <Mic className="chat-mic-pulse h-4 w-4 text-primary" />
                    ) : (
                      <>
                        <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-chat-meta" />
                        <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-chat-meta" />
                        <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-chat-meta" />
                      </>
                    )}
                  </span>
                  <span className="text-2xs text-chat-meta" aria-live="polite">{label}</span>
                </div>
              );
            })()}

            <div
              className={cn(
                "px-3 md:px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:pb-4 pt-2 bg-chat-composer relative",
                dragging && "outline outline-2 outline-primary/50 outline-offset-[-8px] bg-primary/5"
              )}
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
              onDragOver={(e) => { e.preventDefault(); }}
              onDragLeave={(e) => {
                if ((e.target as HTMLElement).contains(e.relatedTarget as Node)) return;
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
              }}
            >
              {/* Banner GRANDE de gravação de áudio */}
              {recording && (
                <div className="mb-2 flex items-center gap-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 shadow-sm">
                  <div className="relative flex-shrink-0">
                    <span className="absolute inset-0 rounded-full bg-destructive/30 animate-ping" />
                    <span className="relative w-10 h-10 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                      <Mic className="w-5 h-5" />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm font-semibold",
                        recordPaused ? "text-muted-foreground" : "text-destructive"
                      )}>
                        {recordPaused ? "Pausado" : "Gravando áudio..."}
                      </span>
                      <span className={cn(
                        "text-sm tabular-nums font-mono",
                        recordPaused ? "text-muted-foreground" : "text-destructive"
                      )}>
                        {Math.floor(recordTime / 60).toString().padStart(2, "0")}:{(recordTime % 60).toString().padStart(2, "0")}
                      </span>
                    </div>
                    {/* Waveform real (AnalyserNode) */}
                    <div className="flex items-center gap-1 mt-2 h-9">
                      {recordLevels.map((lvl, i) => (
                        <span
                          key={i}
                          className={cn(
                            "w-1.5 rounded-full",
                            recordPaused ? "bg-muted-foreground/40" : "bg-destructive/80"
                          )}
                          style={{
                            height: recordPaused ? "20%" : `${Math.max(10, lvl)}%`,
                            transition: "height 80ms linear",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => stopRecording(true)}
                    className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Cancelar gravação"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => (recordPaused ? resumeRecording() : pauseRecording())}
                    className="h-9 w-9 rounded-full flex items-center justify-center bg-muted text-foreground hover:bg-muted/70 transition-colors"
                    title={recordPaused ? "Retomar" : "Pausar"}
                  >
                    {recordPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <Button
                    onClick={() => stopRecording(false)}
                    size="sm"
                    className="h-9 gap-1.5 px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    <Send className="w-3.5 h-3.5" /> Enviar
                  </Button>
                </div>
              )}

              {/* Banner de resposta */}
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-muted/60 rounded-md border-l-2 border-primary">
                  <MessageSquare className="w-3 h-3 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs font-semibold text-primary truncate">Respondendo a {replyTo.author_name || "Usuário"}</p>
                    <p className="text-2xs text-muted-foreground truncate">{replyTo.content.slice(0, 80)}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Banner de edição */}
              {editingMsgId && (
                <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-md border-l-2 border-amber-500">
                  <Settings className="w-3 h-3 text-amber-600 flex-shrink-0" />
                  <p className="text-2xs font-semibold text-amber-700 flex-1">Editando mensagem</p>
                  <button onClick={() => { setEditingMsgId(null); setEditingMsgText(""); }} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Uploads em andamento */}
              {uploadingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                  {uploadingFiles.map((u, i) => (
                    <div
                      key={`up-${i}`}
                      className="w-16 h-16 rounded-md border border-dashed border-border flex flex-col items-center justify-center bg-muted/40 text-muted-foreground gap-1 px-1"
                      title={`Enviando ${u.name}`}
                    >
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-[9px] truncate w-full text-center">{u.name.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Anexos pendentes */}
              {pendingAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                  {pendingAttachments.map((a, i) => {
                    const isImg = (a.type || "").startsWith("image/");
                    return (
                      <div key={i} className="relative group">
                        {isImg ? (
                          <img src={a.url} alt={a.name} className="w-16 h-16 object-cover rounded-md border border-border" />
                        ) : (
                          <div className="w-16 h-16 rounded-md border border-border flex flex-col items-center justify-center bg-muted text-muted-foreground gap-1 px-1">
                            <Paperclip className="w-4 h-4" />
                            <span className="text-[9px] truncate w-full text-center">{a.name?.slice(0, 8) || "file"}</span>
                          </div>
                        )}
                        <button
                          onClick={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Campo de digitação sem borda: no tema escuro `--card` (12% de
                  luminância) e a barra do composer (11%) são praticamente a
                  mesma cor, então a única coisa que desenhava a pílula era o
                  contorno — um fio claro que saltava na tela. O token
                  `--chat-input` resolve pelo lado certo: a pílula é um degrau de
                  luminância acima da barra (18% no escuro, branco puro sobre o
                  bege no claro) e se define sozinha. O foco aparece como halo
                  da cor primária, não como linha. */}
              <div className="rounded-3xl bg-chat-input shadow-sm transition-all relative ring-1 ring-inset ring-border/25 focus-within:ring-primary/40 focus-within:shadow-md">
                {/* Slash commands popover */}
                {slashOpen && slashFiltered.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-72 rounded-md border border-border bg-popover shadow-lg p-1 z-20">
                    <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide px-2 py-1">Comandos</div>
                    {slashFiltered.map((s) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.cmd}
                          onClick={s.run}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded hover:bg-muted text-left"
                        >
                          <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground">{s.label}</p>
                            <p className="text-2xs text-muted-foreground truncate">{s.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Mention popover */}
                {mentionOpen && (() => {
                  const filtered = (employees || [])
                    .filter((e) => e.status === "active" && e.user_id && e.user_id !== profile?.user_id)
                    .filter((e) => !mentionQuery.trim() || (e.full_name || "").toLowerCase().includes(mentionQuery.toLowerCase()) || (e.position_title || "").toLowerCase().includes(mentionQuery.toLowerCase()))
                    .slice(0, 8);
                  return (
                    <div className="absolute bottom-full left-0 mb-1 w-72 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
                      <div className="relative border-b border-border">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          autoFocus
                          value={mentionQuery}
                          onChange={(e) => { setMentionQuery(e.target.value); setMentionIdx(0); }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") { e.preventDefault(); setMentionOpen(false); composerRef.current?.focus(); return; }
                            if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (filtered.length ? (i + 1) % filtered.length : 0)); return; }
                            if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0)); return; }
                            if ((e.key === "Enter" || e.key === "Tab") && filtered.length > 0) {
                              e.preventDefault();
                              const pick = filtered[Math.min(mentionIdx, filtered.length - 1)];
                              insertMention((pick.full_name || "Usuário").split(" ")[0], pick.user_id);
                              composerRef.current?.focus();
                            }
                          }}
                          placeholder="Buscar pessoa..."
                          className="w-full bg-transparent text-xs pl-8 pr-2 py-2 outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto p-1">
                        {filtered.length === 0 ? (
                          <div className="px-2 py-3 text-2xs text-muted-foreground text-center">Ninguém encontrado</div>
                        ) : (
                          filtered.map((e, i) => (
                            <button
                              key={e.id}
                              onClick={() => { insertMention((e.full_name || "Usuário").split(" ")[0], e.user_id); composerRef.current?.focus(); }}
                              onMouseEnter={() => setMentionIdx(i)}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm",
                                i === mentionIdx ? "bg-muted" : "hover:bg-muted"
                              )}
                            >
                              <AvatarBadge name={e.full_name || "?"} avatarUrl={e.avatar_url} size="xs" />
                              <span className="text-xs font-medium text-foreground truncate">{e.full_name}</span>
                              {e.position_title && <span className="text-2xs text-muted-foreground truncate ml-auto">{e.position_title}</span>}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex items-end gap-0.5 px-1.5 py-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
                  />

                  {/* Clipe — as ações de criação vivem atrás dele (ver
                      ComposerAttachMenu). Antes eram 7 botões numa barra fixa
                      abaixo do campo, roubando uma linha de altura de toda
                      conversa e espremendo 9 alvos de toque no celular. */}
                  <ComposerAttachMenu
                    open={attachMenuOpen}
                    onOpenChange={setAttachMenuOpen}
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                        title="Anexar e criar"
                      >
                        <Paperclip className="w-[18px] h-[18px]" />
                      </Button>
                    }
                    onFile={() => fileInputRef.current?.click()}
                    onImage={() => fileInputRef.current?.click()}
                    onPoll={!channel?.is_dm ? () => setPollDialogOpen(true) : undefined}
                    onTask={() => {
                      if (isMember) {
                        // Member só atribui a si mesmo
                        if (myEmployee) setTaskAssigneeIds([myEmployee.id]);
                      } else if (channel?.is_dm && (channel as any).other_user_id) {
                        // Pré-seleciona o destinatário em DM
                        const otherEmp = (employees || []).find((e) => e.user_id === (channel as any).other_user_id);
                        if (otherEmp) setTaskAssigneeIds([otherEmp.id]);
                      }
                      setTaskDialogOpen(true);
                    }}
                    onMeeting={() => {
                      setMeetingTitle(channel?.is_dm
                        ? `Reunião com ${(channel as any).display_name || ""}`.trim()
                        : `Reunião — ${channel?.name || ""}`.trim());
                      setMeetingMode("now");
                      const now = new Date();
                      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                      setMeetingDate(tomorrow.toISOString().slice(0, 10));
                      setMeetingTime("10:00");
                      setMeetingDialogOpen(true);
                    }}
                    onClara={aiEnabled ? () => { setCamiContext(null); setCamiOpen(true); } : undefined}
                  />

                  <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
                        title="Emoji"
                      >
                        <Smile className="w-[18px] h-[18px]" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" side="top" sideOffset={8} className="p-0 w-auto border border-border rounded-xl overflow-hidden shadow-xl">
                      <RSuspense fallback={<div className="p-6 text-xs w-[min(352px,90vw)] h-[380px] flex items-center justify-center text-muted-foreground">Carregando emojis...</div>}>
                        <EmojiPicker
                          data={emojiMartData}
                          theme={document.documentElement.classList.contains("dark") ? "dark" : "light"}
                          locale="pt"
                          previewPosition="none"
                          navPosition="top"
                          perLine={9}
                          emojiButtonSize={36}
                          emojiSize={22}
                          onEmojiSelect={(e: any) => insertEmoji(e.native)}
                        />
                      </RSuspense>
                    </PopoverContent>
                  </Popover>
                  <Textarea
                    ref={composerRef as any}
                    value={draft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    onPaste={(e) => {
                      // Colar imagem/arquivo do clipboard (Ctrl+V) — ex.: print de tela
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      const files: File[] = [];
                      for (const it of Array.from(items)) {
                        if (it.kind === "file") {
                          const f = it.getAsFile();
                          if (f) files.push(f);
                        }
                      }
                      if (files.length > 0) {
                        e.preventDefault(); // evita colar binário como texto
                        handleFiles(files);
                      }
                    }}
                    onInput={(e) => {
                      const ta = e.currentTarget;
                      ta.style.height = "auto";
                      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
                    }}
                    placeholder={
                      // Curto de propósito: o campo agora divide a linha com
                      // quatro botões, e o cabeçalho já diz com quem se fala —
                      // repetir o nome aqui era redundante e estourava a
                      // largura no celular.
                      pendingAttachments.length > 0
                        ? "Escreva uma legenda (opcional)"
                        : channel?.is_dm
                          ? "Digite uma mensagem"
                          : "Digite uma mensagem · @ menciona alguém"
                    }
                    rows={1}
                    className="flex-1 border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-sm min-h-[36px] max-h-[160px] py-1.5 px-0 overflow-y-auto placeholder:text-muted-foreground/70"
                    onKeyDown={(e) => {
                      if (mentionOpen) {
                        const filtered = (employees || [])
                          .filter((emp) => emp.status === "active" && emp.user_id && emp.user_id !== profile?.user_id)
                          .filter((emp) => !mentionQuery.trim() || (emp.full_name || "").toLowerCase().includes(mentionQuery.toLowerCase()))
                          .slice(0, 8);
                        if (e.key === "Escape") { setMentionOpen(false); return; }
                        if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (filtered.length ? (i + 1) % filtered.length : 0)); return; }
                        if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0)); return; }
                        if ((e.key === "Enter" || e.key === "Tab") && filtered.length > 0) {
                          e.preventDefault();
                          const pick = filtered[Math.min(mentionIdx, filtered.length - 1)];
                          insertMention((pick.full_name || "Usuário").split(" ")[0], pick.user_id);
                          return;
                        }
                      }
                      // Enter envia SÓ no desktop. No celular o teclado virtual
                      // não tem Shift+Enter à mão, então a única forma de quebrar
                      // linha era não conseguir: quem escrevia um texto com mais
                      // de um parágrafo mandava tudo picado, uma mensagem por
                      // linha. No mobile o Enter faz o que o teclado promete —
                      // pula linha — e o envio fica exclusivamente no botão.
                      if (e.key === "Enter" && !e.shiftKey && !mentionOpen && !isMobile) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    // Faz o teclado virtual rotular a tecla como "nova linha"
                    // no celular (e como "enviar" no desktop, onde ela envia
                    // mesmo). Sem isso o iOS/Android mostram "enviar" e a
                    // pessoa toca esperando mandar a mensagem.
                    enterKeyHint={isMobile ? "enter" : "send"}
                  />

                  {/* Um alvo só, dois papéis: mic quando não há nada para
                      enviar, enviar assim que houver. */}
                  {hasComposerContent ? (
                    <Button
                      size="sm"
                      className="h-9 w-9 p-0 rounded-full flex-shrink-0 shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
                      disabled={send.isPending}
                      onClick={handleSend}
                      title={editingMsgId ? (isMobile ? "Salvar" : "Salvar (Enter)") : (isMobile ? "Enviar" : "Enviar (Enter)")}
                    >
                      {editingMsgId ? <Check className="w-[18px] h-[18px]" /> : <Send className="w-[18px] h-[18px]" />}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 rounded-full flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Gravar áudio"
                      onClick={startRecording}
                      disabled={recording}
                    >
                      <Mic className="w-[18px] h-[18px]" />
                    </Button>
                  )}
                </div>
              </div>
              {dragging && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-primary font-medium text-sm">
                  Solte para anexar
                </div>
              )}
            </div>
          </div>

          {infoPanelOpen && channel && (
            <aside className="hidden lg:flex w-80 flex-shrink-0 border-l border-border bg-card flex-col">
              {/* Cabeçalho do painel */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInfoPanelOpen(false)}
                    className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <h3 className="text-sm font-semibold text-foreground">
                    {channel.is_dm ? "Sobre bate-papo" : channel.is_system ? "Sobre o canal" : "Sobre o grupo"}
                  </h3>
                </div>
                {!channel.is_dm && !channel.is_system && isAdmin ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => {
                        setEditName(channel.name);
                        setEditDesc(channel.description || "");
                        setEditOpen(true);
                      }}>
                        <Settings className="w-3.5 h-3.5 mr-2" /> Editar grupo
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => {
                        const input = document.getElementById("channel-avatar-input") as HTMLInputElement | null;
                        input?.click();
                      }}>
                        <ImageIcon className="w-3.5 h-3.5 mr-2" /> Trocar foto
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          if (confirm(`Apagar o grupo "${channel.name}"? Esta ação não pode ser desfeita.`)) {
                            deleteChannel.mutate(channel.id, {
                              onSuccess: () => {
                                toast.success("Grupo apagado");
                                setSelectedChannelId(null);
                                setInfoPanelOpen(false);
                              },
                              onError: (e: Error) => toast.error(e.message || "Erro ao apagar"),
                            });
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Apagar grupo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Bloco do contato/canal */}
                <div className="px-4 py-5 flex flex-col items-center gap-2 border-b border-border">
                  {channel.is_dm ? (
                    <AvatarBadge
                      name={(channel as any).display_name || "?"}
                      avatarUrl={(channel as any).display_avatar}
                      size="xl"
                    />
                  ) : channel.avatar_url ? (
                    <img src={channel.avatar_url} alt={channel.name} className="w-14 h-14 rounded-lg object-cover" />
                  ) : (
                    <ChannelAvatar name={channel.name} size="lg" />
                  )}
                  <h2 className={cn(
                    "text-base font-semibold text-foreground text-center mt-2",
                    !channel.is_dm && "capitalize"
                  )}>
                    {channel.is_dm
                      ? (channel.display_name || "Conversa")
                      : channel.name}
                  </h2>
                  {channel.is_dm
                    ? (() => {
                        const otherId = (channel as any).other_user_id;
                        const emp = otherId ? (employees || []).find((e) => e.user_id === otherId) : null;
                        if (!emp) return null;
                        return (
                          <p className="text-xs text-muted-foreground text-center">
                            {emp.position_title || ""}
                            {emp.position_title && (emp.subarea_name || emp.area_name) && " · "}
                            {emp.subarea_name || emp.area_name || ""}
                          </p>
                        );
                      })()
                    : channel.description && (
                        <p className="text-xs text-muted-foreground text-center px-2">
                          {channel.description}
                        </p>
                      )
                  }
                  {channel.is_dm && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-8 gap-1.5 text-xs text-primary hover:bg-primary/10"
                    >
                      <Plus className="w-3.5 h-3.5" /> Criar bate-papo em grupo
                    </Button>
                  )}
                </div>

                {/* Configurações */}
                <div className="px-4 py-3 border-b border-border flex flex-col gap-1">
                  {isCurrentMuted ? (
                    <button
                      onClick={() => {
                        if (!selectedChannelId) return;
                        toggleMute.mutate({ channelId: selectedChannelId, mute: false });
                      }}
                      className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm text-foreground transition-colors"
                    >
                      <BellOff className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-left">Silenciado · clique para reativar</span>
                    </button>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm text-foreground transition-colors">
                          <Volume2 className="w-4 h-4 flex-shrink-0 text-primary" />
                          <span className="flex-1 text-left">Silenciar conversa</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56 p-1">
                        <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide px-2 py-1.5">
                          Silenciar por
                        </div>
                        {MUTE_OPTIONS.map((opt) => (
                          <button
                            key={opt.label}
                            onClick={() => {
                              if (!selectedChannelId) return;
                              toggleMute.mutate({
                                channelId: selectedChannelId,
                                mute: true,
                                durationHours: opt.h ?? null,
                              });
                            }}
                            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                  <button className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm text-foreground transition-colors">
                    <Clock className="w-4 h-4 text-primary flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <div>Excluir mensagens automaticamente</div>
                      <div className="text-2xs text-muted-foreground">Nunca</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>

                {/* Atalhos */}
                <div className="px-4 py-3 border-b border-border">
                  <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-1.5">
                    {channel.is_dm ? "Usuário" : "Canal"}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm text-foreground transition-colors">
                      <Star className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="flex-1 text-left">Mensagens favoritas</span>
                      <span className="text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">0</span>
                    </button>
                    <button className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm text-foreground transition-colors">
                      <Link2 className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="flex-1 text-left">Todos os links</span>
                      <span className="text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
                        {messages.filter((m) => /https?:\/\//.test(m.content)).length}
                      </span>
                    </button>
                    {channel.is_dm && (
                      <button className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted text-sm text-foreground transition-colors">
                        <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="flex-1 text-left">Bate-papos com este usuário</span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Projetos em comum (DM) */}
                {channel.is_dm && (
                  <div className="px-4 py-3 border-b border-border">
                    <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-2 flex items-center justify-between">
                      <span>Projetos em comum · {sharedProjects.length}</span>
                    </div>
                    {sharedProjects.length === 0 ? (
                      <p className="text-2xs text-muted-foreground/70 px-2 py-1 italic">
                        Vocês não compartilham projetos.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {sharedProjects.slice(0, 5).map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => navigate(`/projetos/${p.id}`)}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted text-left transition-colors"
                          >
                            <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                              <FolderKanban className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                              <p className="text-2xs text-muted-foreground truncate">
                                {p.task_count ?? 0} tarefa{(p.task_count ?? 0) !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          </button>
                        ))}
                        {sharedProjects.length > 5 && (
                          <button
                            onClick={() => navigate("/projetos")}
                            className="text-2xs text-primary hover:underline px-2 py-1 text-left"
                          >
                            Ver todos os {sharedProjects.length} projetos...
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Reuniões em comum (DM) */}
                {channel.is_dm && (
                  <div className="px-4 py-3 border-b border-border">
                    <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-2 flex items-center justify-between">
                      <span>Reuniões em comum · {sharedMeetings.length}</span>
                    </div>
                    {sharedMeetings.length === 0 ? (
                      <p className="text-2xs text-muted-foreground/70 px-2 py-1 italic">
                        Vocês não compartilham reuniões.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {sharedMeetings.slice(0, 5).map((m: any) => {
                          const dt = m.scheduled_at ? new Date(m.scheduled_at) : null;
                          return (
                            <button
                              key={m.id}
                              onClick={() => navigate(`/reunioes`)}
                              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted text-left transition-colors"
                            >
                              <div className="w-7 h-7 rounded-md bg-info/10 text-info flex items-center justify-center flex-shrink-0">
                                <CalendarDays className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-foreground truncate">{m.title || "Reunião"}</p>
                                <p className="text-2xs text-muted-foreground truncate">
                                  {dt ? format(dt, "dd MMM · HH:mm", { locale: ptBR }) : "Sem data"}
                                </p>
                              </div>
                              <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            </button>
                          );
                        })}
                        {sharedMeetings.length > 5 && (
                          <button
                            onClick={() => navigate("/reunioes")}
                            className="text-2xs text-primary hover:underline px-2 py-1 text-left"
                          >
                            Ver todas as {sharedMeetings.length} reuniões...
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Membros do canal */}
                {!channel.is_dm && (
                  <div className="px-4 py-3 border-b border-border">
                    <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-2 flex items-center justify-between">
                      <span>Membros · {members.length}</span>
                      {isAdmin && (
                        <button
                          onClick={() => setAddMemberOpen(true)}
                          className="flex items-center gap-1 text-primary hover:underline normal-case tracking-normal text-2xs"
                          title="Adicionar membros"
                        >
                          <Plus className="w-3 h-3" /> Adicionar
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {(showAllMembers ? members : members.slice(0, 8)).map((m: any) => {
                        const online = presence?.get(m.user_id)?.online ?? false;
                        return (
                          <div key={m.user_id} className="group flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted">
                            <div className="relative">
                              <AvatarBadge name={m.full_name} avatarUrl={m.avatar_url} size="sm" />
                              {online && (
                                <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full ring-2 ring-card" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{m.full_name}</p>
                              {m.position_title && (
                                <p className="text-2xs text-muted-foreground truncate">{m.position_title}</p>
                              )}
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  if (confirm(`Remover ${m.full_name} do canal?`)) {
                                    removeMember.mutate(
                                      { channel_id: channel.id, user_id: m.user_id },
                                      { onError: (e: Error) => toast.error(e.message || "Erro") }
                                    );
                                  }
                                }}
                                className="opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                title="Remover do canal"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {members.length > 8 && (
                        <button
                          onClick={() => setShowAllMembers((v) => !v)}
                          className="text-2xs text-primary hover:underline px-2 py-1 text-left"
                        >
                          {showAllMembers ? "Mostrar menos" : `Ver todos os ${members.length} membros...`}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Arquivos e mídia */}
                {recentAttachments.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-2 flex items-center justify-between">
                      <span>Arquivos e mídia</span>
                      <button className="text-primary hover:underline normal-case tracking-normal text-2xs">Ver todos →</button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {recentAttachments.map((a, i) => (
                        <a
                          key={i}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="aspect-square rounded-md bg-muted hover:bg-muted/70 flex flex-col items-center justify-center gap-1 p-2 transition-colors"
                        >
                          <FileText className="w-5 h-5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                            {a.name || "arquivo"}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
        </>
        )}
      </main>

      {/* Detalhes/membros da conversa no MOBILE. Convive com o painel `aside`
          do desktop (infoPanelOpen) em vez de substituí-lo: aquele tem itens
          que não fazem sentido aqui (projetos e reuniões em comum, paginador de
          membros), e trocar um pelo outro seria regressão no desktop. */}
      {channel && isMobile && (
        <ChannelInfoDrawer
          open={infoDrawerOpen}
          onOpenChange={setInfoDrawerOpen}
          title={channel.is_dm ? (channel.display_name || "Conversa") : channel.name}
          avatarUrl={channel.is_dm ? channel.display_avatar : channel.avatar_url}
          subtitle={
            channel.is_dm
              ? (() => {
                  const p = channel.other_user_id
                    ? presence?.get(channel.other_user_id)
                    : undefined;
                  return p?.online ? "online · agora" : `visto por último ${formatLastSeen(p?.lastSeenAt)}`;
                })()
              : `${members.length} membro${members.length !== 1 ? "s" : ""}`
          }
          description={channel.is_dm ? null : channel.description}
          isDm={!!channel.is_dm}
          isSystem={!!channel.is_system}
          members={members}
          presence={presence}
          searchValue={searchInChannel}
          onSearchChange={setSearchInChannel}
          onSearchSubmit={() => { setSearchOpen(true); setInfoDrawerOpen(false); }}
          isAdmin={isAdmin}
          isManager={isManager}
          isMuted={isCurrentMuted}
          muteOptions={MUTE_OPTIONS}
          onToggleMute={(mute, durationHours) => {
            if (!selectedChannelId) return;
            toggleMute.mutate({ channelId: selectedChannelId, mute, durationHours });
          }}
          onAddMember={() => { setInfoDrawerOpen(false); setAddMemberOpen(true); }}
          onRemoveMember={(mb) => {
            if (confirm(`Remover ${mb.full_name} do canal?`)) {
              removeMember.mutate(
                { channel_id: channel.id, user_id: mb.user_id },
                { onError: (e: Error) => toast.error(e.message || "Erro") },
              );
            }
          }}
          onEditGroup={() => {
            setEditName(channel.name);
            setEditDesc(channel.description || "");
            setInfoDrawerOpen(false);
            setEditOpen(true);
          }}
          onChangePhoto={() => {
            const input = document.getElementById("channel-avatar-input") as HTMLInputElement | null;
            input?.click();
          }}
          onDeleteGroup={() => {
            if (confirm(`Apagar o grupo "${channel.name}"? Esta ação não pode ser desfeita.`)) {
              deleteChannel.mutate(channel.id, {
                onSuccess: () => {
                  toast.success("Grupo apagado");
                  setInfoDrawerOpen(false);
                  setSelectedChannelId(null);
                },
                onError: (e: Error) => toast.error(e.message || "Erro ao apagar"),
              });
            }
          }}
          attachments={recentAttachments}
          linksCount={messages.filter((msg) => /https?:\/\//.test(msg.content)).length}
          starredCount={messages.filter((msg) => starredSet?.has(msg.id)).length}
        />
      )}

      {/* Dialog: nova mensagem direta */}
      <Dialog open={dmOpen} onOpenChange={setDmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
                placeholder="Buscar colaborador..."
                className="pl-8 h-9"
                autoFocus
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto flex flex-col gap-0.5">
              {(employees || [])
                .filter((e) => e.status === "active" && e.user_id && e.user_id !== profile?.user_id && !isSystemBotEmployee(e))
                .filter((e) => !dmSearch.trim() || (e.full_name || "").toLowerCase().includes(dmSearch.toLowerCase()))
                .slice(0, 50)
                .map((e) => {
                  const online = e.user_id ? presence?.get(e.user_id)?.online ?? false : false;
                  return (
                    <button
                      key={e.id}
                      disabled={creatingDm}
                      onClick={() => handleStartDM(e.user_id!, e.full_name || "Usuário")}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted text-left transition-colors disabled:opacity-50"
                    >
                      <div className="relative">
                        <AvatarBadge name={e.full_name || "?"} avatarUrl={e.avatar_url} size="sm" />
                        {online && (
                          <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full ring-2 ring-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{e.full_name}</p>
                        {e.position_title && (
                          <p className="text-2xs text-muted-foreground truncate">{e.position_title}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              {(employees || []).filter((e) => e.status === "active" && e.user_id !== profile?.user_id && !isSystemBotEmployee(e)).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum colaborador disponível.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: criar enquete */}
      {/* Dialog: busca global */}
      <Dialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Buscar no chat</DialogTitle>
          </DialogHeader>
          <div className="relative border-b border-border">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="Buscar em todas as conversas..."
              className="w-full bg-transparent text-sm pl-10 pr-3 py-3 outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => { if (e.key === "Escape") setGlobalSearchOpen(false); }}
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {globalSearchQuery.trim().length < 2 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                Digite ao menos 2 caracteres para buscar.
              </div>
            ) : globalSearchFetching ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
              </div>
            ) : globalSearchHits.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                Nada encontrado para "{globalSearchQuery}".
              </div>
            ) : (
              <div className="p-1">
                {globalSearchHits.map((hit) => {
                  const isDmHit = !!hit.channel_is_dm;
                  // Destaca match (case-insensitive)
                  const lc = hit.content.toLowerCase();
                  const idx = lc.indexOf(globalSearchQuery.trim().toLowerCase());
                  const start = Math.max(0, idx - 30);
                  const snippet = hit.content.slice(start, start + 140);
                  const before = idx > start ? snippet.slice(0, idx - start) : "";
                  const match = idx >= 0 ? snippet.slice(idx - start, idx - start + globalSearchQuery.trim().length) : "";
                  const after = idx >= 0 ? snippet.slice(idx - start + globalSearchQuery.trim().length) : snippet;
                  return (
                    <button
                      key={hit.id}
                      onClick={() => {
                        selectChannel(hit.channel_id);
                        setGlobalSearchOpen(false);
                        // tenta scrollar para a mensagem após renderizar
                        setTimeout(() => {
                          const el = document.getElementById(`msg-${hit.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" });
                            el.classList.add("ring-2", "ring-primary", "rounded");
                            setTimeout(() => el.classList.remove("ring-2", "ring-primary", "rounded"), 1800);
                          }
                        }, 350);
                      }}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-md hover:bg-muted text-left"
                    >
                      {isDmHit ? (
                        <AvatarBadge name={hit.author_name || "?"} avatarUrl={hit.author_avatar} size="sm" />
                      ) : hit.channel_avatar_url ? (
                        <img src={hit.channel_avatar_url} alt={hit.channel_name || ""} className="w-9 h-9 rounded-md object-cover border border-border flex-shrink-0" />
                      ) : (
                        <ChannelAvatar name={hit.channel_name || "?"} size="md" noGroupIndicator />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {isDmHit ? (hit.author_name || "Mensagem direta") : `# ${hit.channel_name || "canal"}`}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                            {format(new Date(hit.created_at), "dd MMM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-2xs text-muted-foreground mt-0.5 line-clamp-2">
                          {!isDmHit && (
                            <span className="font-medium text-foreground/80">{(hit.author_name || "Alguém").split(" ")[0]}: </span>
                          )}
                          {idx >= 0 ? (
                            <>
                              {start > 0 && "..."}
                              {before}
                              <mark className="bg-primary/20 text-primary px-0.5 rounded-sm">{match}</mark>
                              {after}
                            </>
                          ) : snippet}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: criar reunião direto do chat */}
      <Dialog
        open={meetingDialogOpen}
        onOpenChange={(open) => {
          setMeetingDialogOpen(open);
          if (!open) {
            setMeetingTitle("");
            setMeetingMode("now");
            setMeetingDate("");
            setMeetingTime("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-4 h-4 text-primary" />
              Criar reunião
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMeetingMode("now")}
                className={cn(
                  "rounded-md border px-3 py-3 text-left transition-colors",
                  meetingMode === "now"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" /> Agora
                </div>
                <div className="text-2xs mt-0.5">Inicia imediatamente</div>
              </button>
              <button
                type="button"
                onClick={() => setMeetingMode("schedule")}
                className={cn(
                  "rounded-md border px-3 py-3 text-left transition-colors",
                  meetingMode === "schedule"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Agendar
                </div>
                <div className="text-2xs mt-0.5">Define data e hora</div>
              </button>
            </div>
            <div>
              <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Título</label>
              <Input
                autoFocus
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="Sobre o que é a reunião?"
                className="mt-1"
              />
            </div>
            {meetingMode === "schedule" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Data</label>
                  <Input
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Hora</label>
                  <Input
                    type="time"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Participantes · {(members || []).length}
              </div>
              <div className="flex items-center flex-wrap gap-1">
                {(members || []).slice(0, 6).map((mb: any) => (
                  <span
                    key={mb.user_id}
                    className="inline-flex items-center gap-1 text-2xs text-muted-foreground bg-background border border-border rounded-full pl-0.5 pr-2 py-0.5"
                  >
                    <AvatarBadge name={mb.full_name || "?"} avatarUrl={mb.avatar_url} size="xs" />
                    <span className="truncate max-w-[90px]">{(mb.full_name || "Membro").split(" ")[0]}</span>
                  </span>
                ))}
                {(members || []).length > 6 && (
                  <span className="text-2xs text-muted-foreground">+{(members || []).length - 6}</span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMeetingDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={
                !meetingTitle.trim() ||
                createMeetingFromChat.isPending ||
                !selectedChannelId ||
                (meetingMode === "schedule" && (!meetingDate || !meetingTime))
              }
              onClick={() => {
                if (!profile?.tenant_id || !profile.user_id || !selectedChannelId || !channel) return;
                const isNow = meetingMode === "now";
                const now = new Date();
                const today = now.toISOString().slice(0, 10);
                const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
                createMeetingFromChat.mutate(
                  {
                    title: meetingTitle.trim(),
                    scheduled_date: isNow ? today : meetingDate,
                    scheduled_time: isNow ? hhmm : meetingTime,
                    meeting_mode: "livekit",
                  },
                  {
                    onSuccess: async (created: any) => {
                      // Adiciona participantes (membros do canal/DM, exceto o criador)
                      const myEmp = (employees || []).find((e) => e.user_id === profile.user_id);
                      const attendees = (members || [])
                        .map((mb: any) => {
                          const emp = (employees || []).find((e) => e.user_id === mb.user_id);
                          if (!emp) return null;
                          return {
                            meeting_id: created.id,
                            employee_id: emp.id,
                            name: emp.full_name || mb.full_name || "Participante",
                            email: emp.email || null,
                            role: "required",
                          };
                        })
                        .filter(Boolean) as any[];
                      // Inclui o organizador
                      if (myEmp && !attendees.some((a) => a.employee_id === myEmp.id)) {
                        attendees.push({
                          meeting_id: created.id,
                          employee_id: myEmp.id,
                          name: myEmp.full_name || "Organizador",
                          email: myEmp.email || null,
                          role: "required",
                        });
                      }
                      if (attendees.length > 0) {
                        try {
                          await supabase
                            .from("meeting_attendees" as any)
                            .upsert(attendees, { onConflict: "meeting_id,employee_id", ignoreDuplicates: false });
                        } catch (e: any) {
                          console.warn("[chat] falha ao inserir participantes:", e?.message || e);
                        }
                      }
                      // Envia mensagem com card de convite
                      const scheduled_at = isNow
                        ? `${today} ${hhmm}`
                        : `${meetingDate} ${meetingTime}`;
                      const inviteAtt = {
                        type: "meeting_invite",
                        meeting_id: created.id,
                        room_name: created.livekit_room_name || null,
                        title: meetingTitle.trim(),
                        host_name: profile.full_name || null,
                        scheduled_at,
                        url: `/meet/${created.livekit_room_name || created.id}`,
                        name: meetingTitle.trim(),
                      } as any;
                      send.mutate(
                        { content: `📹 ${meetingTitle.trim()}`, attachments: [inviteAtt] } as any,
                        {
                          onSuccess: async () => {
                            // Notifica os outros membros
                            if (profile.tenant_id) {
                              const recipients = (members || [])
                                .map((mb: any) => mb.user_id)
                                .filter((uid: string) => uid && uid !== profile.user_id);
                              if (recipients.length > 0) {
                                const whenLabel = isNow
                                  ? "agora"
                                  : `${meetingDate.split("-").reverse().slice(0, 2).join("/")} às ${meetingTime}`;
                                try {
                                  await supabase.from("notifications" as any).insert(
                                    recipients.map((uid: string) => ({
                                      tenant_id: profile.tenant_id,
                                      user_id: uid,
                                      type: "meeting_invite_chat",
                                      title: `${profile.full_name || "Alguém"} convidou você para uma reunião`,
                                      body: `${meetingTitle.trim().slice(0, 100)} · ${whenLabel}`,
                                      link: `/chat/${selectedChannelId}`,
                                    }))
                                  );
                                } catch { /* silencioso */ }
                              }
                            }
                            setMeetingDialogOpen(false);
                            setMeetingTitle("");
                            // Se "Agora", abre a sala em nova aba
                            if (isNow && created.livekit_room_name) {
                              window.open(`/meet/${created.livekit_room_name}`, "_blank", "noopener");
                            }
                          },
                          onError: (e: any) => toast.error(e.message || "Erro ao enviar convite"),
                        }
                      );
                    },
                  }
                );
              }}
            >
              {createMeetingFromChat.isPending
                ? "Criando..."
                : meetingMode === "now"
                  ? "Iniciar agora"
                  : "Agendar e enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: criar tarefa */}
      <Dialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          setTaskDialogOpen(open);
          if (!open) {
            setTaskTitle("");
            setTaskDescription("");
            setTaskAssigneeIds([]);
            setTaskDueDate("");
            setTaskPriority("medium");
            setTaskProjectId("");
            setTaskChecklistItems([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-primary" />
              Criar tarefa
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {/* Ditar tarefa: a IA preenche os campos abaixo para revisão. */}
            <VoiceTaskRecorder
              onDraft={(draft) => {
                setTaskTitle(draft.title || taskTitle);
                setTaskDescription(draft.description || taskDescription);
                setTaskPriority(draft.priority);
                if (draft.due_date) setTaskDueDate(draft.due_date);
                if (draft.project_id) setTaskProjectId(draft.project_id);
                // Member segue sem poder atribuir a outros.
                if (!isMember && draft.assignee_ids.length > 0) setTaskAssigneeIds(draft.assignee_ids);
                setTaskChecklistItems(draft.checklist_items || []);
                if (draft.unmatched_assignees.length > 0) {
                  toast.warning(
                    `Não encontrei ${draft.unmatched_assignees.join(", ")} entre os colaboradores — escolha o responsável manualmente.`
                  );
                } else {
                  toast.success("Tarefa montada a partir do seu áudio. Revise antes de criar.");
                }
              }}
            />
            <div>
              <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Título *</label>
              <Input
                autoFocus
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="O que precisa ser feito?"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Descrição</label>
              <Textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Detalhes (opcional)"
                rows={3}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Projeto</label>
              <Select
                value={taskProjectId || "__none__"}
                onValueChange={(v) => setTaskProjectId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-9 text-sm" aria-label="Projeto">
                  <SelectValue placeholder="— Sem projeto —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem projeto —</SelectItem>
                  {(projects || []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Responsáveis</label>
                <div className="mt-1">
                  <AssigneeMultiSelect
                    value={taskAssigneeIds}
                    onChange={setTaskAssigneeIds}
                    employees={employees || []}
                    isMember={isMember}
                    memberName={myEmployee?.full_name}
                    placeholder="— Sem responsável —"
                    triggerClassName="h-9 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Vence em</label>
                <Input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Prioridade</label>
              <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-1">
                {(["low", "medium", "high", "urgent"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTaskPriority(p)}
                    className={cn(
                      "h-8 rounded-md border text-2xs font-medium capitalize transition-colors",
                      taskPriority === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {p === "low" ? "Baixa" : p === "medium" ? "Média" : p === "high" ? "Alta" : "Urgente"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaskDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!taskTitle.trim() || createTaskFromChat.isPending || !selectedChannelId}
              onClick={() => {
                if (!profile?.tenant_id || !profile.user_id || !selectedChannelId) return;
                // Member só pode atribuir a si mesmo
                const enforcedAssigneeIds = isMember
                  ? (myEmployee?.id ? [myEmployee.id] : [])
                  : taskAssigneeIds;
                const enforcedAssigneeId = enforcedAssigneeIds[0] ?? null;
                createTaskFromChat.mutate(
                  {
                    title: taskTitle.trim(),
                    description: taskDescription.trim() || null,
                    assignee_ids: enforcedAssigneeIds,
                    due_date: taskDueDate || null,
                    priority: taskPriority,
                    status: "todo",
                    created_by: profile.user_id,
                    project_id: taskProjectId || null,
                    checklist_items: taskChecklistItems.length > 0 ? taskChecklistItems : null,
                  } as any,
                  {
                    onSuccess: async (created: any) => {
                      const assigneeName =
                        (employees || []).find((e) => e.id === enforcedAssigneeId)?.full_name || null;
                      const projectName = (projects || []).find((p: any) => p.id === taskProjectId)?.name || null;
                      const taskAtt = {
                        type: "task",
                        task_id: created?.id,
                        title: taskTitle.trim(),
                        description: taskDescription.trim() || null,
                        priority: taskPriority,
                        due_date: taskDueDate || null,
                        assignee_id: enforcedAssigneeId,
                        assignee_name: assigneeName,
                        project_id: taskProjectId || null,
                        project_name: projectName,
                        url: `/tarefas?task=${created?.id || ""}`,
                        name: taskTitle.trim(),
                      } as any;
                      send.mutate(
                        { content: `📋 ${taskTitle.trim()}`, attachments: [taskAtt] } as any,
                        {
                          onSuccess: async () => {
                            // Notifica TODOS os responsáveis (exceto o próprio criador)
                            const assigneeEmps = (employees || []).filter(
                              (e) => enforcedAssigneeIds.includes(e.id) && e.user_id && e.user_id !== profile.user_id
                            );
                            for (const assigneeEmp of assigneeEmps) {
                              if (!selectedChannelId) break;
                              try {
                                // RPC SECURITY DEFINER: insere a notificação só se o responsável
                                // NÃO silenciou o canal (checagem do mute do destinatário server-side)
                                await supabase.rpc("create_chat_task_notification" as any, {
                                  p_channel_id: selectedChannelId,
                                  p_assignee_user_id: assigneeEmp.user_id,
                                  p_title: `${profile.full_name || "Alguém"} criou uma tarefa para você`,
                                  p_body: taskTitle.trim().slice(0, 140),
                                });
                              } catch { /* silencioso */ }
                            }
                            toast.success("Tarefa criada e enviada");
                            setTaskDialogOpen(false);
                            setTaskTitle("");
                            setTaskDescription("");
                            setTaskAssigneeIds([]);
                            setTaskDueDate("");
                            setTaskPriority("medium");
                            setTaskProjectId("");
                            setTaskChecklistItems([]);
                          },
                          onError: (e: any) => toast.error(e.message || "Erro ao enviar tarefa"),
                        }
                      );
                    },
                    onError: (e: any) => toast.error(e.message || "Erro ao criar tarefa"),
                  }
                );
              }}
            >
              {createTaskFromChat.isPending ? "Criando..." : "Criar e enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pollDialogOpen} onOpenChange={(open) => {
        setPollDialogOpen(open);
        if (!open) { setPollQuestion(""); setPollOptions(["", ""]); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar enquete</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Pergunta</label>
              <Input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="O que você acha?" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Opções</label>
              <div className="flex flex-col gap-1.5 mt-1">
                {pollOptions.map((o, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={o}
                      onChange={(e) => {
                        const next = [...pollOptions];
                        next[i] = e.target.value;
                        setPollOptions(next);
                      }}
                      placeholder={`Opção ${i + 1}`}
                      className="h-8 text-sm flex-1"
                    />
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))} className="p-1 text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 8 && (
                  <button
                    onClick={() => setPollOptions([...pollOptions, ""])}
                    className="text-2xs text-primary hover:underline self-start mt-1"
                  >
                    + Adicionar opção
                  </button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPollDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={
                !pollQuestion.trim() ||
                pollOptions.filter((o) => o.trim()).length < 2 ||
                createPoll.isPending
              }
              onClick={() => {
                if (!selectedChannelId) return;
                const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
                createPoll.mutate(
                  { channel_id: selectedChannelId, question: pollQuestion.trim(), options: opts },
                  {
                    onSuccess: () => {
                      toast.success("Enquete criada");
                      setPollDialogOpen(false);
                      setPollQuestion("");
                      setPollOptions(["", ""]);
                    },
                    onError: (e: any) => toast.error(e.message || "Erro ao criar enquete"),
                  }
                );
              }}
            >
              {createPoll.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cami — assistente de IA (painel lateral): só monta se a IA (OpenRouter) estiver conectada */}
      {aiEnabled && (
        <CamiPanel open={camiOpen} onOpenChange={setCamiOpen} context={camiContext} channelId={selectedChannelId} />
      )}

      {/* Lightbox: imagem/vídeo expandido */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          {/* Toolbar */}
          <div
            className="absolute top-4 right-4 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => downloadAttachment(lightbox.url, lightbox.name)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              title="Baixar"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLightbox(null)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              title="Fechar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {lightbox.name && (
            <div className="absolute top-4 left-4 max-w-[60%] truncate text-sm text-white/80">
              {lightbox.name}
            </div>
          )}
          <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
            {lightbox.type?.startsWith("video/") ? (
              <video
                src={lightbox.url}
                controls
                autoPlay
                className="max-w-[90vw] max-h-[85vh] rounded-lg"
              />
            ) : (
              <ZoomableImage key={lightbox.url} src={lightbox.url} alt={lightbox.name} />
            )}
          </div>
        </div>
      )}

      {/* Dialog: encaminhar mensagem */}
      <Dialog open={forwardOpen} onOpenChange={(o) => { setForwardOpen(o); if (!o) setForwardMsg(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Encaminhar mensagem</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {forwardMsg && (
              <div className="px-2 py-1.5 rounded bg-muted/50 border-l-2 border-primary/40 text-xs">
                <span className="font-semibold text-primary">{forwardMsg.author_name || "—"}: </span>
                <span className="text-muted-foreground">{forwardMsg.content.slice(0, 120)}</span>
              </div>
            )}
            <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">
              Selecione o destino
            </div>
            <div className="max-h-[280px] overflow-y-auto flex flex-col gap-0.5">
              {channels
                .filter((c) => c.id !== selectedChannelId)
                .map((c) => (
                  <button
                    key={c.id}
                    disabled={forward.isPending}
                    onClick={() => {
                      if (!forwardMsg) return;
                      forward.mutate(
                        { targetChannelId: c.id, sourceMessage: forwardMsg },
                        {
                          onSuccess: () => {
                            toast.success(`Encaminhado para ${c.is_dm ? (c as any).display_name : "#" + c.name}`);
                            setForwardOpen(false);
                            setForwardMsg(null);
                          },
                          onError: (e: any) => toast.error(e.message || "Erro ao encaminhar"),
                        }
                      );
                    }}
                    className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted text-left transition-colors disabled:opacity-50"
                  >
                    {c.is_dm ? (
                      <AvatarBadge name={(c as any).display_name || "?"} avatarUrl={(c as any).display_avatar} size="sm" />
                    ) : c.is_system ? (
                      <ChannelAvatar name={c.name} size="sm" noGroupIndicator />
                    ) : (
                      <GroupAvatar avatarUrl={c.avatar_url} size="md" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate capitalize">
                        {c.is_dm ? ((c as any).display_name || "Conversa") : c.name}
                      </p>
                      {!c.is_dm && c.description && (
                        <p className="text-2xs text-muted-foreground truncate">{c.description}</p>
                      )}
                    </div>
                  </button>
                ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForwardOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: quem leu a mensagem */}
      <Dialog open={!!readReceiptsFor} onOpenChange={(o) => !o && setReadReceiptsFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Visualizações</DialogTitle>
          </DialogHeader>
          {readReceiptsFor && (() => {
            const reads = (memberReads || [])
              .filter((mr: any) => mr.user_id !== readReceiptsFor.author_id)
              .map((mr: any) => ({
                ...mr,
                read: mr.last_read_at && new Date(mr.last_read_at).getTime() >= new Date(readReceiptsFor.created_at).getTime(),
              }));
            const readList = reads.filter((r) => r.read);
            const unreadList = reads.filter((r) => !r.read);
            return (
              <div className="flex flex-col gap-3 py-2">
                <p className="text-xs text-muted-foreground italic line-clamp-2 px-2 py-1.5 rounded bg-muted/50 border-l-2 border-primary/40">
                  "{readReceiptsFor.content.slice(0, 140)}"
                </p>
                {readList.length > 0 && (
                  <div>
                    <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <CheckCheck className="w-3.5 h-3.5 text-chat-check-read" strokeWidth={2.75} />
                      Lida por · {readList.length}
                    </div>
                    <div className="flex flex-col gap-1">
                      {readList.map((r: any) => (
                        <div key={r.user_id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted">
                          <AvatarBadge name={r.full_name || "?"} avatarUrl={r.avatar_url} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{r.full_name}</p>
                            <p className="text-2xs text-muted-foreground">
                              {r.last_read_at ? format(new Date(r.last_read_at), "dd/MM 'às' HH:mm", { locale: ptBR }) : "—"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {unreadList.length > 0 && (
                  <div>
                    <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-muted-foreground/60" />
                      Ainda não viu · {unreadList.length}
                    </div>
                    <div className="flex flex-col gap-1">
                      {unreadList.map((r: any) => (
                        <div key={r.user_id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted opacity-60">
                          <AvatarBadge name={r.full_name || "?"} avatarUrl={r.avatar_url} size="sm" />
                          <p className="text-xs font-medium text-foreground truncate flex-1">{r.full_name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog: votantes da enquete */}
      <Dialog open={!!pollVotersFor} onOpenChange={(o) => !o && setPollVotersFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quem votou</DialogTitle>
          </DialogHeader>
          {pollVotersFor && (() => {
            const { poll, optionIdx } = pollVotersFor;
            const voters = (poll.votes as any[])
              .filter((v) => v.option_idx === optionIdx)
              .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
            return (
              <div className="flex flex-col gap-3 py-2">
                <div className="text-xs text-muted-foreground italic line-clamp-2 px-2 py-1.5 rounded bg-muted/50 border-l-2 border-primary/40">
                  <span className="font-medium not-italic text-foreground">{poll.options[optionIdx]}</span>
                  <span className="ml-1.5">· {voters.length} {voters.length === 1 ? "voto" : "votos"}</span>
                </div>
                {voters.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sem votos nesta opção.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {voters.map((v: any) => {
                      const prof = userProfileMap?.get(v.user_id);
                      const name = prof?.name || "Membro";
                      return (
                        <div key={v.user_id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted">
                          <AvatarBadge name={name} avatarUrl={prof?.avatar || null} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{name}</p>
                            <p className="text-2xs text-muted-foreground">
                              {v.created_at ? formatLastSeen(v.created_at) : "—"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog: editar grupo */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar grupo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {/* Avatar atual + trocar */}
            <div className="flex items-center gap-3">
              {channel?.avatar_url ? (
                <img src={channel.avatar_url} alt={channel.name} className="w-14 h-14 rounded-md object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={uploadingAvatar}
                  onClick={() => {
                    const input = document.getElementById("channel-avatar-input") as HTMLInputElement | null;
                    input?.click();
                  }}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {uploadingAvatar ? "Enviando..." : "Trocar foto"}
                </Button>
                {channel?.avatar_url && (
                  <button
                    onClick={() => {
                      if (channel) updateChannel.mutate({ id: channel.id, avatar_url: null });
                    }}
                    className="text-2xs text-muted-foreground hover:text-destructive text-left"
                  >
                    Remover foto
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Descrição</label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="mt-1" />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
            {channel && !channel.is_dm && !(channel as any).is_system && channel.created_by === profile?.user_id && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 sm:mr-auto"
                onClick={() => {
                  if (!channel) return;
                  if (!confirm(`Excluir grupo "${channel.name}"? Todas as mensagens serão perdidas.`)) return;
                  deleteChannel.mutate(channel.id, {
                    onSuccess: () => {
                      toast.success("Grupo excluído");
                      setEditOpen(false);
                      setSelectedChannelId(null);
                    },
                    onError: (e: any) => toast.error(e.message || "Erro ao excluir"),
                  });
                }}
                disabled={deleteChannel.isPending}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {deleteChannel.isPending ? "Excluindo..." : "Excluir grupo"}
              </Button>
            )}
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (!channel || !editName.trim()) return;
                  updateChannel.mutate(
                    { id: channel.id, name: editName.trim(), description: editDesc.trim() || null },
                    {
                      onSuccess: () => {
                        toast.success("Grupo atualizado");
                        setEditOpen(false);
                      },
                      onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
                    }
                  );
                }}
                disabled={!editName.trim() || updateChannel.isPending}
              >
                {updateChannel.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: adicionar membros ao canal */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar membros</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={addMemberSearch}
                onChange={(e) => setAddMemberSearch(e.target.value)}
                placeholder="Buscar colaborador..."
                className="pl-8 h-9"
                autoFocus
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto flex flex-col gap-0.5">
              {(employees || [])
                .filter((e) => e.status === "active" && e.user_id)
                .filter((e) => !members.some((m: any) => m.user_id === e.user_id))
                .filter((e) => !addMemberSearch.trim() || (e.full_name || "").toLowerCase().includes(addMemberSearch.toLowerCase()))
                .slice(0, 50)
                .map((e) => {
                  const online = e.user_id ? presence?.get(e.user_id)?.online ?? false : false;
                  return (
                    <button
                      key={e.id}
                      disabled={addMember.isPending}
                      onClick={() => {
                        if (!channel) return;
                        addMember.mutate(
                          { channel_id: channel.id, user_id: e.user_id! },
                          {
                            onSuccess: () => toast.success(`${e.full_name} adicionado`),
                            onError: (err: any) => toast.error(err.message || "Erro ao adicionar"),
                          }
                        );
                      }}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted text-left transition-colors disabled:opacity-50"
                    >
                      <div className="relative">
                        <AvatarBadge name={e.full_name || "?"} avatarUrl={e.avatar_url} size="sm" />
                        {online && (
                          <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full ring-2 ring-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{e.full_name}</p>
                        {e.position_title && (
                          <p className="text-2xs text-muted-foreground truncate">
                            {e.position_title}
                            {(e.subarea_name || e.area_name) && ` · ${e.subarea_name || e.area_name}`}
                          </p>
                        )}
                      </div>
                      <Plus className="w-4 h-4 text-primary flex-shrink-0" />
                    </button>
                  );
                })}
              {(employees || []).filter((e) => e.status === "active" && e.user_id && !members.some((m: any) => m.user_id === e.user_id)).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Todos os colaboradores ativos já são membros.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddMemberOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          setNewName("");
          setNewDesc("");
          setNewMembers(new Set());
          setNewMemberSearch("");
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo grupo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex: marketing" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Descrição (opcional)</label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Sobre o que é esse grupo?" rows={2} className="mt-1" />
            </div>

            {/* Membros */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Membros · {newMembers.size + 1}</label>
                {newMembers.size > 0 && (
                  <button
                    onClick={() => setNewMembers(new Set())}
                    className="text-2xs text-muted-foreground hover:text-foreground"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Chips dos selecionados */}
              {newMembers.size > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {[...newMembers].map((uid) => {
                    const e = (employees || []).find((emp) => emp.user_id === uid);
                    if (!e) return null;
                    return (
                      <span
                        key={uid}
                        className="inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                      >
                        <AvatarBadge name={e.full_name || "?"} avatarUrl={e.avatar_url} size="xs" />
                        <span className="truncate max-w-[100px]">{e.full_name?.split(" ")[0]}</span>
                        <button
                          onClick={() => {
                            const next = new Set(newMembers);
                            next.delete(uid);
                            setNewMembers(next);
                          }}
                          className="hover:bg-primary/20 rounded-full p-0.5"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Busca + lista */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={newMemberSearch}
                  onChange={(e) => setNewMemberSearch(e.target.value)}
                  placeholder="Buscar colaborador..."
                  className="pl-8 h-8"
                />
              </div>
              <div className="max-h-[180px] overflow-y-auto flex flex-col gap-0.5 mt-1.5 border border-border rounded-md p-1">
                {(employees || [])
                  .filter((e) => e.status === "active" && e.user_id && e.user_id !== profile?.user_id)
                  .filter((e) => !newMemberSearch.trim() || (e.full_name || "").toLowerCase().includes(newMemberSearch.toLowerCase()))
                  .slice(0, 50)
                  .map((e) => {
                    const checked = newMembers.has(e.user_id!);
                    return (
                      <label
                        key={e.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(ev) => {
                            const next = new Set(newMembers);
                            if (ev.target.checked) next.add(e.user_id!);
                            else next.delete(e.user_id!);
                            setNewMembers(next);
                          }}
                          className="w-3.5 h-3.5 rounded border-border accent-primary"
                        />
                        <AvatarBadge name={e.full_name || "?"} avatarUrl={e.avatar_url} size="xs" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{e.full_name}</p>
                          {e.position_title && (
                            <p className="text-2xs text-muted-foreground truncate">{e.position_title}</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createChannel.isPending}>
              {createChannel.isPending ? "Criando..." : `Criar grupo${newMembers.size > 0 ? ` · ${newMembers.size + 1}` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PollCard({
  poll,
  meId,
  userProfileMap,
  onVote,
  onShowVoters,
}: {
  poll: { id: string; question: string; options: string[]; votes: { user_id: string; option_idx: number; created_at?: string }[] };
  meId?: string;
  userProfileMap?: Map<string, { name: string; avatar: string | null }>;
  onVote: (option_idx: number) => void;
  onShowVoters?: (option_idx: number) => void;
}) {
  const total = poll.votes.length;
  const myVote = meId ? poll.votes.find((v) => v.user_id === meId) : undefined;
  const initials = (name: string) =>
    name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="mt-2 rounded-lg border border-border bg-card/40 p-4 max-w-lg w-full">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-primary" />
        <span className="text-base font-semibold text-foreground break-words">{poll.question}</span>
      </div>
      <div className="flex flex-col gap-2">
        {poll.options.map((opt, idx) => {
          const voters = poll.votes.filter((v) => v.option_idx === idx);
          const count = voters.length;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isMine = myVote?.option_idx === idx;
          return (
            <div key={idx}>
              <button
                onClick={() => onVote(idx)}
                className={cn(
                  "relative w-full text-left rounded-md border px-3 py-2 overflow-hidden transition-colors",
                  isMine ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40"
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 transition-all",
                    isMine ? "bg-primary/15" : "bg-muted/60"
                  )}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground flex items-center gap-1.5 min-w-0">
                    {isMine && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    <span className="truncate">{opt}</span>
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-2xs text-muted-foreground tabular-nums">
                      {count} · {pct}%
                    </span>
                    {voters.length > 0 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onShowVoters?.(idx); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onShowVoters?.(idx); } }}
                        className="flex items-center gap-1 cursor-pointer"
                        title="Ver quem votou"
                      >
                        <span className="flex -space-x-1.5">
                          {voters.slice(0, 2).map((v) => {
                            const prof = userProfileMap?.get(v.user_id);
                            const name = prof?.name || "Membro";
                            return prof?.avatar ? (
                              <img
                                key={v.user_id}
                                src={prof.avatar}
                                alt={name}
                                className="w-5 h-5 rounded-full object-cover border-2 border-card"
                              />
                            ) : (
                              <span
                                key={v.user_id}
                                className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[8px] font-semibold flex items-center justify-center border-2 border-card"
                              >
                                {initials(name)}
                              </span>
                            );
                          })}
                        </span>
                        {voters.length > 2 && (
                          <span className="text-2xs text-muted-foreground font-medium">
                            +{voters.length - 2}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-2xs text-muted-foreground">
        {total === 0 ? "Sem votos ainda" : `${total} ${total === 1 ? "voto" : "votos"}`}
      </div>
    </div>
  );
}

function MessageRowImpl({
  message: m,
  isMine,
  sameBlock,
  parent,
  editing,
  editingText,
  onEditStart,
  onEditChange,
  onEditCancel,
  onEditSave,
  onReply,
  onPin,
  onUnpin,
  isPinned,
  onStar,
  isStarred,
  onForward,
  onAskCami,
  onCreateTask,
  onShowReads,
  memberReads,
  meId,
  isDm,
  onOpenLightbox,
  reactions,
  userProfileMap,
  onReact,
  onDelete,
  emojiOpen,
  setEmojiOpen,
  poll,
  onVotePoll,
  onShowPollVoters,
  deliveredToAny,
  isLastMine,
}: {
  message: ChatMessage;
  isMine: boolean;
  sameBlock?: boolean;
  parent?: ChatMessage | null;
  editing?: boolean;
  editingText?: string;
  onEditStart?: () => void;
  onEditChange?: (v: string) => void;
  onEditCancel?: () => void;
  onEditSave?: () => void;
  onReply?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  isPinned?: boolean;
  onStar?: () => void;
  isStarred?: boolean;
  onForward?: () => void;
  onAskCami?: () => void;
  onCreateTask?: () => void;
  onShowReads?: () => void;
  memberReads?: any[];
  meId?: string;
  isDm?: boolean;
  onOpenLightbox?: (a: any) => void;
  reactions: Map<string, { count: number; mine: boolean; userIds: string[] }> | undefined;
  userProfileMap?: Map<string, { name: string; avatar: string | null }>;
  onReact: (emoji: string) => void;
  onDelete?: () => void;
  emojiOpen: boolean;
  setEmojiOpen: (v: boolean) => void;
  poll?: { id: string; question: string; options: string[]; created_by: string; votes: { user_id: string; option_idx: number; created_at?: string }[] } | null;
  onVotePoll?: (option_idx: number) => void;
  onShowPollVoters?: (option_idx: number) => void;
  deliveredToAny?: boolean;
  isLastMine?: boolean;
}) {
  // Ações por toque. A barra de ações do balão é `opacity-0 group-hover:...`,
  // e hover não existe no celular: reagir, responder, copiar, editar, encaminhar
  // e excluir eram simplesmente inalcançáveis no mobile. Long-press abre o mesmo
  // conjunto de ações num action sheet.
  //
  // `actionsOpen` é estado LOCAL de propósito: `MessageRow` é memo() com
  // comparador manual (logo abaixo), e prop nova que não entre no comparador
  // vira bug silencioso de re-render. setState local re-renderiza esta linha
  // sem passar pela comparação de props.
  const isMobile = useIsMobile();
  const [actionsOpen, setActionsOpen] = useState(false);
  const longPress = useLongPress(() => setActionsOpen(true), {
    // Em edição o balão vira textarea; o hold atrapalharia a seleção de texto.
    disabled: !isMobile || !!editing,
  });

  // Swipe-to-reply: mesmo `onReply` do action sheet, num gesto só. O sentido
  // acompanha o espaço livre — mensagem própria está encostada à direita, então
  // ela sai para a ESQUERDA; a de terceiros, o contrário.
  const swipe = useSwipeToReply(() => onReply?.(), {
    direction: isMine ? "left" : "right",
    disabled: !isMobile || !!editing || !onReply,
  });

  // Os dois gestos vivem no MESMO balão e disputam os mesmos onTouch*.
  // Espalhar `{...longPress} {...swipe.handlers}` faria o segundo apagar o
  // primeiro — então compomos chamando os dois em sequência. O long-press
  // continua se auto-cancelando aos 10px de movimento, que é o correto: assim
  // que vira arrasto, deixa de ser "segurar".
  const touchHandlers = {
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
      longPress.onTouchStart(e);
      swipe.handlers.onTouchStart(e);
    },
    onTouchMove: (e: React.TouchEvent<HTMLElement>) => {
      longPress.onTouchMove(e);
      swipe.handlers.onTouchMove(e);
    },
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
      longPress.onTouchEnd(e);
      swipe.handlers.onTouchEnd(e);
    },
    onTouchCancel: (e: React.TouchEvent<HTMLElement>) => {
      longPress.onTouchCancel(e);
      swipe.handlers.onTouchCancel(e);
    },
    onContextMenu: longPress.onContextMenu,
  };

  // Calcula status de leitura: outros membros que leram (excluindo o autor)
  const readBy: MemberRead[] = (memberReads || []).filter((mr: any) => {
    if (mr.user_id === m.author_id) return false;
    if (!mr.last_read_at) return false;
    return new Date(mr.last_read_at).getTime() >= new Date(m.created_at).getTime();
  });
  const totalOthers = (memberReads || []).filter((mr: any) => mr.user_id !== m.author_id).length;
  const readByAll = totalOthers > 0 && readBy.length === totalOthers;
  // Renderiza conteúdo com menções, bold (**…**), itálico (*…*) e auto-link
  const renderContent = (txt: string) => {
    // Tokeniza: bold, italic, mention, url, texto cru
    const tokens: { type: string; value: string }[] = [];
    const regex = /(\*\*[^*]+\*\*)|(\*[^*]+\*)|(@\S+)|(https?:\/\/\S+)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(txt)) !== null) {
      if (match.index > lastIdx) tokens.push({ type: "text", value: txt.slice(lastIdx, match.index) });
      const m = match[0];
      if (m.startsWith("**")) tokens.push({ type: "bold", value: m.slice(2, -2) });
      else if (m.startsWith("*")) tokens.push({ type: "italic", value: m.slice(1, -1) });
      else if (m.startsWith("@")) tokens.push({ type: "mention", value: m });
      else if (m.startsWith("http")) tokens.push({ type: "link", value: m });
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < txt.length) tokens.push({ type: "text", value: txt.slice(lastIdx) });
    return tokens.map((t, i) => {
      if (t.type === "bold") return <strong key={i} className="font-semibold">{t.value}</strong>;
      if (t.type === "italic") return <em key={i} className="italic">{t.value}</em>;
      if (t.type === "mention") return <span key={i} className="text-primary font-medium bg-primary/10 rounded px-1">{t.value}</span>;
      if (t.type === "link") return <a key={i} href={t.value} target="_blank" rel="noreferrer" className="text-primary underline break-all">{t.value}</a>;
      return <span key={i}>{t.value}</span>;
    });
  };

  const attachments = Array.isArray(m.attachments) ? m.attachments : [];
  // Áudio standalone: msg só tem áudio (sem texto, sem outros tipos)
  const audioOnly =
    attachments.length === 1 &&
    (attachments[0].type || "").startsWith("audio/") &&
    (m.content === "[áudio]" || !m.content?.trim() || m.content === (attachments[0].transcription || ""));

  return (
    <div
      id={`msg-${m.id}`}
      className={cn(
        "group flex gap-2.5 px-2 relative",
        sameBlock ? "py-0.5" : "py-1",
        isMine ? "flex-row-reverse" : ""
      )}
    >
      {/* Pista visual do swipe-to-reply. Fica FORA do balão de propósito: o
          balão tem `transform` durante o gesto e levaria o ícone junto, em vez
          de revelá-lo. O wrapper externo já é `relative`. */}
      {swipe.active && (
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center",
            "h-7 w-7 rounded-full transition-colors",
            swipe.willTrigger ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            isMine ? "right-2" : "left-2"
          )}
          style={{ opacity: Math.min(1, Math.abs(swipe.offset) / 60) }}
          aria-hidden
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </span>
      )}

      {/* Avatar — só na primeira msg do bloco; espaço reservado nas demais */}
      {sameBlock ? (
        <div className="w-8 flex-shrink-0" />
      ) : (
        <AvatarBadge name={m.author_name || "?"} avatarUrl={m.author_avatar} size="sm" />
      )}
      <div className={cn("flex flex-col gap-0.5 min-w-0 max-w-[85%] sm:max-w-[70%]", isMine && "items-end")}>
        {/* Balão */}
        <div
          {...touchHandlers}
          style={{
            transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined,
            // Sem transição durante o arrasto (o dedo é a animação); com
            // transição na volta, para o balão retornar suave ao soltar.
            transition: swipe.active ? "none" : "transform 180ms ease-out",
            // CRÍTICO: entrega o eixo horizontal ao JS e mantém a rolagem
            // vertical com o navegador. Sem isto o Chrome cancela o gesto no
            // primeiro scroll.
            touchAction: "pan-y",
          }}
          className={cn(
            // `select-none` só no mobile: impede o Android de iniciar seleção de
            // texto durante o hold. No desktop a seleção continua normal.
            // Balão no padrão WhatsApp: fundo SÓLIDO (translúcido sujaria o
            // texto sobre a textura do canvas), canto reto do lado de quem
            // falou e cauda desenhada em ::after — ver .chat-bubble-* no
            // index.css. Sem borda: a sombra já dá o relevo.
            "rounded-xl px-3 py-1.5 shadow-sm relative select-none md:select-auto",
            isMine
              ? "chat-bubble-out bg-chat-bubble-out text-chat-bubble-out-foreground rounded-tr-none"
              : "chat-bubble-in bg-chat-bubble-in text-chat-bubble-in-foreground rounded-tl-none",
            // Mensagens seguintes do mesmo bloco não repetem a cauda.
            sameBlock && "chat-bubble-stacked rounded-xl"
          )}
        >
          {/* Nome de quem falou — DENTRO do balão, como no WhatsApp em grupo.
              Só na primeira msg do bloco e só nas recebidas. */}
          {!isMine && !sameBlock && (
            <span className="block text-xs font-semibold text-primary mb-0.5">
              {m.author_name || "Usuário"}
            </span>
          )}

          {/* Quote do parent (responder) — clicável pra scroll */}
          {parent && (
            <button
              onClick={() => {
                const el = document.getElementById(`msg-${parent.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.classList.add("ring-2", "ring-primary/50", "rounded-lg");
                  setTimeout(() => el.classList.remove("ring-2", "ring-primary/50", "rounded-lg"), 1500);
                }
              }}
              className={cn(
                "border-l-[3px] pl-2 py-1 mb-1.5 text-xs bg-foreground/[0.06] hover:bg-foreground/[0.1] rounded-r rounded-l-sm transition-colors w-full max-w-full min-w-0 overflow-hidden text-left",
                isMine ? "border-primary/50" : "border-primary/40"
              )}
            >
              <p className="text-2xs font-semibold text-primary truncate">
                {parent.author_name || "Usuário"}
              </p>
              <p className="text-2xs text-muted-foreground truncate">
                {parent.content.slice(0, 80)}
              </p>
            </button>
          )}

          {editing ? (
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <textarea
                value={editingText}
                onChange={(e) => onEditChange?.(e.target.value)}
                rows={2}
                autoFocus
                className="w-full bg-transparent text-sm resize-none outline-none border border-border rounded p-1.5"
                onKeyDown={(e) => {
                  // Mesma regra do composer: no celular o Enter quebra linha e
                  // quem salva é o botão "Salvar".
                  if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); onEditSave?.(); }
                  if (e.key === "Escape") onEditCancel?.();
                }}
                enterKeyHint={isMobile ? "enter" : "send"}
              />
              {attachments.length > 0 && (
                <div className="text-2xs text-muted-foreground flex items-center gap-1">
                  <Paperclip className="w-3 h-3" />
                  {attachments.length} {attachments.length === 1 ? "anexo preservado" : "anexos preservados"}
                </div>
              )}
              <div className="flex justify-end gap-1">
                <button onClick={onEditCancel} className="text-2xs text-muted-foreground hover:text-foreground px-2 py-0.5">Cancelar</button>
                <button onClick={onEditSave} className="text-2xs text-primary font-medium px-2 py-0.5">Salvar</button>
              </div>
            </div>
          ) : (
            // Esconde placeholders padrão e huddle — UI custom é renderizada abaixo
            (() => {
              const huddleAtt = attachments.find((a: any) => a.type === "huddle");
              if (huddleAtt) return null;
              const inviteAtt = attachments.find((a: any) => a.type === "meeting_invite");
              if (inviteAtt) return null;
              const taskAtt = attachments.find((a: any) => a.type === "task");
              if (taskAtt) return null;
              if (poll) return null;
              const placeholders = ["[imagem]", "[vídeo]", "[áudio]", "[anexo]"];
              if (attachments.length > 0 && (placeholders.includes(m.content) || !m.content?.trim())) return null;
              // Também esconde se content for o nome literal de um arquivo anexado (legado)
              if (attachments.length > 0 && attachments.some((a: any) => a.name === m.content)) return null;
              return (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {renderContent(m.content)}
                  {m.edited_at && (
                    <span className="text-2xs text-muted-foreground ml-1.5 italic">(editado)</span>
                  )}
                </p>
              );
            })()
          )}

          {/* Enquete */}
          {poll && !editing && (
            <PollCard
              poll={poll}
              meId={meId}
              userProfileMap={userProfileMap}
              onVote={(idx) => onVotePoll?.(idx)}
              onShowVoters={(idx) => onShowPollVoters?.(idx)}
            />
          )}

          {/* Anexos */}
          {attachments.length > 0 && !editing && (
            <div className="flex flex-col gap-1.5 mt-2">
              {attachments.map((a: any, i: number) => {
                const type = a.type || "";
                if (type.startsWith("image/")) {
                  return (
                    <div key={i} className="relative group/img inline-block">
                      <img
                        src={a.url}
                        alt=""
                        onClick={() => onOpenLightbox?.(a)}
                        className="max-w-[280px] max-h-[260px] rounded-md border border-border cursor-zoom-in object-cover"
                      />
                      {/* Expandir + baixar. No mobile ficam SEMPRE visíveis:
                          hover não existe no toque, então `opacity-0 group-hover`
                          tornava baixar um anexo impossível pelo celular. */}
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover/img:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenLightbox?.(a); }}
                          className="w-9 h-9 md:w-7 md:h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                          title="Expandir"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadAttachment(a.url, a.name); }}
                          className="w-9 h-9 md:w-7 md:h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                          title="Baixar"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                }
                if (type.startsWith("audio/")) {
                  return <AudioBubble key={i} messageId={m.id} attachmentIndex={i} url={a.url} mime={type} transcription={a.transcription} allAttachments={attachments} />;
                }
                if (type === "huddle") {
                  return <HuddleCard key={i} attachment={a} messageCreatedAt={m.created_at} authorName={m.author_name || "Alguém"} isMine={isMine} />;
                }
                if (type === "meeting_invite") {
                  return <MeetingInviteCard key={i} attachment={a} authorName={m.author_name || "Alguém"} isMine={isMine} />;
                }
                if (type === "task") {
                  return <TaskCard key={i} attachment={a} authorName={m.author_name || "Alguém"} />;
                }
                if (type === "feed_post") {
                  return <FeedBroadcastCard key={i} attachment={a} />;
                }
                if (type.startsWith("video/")) {
                  return (
                    <div key={i} className="relative group/vid inline-block">
                      <video
                        src={a.url}
                        controls
                        className="max-w-[320px] max-h-[280px] rounded-md border border-border"
                        preload="metadata"
                      />
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover/vid:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenLightbox?.(a); }}
                          className="w-9 h-9 md:w-7 md:h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                          title="Expandir"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadAttachment(a.url, a.name); }}
                          className="w-9 h-9 md:w-7 md:h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                          title="Baixar"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-foreground/[0.06] text-xs group/file">
                    <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="truncate flex-1 hover:underline">{a.name || "anexo"}</a>
                    {a.size && <span className="text-2xs text-muted-foreground">{Math.ceil(a.size / 1024)}KB</span>}
                    <button
                      onClick={() => downloadAttachment(a.url, a.name)}
                      className="opacity-100 md:opacity-0 md:group-hover/file:opacity-100 p-2 md:p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                      title="Baixar"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reações — chip estilo Bitrix com stack de avatares de quem reagiu */}
          {reactions && reactions.size > 0 && (
            <div className={cn("flex flex-wrap items-center gap-1.5 mt-1.5", isMine && "justify-end")}>
              {[...reactions.entries()].map(([emoji, data]) => {
                const reactors = data.userIds
                  .map((uid) => ({ uid, p: userProfileMap?.get(uid) }))
                  .filter((x) => !!x.p) as { uid: string; p: { name: string; avatar: string | null } }[];
                const namesLabel = reactors.map((r) => r.p.name.split(" ")[0]).join(", ");
                return (
                  <Popover key={emoji}>
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => {
                          // Click sem hover-popover: toggle reação
                          if ((e as any).detail !== 0) {
                            e.preventDefault();
                            onReact(emoji);
                          }
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 pl-1.5 pr-1.5 py-0.5 rounded-full border text-xs transition-all hover:scale-105 cursor-pointer",
                          data.mine
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : isMine
                              ? "bg-background/70 border-primary/20 text-foreground hover:bg-background"
                              : "bg-muted/70 border-border text-foreground hover:bg-muted"
                        )}
                        title={`${namesLabel || "—"} reagiram`}
                      >
                        <ReactionIcon emoji={emoji} size={14} />
                        {reactors.length > 0 ? (
                          <span className="flex -space-x-1.5 ml-0.5">
                            {reactors.slice(0, 3).map((r) => (
                              <span key={r.uid} className="ring-2 ring-card rounded-full">
                                <AvatarBadge name={r.p.name} avatarUrl={r.p.avatar} size="xs" />
                              </span>
                            ))}
                            {reactors.length > 3 && (
                              <span className="w-4 h-4 rounded-full bg-muted text-[8px] font-semibold flex items-center justify-center text-muted-foreground ring-2 ring-card tabular-nums">
                                +{reactors.length - 3}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="tabular-nums text-2xs font-medium">{data.count}</span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                        <ReactionIcon emoji={emoji} size={16} />
                        <span>{getReactionLabel(emoji)} · {reactors.length}</span>
                      </div>
                      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {reactors.map((r) => (
                          <div key={r.uid} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50">
                            <AvatarBadge name={r.p.name} avatarUrl={r.p.avatar} size="sm" />
                            <span className="text-xs truncate">{r.p.name}</span>
                            {r.uid === meId && (
                              <span className="ml-auto text-2xs text-muted-foreground">você</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => onReact(emoji)}
                        className="w-full mt-2 px-2 py-1.5 text-2xs font-medium rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                      >
                        {data.mine ? "Remover minha reação" : "Reagir também"}
                      </button>
                    </PopoverContent>
                  </Popover>
                );
              })}
              <button
                onClick={() => setEmojiOpen(true)}
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded-full border text-muted-foreground hover:text-foreground transition-colors",
                  isMine
                    ? "bg-background/70 border-primary/20 hover:bg-background"
                    : "bg-muted/70 border-border hover:bg-muted"
                )}
                title="Adicionar reação"
              >
                <Smile className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className={cn("flex items-center gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
            <span className="text-[10px] text-chat-meta tabular-nums leading-none">
              {format(new Date(m.created_at), "HH:mm")}
            </span>
            {isMine && (() => {
              // Estados: lido (✓✓ azul) > entregue (✓✓ cinza) > enviado (✓ cinza)
              const status: "read" | "delivered" | "sent" =
                readBy.length > 0 ? "read" : deliveredToAny ? "delivered" : "sent";
              const label =
                status === "read"
                  ? (isDm ? "Visto" : `Lido por ${readBy.length}${readByAll ? " (todos)" : ""}`)
                  : status === "delivered"
                    ? "Entregue"
                    : "Enviado";
              const icon = status === "sent" ? (
                <Check className="w-3.5 h-3.5 text-chat-meta" strokeWidth={2.75} aria-label={label} />
              ) : (
                <CheckCheck
                  className={cn(
                    "w-3.5 h-3.5",
                    status === "read" && (isDm || readByAll) ? "text-chat-check-read" : "text-chat-meta"
                  )}
                  strokeWidth={2.75}
                  aria-label={label}
                />
              );
              // Em grupos/canais, clicar no status abre quem viu (com data e hora).
              if (!isDm && onShowReads) {
                return (
                  <button onClick={onShowReads} title="Ver quem viu" className="hover:opacity-80 transition-opacity leading-none">
                    {icon}
                  </button>
                );
              }
              return icon;
            })()}
          </div>
        </div>

        {/* Quem viu — só na última mensagem do remetente, canais/grupos */}
        {!isDm && isLastMine && readBy.length > 0 && (
          <button
            onClick={onShowReads}
            className={cn(
              "mt-0.5 flex items-center gap-0.5 px-0.5 group/reads opacity-60 hover:opacity-100 transition-opacity",
              isMine && "self-end"
            )}
            title="Ver quem leu"
          >
            <span className="text-[8px] text-muted-foreground/60 group-hover/reads:text-muted-foreground transition-colors leading-none">
              visto
            </span>
            <div className="flex -space-x-1">
              {readBy.slice(0, 3).map((r: MemberRead) => (
                <span key={r.user_id} className="ring-1 ring-background rounded-full">
                  <AvatarBadge name={r.full_name || "?"} avatarUrl={r.avatar_url} size="xs" />
                </span>
              ))}
              {readBy.length > 3 && (
                <span className="w-3.5 h-3.5 rounded-full bg-muted text-[7px] font-semibold flex items-center justify-center text-muted-foreground ring-1 ring-background tabular-nums">
                  +{readBy.length - 3}
                </span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Hover actions — flutua sobre a quina superior do balão (sempre adjacente) */}
      <div className={cn(
        "absolute -top-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-card border border-border rounded-full shadow-md p-0.5 z-10",
        isMine ? "right-12" : "left-12"
      )}>
        <DropdownMenu open={emojiOpen} onOpenChange={setEmojiOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Reagir">
              <Smile className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="p-1.5">
            <div className="flex items-center gap-0.5">
              {REACTIONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => { onReact(r.key); setEmojiOpen(false); }}
                  className="w-9 h-9 rounded-md hover:bg-muted flex items-center justify-center transition-transform hover:scale-110"
                  title={r.label}
                >
                  <ReactionIcon emoji={r.key} size={20} />
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {onReply && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onReply} title="Responder">
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Mais">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onReply}>
              <MessageSquare className="w-3.5 h-3.5 mr-2" /> Responder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { navigator.clipboard.writeText(m.content); toast.success("Copiado"); }}>
              <FileText className="w-3.5 h-3.5 mr-2" /> Copiar
            </DropdownMenuItem>
            {onEditStart && isMine && !editing && (
              <DropdownMenuItem onSelect={onEditStart}>
                <Settings className="w-3.5 h-3.5 mr-2" /> Editar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onForward?.()}>
              <ChevronRight className="w-3.5 h-3.5 mr-2" /> Encaminhar
            </DropdownMenuItem>
            {onAskCami && (
              <DropdownMenuItem onSelect={() => onAskCami?.()}>
                <CamiAvatar className="w-4 h-4 mr-2 text-primary" /> Pergunte a Clara
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onCreateTask?.()}>
              <CheckSquare className="w-3.5 h-3.5 mr-2" /> Criar tarefa
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onStar?.()}>
              <Star className={`w-3.5 h-3.5 mr-2 ${isStarred ? "fill-amber-500 text-amber-500" : ""}`} />
              {isStarred ? "Desfavoritar" : "Favoritar"}
            </DropdownMenuItem>
            {isPinned ? (
              <DropdownMenuItem onSelect={() => onUnpin?.()}>
                <Pin className="w-3.5 h-3.5 mr-2" /> Desafixar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onPin?.()}>
                <Pin className="w-3.5 h-3.5 mr-2" /> Fixar
              </DropdownMenuItem>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => { if (confirm("Excluir esta mensagem?")) onDelete(); }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Action sheet mobile — mesmas ações da barra de hover, via long-press.
          Renderizado só no mobile para não montar um Drawer por mensagem no
          desktop, onde a barra de hover já resolve. */}
      {isMobile && (
        <MessageActionsSheet
          open={actionsOpen}
          onOpenChange={setActionsOpen}
          content={m.content}
          isMine={isMine}
          editing={editing}
          onReact={onReact}
          onReply={onReply}
          onEditStart={onEditStart}
          onForward={onForward}
          onAskCami={onAskCami}
          onCreateTask={onCreateTask}
          onStar={onStar}
          isStarred={isStarred}
          onPin={onPin}
          onUnpin={onUnpin}
          isPinned={isPinned}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

// Memoização da linha de mensagem: a lista inteira era re-renderizada a cada nova
// mensagem/refetch (a query recria os objetos de mensagem toda vez), o que travava
// o chat em conversas grandes ao receber msg. O comparador ignora os callbacks
// (closures inline que capturam apenas `m.id` e setters estáveis — seguros de
// ignorar) e compara só os DADOS que afetam o render. Assim só a mensagem nova (e a
// que deixou de ser a última) re-renderiza, em vez de todas.
const MessageRow = memo(MessageRowImpl, (a, b) => {
  const ma = a.message, mb = b.message;
  if (ma.id !== mb.id) return false;
  if (ma.content !== mb.content) return false;
  if (ma.edited_at !== mb.edited_at) return false;
  if ((ma.attachments?.length || 0) !== (mb.attachments?.length || 0)) return false;
  if (a.isMine !== b.isMine) return false;
  if (a.sameBlock !== b.sameBlock) return false;
  if (a.isDm !== b.isDm) return false;
  if (a.meId !== b.meId) return false;
  if (a.isPinned !== b.isPinned) return false;
  if (a.isStarred !== b.isStarred) return false;
  if (a.emojiOpen !== b.emojiOpen) return false;
  if (a.deliveredToAny !== b.deliveredToAny) return false;
  if (a.isLastMine !== b.isLastMine) return false;
  if (a.editing !== b.editing) return false;
  // editingText só afeta a linha que está em edição
  if ((a.editing || b.editing) && a.editingText !== b.editingText) return false;
  // Referências estáveis via useMemo no pai (mudam só quando o dado muda)
  if (a.reactions !== b.reactions) return false;
  if (a.memberReads !== b.memberReads) return false;
  if (a.userProfileMap !== b.userProfileMap) return false;
  if (a.poll !== b.poll) return false;
  if ((a.parent?.id ?? null) !== (b.parent?.id ?? null)) return false;
  if ((a.parent?.content ?? null) !== (b.parent?.content ?? null)) return false;
  return true;
});

// ─── Card de chamada (huddle) inline ───
function HuddleCard({
  attachment,
  messageCreatedAt,
  authorName,
  isMine,
}: {
  attachment: any;
  messageCreatedAt: string;
  authorName: string;
  isMine: boolean;
}) {
  const navigate = useNavigate();
  const { profile: meProfile } = useAuth();
  const huddleId: string | undefined = attachment.huddle_id;
  // Busca status atual da huddle
  const [status, setStatus] = useState<{
    active: boolean;
    ended_at: string | null;
    channel_id: string | null;
    started_by: string | null;
  }>({ active: false, ended_at: null, channel_id: null, started_by: null });
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);

  const canEnd = status.active && status.started_by === meProfile?.user_id;
  const handleEnd = async () => {
    if (!huddleId) return;
    setEnding(true);
    try {
      await supabase
        .from("chat_huddles" as any)
        .update({ ended_at: new Date().toISOString() })
        .eq("id", huddleId);
    } finally { setEnding(false); }
  };

  useEffect(() => {
    let mounted = true;
    if (!huddleId) { setLoading(false); return; }
    const load = async () => {
      const { data } = await supabase
        .from("chat_huddles" as any)
        .select("ended_at, channel_id, started_by")
        .eq("id", huddleId)
        .maybeSingle();
      if (!mounted) return;
      if (data) {
        const d = data as any;
        setStatus({
          active: !d.ended_at,
          ended_at: d.ended_at,
          channel_id: d.channel_id,
          started_by: d.started_by,
        });
      }
      setLoading(false);
    };
    load();
    // Realtime updates
    const ch = supabase.channel(`huddle-card-${huddleId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_huddles", filter: `id=eq.${huddleId}` },
        (payload: any) => {
          const d = payload.new;
          if (!mounted) return;
          setStatus({
            active: !d.ended_at,
            ended_at: d.ended_at,
            channel_id: d.channel_id,
            started_by: d.started_by,
          });
        })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [huddleId]);

  const fmtHM = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
  };

  const durationMs = status.ended_at
    ? new Date(status.ended_at).getTime() - new Date(messageCreatedAt).getTime()
    : 0;
  const durationStr = (() => {
    if (durationMs <= 0) return "";
    const sec = Math.floor(durationMs / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  })();

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl border w-full sm:w-auto sm:min-w-[280px] sm:max-w-[360px]",
      status.active
        ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"
        : "bg-muted/40 border-border"
    )}>
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
        status.active
          ? "bg-green-500 text-white"
          : "bg-muted-foreground/20 text-muted-foreground"
      )}>
        {status.active && (
          <span className="absolute w-10 h-10 rounded-full bg-green-500/40 animate-ping" />
        )}
        {status.active ? <Video className="w-5 h-5 relative" /> : <PhoneIcon className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : status.active ? (
          <>
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">
              📞 Chamada em andamento
            </p>
            <p className="text-2xs text-muted-foreground">
              {isMine ? "Você" : authorName} iniciou às {fmtHM(messageCreatedAt)}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-muted-foreground">
              Ligação encerrada
            </p>
            <p className="text-2xs text-muted-foreground/70">
              {fmtHM(messageCreatedAt)}{durationStr && ` · ${durationStr}`}
            </p>
          </>
        )}
      </div>
      {status.active && status.channel_id && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            className="h-8 gap-1 px-3 text-xs bg-green-600 hover:bg-green-700"
            onClick={() => navigate(`/chat/${status.channel_id}/huddle`)}
          >
            <Video className="w-3 h-3" /> Entrar
          </Button>
          {canEnd && (
            <Button
              size="sm"
              variant="ghost"
              disabled={ending}
              onClick={handleEnd}
              className="h-8 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10"
              title="Encerrar chamada"
            >
              <PhoneIcon className="w-3 h-3 rotate-[135deg]" />
              {ending ? "..." : "Encerrar"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Card de convite para reunião agendada/imediata ───
function FeedBroadcastCard({ attachment }: { attachment: any }) {
  const navigate = useNavigate();
  const postId = attachment.post_id as string | undefined;
  const target = postId ? `/feed?post=${postId}` : "/feed";
  return (
    <button
      type="button"
      onClick={() => navigate(target)}
      className="mt-2 w-full max-w-md text-left rounded-lg border border-border bg-card/40 p-3 hover:bg-muted/40 transition-colors group"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Megaphone className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xs font-mono uppercase tracking-wide text-muted-foreground">
            Publicação no Feed
          </div>
          <div className="text-sm font-medium text-primary mt-0.5 group-hover:underline">
            Ver publicação →
          </div>
        </div>
      </div>
    </button>
  );
}

function TaskCard({ attachment, authorName }: { attachment: any; authorName: string }) {
  const navigate = useNavigate();
  const priority = attachment.priority as "low" | "medium" | "high" | "urgent" | undefined;
  const priorityLabel = priority === "low" ? "Baixa" : priority === "medium" ? "Média" : priority === "high" ? "Alta" : priority === "urgent" ? "Urgente" : null;
  const priorityClass =
    priority === "urgent" ? "bg-destructive/10 text-destructive border-destructive/30"
    : priority === "high" ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
    : priority === "medium" ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
    : "bg-muted text-muted-foreground border-border";
  const dueLabel = attachment.due_date
    ? format(new Date(attachment.due_date), "dd MMM", { locale: ptBR })
    : null;
  return (
    <button
      type="button"
      onClick={() => attachment.task_id && navigate(`/tarefas?task=${attachment.task_id}`)}
      className="mt-2 w-full max-w-md text-left rounded-lg border border-border bg-card/40 p-3 hover:bg-muted/40 transition-colors group"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <CheckSquare className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xs font-mono uppercase tracking-wide text-muted-foreground">
            Tarefa criada por {authorName}
          </div>
          <div className="text-sm font-semibold text-foreground mt-0.5 break-words">
            {attachment.title || "Sem título"}
          </div>
          {attachment.description && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">
              {attachment.description}
            </div>
          )}
          <div className="flex items-center flex-wrap gap-1.5 mt-2">
            {attachment.project_name && (
              <span className="text-2xs font-medium px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground inline-flex items-center gap-1">
                <FolderKanban className="w-3 h-3" />
                {attachment.project_name}
              </span>
            )}
            {priorityLabel && (
              <span className={cn("text-2xs font-medium px-2 py-0.5 rounded-full border", priorityClass)}>
                {priorityLabel}
              </span>
            )}
            {attachment.assignee_name && (
              <span className="text-2xs font-medium px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground inline-flex items-center gap-1">
                <Users className="w-3 h-3" />
                {attachment.assignee_name}
              </span>
            )}
            {dueLabel && (
              <span className="text-2xs font-medium px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground inline-flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {dueLabel}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
      </div>
    </button>
  );
}

function MeetingInviteCard({
  attachment,
  authorName,
  isMine,
}: {
  attachment: any;
  authorName: string;
  isMine: boolean;
}) {
  const roomName: string | undefined = attachment.room_name;
  const title: string = attachment.title || "Reunião";
  const hostName: string = attachment.host_name || authorName;
  const scheduledAt: string | null = attachment.scheduled_at || null;

  // Avalia janela de entrada (se há scheduled_at)
  const joinability = (() => {
    // scheduled_at vem como "YYYY-MM-DD HH:mm" ou ISO
    let scheduledIso: string | null = null;
    if (scheduledAt) {
      const m = scheduledAt.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
      if (m) {
        scheduledIso = `${m[1]}T${m[2]}:00`;
      } else {
        scheduledIso = scheduledAt;
      }
    }
    // Inline: 10 min antes / 10 min após start + 60 min default
    if (!roomName) return { joinable: false, reason: "Sem sala" } as { joinable: boolean; reason?: string; opensAt?: Date };
    if (!scheduledIso) return { joinable: true };
    const start = new Date(scheduledIso);
    if (Number.isNaN(start.getTime())) return { joinable: true };
    const now = Date.now();
    const opensAt = new Date(start.getTime() - 10 * 60 * 1000);
    const closesAt = new Date(start.getTime() + 60 * 60 * 1000 + 10 * 60 * 1000);
    if (now < opensAt.getTime()) return { joinable: false, reason: "ainda não abriu", opensAt };
    if (now > closesAt.getTime()) return { joinable: false, reason: "janela encerrada" };
    return { joinable: true };
  })();

  // Formata "YYYY-MM-DD HH:mm" → "30/04 às 14:30" ou "Agora"
  const whenLabel = (() => {
    if (!scheduledAt) return null;
    const m = scheduledAt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return scheduledAt;
    const [, , mm, dd, hh, mi] = m;
    return `${dd}/${mm} às ${hh}:${mi}`;
  })();

  const handleJoin = () => {
    if (!roomName) return;
    window.open(`/meet/${roomName}?role=guest`, "_blank", "noopener");
  };

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-xl border w-full sm:w-auto sm:min-w-[280px] sm:max-w-[360px] bg-gradient-to-br from-primary/5 to-primary/10 border-primary/25 shadow-sm">
      {/* Header: ícone + autor */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary text-primary-foreground shadow-sm">
          <Video className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xs font-medium text-primary uppercase tracking-wide">
            {scheduledAt ? "Reunião agendada" : "Convite para reunião"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {isMine ? "Você convidou" : `${hostName} convidou você`}
          </p>
        </div>
      </div>

      {/* Título da reunião */}
      <div className="px-0.5">
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {title}
        </p>
        {whenLabel && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{whenLabel}</span>
          </div>
        )}
      </div>

      {/* Ação */}
      {roomName && joinability.joinable && (
        <Button
          size="sm"
          variant={isMine ? "outline" : "default"}
          onClick={handleJoin}
          className="h-8 w-full text-xs font-medium"
        >
          <Video className="w-3.5 h-3.5 mr-1.5" />
          {isMine ? "Abrir sala" : "Entrar na reunião"}
        </Button>
      )}
      {roomName && !joinability.joinable && (
        <div className="flex items-center justify-center gap-1.5 h-8 rounded-md bg-muted/60 text-muted-foreground text-2xs font-medium">
          <Clock className="w-3 h-3" />
          {joinability.opensAt
            ? (() => {
                const diffMs = joinability.opensAt.getTime() - Date.now();
                if (diffMs <= 0) return "abre agora";
                const min = Math.round(diffMs / 60000);
                if (min < 60) return `abre em ${min} min`;
                return `abre às ${String(joinability.opensAt.getHours()).padStart(2, "0")}:${String(joinability.opensAt.getMinutes()).padStart(2, "0")}`;
              })()
            : joinability.reason || "Sala indisponível"}
        </div>
      )}
    </div>
  );
}

// ─── Player de áudio custom (design system) ───
function AudioBubble({
  url,
  mime,
  transcription,
  messageId,
  attachmentIndex,
  allAttachments,
}: {
  url: string;
  mime?: string;
  transcription?: string | null;
  messageId?: string;
  attachmentIndex?: number;
  allAttachments?: any[];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showTranscription, setShowTranscription] = useState(!!transcription);
  const [localTranscription, setLocalTranscription] = useState<string | null>(transcription || null);
  const [transcribing, setTranscribing] = useState(false);

  const handleTranscribe = async () => {
    if (!messageId || !allAttachments) return;
    setTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-transcribe", {
        body: { audio_url: url, mime: mime || "audio/webm" },
      });
      // supabase.functions.invoke retorna o body em data mesmo quando server retorna 4xx/5xx; o erro vem em error
      if (error) {
        // Tenta extrair mensagem do body de erro
        const ctx: any = (error as any)?.context;
        let serverMsg = "";
        try {
          if (ctx && typeof ctx.text === "function") serverMsg = await ctx.text();
        } catch { /* ignore */ }
        const msg = serverMsg || (error as any)?.message || JSON.stringify(error);
        throw new Error(msg);
      }
      // Função pode ter retornado { error: "..." }
      if ((data as any)?.error) {
        throw new Error((data as any).error);
      }
      const t = (data as any)?.transcription;
      if (!t) throw new Error("Resposta vazia do servidor");
      setLocalTranscription(t);
      setShowTranscription(true);
      // Persiste no banco
      const newAtts = allAttachments.map((a, idx) =>
        idx === attachmentIndex ? { ...a, transcription: t } : a
      );
      await supabase.from("chat_messages" as any).update({ attachments: newAtts }).eq("id", messageId);
      toast.success("Áudio transcrito");
    } catch (e: any) {
      console.error("[transcribe]", e);
      toast.error("Falha ao transcrever: " + (e?.message || JSON.stringify(e)).slice(0, 240));
    } finally {
      setTranscribing(false);
    }
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime || 0);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => { setPlaying(false); setCurrent(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = pct * duration;
    setCurrent(a.currentTime);
  };

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return "00:00";
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  // 56 barras de waveform com altura pseudo-randômica baseada em hash da URL
  const bars = (() => {
    const seed = Array.from(url).reduce((a, c) => (a + c.charCodeAt(0)) % 997, 7);
    const out: number[] = [];
    for (let i = 0; i < 32; i++) {
      out.push(25 + Math.abs(Math.sin((seed + i * 1.7) * 0.9)) * 70);
    }
    return out;
  })();

  return (
    <div className="flex flex-col gap-1 w-[260px] max-w-full">
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />

      {/* Linha 1: Play · Waveform · Botão de transcrição (tudo inline) */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-colors shadow-sm"
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-0.5" />}
        </button>

        {/* Waveform clicável (SVG-like com path) */}
        <div
          onClick={seek}
          className="flex items-center gap-[2px] h-7 cursor-pointer flex-1 min-w-0"
        >
          {bars.map((h, i) => {
            const filled = (i / bars.length) * 100 < progress;
            return (
              <span
                key={i}
                className={cn(
                  "w-[3px] rounded-full transition-colors flex-shrink-0",
                  filled ? "bg-primary" : "bg-muted-foreground/30"
                )}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>

        {/* Botão transcrição inline (ícone caps) */}
        {localTranscription ? (
          <button
            onClick={() => setShowTranscription((v) => !v)}
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
              showTranscription
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-primary"
            )}
            title={showTranscription ? "Ocultar transcrição" : "Mostrar transcrição"}
          >
            <Captions className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleTranscribe}
            disabled={transcribing}
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-muted-foreground hover:bg-muted hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-wait"
            title={transcribing ? "Transcrevendo…" : "Gerar transcrição"}
          >
            <Captions className={cn("w-4 h-4", transcribing && "animate-pulse text-primary")} />
          </button>
        )}
      </div>

      {/* Linha 2: tempo decorrido / total */}
      <div className="flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground tabular-nums leading-none">
          {fmt(current)} <span className="text-muted-foreground/50">/ {fmt(duration)}</span>
        </span>
      </div>

      {/* Quote block com a transcrição */}
      {showTranscription && localTranscription && (
        <div className="mt-0.5 pl-2.5 border-l-2 border-primary/40">
          <p className="text-xs text-foreground/85 leading-relaxed italic">
            “{localTranscription}”
          </p>
        </div>
      )}
    </div>
  );
}
