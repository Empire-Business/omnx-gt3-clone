import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Pencil, Eye, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ProcessMarkdownEditorProps {
  markdown: string;
  onSave: (markdown: string) => void;
  readOnly?: boolean;
  isLoading?: boolean;
}

export default function ProcessMarkdownEditor({
  markdown,
  onSave,
  readOnly = false,
  isLoading = false,
}: ProcessMarkdownEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(markdown);

  const handleEdit = () => {
    // Garante que o draft usa sempre o markdown mais recente (evita sobrescrever com placeholder vazio)
    setDraft(markdown);
    setEditing(true);
  };

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(markdown);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Editando documento</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1">
              <X className="w-4 h-4" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-1">
              <Save className="w-4 h-4" /> Salvar
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[500px] font-mono text-sm resize-none"
            placeholder="Documento do processo em Markdown..."
          />
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-xl border border-border/50 bg-muted/30 overflow-auto max-h-[500px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={isLoading}
            className="gap-1"
            title={isLoading ? "Aguardando carregamento do documento..." : undefined}
          >
            <Pencil className="w-4 h-4" />
            {isLoading ? "Carregando..." : "Editar documento"}
          </Button>
        </div>
      )}
      <div className="prose prose-sm dark:prose-invert max-w-none p-6 rounded-xl border border-border/50 bg-card">
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        ) : (
          <p className="text-muted-foreground text-center py-8">Nenhum documento gerado</p>
        )}
      </div>
    </div>
  );
}
