import { useState, useMemo } from "react";
import { Megaphone, Plus, Tag, Pin, Trash2, Edit2, Eye, X, Check, Heart, MessageCircle, Send, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAnnouncements, useAllAnnouncementTags, type Announcement, type VisibilityTarget, type VisibilityTargetType } from "@/hooks/useAnnouncements";
import { useAnnouncementComments, useAnnouncementReactions, useAddComment, useDeleteComment, useToggleReaction } from "@/hooks/useAnnouncementInteractions";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useAllPositions } from "@/hooks/useAreas";
import { useEmployees } from "@/hooks/useEmployees";
import { useAreas } from "@/hooks/useAreas";
import { EmptyState } from "@/components/shared/SharedComponents";

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */

function formatRelativeDate(iso: string) {
  const now = Date.now();
  const d = new Date(iso).getTime();
  const diff = Math.floor((now - d) / 1000);
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

function visibilityLabel(targets: VisibilityTarget[]) {
  if (!targets.length || targets.some((t) => t.target_type === "all")) return "Todos";
  return `${targets.length} grupo${targets.length > 1 ? "s" : ""}`;
}

/* ══════════════════════════════════════
   ANNOUNCEMENT CARD
══════════════════════════════════════ */

interface AnnouncementCardProps {
  ann: Announcement;
  canManage: boolean;
  currentEmployeeId: string | null;
  onEdit: (ann: Announcement) => void;
  onDelete: (id: string) => void;
}

function AnnouncementCard({ ann, canManage, currentEmployeeId, onEdit, onDelete }: AnnouncementCardProps) {
  const [contentExpanded, setContentExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [newComment, setNewComment] = useState("");

  const isLong = ann.content.length > 280;
  const preview = isLong && !contentExpanded ? ann.content.slice(0, 280) + "…" : ann.content;

  const { data: reactions = [] } = useAnnouncementReactions(ann.id);
  const { data: comments = [], isLoading: commentsLoading } = useAnnouncementComments(ann.id);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const toggleReaction = useToggleReaction();

  const likeCount = reactions.filter((r) => r.reaction === "like").length;
  const myLike = currentEmployeeId
    ? reactions.find((r) => r.employee_id === currentEmployeeId && r.reaction === "like")
    : undefined;

  const handleLike = () => {
    toggleReaction.mutate({ announcementId: ann.id, reaction: "like", currentReactions: reactions });
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    await addComment.mutateAsync({ announcementId: ann.id, content: newComment });
    setNewComment("");
  };

  return (
    <div className={cn(
      "bg-card border border-border rounded-2xl shadow-card overflow-hidden",
      ann.pinned && "border-primary/30 ring-1 ring-primary/20"
    )}>
      {ann.cover_url && (
        <img src={ann.cover_url} alt="" className="w-full h-48 object-cover" />
      )}
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <Avatar className="w-9 h-9">
              <AvatarImage src={ann.author_avatar || undefined} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials(ann.author_name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">{ann.author_name || "—"}</p>
              <p className="text-xs text-muted-foreground">{formatRelativeDate(ann.published_at || ann.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {ann.pinned && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Pin className="w-3 h-3" /> Fixado
              </Badge>
            )}
            <Badge variant={ann.type === "announcement" ? "default" : "outline"} className="text-xs">
              {ann.type === "announcement" ? "Comunicado" : "Postagem"}
            </Badge>
            {canManage && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(ann)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(ann.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-foreground mb-2">{ann.title}</h3>

        {/* Content */}
        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{preview}</p>
        {isLong && (
          <button onClick={() => setContentExpanded((v) => !v)} className="text-xs text-primary mt-1 hover:underline">
            {contentExpanded ? "Ver menos" : "Ver mais"}
          </button>
        )}

        {/* Tags + visibility */}
        {(ann.tags.length > 0 || ann.visibility.length > 0) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
            {ann.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                <Tag className="w-2.5 h-2.5" />{tag}
              </span>
            ))}
            {canManage && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                <Eye className="w-3 h-3" /> {visibilityLabel(ann.visibility)}
              </span>
            )}
          </div>
        )}

        {/* Reactions + Comment count bar */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
          {/* Like */}
          <button
            className={cn(
              "flex items-center gap-1.5 text-sm transition-colors",
              myLike ? "text-destructive" : "text-muted-foreground hover:text-destructive"
            )}
            onClick={handleLike}
            disabled={!currentEmployeeId || toggleReaction.isPending}
          >
            <Heart className={cn("w-4 h-4", myLike && "fill-current")} />
            {likeCount > 0 && <span className="text-xs font-medium">{likeCount}</span>}
          </button>

          {/* Comments toggle */}
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setCommentsOpen((v) => !v)}
          >
            <MessageCircle className="w-4 h-4" />
            {comments.length > 0 && <span className="text-xs font-medium">{comments.length}</span>}
            <span className="text-xs">{comments.length === 0 ? "Comentar" : commentsOpen ? "Fechar" : "Ver comentários"}</span>
          </button>
        </div>

        {/* Comments section */}
        {commentsOpen && (
          <div className="mt-3 space-y-3">
            {/* Comment list */}
            {commentsLoading ? (
              <p className="text-xs text-muted-foreground">Carregando comentários...</p>
            ) : comments.length > 0 ? (
              <div className="space-y-2.5">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <Avatar className="w-7 h-7 flex-shrink-0">
                      <AvatarImage src={c.author_avatar || undefined} />
                      <AvatarFallback className="text-xs">{initials(c.author_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 bg-muted rounded-xl px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">{c.author_name || "—"}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-2xs text-muted-foreground">{formatRelativeDate(c.created_at)}</span>
                          {(canManage || c.author_id === currentEmployeeId) && (
                            <button
                              onClick={() => deleteComment.mutate({ commentId: c.id, announcementId: ann.id })}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Seja o primeiro a comentar.</p>
            )}

            {/* Add comment input */}
            {currentEmployeeId && (
              <div className="flex gap-2 mt-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Escreva um comentário..."
                  className="h-8 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendComment(); } }}
                />
                <Button
                  size="sm"
                  className="h-8 px-3"
                  onClick={handleSendComment}
                  disabled={!newComment.trim() || addComment.isPending}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   VISIBILITY BUILDER
══════════════════════════════════════ */

interface VisibilityBuilderProps {
  value: VisibilityTarget[];
  onChange: (targets: VisibilityTarget[]) => void;
}

function VisibilityBuilder({ value, onChange }: VisibilityBuilderProps) {
  const { data: positions } = useAllPositions();
  const { data: employees } = useEmployees();
  const { data: areasData } = useAreas();

  const [targetType, setTargetType] = useState<VisibilityTargetType>("all");
  const [targetId, setTargetId] = useState<string>("");

  const isAll = value.some((v) => v.target_type === "all");

  const addTarget = () => {
    if ((targetType as string) === "all") {
      onChange([{ target_type: "all" as VisibilityTargetType }]);
      return;
    }
    if (!targetId) return;
    if (value.some((v) => v.target_type === targetType && v.target_id === targetId)) return;
    onChange([...value.filter((v) => (v.target_type as string) !== "all"), { target_type: targetType, target_id: targetId }]);
    setTargetId("");
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  const labelFor = (v: VisibilityTarget) => {
    if (v.target_type === "all") return "Todos os colaboradores";
    if (v.target_type === "position") return positions?.find((p) => p.id === v.target_id)?.title || v.target_id;
    if (v.target_type === "employee") return employees?.find((e) => e.id === v.target_id)?.full_name || v.target_id;
    if (v.target_type === "area") return areasData?.find((a) => a.id === v.target_id)?.name || v.target_id;
    return v.target_id;
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Visibilidade</Label>
      <div className="flex gap-2">
        <Select value={targetType} onValueChange={(v) => { setTargetType(v as VisibilityTargetType); setTargetId(""); }}>
          <SelectTrigger className="h-8 text-sm w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="position">Cargo</SelectItem>
            <SelectItem value="employee">Pessoa</SelectItem>
            <SelectItem value="area">Área</SelectItem>
          </SelectContent>
        </Select>

        {targetType !== "all" && (
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="h-8 text-sm flex-1">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              {targetType === "position" && positions?.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
              {targetType === "employee" && employees?.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
              ))}
              {targetType === "area" && areasData?.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button type="button" size="sm" variant="outline" className="h-8 px-3" onClick={addTarget} disabled={isAll && targetType === "all"}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-1">
        {value.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
            {labelFor(v)}
            {!(v.target_type === "all") && (
              <button onClick={() => remove(i)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   CREATE / EDIT MODAL
══════════════════════════════════════ */

interface AnnouncementFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Announcement | null;
  onSave: (data: any) => Promise<void>;
}

function AnnouncementForm({ open, onOpenChange, existing, onSave }: AnnouncementFormProps) {
  const [title, setTitle] = useState(existing?.title || "");
  const [content, setContent] = useState(existing?.content || "");
  const [type, setType] = useState<"announcement" | "post">(existing?.type || "post");
  const [status, setStatus] = useState<"draft" | "published">(existing?.status === "draft" ? "draft" : "published");
  const [tagsInput, setTagsInput] = useState((existing?.tags || []).join(", "));
  const [pinned, setPinned] = useState(existing?.pinned || false);
  const [coverUrl, setCoverUrl] = useState(existing?.cover_url || "");
  const [visibility, setVisibility] = useState<VisibilityTarget[]>(
    existing?.visibility?.length ? existing.visibility : [{ target_type: "all" }]
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Título é obrigatório"); return; }
    setSaving(true);
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await onSave({
        id: existing?.id,
        title: title.trim(),
        content: content.trim(),
        type,
        status,
        tags,
        pinned,
        cover_url: coverUrl.trim() || null,
        visibility,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Editar" : "Novo"} comunicado</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="announcement">Comunicado oficial</SelectItem>
                  <SelectItem value="post">Postagem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Publicado</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 text-sm" placeholder="Título do comunicado..." />
          </div>

          <div>
            <Label className="text-xs">Conteúdo</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="mt-1 text-sm resize-none" rows={5} placeholder="Escreva o conteúdo..." />
          </div>

          <div>
            <Label className="text-xs">Tags (separadas por vírgula)</Label>
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="mt-1 text-sm" placeholder="Ex: RH, Benefícios, Urgente" />
          </div>

          <div>
            <Label className="text-xs">URL da imagem de capa (opcional)</Label>
            <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} className="mt-1 text-sm" placeholder="https://..." />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPinned((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                pinned ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <Pin className="w-3.5 h-3.5" />
              {pinned ? "Fixado no topo" : "Fixar no topo"}
              {pinned && <Check className="w-3 h-3" />}
            </button>
          </div>

          <VisibilityBuilder value={visibility} onChange={setVisibility} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════
   PAGE
══════════════════════════════════════ */

export default function Comunicados() {
  const [activeTab, setActiveTab] = useState<"all" | "announcement" | "post">("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);

  const { isAdmin, isManager } = usePermissions();
  const { user } = useAuth();
  const { data: employees } = useEmployees();
  const currentEmployeeId = employees?.find((employee) => employee.user_id === user?.id)?.id ?? null;
  const canCreate = isAdmin || isManager;
  const canManageAnnouncement = (ann: Announcement) =>
    isAdmin || (isManager && !!currentEmployeeId && ann.author_id === currentEmployeeId);

  const { data: allTags } = useAllAnnouncementTags();
  const { announcements, isLoading, isError, createAnnouncement, updateAnnouncement, deleteAnnouncement } =
    useAnnouncements({
      type: activeTab === "all" ? undefined : activeTab,
      tag: activeTag || undefined,
    });

  const handleSave = async (data: any) => {
    if (data.id) {
      await updateAnnouncement.mutateAsync(data);
      toast.success("Comunicado atualizado!");
    } else {
      await createAnnouncement.mutateAsync(data);
      toast.success("Comunicado publicado!");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este comunicado?")) return;
    try {
      await deleteAnnouncement.mutateAsync(id);
      toast.success("Comunicado excluído.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
  };

  const handleEdit = (ann: Announcement) => {
    setEditTarget(ann);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-h1 font-bold text-foreground flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-primary" />
          Comunicados
        </h1>
        {canCreate && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { setEditTarget(null); setFormOpen(true); }}
          >
            <Plus className="w-4 h-4" /> Novo comunicado
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-auto">
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="announcement">Comunicados</TabsTrigger>
            <TabsTrigger value="post">Postagens</TabsTrigger>
          </TabsList>
        </Tabs>

        {allTags && allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={cn(
                  "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors",
                  activeTag === tag
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Tag className="w-2.5 h-2.5" />{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
              <div className="flex gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-32" />
                  <div className="h-2.5 bg-muted rounded w-20" />
                </div>
              </div>
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-4/5 mt-1.5" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-destructive">
          Erro ao carregar comunicados.
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8">
          <EmptyState
            icon={<Megaphone className="w-8 h-8 text-muted-foreground" />}
            title="Nenhum comunicado"
            description={canCreate ? "Crie o primeiro comunicado clicando em 'Novo comunicado'." : "Nenhum comunicado publicado ainda."}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <AnnouncementCard
              key={ann.id}
              ann={ann}
              canManage={canManageAnnouncement(ann)}
              currentEmployeeId={currentEmployeeId}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {formOpen && (
        <AnnouncementForm
          open={formOpen}
          onOpenChange={(v) => { setFormOpen(v); if (!v) setEditTarget(null); }}
          existing={editTarget}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
