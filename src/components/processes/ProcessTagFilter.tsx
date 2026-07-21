import { useState } from "react";
import { Tags, Plus, Pencil, Trash2, Check, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface ProcessTag {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  created_by: string | null;
  created_at: string | null;
}

interface ProcessTagFilterProps {
  tags: ProcessTag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<void>;
  onUpdateTag: (id: string, name: string, color: string) => Promise<void>;
  onDeleteTag: (id: string) => Promise<void>;
  isLoading?: boolean;
  canManage?: boolean;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#64748b",
];

type EditingTag = { id: string; name: string; color: string } | null;

export function ProcessTagFilter({
  tags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  isLoading,
  canManage,
}: ProcessTagFilterProps) {
  const [manageOpen, setManageOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [editingTag, setEditingTag] = useState<EditingTag>(null);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

  const handleCreateTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    await onCreateTag(trimmed, newTagColor);
    setNewTagName("");
    setNewTagColor(PRESET_COLORS[0]);
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !editingTag.name.trim()) return;
    await onUpdateTag(editingTag.id, editingTag.name.trim(), editingTag.color);
    setEditingTag(null);
  };

  const handleDeleteTag = async () => {
    if (!deletingTagId) return;
    await onDeleteTag(deletingTagId);
    setDeletingTagId(null);
  };

  if (isLoading) {
    return (
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (tags.length === 0 && canManage) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setManageOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Criar tag
      </Button>
    );
  }

  const ColorPicker = ({
    selected,
    onChange,
  }: {
    selected: string;
    onChange: (color: string) => void;
  }) => (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            "h-7 w-7 rounded-full border-2 flex items-center justify-center transition-transform",
            selected === color ? "scale-110 border-foreground" : "border-transparent hover:scale-105",
          )}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
        >
          {selected === color && <Check className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Tags className="h-4 w-4 shrink-0 text-muted-foreground" />

        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap",
                isSelected
                  ? "bg-card"
                  : "bg-transparent border-border text-muted-foreground hover:bg-accent",
              )}
              style={
                isSelected
                  ? { borderColor: tag.color, color: tag.color }
                  : undefined
              }
              onClick={() => onToggleTag(tag.id)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
            </button>
          );
        })}

        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-muted-foreground h-7"
            onClick={() => setManageOpen(true)}
          >
            <Settings className="h-3.5 w-3.5" />
            Gerenciar tags
          </Button>
        )}
      </div>

      {/* Tag Management Dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Tags</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Existing tags */}
            {tags.length > 0 && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                  Tags existentes
                </Label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {tags.map((tag) => {
                    const isEditingThis = editingTag?.id === tag.id;

                    if (isEditingThis) {
                      return (
                        <div key={tag.id} className="space-y-2 rounded-md border border-border p-2">
                          <Input
                            autoFocus
                            value={editingTag.name}
                            onChange={(e) =>
                              setEditingTag({ ...editingTag, name: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleUpdateTag();
                              if (e.key === "Escape") setEditingTag(null);
                            }}
                            className="h-8 text-sm"
                          />
                          <ColorPicker
                            selected={editingTag.color}
                            onChange={(color) =>
                              setEditingTag({ ...editingTag, color })
                            }
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleUpdateTag}>
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingTag(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={tag.id}
                        className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                      >
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm flex-1 truncate">{tag.name}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() =>
                            setEditingTag({ id: tag.id, name: tag.name, color: tag.color })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeletingTagId(tag.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* New tag form */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                Nova tag
              </Label>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTag();
                }}
                placeholder="Nome da tag"
                className="h-8 text-sm"
              />
              <ColorPicker selected={newTagColor} onChange={setNewTagColor} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>
              Fechar
            </Button>
            <Button onClick={handleCreateTag} disabled={!newTagName.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Criar tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingTagId} onOpenChange={(open) => !open && setDeletingTagId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tag</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta tag? Ela sera removida de todos os processos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTag}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
