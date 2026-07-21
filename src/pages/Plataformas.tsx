import { useState, useRef } from "react";
import { ArrowUpRight, Pencil, Plus, Trash2, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatforms, uploadPlatformThumbnail, type Platform, type PlatformInput } from "@/hooks/usePlatforms";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS = [
  { label: "Azul",    value: "from-blue-600 to-indigo-700" },
  { label: "Violeta", value: "from-violet-600 to-purple-800" },
  { label: "Verde",   value: "from-emerald-500 to-teal-700" },
  { label: "Âmbar",  value: "from-amber-500 to-orange-700" },
  { label: "Rosa",    value: "from-rose-500 to-pink-700" },
  { label: "Ciano",   value: "from-cyan-500 to-sky-700" },
];

const EMPTY_FORM: PlatformInput = {
  name: "", description: "", href: "",
  color: COLOR_OPTIONS[0].value, initial: "",
  order_index: 0, thumbnail_url: null,
};

function screenshotUrl(href: string) {
  return `https://api.microlink.io/?url=${encodeURIComponent(href)}&screenshot=true&meta=false&embed=screenshot.url`;
}

/* ─── Card ─────────────────────────────────────────────────── */
function PlatformCard({ platform, isAdmin, onEdit, onDelete }: {
  platform: Platform;
  isAdmin: boolean;
  onEdit: (p: Platform) => void;
  onDelete: (p: Platform) => void;
}) {
  const [imgStatus, setImgStatus] = useState<"loading" | "ok" | "error">("loading");
  const src = platform.thumbnail_url ?? screenshotUrl(platform.href);

  return (
    <div className={cn(
      "group relative flex flex-col rounded-2xl border border-white/8 bg-card overflow-hidden cursor-pointer",
      "transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40 hover:border-white/15"
    )}>
      {/* Thumbnail 16:9 */}
      <div className={cn("relative w-full overflow-hidden bg-gradient-to-br", platform.color)}
        style={{ aspectRatio: "16/9" }}>

        {/* Inicial fallback */}
        {imgStatus !== "ok" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-7xl font-black text-white/20 select-none tracking-tighter">
              {platform.initial}
            </span>
          </div>
        )}

        {/* Screenshot */}
        <img
          src={src}
          alt={platform.name}
          className={cn(
            "absolute inset-0 w-full h-full object-cover object-center transition-all duration-500",
            "group-hover:scale-[1.03]",
            imgStatus === "ok" ? "opacity-100" : "opacity-0"
          )}
          loading="lazy"
          onLoad={() => setImgStatus("ok")}
          onError={() => setImgStatus("error")}
        />

        {/* Gradient overlay bottom */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card/80 to-transparent pointer-events-none" />

        {/* Admin actions — aparecem no hover */}
        {isAdmin && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(platform); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-colors"
              aria-label="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(platform); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-red-500/80 transition-colors"
              aria-label="Excluir"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 justify-between p-4 gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-foreground leading-tight">{platform.name}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{platform.description}</p>
        </div>

        <a
          href={platform.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1.5 self-start",
            "text-xs font-medium text-primary hover:text-primary/80",
            "transition-colors duration-150 cursor-pointer"
          )}
        >
          Acessar plataforma
          <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

/* ─── Modal ─────────────────────────────────────────────────── */
function PlatformFormDialog({ open, onClose, onSave, initial, title, loading }: {
  open: boolean; onClose: () => void;
  onSave: (data: PlatformInput) => void;
  initial: PlatformInput; title: string; loading: boolean;
}) {
  const [form, setForm] = useState<PlatformInput>(initial);
  const [preview, setPreview] = useState<string | null>(initial.thumbnail_url ?? null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof PlatformInput, value: string | number | null) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const tempId = (initial as Platform & { id?: string }).id ?? crypto.randomUUID();
      const url = await uploadPlatformThumbnail(file, tempId);
      set("thumbnail_url", url);
      setPreview(url);
    } catch {
      toast.error("Erro ao fazer upload da imagem.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Upload */}
          <div className="flex flex-col gap-1.5">
            <Label>Foto do card</Label>
            <div
              className={cn(
                "relative w-full rounded-xl border border-dashed border-border overflow-hidden bg-muted cursor-pointer",
                "hover:bg-muted/70 transition-colors"
              )}
              style={{ aspectRatio: "16/9" }}
              onClick={() => fileRef.current?.click()}
            >
              {preview ? (
                <>
                  <img src={preview} alt="preview" className="w-full h-full object-contain" />
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); set("thumbnail_url", null); setPreview(null); }}
                    className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  {uploading
                    ? <span className="text-xs animate-pulse">Enviando...</span>
                    : <><ImageIcon className="w-6 h-6" /><span className="text-xs">Clique para fazer upload</span></>
                  }
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <p className="text-xs text-muted-foreground">JPG, PNG ou WebP • máx. 5 MB. Sem foto = screenshot automático.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="OMNX Skills" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)}
              placeholder="Breve descrição da plataforma" rows={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>URL</Label>
            <Input value={form.href} onChange={(e) => set("href", e.target.value)} placeholder="https://..." />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label>Inicial (fallback)</Label>
              <Input value={form.initial}
                onChange={(e) => set("initial", e.target.value.slice(0, 2).toUpperCase())}
                placeholder="S" maxLength={2} />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label>Ordem</Label>
              <Input type="number" value={form.order_index}
                onChange={(e) => set("order_index", Number(e.target.value))} min={0} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cor do card</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button key={c.value} type="button" onClick={() => set("color", c.value)}
                  className={cn(
                    `w-8 h-8 rounded-lg bg-gradient-to-br ${c.value} transition-all ring-offset-background`,
                    form.color === c.value ? "ring-2 ring-primary ring-offset-2 scale-110" : "ring-0 hover:scale-105"
                  )}
                  title={c.label} />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => { if (!form.name.trim() || !form.href.trim()) return; onSave(form); }}
            disabled={loading || uploading || !form.name.trim() || !form.href.trim()}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Página ────────────────────────────────────────────────── */
export default function Plataformas() {
  const { isAdmin } = usePermissions();
  const { platforms, isLoading, updatePlatform, createPlatform, deletePlatform } = usePlatforms();

  const [editTarget, setEditTarget] = useState<Platform | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Platform | null>(null);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Plataformas</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesse todas as plataformas do ecossistema.</p>
        </div>
        {isAdmin && (
          <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden border border-white/8">
              <Skeleton className="w-full" style={{ aspectRatio: "16/9" }} />
              <div className="p-4 flex flex-col gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : platforms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
            <ImageIcon className="w-6 h-6" />
          </div>
          <p className="text-sm">Nenhuma plataforma cadastrada.</p>
          {isAdmin && (
            <Button size="sm" variant="outline" className="gap-2 mt-1" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> Adicionar primeira plataforma
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {platforms.map((p) => (
            <PlatformCard key={p.id} platform={p} isAdmin={isAdmin}
              onEdit={setEditTarget} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      {/* Modais */}
      {editTarget && (
        <PlatformFormDialog open title="Editar plataforma" initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(data) => updatePlatform.mutate({ id: editTarget.id, input: data }, { onSuccess: () => setEditTarget(null) })}
          loading={updatePlatform.isPending} />
      )}
      <PlatformFormDialog open={addOpen} title="Nova plataforma" initial={EMPTY_FORM}
        onClose={() => setAddOpen(false)}
        onSave={(data) => createPlatform.mutate(data, { onSuccess: () => setAddOpen(false) })}
        loading={createPlatform.isPending} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover plataforma?</AlertDialogTitle>
            <AlertDialogDescription>"{deleteTarget?.name}" será removida permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deletePlatform.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
              className="bg-destructive hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
