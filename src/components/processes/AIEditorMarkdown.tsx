import { useState } from 'react';
import { Sparkles, X, Check, ArrowLeftRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownViewer } from '@/components/shared/MarkdownViewer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const QUICK_SUGGESTIONS = [
  'Adicionar uma etapa de aprovação',
  'Incluir ponto de decisão',
  'Detalhar responsáveis de cada etapa',
  'Adicionar métricas e KPIs',
  'Incluir documentos necessários',
  'Adicionar tempo estimado por etapa',
];

interface AIEditorMarkdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMarkdown: string;
  onApply: (newMarkdown: string) => void;
}

export function AIEditorMarkdown({
  open,
  onOpenChange,
  currentMarkdown,
  onApply,
}: AIEditorMarkdownProps) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const handleGenerate = async (customPrompt?: string) => {
    const p = customPrompt || prompt;
    if (!p.trim()) { toast.error('Descreva o que deseja alterar'); return; }
    
    setGenerating(true);
    try {
      const combinedPrompt = `Documento de processo existente:\n\n${currentMarkdown}\n\n---\n\nInstrução de edição:\n${p.trim()}\n\nGere o documento COMPLETO atualizado incorporando as mudanças solicitadas. Mantenha o formato Markdown profissional.`;

      const { data, error } = await supabase.functions.invoke('process-ai', {
        body: { action: 'generate', prompt: combinedPrompt },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setPreview(data.markdown || currentMarkdown);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao gerar com IA');
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = () => {
    if (preview) {
      onApply(preview);
      toast.success('Documento atualizado!');
      onOpenChange(false);
      setPreview(null);
      setPrompt('');
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setPrompt('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Editar Documento com IA
          </DialogTitle>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sugestões rápidas</Label>
              <div className="flex flex-wrap gap-2">
                {QUICK_SUGGESTIONS.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => { setPrompt(s); handleGenerate(s); }}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ou descreva livremente o que deseja</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Adicionar uma etapa de revisão jurídica antes da aprovação final, com prazo de 48h..."
                rows={4}
                className="resize-none"
              />
            </div>

            <Button onClick={() => handleGenerate()} disabled={generating} className="w-full gap-2">
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Gerar alterações
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant={showDiff ? 'outline' : 'default'}
                size="sm"
                onClick={() => setShowDiff(false)}
              >
                Resultado
              </Button>
              <Button
                variant={showDiff ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowDiff(true)}
                className="gap-1"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Comparar
              </Button>
            </div>

            {showDiff ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Original</p>
                  <ScrollArea className="h-[400px] rounded-lg border border-border p-3 bg-muted/30">
                    <MarkdownViewer content={currentMarkdown} enableTOC={false} variant="compact" />
                  </ScrollArea>
                </div>
                <div>
                  <p className="text-xs font-semibold text-primary mb-2">Atualizado</p>
                  <ScrollArea className="h-[400px] rounded-lg border border-primary/30 p-3 bg-primary/5">
                    <MarkdownViewer content={preview} enableTOC={false} variant="compact" />
                  </ScrollArea>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-[400px] rounded-lg border border-border p-4">
                <MarkdownViewer content={preview} enableTOC={false} variant="compact" />
              </ScrollArea>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-1" /> Descartar
              </Button>
              <Button onClick={handleApply} className="gap-1.5">
                <Check className="w-4 h-4" /> Aplicar alterações
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
