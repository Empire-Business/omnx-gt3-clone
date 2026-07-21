import React from "react";
import { cn } from "@/lib/utils";
import { normalizeSupabaseAssetUrl } from "@/integrations/supabase/config";

/* ════════════════════════════════════════════
   STATUS UTILITIES
   Mapeamento centralizado de status → cor/label
   ════════════════════════════════════════════ */

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  // Project status (DB enum)
  planning: { color: "muted", label: "Planejado" },
  active: { color: "info", label: "Ativo" },
  on_hold: { color: "warning", label: "Em Espera" },
  completed: { color: "success", label: "Concluído" },
  cancelled: { color: "danger", label: "Cancelado" },

  // Task status (DB enum)
  backlog: { color: "muted", label: "Backlog" },
  todo: { color: "info", label: "A Fazer" },
  doing: { color: "warning", label: "Em Andamento" },
  review: { color: "primary", label: "Em Revisão" },
  done: { color: "success", label: "Concluído" },

  // Task priority (DB enum)
  low: { color: "success", label: "Baixa" },
  medium: { color: "info", label: "Média" },
  high: { color: "warning", label: "Alta" },
  urgent: { color: "danger", label: "Urgente" },

  // Employee status (DB enum)
  inactive: { color: "muted", label: "Inativo" },
  on_leave: { color: "warning", label: "Afastado" },

  // Process status (DB enum)
  draft: { color: "muted", label: "Rascunho" },
  archived: { color: "muted", label: "Arquivado" },
};

export function getStatusColor(status: string): string {
  return STATUS_CONFIG[status]?.color || "muted";
}

export function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label || status;
}

/* ════════════════════════════════════════════
   STATUS BADGE
   ════════════════════════════════════════════ */

const colorMap: Record<string, string> = {
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  danger: "bg-danger-light text-danger",
  info: "bg-info-light text-info",
  primary: "bg-primary-light text-primary",
  muted: "bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, className, size = "md" }: StatusBadgeProps) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-2xs" : "px-2.5 py-0.5 text-xs",
        colorMap[color] || colorMap.muted,
        className
      )}
    >
      {label}
    </span>
  );
}

/* ════════════════════════════════════════════
   PROGRESS BAR
   ════════════════════════════════════════════ */

interface ProgressBarProps {
  value: number;
  className?: string;
  colorClass?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function ProgressBar({ value, className, colorClass, showLabel = false, size = "md" }: ProgressBarProps) {
  const getColor = () => {
    if (colorClass) return colorClass;
    if (value >= 70) return "bg-success";
    if (value >= 40) return "bg-warning";
    return "bg-danger";
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("flex-1 rounded-full bg-muted overflow-hidden", size === "sm" ? "h-1.5" : "h-2")}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", getColor())}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-muted-foreground w-8 text-right">{value}%</span>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   AVATAR BADGE
   ════════════════════════════════════════════ */

interface AvatarBadgeProps {
  name: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function AvatarBadge({ name, avatarUrl, size = "md", className }: AvatarBadgeProps) {
  const sizeMap = {
    xs: "w-6 h-6 text-2xs",
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-lg",
  };
  // Pixels reais (para servir 2x via transformação de imagem do Supabase)
  const pxMap = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64 };

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const normalizedAvatarUrl = normalizeSupabaseAssetUrl(avatarUrl);
  // Se a imagem falhar (URL quebrada / host errado / 404), cai para as iniciais
  // em vez de exibir o ícone de imagem quebrada do navegador.
  const [imgFailed, setImgFailed] = React.useState(false);
  React.useEffect(() => { setImgFailed(false); }, [normalizedAvatarUrl]);

  if (normalizedAvatarUrl && !imgFailed) {
    const px = pxMap[size];
    // Usa Supabase Image Transformation se URL for de storage; pede 2x do tamanho exibido
    const supaRender = normalizedAvatarUrl.replace(
      "/storage/v1/object/",
      "/storage/v1/render/image/",
    );
    const finalSrc =
      supaRender !== normalizedAvatarUrl
        ? `${supaRender}${supaRender.includes("?") ? "&" : "?"}width=${px * 2}&height=${px * 2}&resize=cover&quality=85`
        : normalizedAvatarUrl;
    return (
      <img
        src={finalSrc}
        alt={name}
        width={px}
        height={px}
        loading="eager"
        decoding="async"
        onError={() => setImgFailed(true)}
        className={cn("rounded-full object-cover flex-shrink-0", sizeMap[size], className)}
        style={{ imageRendering: "auto" }}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold bg-primary text-primary-foreground flex-shrink-0",
        sizeMap[size],
        className
      )}
      title={name}
    >
      {initials}
    </div>
  );
}

/* ════════════════════════════════════════════
   KPI CARD
   ════════════════════════════════════════════ */

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  iconBg?: string;
}

export function KpiCard({ title, value, icon, trend, iconBg = "bg-primary-light" }: KpiCardProps) {
  return (
    <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 flex items-start justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground font-medium">{title}</span>
        <span className="text-3xl font-bold text-foreground">{value}</span>
        {trend && (
          <span className={cn("text-xs font-medium flex items-center gap-1", trend.positive ? "text-success" : "text-danger")}>
            {trend.positive ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>
      <div className={cn("p-3 rounded-xl", iconBg)}>{icon}</div>
    </div>
  );
}

/* ════════════════════════════════════════════
   EMPTY STATE
   Componente reutilizável para páginas sem dados
   ════════════════════════════════════════════ */

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      {action}
    </div>
  );
}
