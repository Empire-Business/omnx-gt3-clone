import { cn } from "@/lib/utils";
import React from "react";

interface EntityCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

/** Universal Entity Card following Design System V5.3.
 *  Anatomy: Header Slot + Body Slot + Footer Slot (separated by border-t border-subtle).
 *  Hover: translateY(-3px) + shadow + glow + border color (premium elevation v7.3). */
export function EntityCard({ children, className, onClick, active = true }: EntityCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-xl overflow-hidden entity-card-hover",
        onClick && "cursor-pointer",
        !active && "opacity-50",
        className
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
    >
      {children}
    </div>
  );
}

export function EntityCardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-4 pt-4 pb-2", className)}>
      {children}
    </div>
  );
}

export function EntityCardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-4 pb-3", className)}>
      {children}
    </div>
  );
}

export function EntityCardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-4 py-2.5 border-t border-border bg-muted/20", className)}>
      {children}
    </div>
  );
}
