import {
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import dagre from "dagre";
import {
  BpmStartNode,
  BpmEndNode,
  BpmTaskNode,
  BpmDecisionNode,
  BpmSubprocessNode,
  BpmPhaseNode,
  BpmNoteNode,
  BpmDocumentNode,
  BpmDataNode,
  BpmEventNode,
  BpmLaneBackgroundNode,
} from "./BpmNodes";

/* ------------------------------------------------------------------ *
 * Modelo de dados (fonte única de verdade — persistido em processes.flow_data)
 * ------------------------------------------------------------------ */

/** Tipos de nó persistíveis. `phase` e `laneBackground` são gerados em runtime pelo layout. */
export type FlowNodeType =
  | "start"
  | "end"
  | "task"
  | "decision"
  | "subprocess"
  | "note"
  | "document"
  | "data"
  | "event";

/** Chave de cor semântica — mapeia para tokens em src/index.css (sem cores hardcoded). */
export type FlowNodeColor =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

/** Estilo de linha da conexão (mapeia para os edge types nativos do React Flow). */
export type FlowEdgeType = "smoothstep" | "straight" | "step" | "bezier";

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  description?: string;
  responsible?: string;
  estimated_time?: string;
  phase?: string; // agrupa em swim lanes
  color?: FlowNodeColor;
  position?: { x: number; y: number }; // posição manual (senão auto-layout)
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: FlowEdgeType;
  animated?: boolean;
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/* ------------------------------------------------------------------ *
 * Registro de nós customizados (compartilhado por editor/viewer/embed)
 * ------------------------------------------------------------------ */

export const nodeTypes = {
  start: BpmStartNode,
  end: BpmEndNode,
  task: BpmTaskNode,
  decision: BpmDecisionNode,
  subprocess: BpmSubprocessNode,
  phase: BpmPhaseNode,
  note: BpmNoteNode,
  document: BpmDocumentNode,
  data: BpmDataNode,
  event: BpmEventNode,
  laneBackground: BpmLaneBackgroundNode,
};

export const NODE_WIDTH: Record<string, number> = {
  start: 150,
  end: 150,
  task: 190,
  decision: 150,
  subprocess: 190,
  note: 200,
  document: 180,
  data: 180,
  event: 70,
};

export const NODE_HEIGHT: Record<string, number> = {
  start: 54,
  end: 54,
  task: 76,
  decision: 100,
  subprocess: 76,
  note: 100,
  document: 92,
  data: 76,
  event: 70,
};

export const nodeSize = (type?: string) => ({
  width: NODE_WIDTH[type || "task"] || 190,
  height: NODE_HEIGHT[type || "task"] || 76,
});

/** Cor padrão (semântica) por tipo, quando o nó não define `color`. */
export function defaultColorForType(type?: string): FlowNodeColor {
  switch (type) {
    case "start":
      return "success";
    case "end":
      return "danger";
    case "decision":
    case "note":
      return "warning";
    case "subprocess":
    case "event":
      return "info";
    default:
      return "neutral";
  }
}

const COLOR_TOKEN: Record<FlowNodeColor, string> = {
  primary: "--primary",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  info: "--info",
  neutral: "--muted-foreground",
};

/** Cor do nó no MiniMap (usa tokens do design system). */
export function miniMapNodeColor(n: Node): string {
  if (n.type === "laneBackground" || n.type === "phase") return "hsl(var(--muted))";
  const color = ((n.data as { color?: FlowNodeColor })?.color) || defaultColorForType(n.type);
  return `hsl(var(${COLOR_TOKEN[color] || "--muted-foreground"}))`;
}

/* ------------------------------------------------------------------ *
 * Edges
 * ------------------------------------------------------------------ */

export const EDGE_STYLE = { strokeWidth: 2, stroke: "hsl(var(--muted-foreground))" };

export const EDGE_MARKER = {
  type: MarkerType.ArrowClosed as const,
  color: "hsl(var(--muted-foreground))",
  width: 14,
  height: 14,
};

/** Converte o tipo de linha persistido para o edge type nativo do React Flow. */
function toReactFlowEdgeType(t?: FlowEdgeType): string {
  switch (t) {
    case "straight":
      return "straight";
    case "step":
      return "step";
    case "bezier":
      return "default";
    case "smoothstep":
    default:
      return "smoothstep";
  }
}

export function makeEdges(flowEdges: FlowEdge[]): Edge[] {
  return flowEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
    type: toReactFlowEdgeType(e.type),
    animated: !!e.animated,
    markerEnd: EDGE_MARKER,
    style: EDGE_STYLE,
    labelStyle: { fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" },
    labelBgStyle: { fill: "hsl(var(--card))", stroke: "hsl(var(--border))", strokeWidth: 1, rx: 4, ry: 4 },
    labelBgPadding: [6, 4] as [number, number],
  }));
}

/* ------------------------------------------------------------------ *
 * Nós React Flow (propaga TODOS os campos ao data — inclui phase e color)
 * ------------------------------------------------------------------ */

