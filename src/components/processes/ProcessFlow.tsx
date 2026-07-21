import { useMemo } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes, layoutNodes, miniMapNodeColor } from "./flow-core";
import type { FlowData } from "./flow-core";

// Re-exporta o modelo para consumidores que importavam de "./ProcessFlow"
export type { FlowData, FlowNode, FlowEdge, FlowNodeColor, FlowNodeType, FlowEdgeType } from "./flow-core";

interface ProcessFlowProps {
  flowData: FlowData | null;
  className?: string;
}

export default function ProcessFlow({ flowData, className }: ProcessFlowProps) {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => (flowData ? layoutNodes(flowData) : { nodes: [], edges: [] }),
    [flowData]
  );

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(layoutedEdges);

  if (!flowData || flowData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-muted/30 rounded-xl border border-border/50">
        <p className="text-muted-foreground text-sm">Nenhum diagrama gerado</p>
      </div>
    );
  }

  return (
    <div className={className || "h-[600px] rounded-xl border border-border/50 overflow-hidden"}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-right" />
        <MiniMap nodeColor={miniMapNodeColor} nodeStrokeWidth={3} pannable zoomable className="!bg-muted/50" />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="!bg-background" />
      </ReactFlow>
    </div>
  );
}
