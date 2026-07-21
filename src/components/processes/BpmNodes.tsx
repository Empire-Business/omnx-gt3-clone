import { memo, type ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Play,
  Flag,
  ListChecks,
  HelpCircle,
  Layers,
  FileText,
  Database,
  Zap,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowNodeColor } from "./flow-core";

/* ------------------------------------------------------------------ *
 * Paleta de acento por cor semântica (somente tokens — zero hardcode)
 * Classes literais para o JIT do Tailwind detectar.
 * ------------------------------------------------------------------ */
interface Accent {
  bg: string;
  border: string;
  text: string;
  handle: string;
  ring: string;
}

const ACCENTS: Record<FlowNodeColor, Accent> = {
  primary: {
    bg: "bg-primary/10",
    border: "border-primary/30",
    text: "text-primary",
    handle: "!bg-primary !border-primary/40",
    ring: "ring-primary",
  },
  success: {
    bg: "bg-success-light",
    border: "border-success/40",
    text: "text-success",
    handle: "!bg-success !border-success/40",
    ring: "ring-success",
  },
  warning: {
    bg: "bg-warning-light",
    border: "border-warning/40",
    text: "text-warning",
    handle: "!bg-warning !border-warning/40",
    ring: "ring-warning",
  },
  danger: {
    bg: "bg-danger-light",
    border: "border-danger/40",
    text: "text-danger",
    handle: "!bg-danger !border-danger/40",
    ring: "ring-danger",
  },
  info: {
    bg: "bg-info-light",
    border: "border-info/40",
    text: "text-info",
    handle: "!bg-info !border-info/40",
    ring: "ring-info",
  },
  neutral: {
    bg: "bg-card",
    border: "border-border",
    text: "text-muted-foreground",
    handle: "!bg-muted-foreground/50 !border-border",
    ring: "ring-primary",
  },
};

function accentFor(data: NodeProps["data"], fallback: FlowNodeColor): Accent {
  const c = (data?.color as FlowNodeColor) || fallback;
  return ACCENTS[c] || ACCENTS[fallback];
}

/* ------------------------------------------------------------------ *
 * Handles compartilhados — ocultos por padrão, aparecem no hover/seleção
 * ------------------------------------------------------------------ */
