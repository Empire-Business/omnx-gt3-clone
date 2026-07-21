import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline } from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Code, Quote, Minus,
  Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon,
  AlignLeft, AlignCenter, AlignRight,
  Highlighter, Undo2, Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SlashCommand } from "@/lib/slash-command-extension";
import { SlashCommandMenu, defaultSlashCommands } from "@/components/shared/SlashCommandMenu";
import type { SlashCommandItem } from "@/components/shared/SlashCommandMenu";

interface RichTextEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  shortcut,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  shortcut?: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 w-7 p-0",
              active && "bg-accent text-accent-foreground"
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
            disabled={disabled}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {title}{shortcut && <span className="ml-1.5 text-muted-foreground">{shortcut}</span>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function RichTextEditor({
  content,
  onChange,
  onUploadImage,
  readOnly = false,
  placeholder = "Digite '/' para comandos...",
  className,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Slash command state
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashClientRect, setSlashClientRect] = useState<(() => DOMRect | null) | null>(null);

  // Bubble menu state
  const [bubbleMenuPos, setBubbleMenuPos] = useState<{ x: number; y: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder }),
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      SlashCommand.configure({
        suggestion: {
          items: ({ query }: { query: string }) => {
            return defaultSlashCommands.filter((item) => {
              if (!query) return true;
              const q = query.toLowerCase();
              return (
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.keywords?.some((k) => k.includes(q))
              );
            });
          },
          render: () => {
            return {
              onStart: (props: any) => {
                setSlashQuery(props.query);
                setSlashClientRect(() => props.clientRect);
                setSlashMenuOpen(true);
              },
              onUpdate: (props: any) => {
                setSlashQuery(props.query);
                setSlashClientRect(() => props.clientRect);
              },
              onKeyDown: (props: any) => {
                if (props.event.key === "Escape") {
                  setSlashMenuOpen(false);
                  return true;
                }
                if (["ArrowUp", "ArrowDown", "Enter"].includes(props.event.key)) {
                  return true;
                }
                return false;
              },
              onExit: () => {
                setSlashMenuOpen(false);
                setSlashQuery("");
              },
            };
          },
          command: ({ editor: ed, range, props }: any) => {
            ed.chain().focus().deleteRange(range).run();
            props.command(ed);
          },
        },
      }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      const md = (ed.storage as any).markdown.getMarkdown();
      onChangeRef.current(md);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] px-6 py-4",
      },
      handleDrop: (view, event) => {
        if (!onUploadImage) return false;
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const file = files[0];
        if (!file.type.startsWith("image/")) return false;
        event.preventDefault();
        onUploadImage(file).then((url) => {
          const { schema } = view.state;
          const node = schema.nodes.image.create({ src: url });
          const transaction = view.state.tr.replaceSelectionWith(node);
          view.dispatch(transaction);
        });
        return true;
      },
      handlePaste: (view, event) => {
        if (!onUploadImage) return false;
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) return false;
            onUploadImage(file).then((url) => {
              const { schema } = view.state;
              const node = schema.nodes.image.create({ src: url });
              const transaction = view.state.tr.replaceSelectionWith(node);
              view.dispatch(transaction);
            });
            return true;
          }
        }
        return false;
      },
    },
  });

  // Sync content when it changes externally
  useEffect(() => {
    if (!editor) return;
    const currentMd = (editor.storage as any).markdown.getMarkdown();
    if (content !== currentMd) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Sync readOnly
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  // Bubble menu — track text selection
  useEffect(() => {
    if (!editor || readOnly) return;

    const updateBubbleMenu = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || from === to) {
        setBubbleMenuPos(null);
        return;
      }

      // Get the DOM coordinates of the selection
      const { view } = editor;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);

      // Position bubble menu above the selection, centered
      const menuWidth = 300; // approximate width
      const x = Math.max(8, (start.left + end.left) / 2 - menuWidth / 2);
      const y = start.top - 45; // 45px above selection

      setBubbleMenuPos({ x, y: Math.max(4, y) });
    };

    editor.on("selectionUpdate", updateBubbleMenu);
    editor.on("blur", () => setBubbleMenuPos(null));

    return () => {
      editor.off("selectionUpdate", updateBubbleMenu);
      editor.off("blur", () => setBubbleMenuPos(null));
    };
  }, [editor, readOnly]);

  const handleSlashSelect = useCallback(
    (item: SlashCommandItem) => {
      if (!editor) return;
      // The suggestion extension handles deletion + command via its command callback
      // But since we're using the menu directly, we need to handle it:
      setSlashMenuOpen(false);
      item.command(editor);
    },
    [editor]
  );

  const addImage = useCallback(() => {
    if (!editor) return;
    if (onUploadImage) {
      const inputEl = document.createElement("input");
      inputEl.type = "file";
      inputEl.accept = "image/*";
      inputEl.onchange = async () => {
        const file = inputEl.files?.[0];
        if (!file) return;
        const url = await onUploadImage(file);
        editor.chain().focus().setImage({ src: url }).run();
      };
      inputEl.click();
    } else {
      const url = prompt("URL da imagem:");
      if (url) editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor, onUploadImage]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = prompt("URL do link:", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const addTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={cn("border border-border rounded-lg overflow-hidden bg-card", className)}>
      {/* Fixed Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Desfazer" shortcut="Ctrl+Z">
            <Undo2 className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Refazer" shortcut="Ctrl+Y">
            <Redo2 className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Título 1">
            <Heading1 className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Título 2">
            <Heading2 className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Título 3">
            <Heading3 className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito" shortcut="Ctrl+B">
            <Bold className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico" shortcut="Ctrl+I">
            <Italic className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado" shortcut="Ctrl+U">
            <UnderlineIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Tachado">
            <Strikethrough className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")} title="Destaque">
            <Highlighter className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Código inline">
            <Code className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista">
            <List className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerada">
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title="Lista de tarefas">
            <ListChecks className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Citação">
            <Quote className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha horizontal">
            <Minus className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Alinhar à esquerda">
            <AlignLeft className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Centralizar">
            <AlignCenter className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Alinhar à direita">
            <AlignRight className="w-3.5 h-3.5" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-5 mx-1" />

          <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="Link">
            <LinkIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={addImage} title="Imagem">
            <ImageIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={addTable} title="Tabela">
            <TableIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
        </div>
      )}

      {/* Bubble Menu — floating toolbar on text selection */}
      {editor && !readOnly && bubbleMenuPos && (
        createPortal(
          <div
            className="fixed z-50 flex items-center gap-0.5 bg-popover border border-border rounded-lg shadow-lg px-1 py-0.5 animate-in fade-in-0 zoom-in-95 duration-150"
            style={{ left: bubbleMenuPos.x, top: bubbleMenuPos.y }}
          >
            <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito" shortcut="Ctrl+B">
              <Bold className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico" shortcut="Ctrl+I">
              <Italic className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado">
              <UnderlineIcon className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Tachado">
              <Strikethrough className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")} title="Destaque">
              <Highlighter className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Código">
              <Code className="w-3.5 h-3.5" />
            </ToolbarButton>
            <Separator orientation="vertical" className="h-5 mx-0.5" />
            <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="Link">
              <LinkIcon className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive("heading", { level: 2 })}
              title="Título"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </ToolbarButton>
          </div>,
          document.body
        )
      )}

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Slash Command Menu */}
      {slashMenuOpen &&
        createPortal(
          <SlashCommandMenu
            items={defaultSlashCommands}
            query={slashQuery}
            onSelect={(item) => {
              setSlashMenuOpen(false);
              // Trigger suggestion command
              const { state, view } = editor;
              // Find and delete the slash command text, then execute
              item.command(editor);
            }}
            clientRect={slashClientRect}
          />,
          document.body
        )}
    </div>
  );
}
