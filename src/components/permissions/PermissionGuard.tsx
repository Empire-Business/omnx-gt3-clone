import React from "react";
import { usePermissions } from "@/hooks/usePermissions";

interface PermissionGuardProps {
  /** Show children only if user has one of these roles */
  allow?: Array<"admin" | "manager" | "member">;
  /** Show children only if this permission flag is true */
  can?: "canManageStructure" | "canManageProjects" | "canManageProcesses";
  /** What to show when access is denied (defaults to nothing) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally renders children based on user permissions.
 *
 * Usage:
 *   <PermissionGuard allow={["admin"]}>
 *     <Button>Delete</Button>
 *   </PermissionGuard>
 *
 *   <PermissionGuard can="canManageProjects">
 *     <ProjectForm />
 *   </PermissionGuard>
 */
export function PermissionGuard({ allow, can, fallback = null, children }: PermissionGuardProps) {
  const permissions = usePermissions();

  if (permissions.loading) return null;

  if (allow) {
    const hasRole = permissions.role && allow.includes(permissions.role);
    if (!hasRole) return <>{fallback}</>;
  }

  if (can) {
    if (!permissions[can]) return <>{fallback}</>;
  }

  return <>{children}</>;
}
