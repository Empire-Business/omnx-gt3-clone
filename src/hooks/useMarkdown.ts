import { useMemo, createElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface UseMarkdownOptions {
  enableGFM?: boolean;
  enableTOC?: boolean;
  onImageClick?: (src: string, alt: string) => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}

function extractTOC(content: string): TOCItem[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const items: TOCItem[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    items.push({
      id: slugify(match[2]),
      text: match[2],
      level: match[1].length,
    });
  }
  return items;
}

export function useMarkdown(content: string, options?: UseMarkdownOptions) {
  const { enableGFM = true, enableTOC = false, onImageClick } = options || {};

  const toc = useMemo(() => {
    if (!enableTOC) return [];
    return extractTOC(content || '');
  }, [content, enableTOC]);

  const Component = useMemo(() => {
    return function MarkdownContent() {
      return createElement(ReactMarkdown, {
        remarkPlugins: enableGFM ? [remarkGfm] : [],
        components: {
          h1: ({ children, ...props }: any) => {
            const text = String(children);
            const id = slugify(text);
            return createElement('h1', { id, ...props }, children);
          },
          h2: ({ children, ...props }: any) => {
            const text = String(children);
            const id = slugify(text);
            return createElement('h2', { id, ...props }, children);
          },
          h3: ({ children, ...props }: any) => {
            const text = String(children);
            const id = slugify(text);
            return createElement('h3', { id, ...props }, children);
          },
          img: onImageClick
            ? ({ src, alt, ...props }: any) => {
                return createElement('img', {
                  src,
                  alt: alt || '',
                  ...props,
                  className: 'cursor-zoom-in hover:opacity-80 transition-opacity rounded-lg',
                  onClick: (e: MouseEvent) => {
                    e.preventDefault();
                    if (src) onImageClick(src, alt || '');
                  },
                });
              }
            : undefined,
        },
      } as any, content || '');
    };
  }, [content, enableGFM, onImageClick]);

  return { toc, Component };
}

export function useMarkdownTOC(content: string): TOCItem[] {
  return useMemo(() => extractTOC(content || ''), [content]);
}
