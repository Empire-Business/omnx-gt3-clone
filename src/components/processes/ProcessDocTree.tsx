import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  FolderOpen, Folder, FolderPlus, File, ChevronRight, ChevronDown,
  MoreHorizontal, Pencil, Trash2, Globe, Lock, Plus, FileUp, Share2, GripVertical,
  FolderInput, CheckSquare, X, ArrowRightLeft, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import type { DocFolder, DocDocument } from "@/types/documents";
import { cn } from "@/lib/utils";

interface Props {
  folders: DocFolder[];
  documents: DocDocument[];
  selectedDocId: string | null;
  onSelectDoc: (id: string | null) => void;
  onCreateFolder: (name: string, parentId?: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onToggleFolderPublic: (id: string, isPublic: boolean) => void;
  onCreateDoc: (folderId?: string | null) => void;
  onDeleteDoc: (id: string) => void;
  onToggleDocPublic: (id: string, isPublic: boolean) => void;
  onShareItem: (item: DocFolder | DocDocument, type: "folder" | "document") => void;
  onReorderFolders?: (reorderedIds: { id: string; sort_order: number }[]) => void;
  onReorderDocs?: (reorderedIds: { id: string; sort_order: number }[]) => void;
  onImport: (folderId?: string | null) => void;
  canManage: boolean;
  onMoveDoc?: (docId: string, targetFolderId: string | null) => void;
  onMoveMultipleDocs?: (docIds: string[], targetFolderId: string | null) => void;
}

// Tree item type for keyboard navigation
interface TreeItem {
  id: string;
  type: "folder" | "document";
  depth: number;
  folderId?: string;
}

// Helper to highlight matching text
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <mark className="bg-accent/30 text-accent-foreground px-0.5 rounded">
        {match}
      </mark>
      {after}
    </>
  );
}

