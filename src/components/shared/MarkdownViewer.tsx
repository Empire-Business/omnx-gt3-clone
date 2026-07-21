import { useState, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useMarkdown, useMarkdownTOC, type TOCItem } from '@/hooks/useMarkdown';
import { List, X, FileText, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface MarkdownViewerProps {
  content: string;
  className?: string;
  enableTOC?: boolean;
  maxHeight?: string;
  variant?: 'default' | 'compact' | 'full';
  onHeadingClick?: (id: string) => void;
}

export function MarkdownViewer({
  content,
  className,
  enableTOC = true,
  maxHeight,
  variant = 'default',
  onHeadingClick,
}: MarkdownViewerProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState('');

  const handleImageClick = useCallback((src: string, alt: string) => {
    setLightboxSrc(src);
    setLightboxAlt(alt);
  }, []);

  const { toc, Component } = useMarkdown(content, {
    enableGFM: true,
    enableTOC,
    onImageClick: handleImageClick,
  });
  const [showMobileTOC, setShowMobileTOC] = useState(false);

  const handleTOCClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    onHeadingClick?.(id);
    setShowMobileTOC(false);
  };

  const lightbox = (
    <Dialog open={!!lightboxSrc} onOpenChange={() => setLightboxSrc(null)}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-center w-full h-full">
          <img
            src={lightboxSrc || ''}
            alt={lightboxAlt}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
        </div>
        {lightboxAlt && (
          <p className="text-center text-sm text-muted-foreground mt-2">{lightboxAlt}</p>
        )}
      </DialogContent>
    </Dialog>
  );

  if (variant === 'compact') {
    return (
      <>
        {lightbox}
        <ScrollArea className={cn("w-full", maxHeight && `h-[${maxHeight}]`)}>
          <div className={cn("prose prose-slate dark:prose-invert max-w-none p-4", className)}>
            <Component />
          </div>
        </ScrollArea>
      </>
    );
  }

  if (variant === 'full') {
    return (
      <>
        {lightbox}
        <div className={cn("flex gap-6", className)}>
          {enableTOC && toc.length > 0 && (
            <aside className="hidden lg:block w-64 shrink-0">
              <div className="sticky top-4">
                <TableOfContents items={toc} onItemClick={handleTOCClick} />
              </div>
            </aside>
          )}
          <div className="flex-1 min-w-0">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <Component />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {lightbox}
      <div className={cn("flex gap-6", className)}>
        {enableTOC && toc.length > 0 && (
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-4">
              <TableOfContents items={toc} onItemClick={handleTOCClick} />
            </div>
          </aside>
        )}

        <div className="flex-1 min-w-0 relative">
          {enableTOC && toc.length > 0 && (
            <Sheet open={showMobileTOC} onOpenChange={setShowMobileTOC}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden absolute top-0 right-0 z-10 gap-2"
                >
                  <List className="w-4 h-4" />
                  Conteúdo
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <SheetHeader>
                  <SheetTitle>Conteúdo</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <TableOfContents
                    items={toc}
                    onItemClick={handleTOCClick}
                    mobile
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}

          <ScrollArea className={cn("w-full", maxHeight && `h-[${maxHeight}]`)}>
            <div className={cn(
              "prose prose-slate dark:prose-invert max-w-none",
              enableTOC && toc.length > 0 && "pr-24 lg:pr-0"
            )}>
              <Component />
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}

interface TableOfContentsProps {
  items: TOCItem[];
  onItemClick: (id: string) => void;
  mobile?: boolean;
}

function TableOfContents({ items, onItemClick, mobile }: TableOfContentsProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn(
      "rounded-lg border border-border/50 bg-card",
      mobile ? "p-4" : "p-4"
    )}>
      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <List className="w-4 h-4" />
        Conteúdo
      </h4>
      <nav className="space-y-1">
        {items.map((item, index) => (
          <button
            key={index}
            onClick={() => onItemClick(item.id)}
            className={cn(
              "block w-full text-left text-sm transition-colors hover:text-primary",
              "text-muted-foreground hover:bg-muted rounded px-2 py-1",
              item.level === 1 && "font-medium text-foreground",
              item.level === 2 && "pl-4",
              item.level === 3 && "pl-6 text-xs",
              item.level >= 4 && "pl-8 text-xs"
            )}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function MarkdownPreview({
  content,
  className,
  maxLength = 200,
}: {
  content: string;
  className?: string;
  maxLength?: number;
}) {
  const { Component } = useMarkdown(
    content.length > maxLength ? content.slice(0, maxLength) + '...' : content,
    { enableGFM: true, enableTOC: false }
  );

  return (
    <div className={cn("prose prose-slate dark:prose-invert max-w-none text-sm", className)}>
      <Component />
    </div>
  );
}

export function MarkdownCard({
  content,
  title,
  className,
}: {
  content: string;
  title?: string;
  className?: string;
}) {
  const { Component } = useMarkdown(content, { enableGFM: true, enableTOC: false });

  return (
    <div className={cn(
      "rounded-lg border border-border/50 bg-card overflow-hidden",
      className
    )}>
      {title && (
        <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
      )}
      <div className="p-4">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <Component />
        </div>
      </div>
    </div>
  );
}
