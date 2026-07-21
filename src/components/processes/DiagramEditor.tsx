import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  ReactFlow, ReactFlowProvider, Controls, MiniMap, Background, BackgroundVariant,
  useNodesState, useEdgesState, addEdge, useReactFlow,
  type Node, type Edge, type Connection, type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  X, Save, Undo2, Redo2, Trash2, Copy, Maximize2, LayoutGrid, Grid3x3,
  Play, Flag, ListChecks, HelpCircle, Layers, FileText, Database, Zap, StickyNote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  nodeTypes, makeEdges, autoLayoutNodes, EDGE_STYLE, EDGE_MARKER, nodeSize, miniMapNodeColor,
} from './flow-core';
import type { FlowData, FlowNodeColor, FlowNodeType, FlowEdgeType } from './flow-core';

/* ------------------------------------------------------------------ */
const PALETTE_ITEMS: { type: FlowNodeType; label: string; icon: typeof Play }[] = [
  { type: 'start', label: 'Início', icon: Play },
  { type: 'end', label: 'Fim', icon: Flag },
  { type: 'task', label: 'Tarefa', icon: ListChecks },
  { type: 'decision', label: 'Decisão', icon: HelpCircle },
  { type: 'subprocess', label: 'Subprocesso', icon: Layers },
  { type: 'document', label: 'Documento', icon: FileText },
  { type: 'data', label: 'Dados', icon: Database },
  { type: 'event', label: 'Evento', icon: Zap },
  { type: 'note', label: 'Nota', icon: StickyNote },
];

const COLOR_OPTIONS: { key: FlowNodeColor; label: string; swatch: string }[] = [
  { key: 'neutral', label: 'Padrão', swatch: 'bg-muted-foreground/40' },
  { key: 'primary', label: 'Primária', swatch: 'bg-primary' },
  { key: 'success', label: 'Verde', swatch: 'bg-success' },
  { key: 'warning', label: 'Amarelo', swatch: 'bg-warning' },
  { key: 'danger', label: 'Vermelho', swatch: 'bg-danger' },
  { key: 'info', label: 'Azul', swatch: 'bg-info' },
];

const EDGE_TYPE_OPTIONS: { key: FlowEdgeType; label: string }[] = [
  { key: 'smoothstep', label: 'Curva suave' },
  { key: 'step', label: 'Ângulo reto' },
  { key: 'straight', label: 'Reta' },
  { key: 'bezier', label: 'Bézier' },
];

const defaultLabel = (type: FlowNodeType) =>
  type === 'start' ? 'Início' : type === 'end' ? 'Fim' : type === 'note' ? 'Nova nota'
    : type === 'decision' ? 'Decisão?' : type === 'document' ? 'Documento' : type === 'data' ? 'Dados'
    : type === 'event' ? 'Evento' : type === 'subprocess' ? 'Subprocesso' : 'Nova tarefa';

/** RF edge type string → FlowEdgeType persistível. */
function toFlowEdgeType(rf?: string): FlowEdgeType | undefined {
  switch (rf) {
    case 'straight': return 'straight';
    case 'step': return 'step';
    case 'default': return 'bezier';
    case 'smoothstep': return 'smoothstep';
    default: return undefined;
  }
}
/** FlowEdgeType → RF edge type string. */
function toRfEdgeType(t: FlowEdgeType): string {
  return t === 'bezier' ? 'default' : t;
}

type Snapshot = { nodes: Node[]; edges: Edge[] };

interface DiagramEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowData: FlowData | null;
  processName: string;
  onSave: (flowData: FlowData) => void;
}