function NodeHandles({ accent, selected }: { accent: Accent; selected?: boolean }) {
  const cls = cn(
    "!w-2.5 !h-2.5 !border-2 !rounded-full transition-opacity duration-150",
    accent.handle,
    selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
  );
  return (
    <>
      <Handle type="target" position={Position.Left} className={cls} />
      <Handle type="target" position={Position.Top} id="top" className={cls} />
      <Handle type="source" position={Position.Right} className={cls} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={cls} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Card base (task / subprocess / document / data compartilham a moldura)
 * ------------------------------------------------------------------ */
function BaseCard({
  data,
  selected,
  fallbackColor,
  icon: Icon,
  className,
  children,
}: {
  data: NodeProps["data"];
  selected?: boolean;
  fallbackColor: FlowNodeColor;
  icon: LucideIcon;
  className?: string;
  children?: ReactNode;
}) {
  const accent = accentFor(data, fallbackColor);
  return (
    <div
      className={cn(
        "group relative rounded-xl border px-4 py-3 min-w-[150px] max-w-[240px] transition-all duration-200",
        "shadow-sm hover:shadow-md hover:-translate-y-0.5",
        accent.bg,
        accent.border,
        selected && cn("ring-2 shadow-md", accent.ring),
        className
      )}
    >
      <NodeHandles accent={accent} selected={selected} />
      <div className="flex items-start gap-2">
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", accent.text)} />
        <div className="min-w-0 flex-1 text-left space-y-0.5">
          <p className="text-sm font-medium text-foreground leading-snug break-words">
            {String(data?.label || "")}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

/* --- Start --- */
export const BpmStartNode = memo(function BpmStartNode({ data, selected }: NodeProps) {
  const accent = accentFor(data, "success");
  return (
    <div
      className={cn(
        "group relative rounded-full border px-5 py-2.5 min-w-[130px] transition-all duration-200",
        "shadow-sm hover:shadow-md hover:-translate-y-0.5",
        accent.bg,
        accent.border,
        selected && cn("ring-2 shadow-md", accent.ring)
      )}
    >
      <NodeHandles accent={accent} selected={selected} />
      <div className="flex items-center justify-center gap-1.5">
        <Play className={cn("w-3.5 h-3.5", accent.text)} />
        <p className="text-sm font-semibold text-foreground leading-snug">{String(data?.label || "Início")}</p>
      </div>
    </div>
  );
});

/* --- End --- */
export const BpmEndNode = memo(function BpmEndNode({ data, selected }: NodeProps) {
  const accent = accentFor(data, "danger");
  return (
    <div
      className={cn(
        "group relative rounded-full border px-5 py-2.5 min-w-[130px] transition-all duration-200",
        "shadow-sm hover:shadow-md hover:-translate-y-0.5",
        accent.bg,
        accent.border,
        selected && cn("ring-2 shadow-md", accent.ring)
      )}
    >
      <NodeHandles accent={accent} selected={selected} />
      <div className="flex items-center justify-center gap-1.5">
        <Flag className={cn("w-3.5 h-3.5", accent.text)} />
        <p className="text-sm font-semibold text-foreground leading-snug">{String(data?.label || "Fim")}</p>
      </div>
    </div>
  );
});

/* --- Task --- */
export const BpmTaskNode = memo(function BpmTaskNode({ data, selected }: NodeProps) {
  return (
    <BaseCard data={data} selected={selected} fallbackColor="neutral" icon={ListChecks}>
      {(data?.responsible || data?.estimated_time) && (
        <p className="text-xs text-muted-foreground truncate">
          {data?.responsible ? `👤 ${String(data.responsible)}` : ''}
          {data?.responsible && data?.estimated_time ? '  ·  ' : ''}
          {data?.estimated_time ? `⏱ ${String(data.estimated_time)}` : ''}
        </p>
      )}
    </BaseCard>
  );
});

/* --- Subprocess --- */
export const BpmSubprocessNode = memo(function BpmSubprocessNode({ data, selected }: NodeProps) {
  return (
    <BaseCard
      data={data}
      selected={selected}
      fallbackColor="info"
      icon={Layers}
      className="ring-1 ring-inset ring-border/60"
    />
  );
});

/* --- Document --- */
export const BpmDocumentNode = memo(function BpmDocumentNode({ data, selected }: NodeProps) {
  const accent = accentFor(data, "neutral");
  return (
    <div className="group relative">
      <div
        className={cn(
          "relative rounded-t-xl rounded-b-sm border border-b-0 px-4 pt-3 pb-4 min-w-[150px] max-w-[220px] transition-all duration-200",
          "shadow-sm hover:shadow-md hover:-translate-y-0.5",
          accent.bg,
          accent.border,
          selected && cn("ring-2 shadow-md", accent.ring)
        )}
      >
        <NodeHandles accent={accent} selected={selected} />
        <div className="flex items-start gap-2">
          <FileText className={cn("w-4 h-4 mt-0.5 shrink-0", accent.text)} />
          <p className="text-sm font-medium text-foreground leading-snug break-words">{String(data?.label || "Documento")}</p>
        </div>
      </div>
      {/* Base ondulada (efeito documento) */}
      <svg className="block w-full -mt-px" height="8" viewBox="0 0 100 8" preserveAspectRatio="none">
        <path d="M0 0 Q 12.5 8 25 4 T 50 4 T 75 4 T 100 0 V8 H0 Z" className="fill-card stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
});

/* --- Data (paralelogramo — entrada/saída) --- */
export const BpmDataNode = memo(function BpmDataNode({ data, selected }: NodeProps) {
  const accent = accentFor(data, "neutral");
  return (
    <div
      className={cn(
        "group relative border px-5 py-3 min-w-[150px] max-w-[230px] transition-all duration-200",
        "shadow-sm hover:shadow-md hover:-translate-y-0.5",
        accent.bg,
        accent.border,
        selected && cn("ring-2 shadow-md", accent.ring)
      )}
      style={{ transform: "skewX(-12deg)" }}
    >
      <NodeHandles accent={accent} selected={selected} />
      <div className="flex items-start gap-2" style={{ transform: "skewX(12deg)" }}>
        <Database className={cn("w-4 h-4 mt-0.5 shrink-0", accent.text)} />
        <p className="text-sm font-medium text-foreground leading-snug break-words">{String(data?.label || "Dados")}</p>
      </div>
    </div>
  );
});

/* --- Event (círculo) --- */
export const BpmEventNode = memo(function BpmEventNode({ data, selected }: NodeProps) {
  const accent = accentFor(data, "info");
  return (
    <div
      className={cn(
        "group relative rounded-full border-2 w-[70px] h-[70px] flex flex-col items-center justify-center text-center transition-all duration-200",
        "shadow-sm hover:shadow-md",
        accent.bg,
        accent.border,
        selected && cn("ring-2 shadow-md", accent.ring)
      )}
    >
      <NodeHandles accent={accent} selected={selected} />
      <Zap className={cn("w-4 h-4", accent.text)} />
      <p className="text-[10px] font-medium text-foreground leading-tight px-1 line-clamp-2">{String(data?.label || "Evento")}</p>
    </div>
  );
});

/* --- Decision (losango) --- */
export const BpmDecisionNode = memo(function BpmDecisionNode({ data, selected }: NodeProps) {
  const accent = accentFor(data, "warning");
  return (
    <div className={cn("group relative w-[150px] h-[100px] flex items-center justify-center", selected && "drop-shadow-lg")}>
      <div
        className={cn("absolute inset-3 rounded-md border shadow-sm transition-all duration-200", accent.bg, accent.border, selected && cn("ring-2", accent.ring))}
        style={{ transform: "rotate(45deg)" }}
      />
      <Handle type="target" position={Position.Left} className={cn("!w-2.5 !h-2.5 !border-2 !rounded-full transition-opacity", accent.handle, selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")} style={{ left: 2 }} />
      <Handle type="target" position={Position.Top} id="top" className={cn("!w-2.5 !h-2.5 !border-2 !rounded-full transition-opacity", accent.handle, selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")} style={{ top: 2 }} />
      <Handle type="source" position={Position.Right} id="right" className={cn("!w-2.5 !h-2.5 !border-2 !rounded-full transition-opacity", accent.handle, selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")} style={{ right: 2 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={cn("!w-2.5 !h-2.5 !border-2 !rounded-full transition-opacity", accent.handle, selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")} style={{ bottom: 2 }} />
      <div className="relative z-10 flex flex-col items-center text-center px-4">
        <HelpCircle className={cn("w-3.5 h-3.5 mb-0.5", accent.text)} />
        <p className="text-xs font-semibold text-foreground leading-snug line-clamp-3">{String(data?.label || "Decisão?")}</p>
      </div>
    </div>
  );
});

/* --- Note (post-it) --- */
export const BpmNoteNode = memo(function BpmNoteNode({ data, selected }: NodeProps) {
  return (
    <div
      className={cn(
        "group relative rounded-sm border px-3 py-2.5 min-w-[150px] max-w-[240px] transition-all duration-200",
        "bg-warning-light border-warning/40",
        selected && "ring-2 ring-warning shadow-md"
      )}
      style={{ boxShadow: selected ? undefined : "2px 3px 6px rgba(0,0,0,0.10)" }}
    >
      <Handle type="source" position={Position.Right} className="!bg-warning !w-2 !h-2 !border-0 opacity-0 group-hover:opacity-60 transition-opacity" />
      <Handle type="target" position={Position.Left} className="!bg-warning !w-2 !h-2 !border-0 opacity-0 group-hover:opacity-60 transition-opacity" />
      <div className="flex items-start gap-1.5">
        <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" />
        <p className="text-xs text-foreground leading-snug whitespace-pre-wrap break-words">{String(data?.label || "Nota...")}</p>
      </div>
    </div>
  );
});

/* --- Phase (rótulo da swim-lane) --- */
export const BpmPhaseNode = memo(function BpmPhaseNode({ data }: NodeProps) {
  return (
    <div className="flex items-center">
      <div className="bg-muted/70 rounded-lg px-3 py-2 border border-border/50">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider leading-tight whitespace-nowrap">
          {String(data?.label || "")}
        </p>
      </div>
    </div>
  );
});

/* --- Lane background (faixa desenhada atrás da swim-lane) --- */
export const BpmLaneBackgroundNode = memo(function BpmLaneBackgroundNode({ data }: NodeProps) {
  const idx = Number(data?.index || 0);
  return (
    <div
      style={{ width: Number(data?.width || 400), height: Number(data?.height || 120) }}
      className={cn(
        "rounded-lg border border-border/40 pointer-events-none",
        idx % 2 === 0 ? "bg-muted/25" : "bg-muted/10"
      )}
    />
  );
});
