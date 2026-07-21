import { useState, useMemo, useCallback } from "react";
import {
  Folder, FolderOpen, ChevronRight, ChevronDown, Plus,
  MoreHorizontal, Pencil, Trash2, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProcessFolder {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string | null;
}

interface ProcessFolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onMoveFolder?: (id: string, parentId: string | null) => Promise<void>;
  folders: ProcessFolder[];
  isLoading?: boolean;
  canManage?: boolean;
}

type EditingState = { id: string; name: string } | null;
type CreatingState = { parentId: string | null } | null;

function buildTree(folders: ProcessFolder[]): Map<string | null, ProcessFolder[]> {
  const map = new Map<string | null, ProcessFolder[]>();
  for (const f of folders) {
    const key = f.parent_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  for (const children of map.values()) {
    children.sort((a, b) => a.sort_order - b.sort_order);
  }
  return map;
}

export function ProcessFolderTree({
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  folders,
  isLoading,
  canManage,
}: ProcessFolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditingState>(null);
  const [creating, setCreating] = useState<CreatingState>(null);
  const [newName, setNewName] = useState("");

  const tree = useMemo(() => buildTree(folders), [folders]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const hasChildren = useCallback(
    (id: string) => (tree.get(id)?.length ?? 0) > 0,
    [tree],
  );

  const handleCreateSubmit = async () => {
    const trimmed = newName.trim();
    if (!trimmed || !creating) return;
    await onCreateFolder(trimmed, creating.parentId);
    if (creating.parentId) {
      setExpanded((prev) => new Set(prev).add(creating.parentId!));
    }
    setCreating(null);
    setNewName("");
  };

  const handleRenameSubmit = async () => {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed) return;
    await onRenameFolder(editing.id, trimmed);
    setEditing(null);
  };

  const startCreate = (parentId: string | null) => {
    setCreating({ parentId });
    setNewName("");
  };

  const cancelCreate = () => {
    setCreating(null);
    setNewName("");
  };

  const renderCreateInput = (parentId: string | null, depth: number) => {
    if (!creating || creating.parentId !== parentId) return null;
    return (
      <div className="flex items-center gap-1 py-1" style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreateSubmit();
            if (e.key === "Escape") cancelCreate();
          }}
          placeholder="Nome da pasta"
          className="h-7 text-sm"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCreateSubmit}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  const renderFolder = (folder: ProcessFolder, depth: number) => {
    const isSelected = selectedFolderId === folder.id;
    const isExpanded = expanded.has(folder.id);
    const children = tree.get(folder.id) ?? [];
    const isEditing = editing?.id === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors hover:bg-muted",
            isSelected && "bg-muted font-medium text-foreground",
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (!isEditing) onSelectFolder(folder.id);
          }}
        >
          {(children.length > 0 || hasChildren(folder.id)) ? (
            <button
              className="shrink-0 p-0.5 hover:bg-muted rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(folder.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}

          {isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          {isEditing ? (
            <Input
              autoFocus
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") setEditing(null);
              }}
              onBlur={handleRenameSubmit}
              className="h-6 text-sm flex-1"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex-1">{folder.name}</span>
          )}

          {canManage && !isEditing && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  startCreate(folder.id);
                  setExpanded((prev) => new Set(prev).add(folder.id));
                }}
                title="Nova subpasta"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing({ id: folder.id, name: folder.name });
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFolder(folder.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {isExpanded && (
          <>
            {children.map((child) => renderFolder(child, depth + 1))}
            {renderCreateInput(folder.id, depth)}
          </>
        )}
      </div>
    );
  };

  const rootFolders = tree.get(null) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded bg-muted/80 dark:bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 py-2">
      {/* Root option: Todos os Processos */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm cursor-pointer transition-colors hover:bg-muted",
          selectedFolderId === null && "bg-muted font-medium text-foreground",
        )}
        onClick={() => onSelectFolder(null)}
      >
        <List className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">Todos os Documentos</span>
      </div>

      {/* Folder tree */}
      {rootFolders.map((folder) => renderFolder(folder, 0))}

      {/* Create input for root level */}
      {renderCreateInput(null, -1)}

      {/* New root folder button */}
      {canManage && !creating && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-2 text-muted-foreground mt-1"
          onClick={() => startCreate(null)}
        >
          <Plus className="h-4 w-4" />
          Nova pasta
        </Button>
      )}
    </div>
  );
}
