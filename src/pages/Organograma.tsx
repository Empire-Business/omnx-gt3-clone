import { useState, useMemo, useCallback } from "react";
import {
  Network, Search, ZoomIn, ZoomOut, Maximize2,
  Briefcase, CheckSquare, ChevronDown, ChevronRight,
  Crown,
} from "lucide-react";
import { useEmployees, type EmployeeWithDetails } from "@/hooks/useEmployees";
import { usePositionHierarchy, type PositionHierarchyNode } from "@/hooks/useAreas";
import { EmptyState, AvatarBadge, StatusBadge } from "@/components/shared/SharedComponents";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrgSkeleton } from "@/components/shared/SmartSkeleton";
import { EmployeeDetailModal } from "@/components/shared/EmployeeDetailModal";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════
   TYPES - People-based org chart
   ════════════════════════════════════════════ */

interface OrgNode {
  position: PositionHierarchyNode;
  employee: EmployeeWithDetails;
  children: OrgNode[];
}

/* ════════════════════════════════════════════
   TREE BUILDER - People only, hierarchy by positions
   ════════════════════════════════════════════ */

function buildPeopleOrgChart(
  positionTree: PositionHierarchyNode[],
  employees: EmployeeWithDetails[]
): OrgNode[] {
  // Map position_id -> employees[] (handles multiple people per position)
  const positionToEmployees = new Map<string, EmployeeWithDetails[]>();
  for (const emp of employees) {
    if (emp.position_id) {
      const list = positionToEmployees.get(emp.position_id) || [];
      list.push(emp);
      positionToEmployees.set(emp.position_id, list);
    }
  }

  // Recursively process position nodes.
  // Returns OrgNodes with employees only — vacant positions are skipped
  // and their children bubble up to the nearest occupied ancestor.
  const processNode = (posNode: PositionHierarchyNode): OrgNode[] => {
    const emps = positionToEmployees.get(posNode.id) || [];
    const childNodes = posNode.children.flatMap(processNode);

    if (emps.length === 0) {
      // No employee here — pass children up
      return childNodes;
    }

    // One node per employee; first employee carries the children
    return emps.map((emp, i) => ({
      position: posNode,
      employee: emp,
      children: i === 0 ? childNodes : [],
    }));
  };

  const roots = positionTree.flatMap(processNode);

  // Sort roots by area type then employee name
  const areaOrder = ["acquisition", "delivery", "operation"];
  roots.sort((a, b) => {
    const aIdx = areaOrder.indexOf((a.position as any).area_type || "");
    const bIdx = areaOrder.indexOf((b.position as any).area_type || "");
    const ai = aIdx < 0 ? 99 : aIdx;
    const bi = bIdx < 0 ? 99 : bIdx;
    if (ai !== bi) return ai - bi;
    return (a.employee.full_name || "").localeCompare(b.employee.full_name || "");
  });

  const sortChildren = (nodes: OrgNode[]) => {
    nodes.sort((a, b) =>
      (a.employee.full_name || "").localeCompare(b.employee.full_name || "")
    );
    nodes.forEach(n => sortChildren(n.children));
  };
  roots.forEach(r => sortChildren(r.children));

  return roots;
}

/* ════════════════════════════════════════════
   AREA COLOR UTILS
   ════════════════════════════════════════════ */

const AREA_STYLES: Record<string, { dot: string; label: string }> = {
  acquisition: { dot: "bg-area-acquisition", label: "Aquisição" },
  delivery: { dot: "bg-area-delivery", label: "Entrega" },
  operation: { dot: "bg-area-operation", label: "Operação" },
};

const AREA_LABEL_COLORS: Record<string, string> = {
  acquisition: "text-area-acquisition",
  delivery: "text-area-delivery",
  operation: "text-area-operation",
};

/* ════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════ */