function EditorInner({ onOpenChange, flowData, processName, onSave }: Omit<DiagramEditorProps, 'open'>) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const initialNodes = useMemo<Node[]>(() => {
    if (!flowData?.nodes.length) return [];
    const nodes: Node[] = flowData.nodes.map((n) => ({
      id: n.id, type: n.type, position: n.position || { x: 0, y: 0 },
      data: { label: n.label, description: n.description, responsible: n.responsible, estimated_time: n.estimated_time, phase: n.phase, color: n.color },
    }));
    if (flowData.nodes.some((n) => n.position)) return nodes;
    const edges = makeEdges(flowData.edges);
    return autoLayoutNodes(nodes, edges);
  }, [flowData]);

  const initialEdges = useMemo<Edge[]>(() => (flowData?.edges.length ? makeEdges(flowData.edges) : []), [flowData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) || null, [edges, selectedEdgeId]);

  /* ---- Undo / Redo ---- */
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const editGuard = useRef<number>(0);

  const commit = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-49), { nodes, edges }]);
    setRedoStack([]);
  }, [nodes, edges]);

  // Commit coalescido para edições contínuas (digitação/sliders)
  const commitEdit = useCallback(() => {
    const now = Date.now();
    if (now - editGuard.current < 700) { editGuard.current = now; return; }
    editGuard.current = now;
    commit();
  }, [commit]);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (!prev.length) return prev;
      const snap = prev[prev.length - 1];
      setRedoStack((r) => [...r, { nodes, edges }]);
      setNodes(snap.nodes);
      setEdges(snap.edges);
      return prev.slice(0, -1);
    });
  }, [nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const snap = prev[prev.length - 1];
      setUndoStack((u) => [...u, { nodes, edges }]);
      setNodes(snap.nodes);
      setEdges(snap.edges);
      return prev.slice(0, -1);
    });
  }, [nodes, edges, setNodes, setEdges]);

  /* ---- Conexões ---- */
  const onConnect: OnConnect = useCallback((connection: Connection) => {
    commit();
    setEdges((eds) => addEdge({ ...connection, id: `edge_${crypto.randomUUID()}`, type: 'smoothstep', markerEnd: EDGE_MARKER, style: EDGE_STYLE }, eds));
  }, [setEdges, commit]);

  /* ---- Adicionar nó (clique = centro do viewport) ---- */
  const spawnNode = useCallback((type: FlowNodeType, position: { x: number; y: number }) => {
    commit();
    const id = `node_${crypto.randomUUID()}`;
    setNodes((nds) => [...nds, { id, type, position, data: { label: defaultLabel(type) } }]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }, [setNodes, commit]);

  const addNodeCentered = useCallback((type: FlowNodeType) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 200, y: 200 };
    const { width, height } = nodeSize(type);
    spawnNode(type, { x: center.x - width / 2, y: center.y - height / 2 });
  }, [screenToFlowPosition, spawnNode]);

  /* ---- Drag-and-drop da paleta ---- */
  const onDragStart = (e: React.DragEvent, type: FlowNodeType) => {
    e.dataTransfer.setData('application/omnx-node', type);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/omnx-node') as FlowNodeType;
    if (!type) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const { width, height } = nodeSize(type);
    spawnNode(type, { x: pos.x - width / 2, y: pos.y - height / 2 });
  }, [screenToFlowPosition, spawnNode]);

  /* ---- Excluir / duplicar ---- */
  const deleteSelected = useCallback(() => {
    const nodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
    const edgeIds = edges.filter((e) => e.selected).map((e) => e.id);
    if (!nodeIds.length && !edgeIds.length && !selectedNodeId && !selectedEdgeId) return;
    if (selectedNodeId && !nodeIds.includes(selectedNodeId)) nodeIds.push(selectedNodeId);
    if (selectedEdgeId && !edgeIds.includes(selectedEdgeId)) edgeIds.push(selectedEdgeId);
    commit();
    setNodes((nds) => nds.filter((n) => !nodeIds.includes(n.id)));
    setEdges((eds) => eds.filter((e) => !edgeIds.includes(e.id) && !nodeIds.includes(e.source) && !nodeIds.includes(e.target)));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [nodes, edges, selectedNodeId, selectedEdgeId, setNodes, setEdges, commit]);

  const duplicateSelected = useCallback(() => {
    const toDup = nodes.filter((n) => n.selected || n.id === selectedNodeId);
    if (!toDup.length) return;
    commit();
    const clones = toDup.map((n) => ({
      ...n, id: `node_${crypto.randomUUID()}`, selected: false,
      position: { x: n.position.x + 32, y: n.position.y + 32 },
      data: { ...n.data },
    }));
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...clones]);
    setSelectedNodeId(clones[0].id);
  }, [nodes, selectedNodeId, setNodes, commit]);

  /* ---- Auto-layout ---- */
  const applyAutoLayout = useCallback(() => {
    commit();
    setNodes((nds) => autoLayoutNodes(nds, edges));
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
  }, [edges, setNodes, commit, fitView]);

  /* ---- Seleção ---- */
  const onNodeClick = useCallback((_: unknown, node: Node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }, []);
  const onEdgeClick = useCallback((_: unknown, edge: Edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }, []);
  const onPaneClick = useCallback(() => { setSelectedNodeId(null); setSelectedEdgeId(null); }, []);
  const onNodeDragStart = useCallback(() => { commit(); }, [commit]);

  /* ---- Atualizar propriedades ---- */
  const updateNodeData = useCallback((field: string, value: unknown) => {
    if (!selectedNodeId) return;
    commitEdit();
    setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, [field]: value } } : n)));
  }, [selectedNodeId, setNodes, commitEdit]);

  const changeNodeType = useCallback((type: FlowNodeType) => {
    if (!selectedNodeId) return;
    commit();
    setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, type } : n)));
  }, [selectedNodeId, setNodes, commit]);

  const updateEdge = useCallback((patch: Partial<Edge>, coalesce = false) => {
    if (!selectedEdgeId) return;
    if (coalesce) commitEdit(); else commit();
    setEdges((eds) => eds.map((e) => (e.id === selectedEdgeId ? { ...e, ...patch } : e)));
  }, [selectedEdgeId, setEdges, commit, commitEdit]);

  /* ---- Teclado ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault(); duplicateSelected();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        e.preventDefault(); deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, duplicateSelected, deleteSelected]);

  /* ---- Salvar ---- */
  const handleSave = () => {
    const runtime = (t?: string) => t === 'phase' || t === 'laneBackground';
    const fd: FlowData = {
      nodes: nodes.filter((n) => !runtime(n.type)).map((n) => ({
        id: n.id, type: (n.type || 'task') as FlowNodeType, label: String(n.data?.label || ''),
        description: n.data?.description ? String(n.data.description) : undefined,
        responsible: n.data?.responsible ? String(n.data.responsible) : undefined,
        estimated_time: n.data?.estimated_time ? String(n.data.estimated_time) : undefined,
        phase: n.data?.phase ? String(n.data.phase) : undefined,
        color: (n.data?.color as FlowNodeColor) || undefined,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      })),
      edges: edges.map((e) => ({
        id: e.id, source: e.source, target: e.target,
        label: e.label ? String(e.label) : undefined,
        type: toFlowEdgeType(e.type),
        animated: e.animated || undefined,
      })),
    };
    onSave(fd);
    toast.success('Diagrama salvo!');
    onOpenChange(false);
  };

  const currentEdgeFlowType: FlowEdgeType = toFlowEdgeType(selectedEdge?.type) || 'smoothstep';

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate max-w-[220px]">{processName} — Editor</span>
          <div className="flex gap-0.5 ml-3">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={undo} disabled={!undoStack.length} title="Desfazer (Ctrl+Z)"><Undo2 className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={redo} disabled={!redoStack.length} title="Refazer (Ctrl+Shift+Z)"><Redo2 className="w-3.5 h-3.5" /></Button>
            <div className="w-px h-5 bg-border mx-1 self-center" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={duplicateSelected} disabled={!selectedNode} title="Duplicar (Ctrl+D)"><Copy className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={deleteSelected} disabled={!selectedNode && !selectedEdge} title="Excluir (Del)"><Trash2 className="w-3.5 h-3.5" /></Button>
            <div className="w-px h-5 bg-border mx-1 self-center" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={applyAutoLayout} title="Auto-organizar"><LayoutGrid className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fitView({ padding: 0.2, duration: 300 })} title="Ajustar à tela"><Maximize2 className="w-3.5 h-3.5" /></Button>
            <Button variant={snapEnabled ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setSnapEnabled((s) => !s)} title="Alinhar à grade"><Grid3x3 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} className="gap-1.5"><Save className="w-3.5 h-3.5" /> Salvar</Button>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Paleta */}
        <div className="w-44 border-r border-border bg-muted/30 p-3 space-y-1.5 overflow-auto shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Elementos</p>
          <p className="text-[10px] text-muted-foreground/70 mb-2">Arraste ou clique para adicionar</p>
          {PALETTE_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.type}
                draggable
                onDragStart={(e) => onDragStart(e, item.type)}
                onClick={() => addNodeCentered(item.type)}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors border border-transparent hover:border-border cursor-grab active:cursor-grabbing"
              >
                <Icon className="w-4 h-4 text-muted-foreground" />{item.label}
              </button>
            );
          })}
        </div>

        {/* Canvas */}
        <div className="flex-1 relative min-h-0" ref={wrapperRef}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick} onNodeDragStart={onNodeDragStart}
            onDrop={onDrop} onDragOver={onDragOver}
            nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            snapToGrid={snapEnabled} snapGrid={[15, 15]} deleteKeyCode={null}
          >
            <Controls position="bottom-left" />
            <MiniMap nodeColor={miniMapNodeColor} pannable zoomable position="bottom-right" className="!bg-muted/50" />
            <Background variant={BackgroundVariant.Dots} gap={15} size={1} className="!bg-background" />
          </ReactFlow>
        </div>

        {/* Painel de propriedades — Nó */}
        {selectedNode && (
          <div className="w-64 border-l border-border bg-card p-4 overflow-auto shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Propriedades</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedNodeId(null)}><X className="w-3 h-3" /></Button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={selectedNode.type} onValueChange={(v) => changeNodeType(v as FlowNodeType)}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PALETTE_ITEMS.map((p) => <SelectItem key={p.type} value={p.type}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {selectedNode.type === 'note' ? (
                <div>
                  <Label className="text-xs">Conteúdo da nota</Label>
                  <Textarea value={String(selectedNode.data?.label || '')} onChange={(e) => updateNodeData('label', e.target.value)} className="text-sm resize-none mt-1" rows={5} placeholder="Escreva sua anotação..." />
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Rótulo</Label>
                  <Input value={String(selectedNode.data?.label || '')} onChange={(e) => updateNodeData('label', e.target.value)} className="h-8 text-sm mt-1" />
                </div>
              )}

              {/* Cor */}
              <div>
                <Label className="text-xs">Cor</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {COLOR_OPTIONS.map((c) => {
                    const active = (selectedNode.data?.color || 'neutral') === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => updateNodeData('color', c.key === 'neutral' ? undefined : c.key)}
                        title={c.label}
                        className={cn('w-6 h-6 rounded-full border-2 transition-all', c.swatch, active ? 'border-foreground scale-110' : 'border-transparent hover:border-border')}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Fase (swim-lane) */}
              {selectedNode.type !== 'note' && (
                <div>
                  <Label className="text-xs">Fase (swim-lane)</Label>
                  <Input value={String(selectedNode.data?.phase || '')} onChange={(e) => updateNodeData('phase', e.target.value)} className="h-8 text-sm mt-1" placeholder="Ex: Solicitação" />
                </div>
              )}

              {selectedNode.type === 'task' && (
                <>
                  <div><Label className="text-xs">Responsável</Label><Input value={String(selectedNode.data?.responsible || '')} onChange={(e) => updateNodeData('responsible', e.target.value)} className="h-8 text-sm mt-1" placeholder="Ex: Gerente de RH" /></div>
                  <div><Label className="text-xs">Tempo estimado</Label><Input value={String(selectedNode.data?.estimated_time || '')} onChange={(e) => updateNodeData('estimated_time', e.target.value)} className="h-8 text-sm mt-1" placeholder="Ex: 2 horas" /></div>
                </>
              )}
              {(selectedNode.type === 'task' || selectedNode.type === 'subprocess') && (
                <div><Label className="text-xs">Descrição</Label><Textarea value={String(selectedNode.data?.description || '')} onChange={(e) => updateNodeData('description', e.target.value)} className="text-sm resize-none mt-1" rows={3} /></div>
              )}
            </div>
          </div>
        )}

        {/* Painel de propriedades — Conexão */}
        {selectedEdge && !selectedNode && (
          <div className="w-64 border-l border-border bg-card p-4 overflow-auto shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Conexão</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedEdgeId(null)}><X className="w-3 h-3" /></Button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Rótulo</Label>
                <Input value={String(selectedEdge.label || '')} onChange={(e) => updateEdge({ label: e.target.value }, true)} className="h-8 text-sm mt-1" placeholder="Ex: Sim / Não" />
              </div>
              <div>
                <Label className="text-xs">Estilo da linha</Label>
                <Select value={currentEdgeFlowType} onValueChange={(v) => updateEdge({ type: toRfEdgeType(v as FlowEdgeType) })}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EDGE_TYPE_OPTIONS.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Animada</Label>
                <Switch checked={!!selectedEdge.animated} onCheckedChange={(v) => updateEdge({ animated: v })} />
              </div>
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-danger" onClick={deleteSelected}><Trash2 className="w-3.5 h-3.5" /> Excluir conexão</Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function DiagramEditor({ open, onOpenChange, flowData, processName, onSave }: DiagramEditorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-[90vh] p-0 gap-0 flex flex-col overflow-hidden [&>button.absolute]:hidden">
        <DialogTitle className="sr-only">{processName} — Editor de diagrama</DialogTitle>
        <ReactFlowProvider>
          <EditorInner onOpenChange={onOpenChange} flowData={flowData} processName={processName} onSave={onSave} />
        </ReactFlowProvider>
      </DialogContent>
    </Dialog>
  );
}
