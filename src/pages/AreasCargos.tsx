import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Briefcase, Layers, Crown, Users, ZoomIn, ZoomOut, Maximize2, Search } from "lucide-react";
import { useAreas, useSubareas, usePositions, useAllPositions, type PositionWithHierarchy } from "@/hooks/useAreas";
import { useEmployees } from "@/hooks/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { EmptyState, AvatarBadge } from "@/components/shared/SharedComponents";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListSkeleton } from "@/components/shared/SmartSkeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PositionDetailModal } from "@/components/shared/PositionDetailModal";
import type { Tables } from "@/integrations/supabase/types";

type Area = Tables<"company_areas">;
type Subarea = Tables<"subareas">;
type Position = Tables<"positions">;

const AREA_TYPE_CONFIG: Record<string, { label: string; colorClass: string; dotClass: string }> = {
  acquisition: { label: "Aquisição", colorClass: "text-area-acquisition", dotClass: "bg-area-acquisition" },
  delivery: { label: "Entrega", colorClass: "text-area-delivery", dotClass: "bg-area-delivery" },
  operation: { label: "Operação", colorClass: "text-area-operation", dotClass: "bg-area-operation" },
};

const AREA_DEFAULTS: { type: string; position: string; name: string }[] = [
  { type: "acquisition", position: "left", name: "Aquisição" },
  { type: "delivery", position: "right", name: "Entrega" },
  { type: "operation", position: "bottom", name: "Operação" },
];

const DEFAULT_AREA_COLOR = "#7C3AED";

const AREA_PRESET_COLORS = [
  "#7C3AED", "#2563EB", "#0891B2", "#059669", "#CA8A04",
  "#EA580C", "#DC2626", "#DB2777", "#4F46E5", "#475569",
];

/** Visual resolvido de uma área: usa as classes semânticas para as 3 áreas
 * padrão (Aquisição/Entrega/Operação) e cor inline para departamentos custom. */
interface AreaVisual {
  label: string;
  colorClass: string;
  dotClass: string;
  /** Cor hex quando a área é um departamento custom (fora das 3 padrão). */
  color?: string;
}

function resolveAreaVisual(type: string, name?: string | null, color?: string | null): AreaVisual {
  const known = AREA_TYPE_CONFIG[type];
  if (known) return known;
  return { label: name || type, colorClass: "", dotClass: "", color: color || DEFAULT_AREA_COLOR };
}

/** Gera um `type` estável e único para uma área nova a partir do nome. */
function slugifyAreaType(name: string): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "area";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

/* ════════════════════════════════════════════
   AREA FORM DIALOG — criar / editar departamento
   ════════════════════════════════════════════ */