export function ProcessDocTree({
  folders, documents, selectedDocId, onSelectDoc,
  onCreateFolder, onRenameFolder, onDeleteFolder, onToggleFolderPublic,
  onCreateDoc, onDeleteDoc, onToggleDocPublic, onShareItem,
  onReorderFolders, onReorderDocs, onImport, canManage,
  onMoveDoc, onMoveMultipleDocs,
}: Props) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderParentId, setNewFolderParentId] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "folder" | "doc"; id: string } | null>(null);

  // Move dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingDocIds, setMovingDocIds] = useState<string[]>([]);

  // Multi-select state
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard navigation state
  const [focusedItemIndex, setFocusedItemIndex] = useState<number>(-1);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const focusedItemRef = useRef<HTMLDivElement>(null);

  // Store original expansion state before search
  const [preSearchExpandedFolders, setPreSearchExpandedFolders] = useState<Set<string> | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const rootFolders = useMemo(() =>
    folders.filter((f) => !f.parent_id).sort((a, b) => a.sort_order - b.sort_order),
    [folders]
  );
  const rootDocs = useMemo(() =>
    documents.filter((d) => !d.folder_id).sort((a, b) => a.sort_order - b.sort_order),
    [documents]
  );

  const getChildFolders = useCallback((parentId: string) =>
    folders.filter((f) => f.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order),
    [folders]
  );
  const getFolderDocs = useCallback((folderId: string) =>
    documents.filter((d) => d.folder_id === folderId).sort((a, b) => a.sort_order - b.sort_order),
    [documents]
  );

  // Build flat list of visible items for keyboard navigation
  const visibleItems = useMemo((): TreeItem[] => {
    const items: TreeItem[] = [];

    const addFolderItems = (folderList: DocFolder[], depth: number) => {
      for (const folder of folderList) {
        items.push({ id: folder.id, type: "folder", depth });
        if (expandedFolders.has(folder.id)) {
          addFolderItems(getChildFolders(folder.id), depth + 1);
          for (const doc of getFolderDocs(folder.id)) {
            items.push({ id: doc.id, type: "document", depth: depth + 1, folderId: folder.id });
          }
        }
      }
    };

    // Add root folders and their contents
    addFolderItems(rootFolders, 0);

    // Add root documents
    for (const doc of rootDocs) {
      items.push({ id: doc.id, type: "document", depth: 0, folderId: null });
    }

    return items;
  }, [rootFolders, rootDocs, expandedFolders, getChildFolders, getFolderDocs]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return null;

    const query = searchQuery.toLowerCase();
    const matchingFolderIds = new Set<string>();
    const matchingDocIds = new Set<string>();

    // Find all matching items
    folders.forEach(f => {
      if (f.name.toLowerCase().includes(query)) {
        matchingFolderIds.add(f.id);
      }
    });
    documents.forEach(d => {
      if (d.title.toLowerCase().includes(query)) {
        matchingDocIds.add(d.id);
      }
    });

    // Find parent folders of matching items
    const foldersToExpand = new Set<string>();

    const findParentFolders = (folderId: string | null) => {
      if (!folderId) return;
      foldersToExpand.add(folderId);
      const folder = folders.find(f => f.id === folderId);
      if (folder?.parent_id) {
        findParentFolders(folder.parent_id);
      }
    };

    matchingFolderIds.forEach(id => {
      const folder = folders.find(f => f.id === id);
      if (folder?.parent_id) findParentFolders(folder.parent_id);
    });

    matchingDocIds.forEach(docId => {
      const doc = documents.find(d => d.id === docId);
      if (doc?.folder_id) findParentFolders(doc.folder_id);
    });

    return {
      matchingFolderIds,
      matchingDocIds,
      foldersToExpand
    };
  }, [searchQuery, folders, documents]);

  // Handle search expansion
  useEffect(() => {
    if (filteredItems && filteredItems.foldersToExpand.size > 0) {
      // Store original state if not already stored
      if (preSearchExpandedFolders === null) {
        setPreSearchExpandedFolders(new Set(expandedFolders));
      }
      // Expand folders containing matches
      setExpandedFolders(prev => {
        const next = new Set(prev);
        filteredItems.foldersToExpand.forEach(id => next.add(id));
        return next;
      });
    } else if (!searchQuery.trim() && preSearchExpandedFolders !== null) {
      // Restore original state when search is cleared
      setExpandedFolders(preSearchExpandedFolders);
      setPreSearchExpandedFolders(null);
    }
  }, [filteredItems, searchQuery]);

  // Check if an item matches the search
  const itemMatchesSearch = (id: string, type: "folder" | "document"): boolean => {
    if (!filteredItems) return true;
    return type === "folder"
      ? filteredItems.matchingFolderIds.has(id)
      : filteredItems.matchingDocIds.has(id);
  };

  // Check if item should be visible (it matches or contains matching children)
  const isItemVisible = (id: string, type: "folder" | "document"): boolean => {
    if (!filteredItems) return true;

    if (type === "folder") {
      if (filteredItems.matchingFolderIds.has(id)) return true;
      // Check if any descendant matches
      const checkDescendants = (folderId: string): boolean => {
        const childFolders = folders.filter(f => f.parent_id === folderId);
        const childDocs = documents.filter(d => d.folder_id === folderId);

        for (const child of childFolders) {
          if (filteredItems.matchingFolderIds.has(child.id)) return true;
          if (checkDescendants(child.id)) return true;
        }
        for (const doc of childDocs) {
          if (filteredItems.matchingDocIds.has(doc.id)) return true;
        }
        return false;
      };
      return checkDescendants(id);
    } else {
      return filteredItems.matchingDocIds.has(id);
    }
  };

  // Keyboard navigation handlers
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = visibleItems;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedItemIndex(prev =>
          prev < items.length - 1 ? prev + 1 : prev
        );
        break;

      case "ArrowUp":
        e.preventDefault();
        setFocusedItemIndex(prev =>
          prev > 0 ? prev - 1 : prev
        );
        break;

      case "ArrowRight": {
        e.preventDefault();
        const item = items[focusedItemIndex];
        if (item?.type === "folder") {
          if (!expandedFolders.has(item.id)) {
            toggleExpand(item.id);
          } else {
            // Move to first child
            setFocusedItemIndex(prev => prev + 1);
          }
        }
        break;
      }

      case "ArrowLeft": {
        e.preventDefault();
        const item = items[focusedItemIndex];
        if (item?.type === "folder" && expandedFolders.has(item.id)) {
          toggleExpand(item.id);
        } else if (item && item.depth > 0) {
          // Move to parent folder
          let parentIndex = focusedItemIndex - 1;
          while (parentIndex >= 0) {
            const potentialParent = items[parentIndex];
            if (potentialParent.type === "folder" && potentialParent.depth === item.depth - 1) {
              setFocusedItemIndex(parentIndex);
              break;
            }
            parentIndex--;
          }
        }
        break;
      }

      case "Enter": {
        e.preventDefault();
        const item = items[focusedItemIndex];
        if (item?.type === "document") {
          onSelectDoc(item.id);
        } else if (item?.type === "folder") {
          toggleExpand(item.id);
        }
        break;
      }

      case "Escape":
        if (document.activeElement === searchInputRef.current) {
          setSearchQuery("");
          (document.activeElement as HTMLElement).blur();
        } else {
          setFocusedItemIndex(-1);
          onSelectDoc(null);
        }
        break;
    }
  }, [visibleItems, focusedItemIndex, expandedFolders, onSelectDoc]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedItemRef.current) {
      focusedItemRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedItemIndex]);

  // Focus search on slash key
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const handleSubmitNewFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim(), newFolderParentId);
      setNewFolderName("");
      setNewFolderParentId(undefined);
    }
  };

  const handleSubmitRename = (id: string) => {
    if (renameValue.trim()) {
      onRenameFolder(id, renameValue.trim());
      setRenamingId(null);
    }
  };

  const handleToggleSelect = (docId: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || multiSelectMode) {
      e.stopPropagation();
      e.preventDefault();
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        if (next.has(docId)) {
          next.delete(docId);
        } else {
          next.add(docId);
        }
        return next;
      });
      return true;
    }
    return false;
  };

  const clearSelection = () => {
    setSelectedDocIds(new Set());
    setMultiSelectMode(false);
  };

  const openMoveDialog = (docIds: string[]) => {
    setMovingDocIds(docIds);
    setMoveDialogOpen(true);
  };

  const handleMoveToFolder = (targetFolderId: string | null) => {
    if (movingDocIds.length === 1 && onMoveDoc) {
      onMoveDoc(movingDocIds[0], targetFolderId);
    } else if (movingDocIds.length > 1 && onMoveMultipleDocs) {
      onMoveMultipleDocs(movingDocIds, targetFolderId);
    }
    setMoveDialogOpen(false);
    setMovingDocIds([]);
    clearSelection();
  };

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, type } = result;
    if (source.droppableId !== destination.droppableId) return;
    if (source.index === destination.index) return;

    if (type === "FOLDER") {
      const parentId = source.droppableId === "root-folders" ? null : source.droppableId;
      const items = parentId ? getChildFolders(parentId) : rootFolders;
      const reordered = Array.from(items);
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      const updates = reordered.map((f, i) => ({ id: f.id, sort_order: i }));
      onReorderFolders?.(updates);
    } else if (type === "DOC") {
      const folderId = source.droppableId === "root-docs" ? null : source.droppableId;
      const items = folderId ? getFolderDocs(folderId) : rootDocs;
      const reordered = Array.from(items);
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      const updates = reordered.map((d, i) => ({ id: d.id, sort_order: i }));
      onReorderDocs?.(updates);
    }
  }, [rootFolders, rootDocs, getChildFolders, getFolderDocs, onReorderFolders, onReorderDocs]);

  // Get global index for keyboard navigation
  const getGlobalIndex = (type: "folder" | "document", id: string): number => {
    return visibleItems.findIndex(item => item.type === type && item.id === id);
  };

  const renderFolder = (folder: DocFolder, depth: number, index: number) => {
    const isExpanded = expandedFolders.has(folder.id);
    const children = getChildFolders(folder.id);
    const docs = getFolderDocs(folder.id);
    const globalIndex = getGlobalIndex("folder", folder.id);
    const isFocused = focusedItemIndex === globalIndex;
    const isSearchMatch = itemMatchesSearch(folder.id, "folder");

    // Don't render if not visible in search
    if (!isItemVisible(folder.id, "folder")) return null;

    return (
      <Draggable key={folder.id} draggableId={`folder-${folder.id}`} index={index} isDragDisabled={!canManage}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.draggableProps}>
            <div
              ref={isFocused ? focusedItemRef : undefined}
              className={cn(
                "flex items-center gap-1 py-1.5 px-1 rounded-md group cursor-pointer text-sm relative",
                "transition-colors duration-150",
                // Hover effect
                "hover:bg-accent/60",
                // Focus/selected state
                isFocused && "bg-accent ring-1 ring-ring",
                // Dragging state
                snapshot.isDragging && "bg-accent shadow-lg",
                // Search match highlight
                isSearchMatch && searchQuery && "bg-primary/5"
              )}
              style={{ paddingLeft: `${depth * 16 + 4}px` }}
              onClick={() => toggleExpand(folder.id)}
              onFocus={() => setFocusedItemIndex(globalIndex)}
              tabIndex={0}
              role="treeitem"
              aria-expanded={isExpanded}
            >
              {/* Vertical connector line */}
              {depth > 0 && (
                <div
                  className="absolute left-0 top-0 bottom-0 border-l border-border/50"
                  style={{ left: `${(depth - 1) * 16 + 12}px` }}
                />
              )}

              {canManage && (
                <span {...provided.dragHandleProps} className="cursor-grab opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                </span>
              )}

              <span className="shrink-0 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(0deg)' }}>
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </span>

              {/* Folder icon - different for open/closed */}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-primary shrink-0 transition-colors" />
              ) : (
                <Folder className="w-4 h-4 text-primary shrink-0 transition-colors" />
              )}

              {renamingId === folder.id ? (
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmitRename(folder.id); if (e.key === "Escape") setRenamingId(null); }}
                  onBlur={() => handleSubmitRename(folder.id)}
                  className="h-6 text-xs py-0 px-1"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate flex-1 text-foreground">
                  {searchQuery ? highlightMatch(folder.name, searchQuery) : folder.name}
                </span>
              )}

              {folder.is_public && <Globe className="w-3 h-3 text-info shrink-0" />}

              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => onShareItem(folder, "folder")}>
                      <Share2 className="w-3.5 h-3.5 mr-2" /> Compartilhar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCreateDoc(folder.id)}>
                      <Plus className="w-3.5 h-3.5 mr-2" /> Novo documento
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setNewFolderParentId(folder.id); setExpandedFolders((p) => new Set(p).add(folder.id)); }}>
                      <FolderPlus className="w-3.5 h-3.5 mr-2" /> Subpasta
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onImport(folder.id)}>
                      <FileUp className="w-3.5 h-3.5 mr-2" /> Importar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name); }}>
                      <Pencil className="w-3.5 h-3.5 mr-2" /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleFolderPublic(folder.id, !folder.is_public)}>
                      {folder.is_public ? <><Lock className="w-3.5 h-3.5 mr-2" /> Tornar privada</> : <><Globe className="w-3.5 h-3.5 mr-2" /> Tornar pública</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirm({ type: "folder", id: folder.id })}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {isExpanded && (
              <div className="relative">
                {/* Vertical connector for children */}
                {depth >= 0 && (
                  <div
                    className="absolute top-0 bottom-0 border-l border-border/30"
                    style={{ left: `${depth * 16 + 12}px` }}
                  />
                )}
                <Droppable droppableId={folder.id} type="FOLDER">
                  {(dropProvided) => (
                    <div ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
                      {children.map((c, i) => renderFolder(c, depth + 1, i))}
                      {dropProvided.placeholder}
                    </div>
                  )}
                </Droppable>
                <Droppable droppableId={`${folder.id}-docs`} type="DOC">
                  {(dropProvided) => (
                    <div ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
                      {docs.map((d, i) => renderDocItem(d, depth + 1, i))}
                      {dropProvided.placeholder}
                    </div>
                  )}
                </Droppable>
                {newFolderParentId === folder.id && renderNewFolderInput(depth + 1)}
              </div>
            )}
          </div>
        )}
      </Draggable>
    );
  };

  const renderDocItem = (doc: DocDocument, depth: number, index: number) => {
    const isSelected = selectedDocIds.has(doc.id);
    const globalIndex = getGlobalIndex("document", doc.id);
    const isFocused = focusedItemIndex === globalIndex;
    const isSearchMatch = itemMatchesSearch(doc.id, "document");

    // Don't render if not visible in search
    if (!isItemVisible(doc.id, "document")) return null;

    return (
      <Draggable key={doc.id} draggableId={`doc-${doc.id}`} index={index} isDragDisabled={!canManage}>
        {(provided, snapshot) => (
          <div
            ref={(node) => {
              provided.innerRef(node);
              if (isFocused) focusedItemRef.current = node;
            }}
            {...provided.draggableProps}
            className={cn(
              "flex items-center gap-1 py-1.5 px-1 rounded-md group cursor-pointer text-sm relative",
              "transition-all duration-150",
              // Hover effect
              "hover:bg-accent/60 hover:translate-x-0.5",
              // Selected state
              selectedDocId === doc.id && "bg-primary/15 text-primary font-medium",
              // Multi-select state
              isSelected && "ring-1 ring-primary bg-primary/10",
              // Focus state
              isFocused && !selectedDocId && "bg-accent ring-1 ring-ring",
              // Dragging state
              snapshot.isDragging && "shadow-lg bg-accent",
              // Search match highlight
              isSearchMatch && searchQuery && "bg-primary/5"
            )}
            style={{ ...provided.draggableProps.style, paddingLeft: `${depth * 16 + 20}px` }}
            onClick={(e) => {
              if (!handleToggleSelect(doc.id, e)) {
                onSelectDoc(doc.id);
              }
            }}
            onFocus={() => setFocusedItemIndex(globalIndex)}
            tabIndex={0}
            role="treeitem"
          >
            {/* Vertical connector line */}
            {depth > 0 && (
              <div
                className="absolute left-0 top-0 bottom-0 border-l border-border/50"
                style={{ left: `${(depth - 1) * 16 + 12}px` }}
              />
            )}

            {multiSelectMode && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => {
                  setSelectedDocIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(doc.id)) {
                      next.delete(doc.id);
                    } else {
                      next.add(doc.id);
                    }
                    return next;
                  });
                }}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
              />
            )}
            {canManage && !multiSelectMode && (
              <span {...provided.dragHandleProps} className="cursor-grab opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <GripVertical className="w-3 h-3 text-muted-foreground" />
              </span>
            )}
            <File className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate flex-1 text-foreground">
              {searchQuery ? highlightMatch(doc.title, searchQuery) : doc.title}
            </span>
            {doc.is_public && <Globe className="w-3 h-3 text-info shrink-0" />}
            {canManage && !multiSelectMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onShareItem(doc, "document"); }}>
                    <Share2 className="w-3.5 h-3.5 mr-2" /> Compartilhar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openMoveDialog([doc.id]); }}>
                    <FolderInput className="w-3.5 h-3.5 mr-2" /> Mover para...
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleDocPublic(doc.id, !doc.is_public); }}>
                    {doc.is_public ? <><Lock className="w-3.5 h-3.5 mr-2" /> Tornar privado</> : <><Globe className="w-3.5 h-3.5 mr-2" /> Tornar público</>}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: "doc", id: doc.id }); }}>
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </Draggable>
    );
  };

  const renderNewFolderInput = (depth: number = 0) => (
    <div className="flex items-center gap-1 py-1" style={{ paddingLeft: `${depth * 16 + 20}px` }}>
      <Input
        value={newFolderName}
        onChange={(e) => setNewFolderName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSubmitNewFolder(); if (e.key === "Escape") setNewFolderParentId(undefined); }}
        placeholder="Nome da pasta..."
        className="h-6 text-xs py-0 px-1 flex-1"
        autoFocus
      />
    </div>
  );

  // Check if there are any visible items
  const hasVisibleItems = useMemo(() => {
    if (!searchQuery) return folders.length > 0 || documents.length > 0;

    const hasVisibleFolders = folders.some(f => isItemVisible(f.id, "folder"));
    const hasVisibleDocs = documents.some(d => isItemVisible(d.id, "document"));
    return hasVisibleFolders || hasVisibleDocs;
  }, [searchQuery, folders, documents]);

  // Get the current folder of moving docs (for highlighting)
  const movingDocCurrentFolder = movingDocIds.length > 0
    ? documents.find(d => d.id === movingDocIds[0])?.folder_id || null
    : null;

  return (
    <div className="flex flex-col gap-1 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-2 border-b border-border">
        <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Documentos</span>
        {canManage && (
          <div className="flex gap-1">
            <Button
              variant={multiSelectMode ? "default" : "ghost"}
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => { setMultiSelectMode(!multiSelectMode); if (multiSelectMode) clearSelection(); }}
              title={multiSelectMode ? "Sair da seleção" : "Selecionar vários"}
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onCreateDoc(null)} title="Novo documento">
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setNewFolderParentId(null)} title="Nova pasta">
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onImport(null)} title="Importar">
              <FileUp className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Search input */}
      <div className="relative px-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar documentos... (/)"
          className="h-7 text-xs pl-7 pr-7"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 p-0"
            onClick={() => setSearchQuery("")}
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Multi-select action bar */}
      {selectedDocIds.size > 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/10 rounded-md border border-primary/20 text-xs">
          <span className="text-foreground font-medium">{selectedDocIds.size} selecionado(s)</span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={() => openMoveDialog(Array.from(selectedDocIds))}
          >
            <ArrowRightLeft className="w-3 h-3" /> Mover
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={clearSelection}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Tree */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div
          ref={treeContainerRef}
          className="flex-1 overflow-y-auto scrollbar-thin py-1"
          onKeyDown={handleKeyDown}
          role="tree"
          aria-label="Document tree"
        >
          {newFolderParentId === null && renderNewFolderInput(0)}

          <Droppable droppableId="root-folders" type="FOLDER">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {rootFolders.map((f, i) => renderFolder(f, 0, i))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          <Droppable droppableId="root-docs" type="DOC">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {rootDocs.map((d, i) => renderDocItem(d, 0, i))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {/* No results message */}
          {searchQuery && !hasVisibleItems && (
            <div className="text-center py-6">
              <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum resultado encontrado</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Tente outros termos de busca</p>
            </div>
          )}

          {/* Empty state */}
          {!searchQuery && folders.length === 0 && documents.length === 0 && (
            <div className="text-center py-6">
              <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum documento ainda</p>
            </div>
          )}
        </div>
      </DragDropContext>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === "folder"
                ? "Todos os documentos dentro desta pasta também serão excluídos."
                : "Este documento será excluído permanentemente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm?.type === "folder") onDeleteFolder(deleteConfirm.id);
                else if (deleteConfirm) onDeleteDoc(deleteConfirm.id);
                setDeleteConfirm(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Mover {movingDocIds.length > 1 ? `${movingDocIds.length} documentos` : "documento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            <Button
              variant={movingDocCurrentFolder === null ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start gap-2 text-sm h-8"
              onClick={() => handleMoveToFolder(null)}
              disabled={movingDocCurrentFolder === null}
            >
              <FolderOpen className="w-4 h-4" /> Raiz (sem pasta)
            </Button>
            {folders.map((folder) => (
              <Button
                key={folder.id}
                variant={movingDocCurrentFolder === folder.id ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start gap-2 text-sm h-8"
                style={{ paddingLeft: `${(folder.parent_id ? 32 : 16)}px` }}
                onClick={() => handleMoveToFolder(folder.id)}
                disabled={movingDocCurrentFolder === folder.id}
              >
                <FolderOpen className="w-4 h-4 text-primary" /> {folder.name}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMoveDialogOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
