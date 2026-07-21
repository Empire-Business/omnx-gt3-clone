import { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { nodeTypes, layoutNodes, miniMapNodeColor } from './flow-core';
import type { FlowData } from './flow-core';

interface DiagramViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowData: FlowData | null;
  processName: string;
  onEdit?: () => void;
  onExport?: () => void;
}

export function DiagramViewer({ open, onOpenChange, flowData, processName, onEdit, onExport }: DiagramViewerProps) {
  const laid = useMemo(() => (flowData ? layoutNodes(flowData) : { nodes: [], edges: [] }), [flowData]);

  const [nodes, , onNodesChange] = useNodesState(laid.nodes);
  const [edges, , onEdgesChange] = useEdgesState(laid.edges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const handleNodeClick = useCallback((_: unknown, node: Node) => setSelectedNode(node), []);
  const isRuntime = (t?: string) => t === 'phase' || t === 'laneBackground';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-[90vh] p-0 gap-0 flex flex-col overflow-hidden [&>button.absolute]:hidden">
        <DialogTitle className="sr-only">{processName} — Diagrama</DialogTitle>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">{processName}</h2>
            <Badge variant="outline" className="text-xs">
              {flowData?.nodes.length || 0} nós · {flowData?.edges.length || 0} conexões
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {onExport && <Button variant="outline" size="sm" onClick={onExport}>Exportar</Button>}
            {onEdit && <Button variant="outline" size="sm" onClick={onEdit}>Editar</Button>}
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="flex-1 relative min-h-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Controls position="bottom-left" />
            <MiniMap nodeColor={miniMapNodeColor} nodeStrokeWidth={3} pannable zoomable position="bottom-right" className="!bg-muted/50" />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
          </ReactFlow>

          {selectedNode && !isRuntime(selectedNode.type) && (
            <div className="absolute top-0 left-0 w-72 h-full bg-card border-r border-border p-4 overflow-auto z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="w-4 h-4" /> Detalhes do Nó
                </h3>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedNode(null)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <div className="space-y-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Tipo</p><Badge variant="outline">{selectedNode.type === 'note' ? 'Nota' : selectedNode.type}</Badge></div>
                <div><p className="text-xs text-muted-foreground">{selectedNode.type === 'note' ? 'Nota' : 'Label'}</p><p className="font-medium text-foreground whitespace-pre-wrap">{String(selectedNode.data?.label || '')}</p></div>
                {selectedNode.data?.phase ? <div><p className="text-xs text-muted-foreground">Fase</p><p className="text-foreground">{String(selectedNode.data.phase)}</p></div> : null}
                {selectedNode.data?.description ? <div><p className="text-xs text-muted-foreground">Descrição</p><p className="text-foreground">{String(selectedNode.data.description)}</p></div> : null}
                {selectedNode.data?.responsible ? <div><p className="text-xs text-muted-foreground">Responsável</p><p className="text-foreground">{String(selectedNode.data.responsible)}</p></div> : null}
                {selectedNode.data?.estimated_time ? <div><p className="text-xs text-muted-foreground">Tempo estimado</p><p className="text-foreground">{String(selectedNode.data.estimated_time)}</p></div> : null}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
