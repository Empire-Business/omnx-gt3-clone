import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ThumbsUp, Heart, MessageCircle, Send, Trash2, ChevronDown, ChevronUp,
  Rss, Globe, Lock, X, Tag as TagIcon, Loader2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useFeedPosts, useCreateFeedPost, useDeleteFeedPost, useFeedUnreadCount,
  useFeedReactions, useToggleFeedReaction,
  useFeedComments, useAddFeedComment, useDeleteFeedComment,
  type FeedPost, type FeedVisibilityTarget, type FeedComment,
} from "@/hooks/useFeed";
import { useAuth } from "@/hooks/useAuth";
import { useEmployees, type EmployeeWithDetails } from "@/hooks/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { useAreas, useSubareas, usePositions } from "@/hooks/useAreas";
import { EmptyState } from "@/components/shared/SharedComponents";
import { LinkifiedText } from "@/components/shared/LinkifiedText";
import { extractVideoEmbeds, stripVideoUrlsFromText } from "@/lib/feed-embeds";
import { LinkEmbed } from "@/components/feed/LinkEmbed";
import { ReactorList, type ReactorInfo } from "@/components/feed/ReactorList";
import { AttachmentRenderer } from "@/components/feed/AttachmentRenderer";
import {
  MediaComposer, uploadFeedFiles, EMPTY_MEDIA_STATE,
  type MediaComposerState,
} from "@/components/feed/MediaComposer";

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */

function formatRelativeDate(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}


/* ══════════════════════════════════════
   FEED POST CARD
══════════════════════════════════════ */

interface FeedPostCardProps {
  post: FeedPost;
  currentEmployeeId: string | null;
  canDelete: boolean;
  onDelete: (id: string) => void;
  employees: EmployeeWithDetails[];
}

