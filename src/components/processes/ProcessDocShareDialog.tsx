import { useState } from "react";
import { Copy, Check, Globe, Lock, ExternalLink, Link2, FolderOpen, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { DocFolder, DocDocument } from "@/types/documents";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: DocFolder | DocDocument | null;
  itemType: "folder" | "document";
  projectMode?: boolean;
  onTogglePublic: (id: string, isPublic: boolean) => void;
  allFolders?: DocFolder[];
  allDocuments?: DocDocument[];
  onToggleFolderPublic?: (id: string, isPublic: boolean) => void;
  onToggleDocPublic?: (id: string, isPublic: boolean) => void;
  onBulkToggleAll?: (isPublic: boolean) => void;
  onBulkToggleFolderChildren?: (folderId: string, isPublic: boolean) => void;
}

function buildPublicUrl(token: string) {
  return `${window.location.origin}/public/docs/${token}`;
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 gap-1 h-7">
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

export function ProcessDocShareDialog({
  open, onOpenChange, item, itemType, projectMode, onTogglePublic,
  allFolders = [], allDocuments = [],
  onToggleFolderPublic, onToggleDocPublic,
  onBulkToggleAll, onBulkToggleFolderChildren,
}: Props) {
  const [copiedMain, setCopiedMain] = useState(false);

  // Project mode: no item needed
  if (!projectMode && !item) return null;

  const isPublic = item?.is_public ?? false;
  const token = item?.public_token;
  const publicUrl = token ? buildPublicUrl(token) : "";

  const handleCopyMain = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopiedMain(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedMain(false), 2000);
  };

  const handleToggle = (checked: boolean) => {
    if (item) onTogglePublic(item.id, checked);
  };

  const publicFolders = allFolders.filter(f => f.is_public && f.public_token);
  const publicDocs = allDocuments.filter(d => d.is_public && d.public_token);
  const hasPublicItems = publicFolders.length > 0 || publicDocs.length > 0;
  const hasManageCallbacks = !!onToggleFolderPublic && !!onToggleDocPublic;

  const allPublic = allFolders.every(f => f.is_public) && allDocuments.every(d => d.is_public);
  const totalItems = allFolders.length + allDocuments.length;

  // For folder sharing: check if this folder has children
  const isFolder = itemType === "folder" && !!item;
  const folderChildDocs = isFolder ? allDocuments.filter(d => {
    const getDescendantIds = (parentId: string): string[] => {
      const children = allFolders.filter(f => f.parent_id === parentId);
      const ids: string[] = [];
      for (const child of children) {
        ids.push(child.id);
        ids.push(...getDescendantIds(child.id));
      }
      return ids;
    };
    const folderIds = [item!.id, ...getDescendantIds(item!.id)];
    return d.folder_id && folderIds.includes(d.folder_id);
  }) : [];
  const folderChildFolders = isFolder ? allFolders.filter(f => {
    const getDescendantIds = (parentId: string): string[] => {
      const children = allFolders.filter(ff => ff.parent_id === parentId);
      const ids: string[] = [];
      for (const child of children) {
        ids.push(child.id);
        ids.push(...getDescendantIds(child.id));
      }
      return ids;
    };
    return getDescendantIds(item!.id).includes(f.id);
  }) : [];
  const folderChildCount = folderChildDocs.length + folderChildFolders.length;
  const allFolderChildrenPublic = folderChildDocs.every(d => d.is_public) && folderChildFolders.every(f => f.is_public) && isPublic;

  // Project mode title/description
  if (projectMode) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Compartilhar documentos do projeto
            </DialogTitle>
            <DialogDescription>
              Gerencie a visibilidade de todos os documentos e pastas do projeto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Bulk: share ALL project documents at once */}
            {onBulkToggleAll && totalItems > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Todos os documentos do projeto
                </Label>
                <p className="text-xs text-muted-foreground">
                  {allFolders.length} pasta(s) e {allDocuments.length} documento(s) no total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant={allPublic ? "outline" : "default"}
                    size="sm"
                    className="flex-1 gap-1 text-xs"
                    onClick={() => onBulkToggleAll(!allPublic)}
                  >
                    {allPublic ? (
                      <><Lock className="w-3.5 h-3.5" /> Tornar TUDO privado</>
                    ) : (
                      <><Globe className="w-3.5 h-3.5" /> Tornar TUDO público</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Shared links management panel */}
            {hasManageCallbacks && hasPublicItems && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-sm font-medium text-foreground">Links ativos ({publicFolders.length + publicDocs.length})</Label>
                  </div>
                  <ScrollArea className="max-h-48">
                    <div className="space-y-1.5">
                      {publicFolders.map(f => (
                        <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/30 text-sm">
                          <Globe className="w-3.5 h-3.5 text-info shrink-0" />
                          <span className="truncate flex-1 text-foreground">📁 {f.name}</span>
                          <CopyLinkButton url={buildPublicUrl(f.public_token!)} />
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => onToggleFolderPublic!(f.id, false)}>
                            <Lock className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                      {publicDocs.map(d => (
                        <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/30 text-sm">
                          <Globe className="w-3.5 h-3.5 text-info shrink-0" />
                          <span className="truncate flex-1 text-foreground">📄 {d.title}</span>
                          <CopyLinkButton url={buildPublicUrl(d.public_token!)} />
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => onToggleDocPublic!(d.id, false)}>
                            <Lock className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}

            {totalItems === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento ou pasta neste projeto.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPublic ? <Globe className="w-5 h-5 text-info" /> : <Lock className="w-5 h-5 text-muted-foreground" />}
            Compartilhar {itemType === "folder" ? "pasta" : "documento"}
          </DialogTitle>
          <DialogDescription>
            {itemType === "folder"
              ? "Todos os documentos dentro desta pasta ficarão acessíveis publicamente."
              : "Qualquer pessoa com o link poderá visualizar este documento."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current item toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="public-toggle" className="text-foreground">Acesso público</Label>
            <Switch id="public-toggle" checked={isPublic} onCheckedChange={handleToggle} />
          </div>

          {isPublic && token && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Link público</Label>
              <div className="flex gap-2">
                <Input value={publicUrl} readOnly className="text-xs" />
                <Button variant="outline" size="sm" onClick={handleCopyMain} className="shrink-0 gap-1">
                  {copiedMain ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="outline" size="sm" asChild className="shrink-0">
                  <a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                </Button>
              </div>
            </div>
          )}

          {/* Folder: share entire folder with all children */}
          {isFolder && folderChildCount > 0 && onBulkToggleFolderChildren && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  Compartilhar pasta inteira
                </Label>
                <p className="text-xs text-muted-foreground">
                  Inclui esta pasta + {folderChildFolders.length} subpasta(s) + {folderChildDocs.length} documento(s)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant={allFolderChildrenPublic ? "outline" : "default"}
                    size="sm"
                    className="flex-1 gap-1 text-xs"
                    onClick={() => onBulkToggleFolderChildren(item.id, !allFolderChildrenPublic)}
                  >
                    {allFolderChildrenPublic ? (
                      <><Lock className="w-3.5 h-3.5" /> Tornar tudo privado</>
                    ) : (
                      <><Globe className="w-3.5 h-3.5" /> Tornar tudo público</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Bulk: share ALL project documents at once */}
          {onBulkToggleAll && totalItems > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Todos os documentos do projeto
                </Label>
                <p className="text-xs text-muted-foreground">
                  {allFolders.length} pasta(s) e {allDocuments.length} documento(s) no total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant={allPublic ? "outline" : "default"}
                    size="sm"
                    className="flex-1 gap-1 text-xs"
                    onClick={() => onBulkToggleAll(!allPublic)}
                  >
                    {allPublic ? (
                      <><Lock className="w-3.5 h-3.5" /> Tornar TUDO privado</>
                    ) : (
                      <><Globe className="w-3.5 h-3.5" /> Tornar TUDO público</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Shared links management panel */}
          {hasManageCallbacks && hasPublicItems && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium text-foreground">Links ativos ({publicFolders.length + publicDocs.length})</Label>
                </div>
                <ScrollArea className="max-h-48">
                  <div className="space-y-1.5">
                    {publicFolders.map(f => (
                      <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/30 text-sm">
                        <Globe className="w-3.5 h-3.5 text-info shrink-0" />
                        <span className="truncate flex-1 text-foreground">📁 {f.name}</span>
                        <CopyLinkButton url={buildPublicUrl(f.public_token!)} />
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => onToggleFolderPublic!(f.id, false)}
                        >
                          <Lock className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {publicDocs.map(d => (
                      <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/30 text-sm">
                        <Globe className="w-3.5 h-3.5 text-info shrink-0" />
                        <span className="truncate flex-1 text-foreground">📄 {d.title}</span>
                        <CopyLinkButton url={buildPublicUrl(d.public_token!)} />
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => onToggleDocPublic!(d.id, false)}
                        >
                          <Lock className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
