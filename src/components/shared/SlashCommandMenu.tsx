import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import {
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Minus, Code,
  Table as TableIcon, Image as ImageIcon,
  Type, Pilcrow,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: any) => void;
  keywords?: string[];
  group: string;
}

export const defaultSlashCommands: SlashCommandItem[] = [
  {
    title: "Texto",
    description: "Parágrafo simples",
    icon: <Pilcrow className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().setParagraph().run(),
    keywords: ["text", "paragraph", "texto", "paragrafo"],
    group: "Básico",
  },
  {
    title: "Título 1",
    description: "Título grande",
    icon: <Heading1 className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    keywords: ["h1", "heading", "titulo"],
    group: "Títulos",
  },
  {
    title: "Título 2",
    description: "Título médio",
    icon: <Heading2 className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    keywords: ["h2", "heading", "subtitulo"],
    group: "Títulos",
  },
  {
    title: "Título 3",
    description: "Título pequeno",
    icon: <Heading3 className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    keywords: ["h3", "heading"],
    group: "Títulos",
  },
  {
    title: "Lista",
    description: "Lista com marcadores",
    icon: <List className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    keywords: ["bullet", "list", "ul", "lista"],
    group: "Listas",
  },
  {
    title: "Lista numerada",
    description: "Lista ordenada",
    icon: <ListOrdered className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    keywords: ["numbered", "ordered", "ol", "numerada"],
    group: "Listas",
  },
  {
    title: "Checklist",
    description: "Lista de tarefas",
    icon: <ListChecks className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
    keywords: ["todo", "task", "check", "tarefa"],
    group: "Listas",
  },
  {
    title: "Citação",
    description: "Bloco de citação",
    icon: <Quote className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    keywords: ["quote", "blockquote", "citacao"],
    group: "Blocos",
  },
  {
    title: "Código",
    description: "Bloco de código",
    icon: <Code className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    keywords: ["code", "codeblock", "codigo"],
    group: "Blocos",
  },
  {
    title: "Separador",
    description: "Linha horizontal",
    icon: <Minus className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
    keywords: ["divider", "hr", "separator", "linha"],
    group: "Blocos",
  },
  {
    title: "Tabela",
    description: "Tabela 3×3",
    icon: <TableIcon className="w-4 h-4" />,
    command: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    keywords: ["table", "tabela", "grid"],
    group: "Blocos",
  },
  {
    title: "Imagem",
    description: "Inserir imagem por URL",
    icon: <ImageIcon className="w-4 h-4" />,
    command: (editor) => {
      const url = prompt("URL da imagem:");
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
    keywords: ["image", "img", "imagem", "foto"],
    group: "Mídia",
  },
];

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  query: string;
  onSelect: (item: SlashCommandItem) => void;
  clientRect: (() => DOMRect | null) | null;
}

export function SlashCommandMenu({ items, query, onSelect, clientRect }: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const filteredItems = items.filter((item) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.keywords?.some((k) => k.includes(q))
    );
  });

  // Group items
  const groups = filteredItems.reduce<Record<string, SlashCommandItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          onSelect(filteredItems[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
      }
    },
    [filteredItems, selectedIndex, onSelect]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  if (filteredItems.length === 0) {
    return (
      <div
        ref={menuRef}
        className="z-50 fixed bg-popover border border-border rounded-lg shadow-lg p-2 w-64"
        style={getMenuPosition(clientRect)}
      >
        <p className="text-sm text-muted-foreground px-2 py-1">Nenhum comando encontrado</p>
      </div>
    );
  }

  let flatIndex = 0;

  return (
    <div
      ref={menuRef}
      className="z-50 fixed bg-popover border border-border rounded-lg shadow-lg py-1 w-72 max-h-80 overflow-y-auto"
      style={getMenuPosition(clientRect)}
    >
      {Object.entries(groups).map(([group, groupItems]) => (
        <div key={group}>
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {group}
          </div>
          {groupItems.map((item) => {
            const currentIndex = flatIndex++;
            const isSelected = currentIndex === selectedIndex;
            return (
              <button
                key={item.title}
                ref={isSelected ? selectedRef : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                  isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIndex(currentIndex)}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function getMenuPosition(clientRect: (() => DOMRect | null) | null): React.CSSProperties {
  if (!clientRect) return { display: "none" };
  const rect = clientRect();
  if (!rect) return { display: "none" };

  const menuHeight = 320; // max-h-80 = 20rem = 320px
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rect.bottom;
  const showAbove = spaceBelow < menuHeight && rect.top > menuHeight;

  return {
    left: `${rect.left}px`,
    top: showAbove ? `${rect.top - menuHeight}px` : `${rect.bottom + 4}px`,
  };
}
