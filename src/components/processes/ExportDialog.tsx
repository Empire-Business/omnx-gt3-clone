import { useRef, useMemo, useState } from 'react';
import { Download, FileImage, FileText, File, Copy } from 'lucide-react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  exportDiagramAsImage,
  exportDiagramAsPDF,
  copyDiagramToClipboard,
  downloadDataUrl,
  type ImageFormat,
} from '@/lib/export-diagram';
import { exportMarkdownAsFile, type MarkdownExportFormat } from '@/lib/export-markdown';
import { nodeTypes, layoutNodes, nodeSize, type FlowData } from './flow-core';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processName: string;
  hasMarkdown: boolean;
  hasDiagram: boolean;
  markdown?: string;
  flowData?: FlowData | null;
}

/** Calcula o tamanho do canvas que envolve todo o grafo. */
function computeCanvas(nodes: Node[]): { width: number; height: number } {
  if (!nodes.length) return { width: 800, height: 600 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const d = n.data as Record<string, unknown> | undefined;
    const w = Number(d?.width) || nodeSize(n.type).width;
    const h = Number(d?.height) || nodeSize(n.type).height;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  const PAD = 60;
  const width = Math.min(Math.max(maxX - minX + PAD * 2, 600), 4000);
  const height = Math.min(Math.max(maxY - minY + PAD * 2, 400), 4000);
  return { width, height };
}

export function ExportDialog({
  open,
  onOpenChange,
  processName,
  hasMarkdown,
  hasDiagram,
  markdown,
  flowData,
}: ExportDialogProps) {
  const [diagramFormat, setDiagramFormat] = useState<ImageFormat | 'pdf'>('png');
  const [markdownFormat, setMarkdownFormat] = useState<MarkdownExportFormat>('pdf');
  const [exporting, setExporting] = useState(false);
  const [copying, setCopying] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const laid = useMemo(
    () => (flowData ? layoutNodes(flowData) : { nodes: [], edges: [] }),
    [flowData]
  );
  const canvas = useMemo(() => computeCanvas(laid.nodes), [laid.nodes]);

  const handleExportDiagram = async () => {
    setExporting(true);
    try {
      const element = captureRef.current;
      if (diagramFormat === 'pdf') {
        await exportDiagramAsPDF({ element });
      } else {
        const dataUrl = await exportDiagramAsImage(diagramFormat, { element });
        downloadDataUrl(dataUrl, `${processName}-diagrama.${diagramFormat}`);
      }
      toast.success('Diagrama exportado com sucesso!');
      onOpenChange(false);
    } catch (e) {
      console.error('Export error:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao exportar diagrama. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  const handleCopyImage = async () => {
    setCopying(true);
    try {
      await copyDiagramToClipboard({ element: captureRef.current });
      toast.success('Imagem copiada para a área de transferência!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível copiar a imagem.');
    } finally {
      setCopying(false);
    }
  };

  const handleExportMarkdown = () => {
    if (!markdown) { toast.error('Sem conteúdo para exportar'); return; }
    try {
      exportMarkdownAsFile(markdown, markdownFormat, processName);
      toast.success('Documento exportado!');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao exportar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" /> Exportar Processo
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={hasDiagram ? 'diagram' : 'document'}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="diagram" disabled={!hasDiagram}>
              <FileImage className="w-4 h-4 mr-1.5" /> Diagrama
            </TabsTrigger>
            <TabsTrigger value="document" disabled={!hasMarkdown}>
              <FileText className="w-4 h-4 mr-1.5" /> Documento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="diagram" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={diagramFormat} onValueChange={(v) => setDiagramFormat(v as ImageFormat | 'pdf')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG (imagem)</SelectItem>
                  <SelectItem value="jpeg">JPEG (imagem)</SelectItem>
                  <SelectItem value="svg">SVG (vetorial)</SelectItem>
                  <SelectItem value="pdf">PDF (documento)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExportDiagram} disabled={exporting || copying} className="flex-1 gap-2">
                {exporting ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Exportar
              </Button>
              <Button variant="outline" onClick={handleCopyImage} disabled={exporting || copying} className="gap-2">
                {copying ? (
                  <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                Copiar
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="document" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={markdownFormat} onValueChange={(v) => setMarkdownFormat(v as MarkdownExportFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="md">Markdown (.md)</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleExportMarkdown} className="w-full gap-2">
              <File className="w-4 h-4" /> Exportar Documento
            </Button>
          </TabsContent>
        </Tabs>

        {/* Canvas off-screen: renderiza o diagrama COMPLETO para captura confiável. */}
        {hasDiagram && (
          <div aria-hidden style={{ position: 'fixed', left: -100000, top: 0, pointerEvents: 'none', zIndex: -1 }}>
            <div ref={captureRef} style={{ width: canvas.width, height: canvas.height }}>
              <ReactFlow
                nodes={laid.nodes}
                edges={laid.edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.08 }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag={false}
                zoomOnScroll={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
              </ReactFlow>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
