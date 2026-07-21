import { useState } from 'react';
import { Sparkles, X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FlowData } from './ProcessFlow';

const DIAGRAM_SUGGESTIONS = [
  'Adicionar uma etapa entre A e B',
  'Incluir um ponto de decisão',
  'Adicionar loop de retorno',
  'Simplificar o fluxo',
  'Adicionar etapa paralela',
  'Incluir subprocesso',
];

interface AIEditorDiagramProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFlowData: FlowData | null;
  currentMarkdown?: string;
  onApply: (flowData: FlowData) => void;
}

export function AIEditorDiagram({
  open,
  onOpenChange,
  currentFlowData,
  currentMarkdown,
  onApply,
}: AIEditorDiagramProps) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (customPrompt?: string) => {
    const p = customPrompt || prompt;
    if (!p.trim()) { toast.error('Descreva o que deseja alterar'); return; }

    setGenerating(true);
    try {
      // Use the existing markdown + edit instruction to regenerate the diagram
      const baseContent = currentMarkdown || 
        (currentFlowData?.nodes.map(n => `- ${n.label}`).join('\n') || 'Processo genérico');
      
      const combinedPrompt = `Processo atual:\n\n${baseContent}\n\nFluxo atual:\n${JSON.stringify(currentFlowData, null, 2)}\n\n---\n\nEdição solicitada no diagrama:\n${p.trim()}\n\nGere o documento e diagrama atualizados.`;

      const { data, error } = await supabase.functions.invoke('process-ai', {
        body: { action: 'generate', prompt: combinedPrompt },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data.flowData) {
        onApply(data.flowData);
        toast.success('Diagrama atualizado com IA!');
        onOpenChange(false);
        setPrompt('');
      } else {
        toast.error('A IA não retornou um diagrama válido');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao gerar com IA');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Editar Diagrama com IA
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Sugestões</Label>
            <div className="flex flex-wrap gap-2">
              {DIAGRAM_SUGGESTIONS.map((s) => (
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
            <Label>Descreva a alteração no diagrama</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: Adicionar uma etapa de validação técnica após a revisão, com dois caminhos: aprovado e rejeitado..."
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
                <Sparkles className="w-4 h-4" /> Aplicar alteração
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
