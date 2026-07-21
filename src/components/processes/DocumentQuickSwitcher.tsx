import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { File, FolderOpen, Search, Clock, Command } from "lucide-react";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DocFolder, DocDocument } from "@/types/documents";

interface Props {
    folders: DocFolder[];
    documents: DocDocument[];
    onSelectDoc: (id: string) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

// Local storage key for recent documents
const RECENT_DOCS_KEY = "recent_documents";
const MAX_RECENT = 5;

// Helper to get recent document IDs from localStorage
function getRecentDocIds(): string[] {
    try {
        const stored = localStorage.getItem(RECENT_DOCS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

// Helper to save recent document IDs to localStorage
function saveRecentDocId(docId: string) {
    try {
        const current = getRecentDocIds();
        const filtered = current.filter(id => id !== docId);
        const updated = [docId, ...filtered].slice(0, MAX_RECENT);
        localStorage.setItem(RECENT_DOCS_KEY, JSON.stringify(updated));
    } catch {
        // Ignore localStorage errors
    }
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

interface SearchResult {
    doc: DocDocument;
    folderName: string | null;
    matchType: "title" | "folder";
}

export function DocumentQuickSwitcher({
    folders,
    documents,
    onSelectDoc,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
}: Props) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Use controlled or internal state
    const open = controlledOpen ?? internalOpen;
    const setOpen = controlledOnOpenChange ?? setInternalOpen;

    // Get folder name by ID
    const getFolderName = useCallback((folderId: string | null): string | null => {
        if (!folderId) return null;
        const folder = folders.find(f => f.id === folderId);
        return folder?.name ?? null;
    }, [folders]);

    // Get recent documents
    const recentDocs = useMemo(() => {
        const recentIds = getRecentDocIds();
        return recentIds
            .map(id => documents.find(d => d.id === id))
            .filter((d): d is DocDocument => d !== undefined);
    }, [documents]);

    // Search results
    const searchResults = useMemo((): SearchResult[] => {
        if (!searchQuery.trim()) return [];

        const query = searchQuery.toLowerCase();
        const results: SearchResult[] = [];

        for (const doc of documents) {
            const titleMatch = doc.title.toLowerCase().includes(query);
            const folderName = getFolderName(doc.folder_id);
            const folderMatch = folderName?.toLowerCase().includes(query) ?? false;

            if (titleMatch || folderMatch) {
                results.push({
                    doc,
                    folderName,
                    matchType: titleMatch ? "title" : "folder"
                });
            }
        }

        return results;
    }, [searchQuery, documents, getFolderName]);

    // Items to display (search results or recent docs)
    const displayItems = searchQuery.trim() ? searchResults :
        recentDocs.map(doc => ({
            doc,
            folderName: getFolderName(doc.folder_id),
            matchType: "title" as const
        }));

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (open) {
            setSearchQuery("");
            setSelectedIndex(0);
            // Focus input after animation
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Reset selected index when search changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchQuery]);

    // Keyboard shortcut to open (Cmd/Ctrl + K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setOpen(!open);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, setOpen]);

    // Keyboard navigation within dialog
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < displayItems.length - 1 ? prev + 1 : prev
                );
                break;

            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
                break;

            case "Enter":
                e.preventDefault();
                if (displayItems[selectedIndex]) {
                    handleSelect(displayItems[selectedIndex].doc.id);
                }
                break;

            case "Escape":
                e.preventDefault();
                setOpen(false);
                break;
        }
    }, [displayItems, selectedIndex, setOpen]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        }
    }, [selectedIndex]);

    // Handle document selection
    const handleSelect = useCallback((docId: string) => {
        saveRecentDocId(docId);
        onSelectDoc(docId);
        setOpen(false);
    }, [onSelectDoc, setOpen]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden sm:rounded-lg">
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Buscar documentos..."
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                        <span className="text-xs">esc</span>
                    </kbd>
                </div>

                {/* Results */}
                <div
                    ref={listRef}
                    className="max-h-80 overflow-y-auto p-2"
                >
                    {!searchQuery.trim() && recentDocs.length > 0 && (
                        <div className="mb-2">
                            <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                Recentes
                            </div>
                            {displayItems.map((item, index) => (
                                <button
                                    key={item.doc.id}
                                    onClick={() => handleSelect(item.doc.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm text-left",
                                        "transition-colors duration-150",
                                        "hover:bg-accent",
                                        selectedIndex === index && "bg-accent ring-1 ring-ring"
                                    )}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <File className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate text-foreground">{item.doc.title}</div>
                                        {item.folderName && (
                                            <div className="text-xs text-muted-foreground truncate">
                                                {item.folderName}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {searchQuery.trim() && searchResults.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                <Search className="w-3 h-3" />
                                Resultados ({searchResults.length})
                            </div>
                            {searchResults.map((result, index) => (
                                <button
                                    key={result.doc.id}
                                    onClick={() => handleSelect(result.doc.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm text-left",
                                        "transition-colors duration-150",
                                        "hover:bg-accent",
                                        selectedIndex === index && "bg-accent ring-1 ring-ring"
                                    )}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <File className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate text-foreground">
                                            {highlightMatch(result.doc.title, searchQuery)}
                                        </div>
                                        {result.folderName && (
                                            <div className="text-xs text-muted-foreground truncate">
                                                <FolderOpen className="w-3 h-3 inline mr-1" />
                                                {highlightMatch(result.folderName, searchQuery)}
                                            </div>
                                        )}
                                    </div>
                                    {result.matchType === "folder" && (
                                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                            Pasta
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {searchQuery.trim() && searchResults.length === 0 && (
                        <div className="text-center py-8">
                            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">Nenhum documento encontrado</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">
                                Tente outros termos de busca
                            </p>
                        </div>
                    )}

                    {!searchQuery.trim() && recentDocs.length === 0 && (
                        <div className="text-center py-8">
                            <File className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">Nenhum documento recente</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">
                                Os documentos acessados aparecerão aqui
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-border bg-muted text-[10px]">↑</kbd>
                            <kbd className="inline-flex h-4 w-4 items-center justify-center rounded border border-border bg-muted text-[10px]">↓</kbd>
                            para navegar
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="inline-flex h-4 items-center justify-center rounded border border-border bg-muted px-1 text-[10px]">↵</kbd>
                            para selecionar
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Command className="w-3 h-3" />
                        <span>K</span>
                        <span className="mx-1">para abrir</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