export default function Organograma() {
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: positionHierarchy, isLoading: hierarchyLoading } = usePositionHierarchy();
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithDetails | null>(null);

  const isLoading = employeesLoading || hierarchyLoading;

  const tree = useMemo<OrgNode[]>(() => {
    if (!positionHierarchy?.tree || !employees) return [];
return buildPeopleOrgChart(positionHierarchy.tree, employees);
  }, [positionHierarchy, employees]);

  const searchLower = search.toLowerCase();

  const matchesSearch = useCallback(
    (node: OrgNode) => {
      if (!searchLower) return true;
      const { employee, position } = node;
      return !!(
        employee.full_name?.toLowerCase().includes(searchLower) ||
        position.title?.toLowerCase().includes(searchLower) ||
        (position as any).area_name?.toLowerCase().includes(searchLower) ||
        employee.position_title?.toLowerCase().includes(searchLower)
      );
    },
    [searchLower]
  );

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.4));
  const handleZoomReset = () => setZoom(1);

  const selectedManager = useMemo(() => {
    if (!selectedEmployee || !employees) return null;
    // Find manager based on position hierarchy
    const empPositionId = selectedEmployee.position_id;
    if (!empPositionId || !positionHierarchy?.map) return null;

    const position = positionHierarchy.map.get(empPositionId);
    if (!position?.reports_to_id) return null;

    // Find employee in the parent position
    const managerPosition = positionHierarchy.map.get(position.reports_to_id);
    if (!managerPosition) return null;

    // Find the employee in the parent position
    return employees.find(e => e.position_id === position.reports_to_id) || null;
  }, [selectedEmployee, employees, positionHierarchy]);

  const directReports = useMemo(() => {
    if (!selectedEmployee || !employees || !positionHierarchy?.map) return [];

    // Find all positions that report to the selected employee's position
    const empPositionId = selectedEmployee.position_id;
    if (!empPositionId) return [];

    const directReportPositionIds = new Set<string>();
    for (const [id, pos] of positionHierarchy.map) {
      if (pos.reports_to_id === empPositionId) {
        directReportPositionIds.add(id);
      }
    }

    // Find employees in those positions
    return employees.filter(e =>
      e.position_id && directReportPositionIds.has(e.position_id)
    );
  }, [selectedEmployee, employees, positionHierarchy]);

  if (isLoading) {
    return <OrgSkeleton />;
  }

  const hasContent = tree.length > 0;

  return (
    <div className="flex flex-col gap-4 animate-fade-in h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-h1 font-bold text-foreground">Organograma</h1>

        <div className="flex items-center gap-2">
          {hasContent && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar pessoa ou cargo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-[220px]"
              />
            </div>
          )}
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 md:h-7 md:w-7 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0" onClick={handleZoomOut} title="Zoom out">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center font-medium">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 md:h-7 md:w-7 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0" onClick={handleZoomIn} title="Zoom in">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 md:h-7 md:w-7 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0" onClick={handleZoomReset} title="Reset zoom">
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Org chart canvas */}
      {!hasContent ? (
        <div className="bg-card rounded-2xl border border-border shadow-card min-h-[500px] flex items-center justify-center">
          <EmptyState
            icon={<Network className="w-8 h-8 text-muted-foreground" />}
            title="Organograma vazio"
            description="O organograma será gerado automaticamente quando cargos forem cadastrados com hierarquia definida."
          />
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border shadow-card overflow-auto flex-1 min-h-[500px]">
          <div
            className="p-8 min-w-fit transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
          >
            {/* People arranged by position hierarchy */}
            <div className="flex flex-wrap justify-center gap-8 px-4 py-6">
              {tree.map((node) => {
                const areaType = (node.position as any).area_type || "";
                const areaLabel = AREA_STYLES[areaType]?.label;
                const areaLabelColor = AREA_LABEL_COLORS[areaType] || "text-muted-foreground";
                const areaDot = AREA_STYLES[areaType]?.dot || "bg-muted-foreground";

                return (
                  <div key={`${node.position.id}-${node.employee.id}`} className="flex flex-col items-center">
                    {areaLabel && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className={cn("w-3 h-3 rounded-full", areaDot)} />
                        <span className={cn("text-sm font-semibold", areaLabelColor)}>{areaLabel}</span>
                      </div>
                    )}
                    <OrgBranch
                      node={node}
                      collapsed={collapsed}
                      toggleCollapse={toggleCollapse}
                      matchesSearch={matchesSearch}
                      searchActive={!!searchLower}
                      onSelect={setSelectedEmployee}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <EmployeeDetailModal
        employee={selectedEmployee}
        manager={selectedManager}
        directReports={directReports}
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        onSelectEmployee={setSelectedEmployee}
        allEmployees={employees}
      />
    </div>
  );
}

/* ════════════════════════════════════════════
   ORG BRANCH (recursive tree)
   ════════════════════════════════════════════ */

interface OrgBranchProps {
  node: OrgNode;
  isRoot?: boolean;
  isCeo?: boolean;
  isDirector?: boolean;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  matchesSearch: (node: OrgNode) => boolean;
  searchActive: boolean;
  onSelect: (emp: EmployeeWithDetails | null) => void;
}

function OrgBranch({
  node,
  isRoot,
  isCeo: propIsCeo,
  isDirector,
  collapsed,
  toggleCollapse,
  matchesSearch,
  searchActive,
  onSelect,
}: OrgBranchProps) {
  const { position, employee, children } = node;
  const isCeo = propIsCeo || position.level === 0;
  const isCollapsed = collapsed.has(position.id);
  const hasChildren = children.length > 0;
  const dimmed = searchActive && !matchesSearch(node);

  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard
        node={node}
        hasChildren={hasChildren}
        isCollapsed={isCollapsed}
        onToggle={() => toggleCollapse(position.id)}
        onClick={() => onSelect(employee)}
        dimmed={dimmed}
        isRoot={isRoot}
        isCeo={isCeo}
        isDirector={isDirector}
      />

      {hasChildren && !isCollapsed && (
        <>
          <div className="w-px h-8 bg-border" />
          {children.length === 1 ? (
            <OrgBranch
              node={children[0]}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
              matchesSearch={matchesSearch}
              searchActive={searchActive}
              onSelect={onSelect}
            />
          ) : (
            <div className="flex flex-col items-center">
              <div className="flex">
                {children.map((child, i) => (
                  <div
                    key={`${child.position.id}-${child.employee.id}`}
                    className="flex flex-col items-center"
                    style={{ minWidth: 220 }}
                  >
                    <div className="flex w-full">
                      <div className={cn("h-px flex-1", i === 0 ? "bg-transparent" : "bg-border")} />
                      <div className={cn("h-px flex-1", i === children.length - 1 ? "bg-transparent" : "bg-border")} />
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <OrgBranch
                      node={child}
                      collapsed={collapsed}
                      toggleCollapse={toggleCollapse}
                      matchesSearch={matchesSearch}
                      searchActive={searchActive}
                      onSelect={onSelect}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   ORG NODE CARD — Unified for occupied and vacant positions
   ════════════════════════════════════════════ */

interface OrgNodeCardProps {
  node: OrgNode;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onClick: () => void;
  dimmed?: boolean;
  isRoot?: boolean;
  isCeo?: boolean;
  isDirector?: boolean;
}

function OrgNodeCard({ node, hasChildren, isCollapsed, onToggle, onClick, dimmed, isRoot, isCeo, isDirector }: OrgNodeCardProps) {
  const { position, employee } = node;
  const areaStyle = AREA_STYLES[(position as any).area_type || ""] || { dot: "bg-muted-foreground" };
  const displayTitle = position.title || (isCeo ? "CEO" : isDirector ? "Diretor" : null);
  const isActive = employee.status === "active";
  const empIsCeo = isCeo;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-xl border border-border bg-card p-3 w-[210px] select-none cursor-pointer entity-card-hover",
        dimmed && "opacity-30",
        !isActive && "opacity-50"
      )}
    >
      <div className="flex items-start gap-2.5">
        <AvatarBadge
          name={employee.full_name || "?"}
          avatarUrl={employee.avatar_url}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {empIsCeo && <Crown className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
            <h3 className="text-sm font-semibold text-foreground truncate leading-tight">
              {employee.full_name || "Sem nome"}
            </h3>
          </div>
          {displayTitle && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{displayTitle}</p>
          )}
          {employee.area_name && (
            <div className="flex items-center gap-1 mt-1">
              <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", areaStyle.dot)} />
              <span className="text-2xs text-muted-foreground truncate">
                {employee.area_name}
                {employee.subarea_name && employee.subarea_name !== "Diretoria" ? ` › ${employee.subarea_name}` : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Role badge for CEO */}
      {empIsCeo && (
        <Badge variant="secondary" className="absolute top-2 right-2 text-2xs px-1.5 py-0">CEO</Badge>
      )}

      {/* Status badges */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
        <StatusBadge status={employee.status || "active"} size="sm" />
        {(employee.active_projects ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <Briefcase className="w-3 h-3" /> {employee.active_projects}
          </span>
        )}
        {(employee.pending_tasks ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <CheckSquare className="w-3 h-3" /> {employee.pending_tasks}
          </span>
        )}
      </div>

      {/* Collapse/expand button */}
      {hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors z-10 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:w-6 md:h-6"
          title={isCollapsed ? "Expandir" : "Recolher"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      )}
    </div>
  );
}