function AreaFormDialog({ open, onOpenChange, existing, nextSortOrder }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Area | null;
  nextSortOrder: number;
}) {
  const { createArea, updateArea } = useAreas();
  const [name, setName] = useState(existing?.name || "");
  const [color, setColor] = useState(existing?.color || DEFAULT_AREA_COLOR);
  const isKnown = existing ? !!AREA_TYPE_CONFIG[existing.type] : false;

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome é obrigatório"); return; }
    try {
      if (existing) {
        await updateArea.mutateAsync({ id: existing.id, name: name.trim(), color });
        toast.success("Área atualizada!");
      } else {
        await createArea.mutateAsync({
          name: name.trim(),
          color,
          type: slugifyAreaType(name),
          position: "custom",
          sort_order: nextSortOrder,
        });
        toast.success("Área criada! Um canal no chat foi criado automaticamente.");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar área");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) { setName(existing?.name || ""); setColor(existing?.color || DEFAULT_AREA_COLOR); }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-primary" />
            </span>
            {existing ? "Editar área" : "Nova área"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1">
          {/* Prévia ao vivo do card da área */}
          <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-3">
            <div
              className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", isKnown && "bg-muted")}
              style={isKnown ? undefined : { backgroundColor: `${color}26` }}
            >
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: isKnown ? "hsl(var(--primary))" : color }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={isKnown ? undefined : { color }}>
                {name.trim() || "Nome da área"}
              </p>
              <p className="text-xs text-muted-foreground">Prévia do card no organograma</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Financeiro" autoFocus />
          </div>

          {isKnown ? (
            <p className="text-xs text-muted-foreground">
              As áreas padrão (Aquisição, Entrega, Operação) usam a cor do tema.
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap items-center gap-2">
                {AREA_PRESET_COLORS.map((c) => {
                  const selected = color.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Cor ${c}`}
                      className={cn(
                        "w-7 h-7 rounded-full transition-transform ring-2 ring-offset-2 ring-offset-background",
                        selected ? "ring-foreground scale-110" : "ring-transparent hover:scale-105",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  );
                })}
                <label
                  className="relative w-7 h-7 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-foreground/40 transition-colors"
                  title="Cor personalizada"
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label="Cor personalizada"
                  />
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </label>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={createArea.isPending || updateArea.isPending}>
            {existing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AreasCargos() {
  const qc = useQueryClient();
  const { data: areas, isLoading: areasLoading, isFetching: areasFetching, createArea } = useAreas();
  const { data: allSubareas, isLoading: subareasLoading, isFetching: subareasFetching } = useSubareas();
  const { data: allPositions, isLoading: positionsLoading, isFetching: positionsFetching } = usePositions();
  const { data: employees, isLoading: employeesLoading, isFetching: employeesFetching } = useEmployees();
  const { canManageStructure } = usePermissions();

  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState("");
  const [showCeoDetail, setShowCeoDetail] = useState(false);
  const [areaFormOpen, setAreaFormOpen] = useState(false);
  const isLoading = areasLoading || subareasLoading || positionsLoading || employeesLoading;
  const isRefetchingWithoutData = (areasFetching && !areas) || (subareasFetching && !allSubareas) || (positionsFetching && !allPositions) || (employeesFetching && !employees);
  const showSkeleton = isLoading || isRefetchingWithoutData;
  const hasAreas = areas && areas.length > 0;

  const ceoPosition = useMemo(() => {
    return (allPositions || []).find(
      (p) => p.level === 0 || p.title.toLowerCase().includes("ceo") || p.title.toLowerCase().includes("diretor geral")
    );
  }, [allPositions]);

  const employeeCountByPosition = useMemo(() => {
    const map: Record<string, number> = {};
    for (const emp of employees || []) {
      if (emp.position_id) {
        map[emp.position_id] = (map[emp.position_id] || 0) + 1;
      }
    }
    return map;
  }, [employees]);

  const handleInitializeAreas = async () => {
    try {
      for (const defaults of AREA_DEFAULTS) {
        await createArea.mutateAsync({ name: defaults.name, type: defaults.type, position: defaults.position });
      }
      toast.success("Estrutura T inicializada com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao inicializar áreas");
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.4));
  const handleZoomReset = () => setZoom(1);

  if (showSkeleton) return <ListSkeleton />;

  if (!hasAreas) {
    return (
      <div className="flex flex-col gap-6 animate-fade-in">
        <h1 className="text-h1 font-bold text-foreground">Áreas e Cargos</h1>
        <EmptyState
          icon={<Building2 className="w-8 h-8 text-muted-foreground" />}
          title="Estrutura T não configurada"
          description={
            canManageStructure
              ? "Inicialize as 3 áreas padrão (Aquisição, Entrega, Operação) para começar."
              : "A estrutura organizacional ainda não foi configurada. Peça a um administrador para inicializá-la."
          }
          action={
            canManageStructure ? (
              <Button onClick={handleInitializeAreas} disabled={createArea.isPending}>
                <Plus className="w-4 h-4 mr-2" />
                {createArea.isPending ? "Criando..." : "Inicializar Estrutura T"}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const totalPositions = allPositions?.length || 0;
  const totalSubareas = allSubareas?.length || 0;

  const sortedAreas = [...(areas || [])].sort((a, b) => {
    const order = { acquisition: 0, delivery: 1, operation: 2 };
    return (order[a.type as keyof typeof order] ?? 9) - (order[b.type as keyof typeof order] ?? 9);
  });

  return (
    <div className="flex flex-col gap-4 animate-fade-in h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h1 font-bold text-foreground">Áreas e Cargos</h1>
          <p className="text-sm text-muted-foreground">
            {areas?.length || 0} área{(areas?.length || 0) !== 1 ? "s" : ""} · {totalSubareas} subárea{totalSubareas !== 1 ? "s" : ""} · {totalPositions} cargo{totalPositions !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageStructure && (
            <Button size="sm" onClick={() => setAreaFormOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Nova área
            </Button>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar área, subárea ou cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-[220px]"
            />
          </div>
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0" onClick={handleZoomOut} title="Zoom out">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center font-medium">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0" onClick={handleZoomIn} title="Zoom in">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0" onClick={handleZoomReset} title="Reset zoom">
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tree canvas */}
      <div className="bg-card rounded-2xl border border-border shadow-card overflow-auto flex-1 min-h-[500px]">
        <div
          className="p-8 min-w-fit transition-transform duration-200"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
        >
          {/* CEO Card — same visual pattern as PersonCard */}
          <div className="flex flex-col items-center">
            <div
              className="relative rounded-xl border border-border bg-card p-3 w-full max-w-[210px] select-none cursor-pointer entity-card-hover"
              onClick={() => setShowCeoDetail(true)}
            >
              <div className="flex items-start gap-2.5">
                <AvatarBadge name={ceoPosition?.title || "CEO"} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <Crown className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <h3 className="text-sm font-semibold text-foreground truncate leading-tight">
                      {ceoPosition?.title || "CEO"}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">Nível executivo</p>
                </div>
              </div>
              <Badge variant="secondary" className="absolute top-2 right-2 text-2xs px-1.5 py-0">CEO</Badge>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
                  <Building2 className="w-3 h-3" /> Executivo
                </span>
              </div>
            </div>
            {ceoPosition && (
              <PositionDetailModal position={ceoPosition} open={showCeoDetail} onOpenChange={setShowCeoDetail} areaName="Executivo" onUpdated={() => qc.invalidateQueries({ queryKey: ["positions"] })} />
            )}
          </div>

          {/* Vertical connector */}
          <div className="flex justify-center">
            <div className="w-px h-8 bg-border" />
          </div>

          {/* Area Cards */}
          <div className="flex flex-wrap justify-center gap-8">
            {sortedAreas.map((area) => {
              const config = resolveAreaVisual(area.type, area.name, area.color);
              const areaSubareas = allSubareas?.filter((s) => s.area_id === area.id) || [];
              const areaPositionCount = (allPositions || []).filter(p =>
                areaSubareas.some(s => s.id === p.subarea_id)
              ).length;

              return (
                <AreaCard
                  key={area.id}
                  area={area}
                  config={config}
                  subareas={areaSubareas}
                  positions={allPositions || []}
                  positionCount={areaPositionCount}
                  subareaCount={areaSubareas.length}
                  employeeCountByPosition={employeeCountByPosition}
                  search={search}
                />
              );
            })}
          </div>
        </div>
      </div>

      <AreaFormDialog
        open={areaFormOpen}
        onOpenChange={setAreaFormOpen}
        existing={null}
        nextSortOrder={areas?.length || 0}
      />
    </div>
  );
}

/* ════════════════════════════════════════════
   AREA CARD — PersonCard-style card for each area
   ════════════════════════════════════════════ */

function AreaCard({
  area,
  config,
  subareas,
  positions,
  positionCount,
  subareaCount,
  employeeCountByPosition,
  search,
}: {
  area: Area;
  config: AreaVisual;
  subareas: Subarea[];
  positions: Position[];
  positionCount: number;
  subareaCount: number;
  employeeCountByPosition: Record<string, number>;
  search: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showDirectorDialog, setShowDirectorDialog] = useState(false);
  const [showAreaEdit, setShowAreaEdit] = useState(false);
  const [showAreaDelete, setShowAreaDelete] = useState(false);
  const { deleteArea } = useAreas();
  const { canManageStructure } = usePermissions();

  const custom = !!config.color;
  const wrapStyle = custom ? { backgroundColor: `${config.color}26` } : undefined;
  const dotStyle = custom ? { backgroundColor: config.color } : undefined;
  const titleStyle = custom ? { color: config.color } : undefined;

  const handleDeleteArea = async () => {
    try {
      await deleteArea.mutateAsync(area.id);
      toast.success("Área removida!");
    } catch (err: any) { toast.error(err.message || "Erro ao remover área"); }
  };

  const areaPositions = positions.filter(p => p.area_id === area.id);
  const searchLower = search.toLowerCase();
  const hasSearchMatch = searchLower && (
    area.name.toLowerCase().includes(searchLower) ||
    areaPositions.some(p => p.title.toLowerCase().includes(searchLower)) ||
    subareas.some(s => s.name.toLowerCase().includes(searchLower)) ||
    positions.filter(p => subareas.some(s => s.id === p.subarea_id)).some(p => p.title.toLowerCase().includes(searchLower))
  );

  const isExpanded = expanded || !!hasSearchMatch;
  const hasChildren = subareas.length > 0 || areaPositions.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Area card — PersonCard visual pattern */}
      <div
        className="relative rounded-xl border border-border bg-card p-3 w-full max-w-[210px] select-none cursor-pointer entity-card-hover group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2.5">
          <div
            className={cn("w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0", !custom && config.dotClass + "/15")}
            style={wrapStyle}
          >
            <div className={cn("w-4 h-4 rounded-full", !custom && config.dotClass)} style={dotStyle} />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className={cn("text-sm font-semibold truncate leading-tight", custom ? "text-foreground" : config.colorClass)}
              style={titleStyle}
            >
              {area.name}
            </h3>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {subareaCount} subárea{subareaCount !== 1 ? "s" : ""} · {positionCount} cargo{positionCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Footer — matches PersonCard separator pattern */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <Layers className="w-3 h-3" /> {subareaCount}
          </span>
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <Briefcase className="w-3 h-3" /> {positionCount}
          </span>
          {canManageStructure && (
            <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowDirectorDialog(true)} title="Adicionar Diretor">
                <Plus className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowAreaEdit(true)} title="Editar área">
                <Pencil className="w-3 h-3" />
              </Button>
              {custom && (
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive hover:text-destructive" onClick={() => setShowAreaDelete(true)} title="Remover área">
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Collapse/expand button — same as PersonCard */}
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors z-10 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:w-6 md:h-6"
            title={isExpanded ? "Recolher" : "Expandir"}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}
      </div>

      {/* Expanded: area positions (Directors) and subareas */}
      {isExpanded && (
        <>
          <div className="w-px h-8 bg-border" />

          {/* Area-level positions (Directors) */}
          {areaPositions.length > 0 && (
            <div className="flex flex-col items-center gap-2 mb-6">
              {areaPositions.map((pos, i) => (
                <div key={pos.id} className="flex flex-col items-center">
                  {i > 0 && <div className="w-px h-2 bg-border" />}
                  <PositionLeaf
                    position={pos}
                    areaType={area.type}
                    areaColor={config.color}
                    employeeCount={employeeCountByPosition[pos.id] || 0}
                    subareaName="Diretoria"
                    areaName={area.name}
                  />
                </div>
              ))}
              <div className="w-px h-8 bg-border" />
            </div>
          )}

          {subareas.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-6">
              {subareas
                .filter(sub => {
                  if (!searchLower) return true;
                  if (sub.name.toLowerCase().includes(searchLower)) return true;
                  return positions.filter(p => p.subarea_id === sub.id).some(p => p.title.toLowerCase().includes(searchLower));
                })
                .map((sub) => (
                  <div key={sub.id} className="flex flex-col items-center">
                    <SubareaNode
                      subarea={sub}
                      positions={positions.filter((p) => p.subarea_id === sub.id)}
                      areaType={area.type}
                      areaColor={config.color}
                      areaName={area.name}
                      employeeCountByPosition={employeeCountByPosition}
                      search={search}
                    />
                  </div>
                ))
              }
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">Nenhuma subárea</p>
          )}

          {canManageStructure && <AddSubareaButton areaId={area.id} areaType={area.type} />}
        </>
      )}
      <PositionFormDialog open={showDirectorDialog} onOpenChange={setShowDirectorDialog} areaId={area.id} />
      <AreaFormDialog open={showAreaEdit} onOpenChange={setShowAreaEdit} existing={area} nextSortOrder={0} />

      <AlertDialog open={showAreaDelete} onOpenChange={setShowAreaDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover área?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá "{area.name}" e todas as subáreas e cargos associados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteArea} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


/* ════════════════════════════════════════════
   SUBAREA NODE — PersonCard-style card for each subarea
   ════════════════════════════════════════════ */

function SubareaNode({
  subarea,
  positions,
  areaType,
  areaColor,
  areaName,
  employeeCountByPosition,
  search,
}: {
  subarea: Subarea;
  positions: Position[];
  areaType: string;
  areaColor?: string;
  areaName?: string;
  employeeCountByPosition: Record<string, number>;
  search: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [editingSubarea, setEditingSubarea] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const { deleteSubarea } = useSubareas();
  const { canManageStructure } = usePermissions();
  const config = resolveAreaVisual(areaType, areaName, areaColor);
  const custom = !!config.color;
  const iconStyle = custom ? { color: config.color } : undefined;
  const dotStyle = custom ? { backgroundColor: config.color } : undefined;

  const handleDelete = async () => {
    try {
      await deleteSubarea.mutateAsync(subarea.id);
      toast.success("Subárea removida!");
    } catch (err: any) { toast.error(err.message || "Erro ao remover subárea"); }
  };

  const searchLower = search.toLowerCase();
  const hasSearchMatch = searchLower && (
    subarea.name.toLowerCase().includes(searchLower) ||
    positions.some(p => p.title.toLowerCase().includes(searchLower))
  );
  const isExpanded = expanded || !!hasSearchMatch;
  const hasChildren = positions.length > 0;

  const filteredPositions = positions.filter((p) => {
    if (!searchLower) return true;
    return p.title.toLowerCase().includes(searchLower) || subarea.name.toLowerCase().includes(searchLower);
  });

  return (
    <div className="flex flex-col items-center">
      {/* Subarea card — PersonCard visual pattern */}
      <div
        className="relative rounded-xl border border-border bg-card p-3 w-full max-w-[210px] select-none cursor-pointer entity-card-hover group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <Layers className={cn("w-4 h-4", !custom && config.colorClass)} style={iconStyle} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate leading-tight">
              {subarea.name}
            </h3>
            <div className="flex items-center gap-1 mt-0.5">
              <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", !custom && config.dotClass)} style={dotStyle} />
              <span className="text-xs text-muted-foreground truncate">{config.label}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <Briefcase className="w-3 h-3" /> {positions.length} cargo{positions.length !== 1 ? "s" : ""}
          </span>
          {/* Action buttons on hover */}
          {canManageStructure && (
            <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0" onClick={() => setShowPositionDialog(true)} title="Adicionar cargo">
                <Plus className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0" onClick={() => setEditingSubarea(true)} title="Editar subárea">
                <Pencil className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(true)} title="Remover subárea">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Collapse/expand */}
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors z-10 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:w-6 md:h-6"
            title={isExpanded ? "Recolher" : "Expandir"}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}
      </div>

      {/* Position leaves */}
      {isExpanded && filteredPositions.length > 0 && (
        <>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-center gap-2">
            {filteredPositions.map((pos, i) => (
              <div key={pos.id} className="flex flex-col items-center">
                {i > 0 && <div className="w-px h-2 bg-border" />}
                <PositionLeaf
                  position={pos}
                  areaType={areaType}
                  areaColor={config.color}
                  employeeCount={employeeCountByPosition[pos.id] || 0}
                  subareaName={subarea.name}
                  areaName={config.label}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <SubareaFormDialog open={editingSubarea} onOpenChange={setEditingSubarea} areaId={subarea.area_id} areaType={areaType} existing={subarea} />
      <PositionFormDialog open={showPositionDialog} onOpenChange={setShowPositionDialog} subareaId={subarea.id} />

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover subárea?</AlertDialogTitle>
            <AlertDialogDescription>Isso removerá "{subarea.name}" e todos os cargos associados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ════════════════════════════════════════════
   POSITION LEAF — PersonCard-style card for each position
   ════════════════════════════════════════════ */

function PositionLeaf({ position, areaType, areaColor, employeeCount, subareaName, areaName }: { position: Position; areaType: string; areaColor?: string; employeeCount: number; subareaName: string; areaName: string }) {
  const posQc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const { deletePosition } = usePositions();
  const { canManageStructure } = usePermissions();
  const config = resolveAreaVisual(areaType, areaName, areaColor);
  const custom = !!config.color;
  const dotStyle = custom ? { backgroundColor: config.color } : undefined;

  const handleDelete = async () => {
    try {
      await deletePosition.mutateAsync(position.id);
      toast.success("Cargo removido!");
    } catch (err: any) { toast.error(err.message || "Erro ao remover cargo"); }
  };

  return (
    <>
      <div
        className="relative rounded-xl border border-border bg-card p-3 w-full max-w-[210px] select-none cursor-pointer entity-card-hover group"
        onClick={() => setShowDetail(true)}
      >
        <div className="flex items-start gap-2.5">
          <AvatarBadge name={position.title} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate leading-tight">
              {position.title}
            </h3>
            <div className="flex items-center gap-1 mt-0.5">
              <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", !custom && config.dotClass)} style={dotStyle} />
              <span className="text-xs text-muted-foreground truncate">
                {areaName} {subareaName !== "Diretoria" ? `› ${subareaName}` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          {position.level && (
            <Badge variant="secondary" className="text-2xs px-1.5 py-0">N{position.level}</Badge>
          )}
          {employeeCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
              <Users className="w-3 h-3" /> {employeeCount}
            </span>
          )}
          {/* Edit/delete on hover */}
          {canManageStructure && (
            <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0" onClick={() => setEditing(true)}><Pencil className="w-2.5 h-2.5" /></Button>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(true)}><Trash2 className="w-2.5 h-2.5" /></Button>
            </div>
          )}
        </div>
      </div>

      <PositionDetailModal position={position} open={showDetail} onOpenChange={setShowDetail} subareaName={subareaName} areaName={areaName} onUpdated={() => posQc.invalidateQueries({ queryKey: ["positions"] })} />
      <PositionFormDialog open={editing} onOpenChange={setEditing} subareaId={position.subarea_id ?? undefined} areaId={position.area_id ?? undefined} existing={position} />

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cargo?</AlertDialogTitle>
            <AlertDialogDescription>Isso removerá o cargo "{position.title}".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ════════════════════════════════════════════
   ADD SUBAREA BUTTON
   ════════════════════════════════════════════ */

function AddSubareaButton({ areaId, areaType }: { areaId: string; areaType: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-3 h-3 mr-1" /> Subárea
      </Button>
      <SubareaFormDialog open={open} onOpenChange={setOpen} areaId={areaId} areaType={areaType} />
    </>
  );
}

/* ════════════════════════════════════════════
   FORM DIALOGS
   ════════════════════════════════════════════ */

function SubareaFormDialog({ open, onOpenChange, areaId, areaType, existing }: {
  open: boolean; onOpenChange: (v: boolean) => void; areaId: string; areaType: string; existing?: Subarea;
}) {
  const { createSubarea, updateSubarea } = useSubareas();
  const [name, setName] = useState(existing?.name || "");

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome é obrigatório"); return; }
    try {
      if (existing) {
        await updateSubarea.mutateAsync({ id: existing.id, name: name.trim() });
        toast.success("Subárea atualizada!");
      } else {
        await createSubarea.mutateAsync({ name: name.trim(), area_id: areaId });
        toast.success("Subárea criada!");
      }
      setName("");
      onOpenChange(false);
    } catch (err: any) { toast.error(err.message || "Erro"); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setName(existing?.name || ""); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? "Editar Subárea" : "Nova Subárea"}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Marketing Digital" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>{existing ? "Salvar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PositionFormDialog({ open, onOpenChange, subareaId, areaId, existing }: {
  open: boolean; onOpenChange: (v: boolean) => void; subareaId?: string; areaId?: string; existing?: Position;
}) {
  const { createPosition, updatePosition } = usePositions();
  const { data: allPositionsList } = useAllPositions();
  const [title, setTitle] = useState(existing?.title || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [level, setLevel] = useState<number>(existing?.level || 3);
  const [reportsToId, setReportsToId] = useState<string | null>((existing as any)?.reports_to_id || null);

  // Get descendant IDs to exclude from the selector (prevent cycles)
  const getDescendantIds = useCallback((positionId: string): Set<string> => {
    const descendants = new Set<string>();
    const queue = [positionId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      // Find all positions that report to current
      for (const pos of allPositionsList || []) {
        if (pos.reports_to_id === currentId && !descendants.has(pos.id)) {
          descendants.add(pos.id);
          queue.push(pos.id);
        }
      }
    }

    return descendants;
  }, [allPositionsList]);

  // Positions that can be selected (exclude self and descendants)
  const selectablePositions = useMemo(() => {
    if (!allPositionsList) return [];

    const excludeIds = existing ? getDescendantIds(existing.id) : new Set<string>();
    if (existing) excludeIds.add(existing.id);

    return allPositionsList.filter(pos => !excludeIds.has(pos.id));
  }, [allPositionsList, existing, getDescendantIds]);

  // Sort positions by level for display
  const sortedPositions = useMemo(() => {
    return [...selectablePositions].sort((a, b) => {
      const levelA = a.level ?? 99;
      const levelB = b.level ?? 99;
      if (levelA !== levelB) return levelA - levelB;
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [selectablePositions]);

  // Group by level for better visualization
  const positionsByLevel = useMemo(() => {
    const groups: Record<number, typeof sortedPositions> = {};
    for (const pos of sortedPositions) {
      const lvl = pos.level ?? 99;
      if (!groups[lvl]) groups[lvl] = [];
      groups[lvl].push(pos);
    }
    return groups;
  }, [sortedPositions]);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Título é obrigatório"); return; }
    try {
      const payload = {
        title: title.trim(),
        subarea_id: subareaId || null,
        area_id: areaId || null,
        description: description.trim() || null,
        level,
        reports_to_id: reportsToId || null,
      };

      if (existing) {
        await updatePosition.mutateAsync({ id: existing.id, ...payload });
        toast.success("Cargo atualizado!");
      } else {
        await createPosition.mutateAsync(payload);
        toast.success("Cargo criado!");
      }
      setTitle(""); setDescription(""); setLevel(3); setReportsToId(null);
      onOpenChange(false);
    } catch (err: any) { toast.error(err.message || "Erro"); }
  };

  // Reset form state when dialog opens/closes
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setTitle(existing?.title || "");
      setDescription(existing?.description || "");
      setLevel(existing?.level || 3);
      setReportsToId((existing as any)?.reports_to_id || null);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Editar Cargo" : "Novo Cargo"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Analista de Marketing" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Responsabilidades..." rows={3} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Nível (1 = mais sênior)</Label>
              <Input type="number" min={1} max={10} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
            </div>
            <div>
              <Label>Reporta para</Label>
              <Select value={reportsToId || "none"} onValueChange={(v) => setReportsToId(v === "none" ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Ninguém (cargo topo)</span>
                  </SelectItem>
                  {Object.entries(positionsByLevel).map(([lvl, positions]) => (
                    <div key={lvl}>
                      {positions.map((pos) => (
                        <SelectItem key={pos.id} value={pos.id}>
                          <span className="flex items-center gap-2">
                            {pos.title}
                            <span className="text-xs text-muted-foreground">N{pos.level ?? "-"}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>{existing ? "Salvar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