export function toReactFlowNode(n: FlowNode, position: { x: number; y: number }): Node {
  return {
    id: n.id,
    type: n.type,
    position,
    data: {
      label: n.label,
      description: n.description,
      responsible: n.responsible,
      estimated_time: n.estimated_time,
      phase: n.phase,
      color: n.color,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

const LANE_LABEL_W = 150;
const LANE_PAD_X = 40;
const LANE_GAP_X = 70;
const LANE_GAP_Y = 40;
const LANE_PAD_Y = 30;

/** Layout automático via dagre (fallback quando não há fases). Direção top→bottom. */
function dagreLayout(flowData: FlowData): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100, marginx: 40, marginy: 40 });

  for (const n of flowData.nodes) {
    const { width, height } = nodeSize(n.type);
    g.setNode(n.id, { width, height });
  }
  for (const e of flowData.edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const nodes: Node[] = flowData.nodes.map((n) => {
    if (n.position) return toReactFlowNode(n, n.position);
    const pos = g.node(n.id);
    const { width, height } = nodeSize(n.type);
    return toReactFlowNode(n, { x: pos.x - width / 2, y: pos.y - height / 2 });
  });

  return { nodes, edges: makeEdges(flowData.edges) };
}

/** Layout de swim-lanes horizontais por `phase`, com faixa de fundo desenhada. */
function swimLaneLayout(flowData: FlowData): { nodes: Node[]; edges: Edge[] } {
  const phaseOrder: string[] = [];
  const phaseMap = new Map<string, FlowNode[]>();
  for (const n of flowData.nodes) {
    const p = n.phase || "Geral";
    if (!phaseMap.has(p)) {
      phaseOrder.push(p);
      phaseMap.set(p, []);
    }
    phaseMap.get(p)!.push(n);
  }

  // Largura total da lane = maior extensão horizontal entre as fases (faixas alinhadas).
  let maxLaneRight = LANE_LABEL_W + LANE_PAD_X;
  for (const phase of phaseOrder) {
    let x = LANE_LABEL_W + LANE_PAD_X;
    for (const n of phaseMap.get(phase)!) {
      if (n.position) {
        maxLaneRight = Math.max(maxLaneRight, n.position.x + nodeSize(n.type).width);
        continue;
      }
      x += nodeSize(n.type).width + LANE_GAP_X;
    }
    maxLaneRight = Math.max(maxLaneRight, x);
  }
  const laneWidth = maxLaneRight + LANE_PAD_X;

  const bgNodes: Node[] = [];
  const contentNodes: Node[] = [];
  let yOffset = 0;

  phaseOrder.forEach((phase, idx) => {
    const nodesInPhase = phaseMap.get(phase)!;
    const maxH = Math.max(...nodesInPhase.map((n) => nodeSize(n.type).height));
    const laneH = maxH + LANE_PAD_Y * 2;

    // Faixa de fundo desenhada (atrás de tudo)
    bgNodes.push({
      id: `__lane__${phase}`,
      type: "laneBackground",
      position: { x: 0, y: yOffset },
      data: { width: laneWidth, height: laneH, index: idx },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: -1,
    } as Node);

    // Rótulo da fase (esquerda)
    contentNodes.push({
      id: `__phase__${phase}`,
      type: "phase",
      position: { x: 12, y: yOffset + (laneH - 40) / 2 },
      data: { label: phase },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: 1,
    } as Node);

    // Nós, da esquerda para a direita
    let xOffset = LANE_LABEL_W + LANE_PAD_X;
    for (const n of nodesInPhase) {
      if (n.position) {
        contentNodes.push(toReactFlowNode(n, n.position));
        continue;
      }
      const { width, height } = nodeSize(n.type);
      contentNodes.push(toReactFlowNode(n, { x: xOffset, y: yOffset + (laneH - height) / 2 }));
      xOffset += width + LANE_GAP_X;
    }

    yOffset += laneH + LANE_GAP_Y;
  });

  return { nodes: [...bgNodes, ...contentNodes], edges: makeEdges(flowData.edges) };
}

/** Escolhe swim-lane (se houver fase) ou dagre. */
export function layoutNodes(flowData: FlowData): { nodes: Node[]; edges: Edge[] } {
  const hasPhases = flowData.nodes.some((n) => n.phase);
  return hasPhases ? swimLaneLayout(flowData) : dagreLayout(flowData);
}

/** Auto-layout dagre para uso no editor (ignora nós runtime; retorna posições atualizadas). */
export function autoLayoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100, marginx: 40, marginy: 40 });

  const isRuntime = (t?: string) => t === "phase" || t === "laneBackground";

  for (const n of nodes) {
    if (isRuntime(n.type)) continue;
    const { width, height } = nodeSize(n.type);
    g.setNode(n.id, { width, height });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  return nodes.map((n) => {
    if (isRuntime(n.type)) return n;
    const pos = g.node(n.id);
    if (!pos) return n;
    const { width, height } = nodeSize(n.type);
    return { ...n, position: { x: pos.x - width / 2, y: pos.y - height / 2 } };
  });
}