function FeedPostCard({ post, currentEmployeeId, canDelete, onDelete, employees }: FeedPostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [contentExpanded, setContentExpanded] = useState(false);

  const cleanedContent = useMemo(() => stripVideoUrlsFromText(post.content), [post.content]);
  const isLong = cleanedContent.length > 300;
  const preview = isLong && !contentExpanded ? cleanedContent.slice(0, 300) + "…" : cleanedContent;

  const { data: reactions = [] } = useFeedReactions(post.id);
  const { data: comments = [] } = useFeedComments(post.id);
  const toggleReaction = useToggleFeedReaction();
  const addComment = useAddFeedComment();
  const deleteComment = useDeleteFeedComment();

  const likeCount = reactions.filter((r) => r.reaction === "like").length;
  const loveCount = reactions.filter((r) => r.reaction === "love").length;
  const myLike = currentEmployeeId
    ? reactions.find((r) => r.employee_id === currentEmployeeId && r.reaction === "like")
    : undefined;
  const myLove = currentEmployeeId
    ? reactions.find((r) => r.employee_id === currentEmployeeId && r.reaction === "love")
    : undefined;

  const handleLike = () => toggleReaction.mutate({ postId: post.id, reaction: "like", currentReactions: reactions });
  const handleLove = () => toggleReaction.mutate({ postId: post.id, reaction: "love", currentReactions: reactions });

  const getReactors = (type: string): ReactorInfo[] =>
    reactions
      .filter((r) => r.reaction === type)
      .map((r) => {
        const e = employees.find((emp) => emp.id === r.employee_id);
        return {
          id: r.employee_id,
          full_name: e?.full_name ?? null,
          avatar_url: e?.avatar_url ?? null,
          position_title: e?.position_title ?? null,
        };
      });

  const videoEmbeds = useMemo(() => extractVideoEmbeds(post.content), [post.content]);

  const handleComment = async () => {
    const text = newComment.trim();
    if (!text) return;
    try {
      await addComment.mutateAsync({ postId: post.id, content: text });
      setNewComment("");
    } catch (e: any) { toast.error(e.message); }
  };

  const renderReactorButton = (
    icon: React.ReactNode,
    type: "like" | "love",
    count: number,
    isMine: boolean,
    onClick: () => void,
    label: string,
  ) => {
    const reactors = getReactors(type);
    return (
      <HoverCard openDelay={150} closeDelay={80}>
        <HoverCardTrigger asChild>
          <div className="flex items-center gap-1">
            <button
              onClick={onClick}
              aria-label={`${label} (${count})`}
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium transition-colors rounded-md px-1 py-0.5",
                isMine ? "text-primary" : "text-muted-foreground hover:text-primary",
              )}
            >
              {icon}
            </button>
            {count > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    aria-label={`Ver quem ${label.toLowerCase()}`}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
                  >
                    {count}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <p className="font-medium text-foreground text-xs mb-2 px-1">
                    {label} ({count})
                  </p>
                  <ReactorList reactors={reactors} />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </HoverCardTrigger>
        {count > 0 && (
          <HoverCardContent className="w-64 p-2" align="start">
            <p className="font-medium text-foreground text-xs mb-2 px-1">
              {label} ({count})
            </p>
            <ReactorList reactors={reactors} />
          </HoverCardContent>
        )}
      </HoverCard>
    );
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarImage src={post.employee?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials(post.employee?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold leading-tight">{post.employee?.full_name || "Colaborador"}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{formatRelativeDate(post.created_at)}</span>
              {post.visibility_type === "all"
                ? <Globe className="w-3 h-3" />
                : <Lock className="w-3 h-3" />}
            </div>
          </div>
        </div>
        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="text-muted-foreground hover:text-destructive transition-colors p-1" aria-label="Apagar post">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar este post?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. O post, suas reações e comentários serão removidos permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(post.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Apagar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Content (sem URLs de vídeo, que viram embed abaixo) */}
      {preview && (
        <LinkifiedText className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{preview}</LinkifiedText>
      )}
      {isLong && (
        <button onClick={() => setContentExpanded(!contentExpanded)}
          className="text-xs text-primary hover:underline mt-1 flex items-center gap-0.5">
          {contentExpanded ? <><ChevronUp className="w-3 h-3" />Mostrar menos</> : <><ChevronDown className="w-3 h-3" />Ver mais</>}
        </button>
      )}

      {/* Video embeds (YouTube / Vimeo) */}
      <LinkEmbed embeds={videoEmbeds} />

      {/* Attachments */}
      <AttachmentRenderer attachments={post.attachments || []} />

      {/* Tags */}
      {(post.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {post.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-2xs px-1.5 py-0">{tag}</Badge>
          ))}
        </div>
      )}

      {/* Reactions row */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/40">
        {renderReactorButton(
          <ThumbsUp className={cn("w-4 h-4", myLike && "fill-current")} />,
          "like",
          likeCount,
          !!myLike,
          handleLike,
          "Curtidas",
        )}
        {renderReactorButton(
          <Heart className={cn("w-4 h-4", myLove && "fill-current")} />,
          "love",
          loveCount,
          !!myLove,
          handleLove,
          "Amores",
        )}
        <button onClick={() => setCommentsOpen(!commentsOpen)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
          <MessageCircle className="w-4 h-4" />
          {comments.length > 0 && <span>{comments.length}</span>}
        </button>
      </div>

      {/* Comments */}
      {commentsOpen && (
        <div className="mt-3 space-y-3">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              canDelete={canDelete || c.employee_id === currentEmployeeId}
              onDelete={() => deleteComment.mutate({ commentId: c.id, postId: post.id })}
            />
          ))}
          <CommentComposer postId={post.id} />
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   COMMENT ITEM
══════════════════════════════════════ */

function CommentItem({
  comment,
  canDelete,
  onDelete,
}: {
  comment: FeedComment;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const cleaned = useMemo(() => stripVideoUrlsFromText(comment.content), [comment.content]);
  const videoEmbeds = useMemo(() => extractVideoEmbeds(comment.content), [comment.content]);
  const hasMedia = (comment.attachments?.length ?? 0) > 0 || videoEmbeds.length > 0;

  return (
    <div className="flex gap-2 group">
      <Avatar className="w-6 h-6 flex-shrink-0 mt-0.5">
        <AvatarImage src={comment.employee?.avatar_url || undefined} />
        <AvatarFallback className="text-2xs bg-muted">
          {initials(comment.employee?.full_name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="bg-muted rounded-xl px-3 py-1.5">
          <p className="text-xs font-semibold">
            {comment.employee?.full_name || "Colaborador"}
          </p>
          {cleaned && (
            <LinkifiedText className="text-xs text-foreground/80 whitespace-pre-wrap">{cleaned}</LinkifiedText>
          )}
        </div>
        {hasMedia && (
          <div className="mt-1.5">
            <LinkEmbed embeds={videoEmbeds} />
            <AttachmentRenderer attachments={comment.attachments || []} dense />
          </div>
        )}
      </div>
      {canDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive self-start mt-1"
              aria-label="Apagar comentário"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar este comentário?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Apagar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   COMMENT COMPOSER
══════════════════════════════════════ */

function CommentComposer({ postId }: { postId: string }) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState<MediaComposerState>(EMPTY_MEDIA_STATE);
  const [submitting, setSubmitting] = useState(false);

  const addComment = useAddFeedComment();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const hasContent =
    text.trim().length > 0 ||
    media.pendingFiles.length > 0 ||
    media.pendingVideoUrls.length > 0;

  const handleSubmit = async () => {
    if (!hasContent || !tenantId) return;
    setSubmitting(true);
    try {
      const attachments = await uploadFeedFiles(media.pendingFiles, tenantId);
      const finalContent = media.pendingVideoUrls.length
        ? [text.trim(), ...media.pendingVideoUrls].filter(Boolean).join("\n")
        : text.trim();
      await addComment.mutateAsync({ postId, content: finalContent, attachments });
      setText("");
      setMedia(EMPTY_MEDIA_STATE);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao publicar comentário");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex gap-2 items-start mt-2">
      <div className="flex-1 space-y-2">
        <Textarea
          rows={1}
          placeholder="Escrever comentário..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="text-xs min-h-0 resize-none py-2"
        />
        <MediaComposer
          tenantId={tenantId}
          state={media}
          onChange={setMedia}
          compact
          disabled={submitting}
        />
      </div>
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={!hasContent || submitting || addComment.isPending}
        className="h-8 w-8 p-0"
      >
        {submitting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Send className="w-3.5 h-3.5" />
        )}
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════
   COMPOSE BOX
══════════════════════════════════════ */

interface ComposeBoxProps {
  currentEmployee: EmployeeWithDetails | null;
}

function ComposeBox({ currentEmployee }: ComposeBoxProps) {
  const [content, setContent] = useState("");
  const [visibilityType, setVisibilityType] = useState<"all" | "specific">("all");
  const [targets, setTargets] = useState<FeedVisibilityTarget[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [addTargetType, setAddTargetType] = useState<"position" | "area" | "subarea" | "employee">("area");
  const [addTargetId, setAddTargetId] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [media, setMedia] = useState<MediaComposerState>(EMPTY_MEDIA_STATE);
  const [uploading, setUploading] = useState(false);

  const createPost = useCreateFeedPost();
  const { data: areas = [] } = useAreas();
  const { data: subareas = [] } = useSubareas();
  const { data: positions = [] } = usePositions();
  const { data: employees = [] } = useEmployees();
  const { profile } = useAuth();

  const activeEmployees = employees.filter((e) => e.status === "active");

  const targetOptions = {
    area: (areas as any[]).map((a) => ({ id: a.id, label: a.name })),
    subarea: (subareas as any[]).map((s) => ({ id: s.id, label: s.name })),
    position: (positions as any[]).map((p) => ({ id: p.id, label: p.title })),
    employee: activeEmployees.map((e) => ({ id: e.id, label: e.full_name || e.id })),
  };

  const TARGET_TYPE_LABELS: Record<string, string> = {
    area: "Área",
    subarea: "Subárea",
    position: "Cargo",
    employee: "Membro",
  };

  const addTarget = () => {
    if (!addTargetId) return;
    const found = targetOptions[addTargetType].find((o) => o.id === addTargetId);
    if (!found) return;
    if (targets.some((t) => t.type === addTargetType && t.id === addTargetId)) return;
    setTargets((prev) => [...prev, { type: addTargetType, id: addTargetId, label: found.label }]);
    setAddTargetId("");
  };

  const removeTarget = (idx: number) => setTargets((prev) => prev.filter((_, i) => i !== idx));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const handlePost = async () => {
    const text = content.trim();
    if (!text && media.pendingFiles.length === 0 && media.pendingVideoUrls.length === 0) return;
    if (!profile?.tenant_id) return;

    let finalTargets = targets;
    if (visibilityType === "specific" && addTargetId) {
      const found = targetOptions[addTargetType].find((o) => o.id === addTargetId);
      if (found && !targets.some((t) => t.type === addTargetType && t.id === addTargetId)) {
        finalTargets = [...targets, { type: addTargetType as FeedVisibilityTarget["type"], id: addTargetId, label: found.label }];
      }
    }

    // Anexa URLs de vídeo ao final do conteúdo (serão escondidas no render).
    const finalContent = media.pendingVideoUrls.length
      ? [text, ...media.pendingVideoUrls].filter(Boolean).join("\n")
      : text;

    setUploading(true);
    try {
      const attachments = await uploadFeedFiles(media.pendingFiles, profile.tenant_id);
      await createPost.mutateAsync({
        content: finalContent,
        visibility_type: visibilityType,
        visibility_targets: finalTargets,
        tags,
        attachments,
      });
      setContent("");
      setTargets([]);
      setTags([]);
      setVisibilityType("all");
      setShowOptions(false);
      setAddTargetId("");
      setMedia(EMPTY_MEDIA_STATE);
      toast.success("Post publicado!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex gap-3">
        <Avatar className="w-9 h-9 flex-shrink-0">
          <AvatarImage src={currentEmployee?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {initials(currentEmployee?.full_name)}
          </AvatarFallback>
        </Avatar>
        <Textarea
          placeholder="Compartilhe algo com a equipe…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => setShowOptions(true)}
          rows={showOptions ? 4 : 2}
          className="flex-1 resize-none text-sm"
        />
      </div>

      <div className="pl-12">
        <MediaComposer
          tenantId={profile?.tenant_id}
          state={media}
          onChange={setMedia}
          disabled={uploading}
        />
      </div>

      {showOptions && (
        <div className="space-y-3 pl-12">
          {/* Tags */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <TagIcon className="w-3 h-3" /> Tags
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                  {tag}
                  <button onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex gap-1">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="adicionar tag…" className="h-7 text-xs w-32" />
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={addTag}>+</Button>
              </div>
            </div>
          </div>

          {/* Visibilidade */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Globe className="w-3 h-3" /> Visibilidade
            </p>
            <div className="flex gap-2 mb-2">
              <button onClick={() => { setVisibilityType("all"); setTargets([]); }}
                className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  visibilityType === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                <Globe className="w-3 h-3" /> Todos
              </button>
              <button onClick={() => setVisibilityType("specific")}
                className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors",
                  visibilityType === "specific" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                <Lock className="w-3 h-3" /> Específico
              </button>
            </div>

            {visibilityType === "specific" && (
              <div className="space-y-2">
                {targets.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {targets.map((t, i) => (
                      <Badge key={i} variant="outline" className="gap-1 text-xs">
                        <span className="text-muted-foreground">{TARGET_TYPE_LABELS[t.type]}:</span> {t.label || t.id}
                        <button onClick={() => removeTarget(i)}><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5 flex-wrap">
                  <Select value={addTargetType} onValueChange={(v) => { setAddTargetType(v as any); setAddTargetId(""); }}>
                    <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="area">Área</SelectItem>
                      <SelectItem value="subarea">Subárea</SelectItem>
                      <SelectItem value="position">Cargo</SelectItem>
                      <SelectItem value="employee">Membro</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={addTargetId} onValueChange={setAddTargetId}>
                    <SelectTrigger className="h-7 text-xs flex-1 min-w-32"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                    <SelectContent>
                      {targetOptions[addTargetType].map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={addTarget} disabled={!addTargetId}>
                    Adicionar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pl-12">
        <button onClick={() => setShowOptions(!showOptions)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted">
          {showOptions ? <><ChevronUp className="w-3 h-3" />Ocultar opções</> : <><ChevronDown className="w-3 h-3" />Mais opções</>}
        </button>

        <Button size="sm" onClick={handlePost}
          disabled={(!content.trim() && media.pendingFiles.length === 0 && media.pendingVideoUrls.length === 0) || createPost.isPending || uploading}
          className="gap-1.5">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {uploading ? "Enviando…" : "Publicar"}
        </Button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════ */

export default function Feed() {
  const { data: posts, isLoading, isError } = useFeedPosts();
  const deletePost = useDeleteFeedPost();
  const { markRead } = useFeedUnreadCount();
  const { user } = useAuth();
  const { data: employees } = useEmployees();
  const { isAdmin, canManageProjects } = usePermissions();

  // Zera a contagem: ao entrar, ao chegar novo post enquanto a página está
  // aberta, e ao voltar a aba a ficar visível/focada.
  const postsCount = posts?.length ?? 0;
  useEffect(() => { markRead(); }, [markRead, postsCount]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") markRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [markRead]);

  // Deep-link ?post=<id> (ex.: clique no card "Ver publicação" vindo do chat):
  // rola até o post e destaca por um instante.
  const [searchParams] = useSearchParams();
  const focusPostId = searchParams.get("post");
  useEffect(() => {
    if (!focusPostId || !postsCount) return;
    const el = document.getElementById(`feed-post-${focusPostId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary", "rounded-2xl");
    const t = setTimeout(
      () => el.classList.remove("ring-2", "ring-primary", "rounded-2xl"),
      2200,
    );
    return () => clearTimeout(t);
  }, [focusPostId, postsCount]);

  const currentEmployee = employees?.find((e) => e.user_id === user?.id) || null;
  const currentEmployeeId = currentEmployee?.id || null;

  const canDeletePost = (post: FeedPost) =>
    isAdmin || canManageProjects || post.employee_id === currentEmployeeId;

  const handleDeletePost = async (id: string) => {
    try { await deletePost.mutateAsync(id); toast.success("Post removido."); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Rss className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">Feed</h1>
      </div>

      <ComposeBox currentEmployee={currentEmployee} />

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="flex gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="space-y-1.5"><Skeleton className="h-3 w-28" /><Skeleton className="h-2.5 w-20" /></div>
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-destructive">
          Erro ao carregar o feed.
        </div>
      ) : !posts?.length ? (
        <div className="bg-card border border-border rounded-2xl p-10">
          <EmptyState
            icon={<Rss className="w-8 h-8 text-muted-foreground" />}
            title="Nenhuma publicação ainda"
            description="Seja o primeiro a compartilhar algo com a equipe!" />
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post.id} id={`feed-post-${post.id}`} className="transition-shadow">
              <FeedPostCard post={post}
                currentEmployeeId={currentEmployeeId}
                canDelete={canDeletePost(post)}
                onDelete={handleDeletePost}
                employees={employees ?? []} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
