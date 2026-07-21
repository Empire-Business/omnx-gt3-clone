import { useState, useMemo } from "react";
import { Building2, Users, Briefcase, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PermissionGuard } from "@/components/permissions/PermissionGuard";
import { usePositions, useAreas, useSubareas } from "@/hooks/useAreas";
import { toast } from "sonner";
import type { UseMutationResult } from "@tanstack/react-query";

interface Props {
  process: any;
  canManageProcesses: boolean;
  linkPosition: UseMutationResult<any, any, { processId: string; positionId: string; isPrimary?: boolean }>;
  unlinkPosition: UseMutationResult<any, any, { processId: string; positionId: string }>;
}

export function ProcessResponsaveisTab({ process, canManageProcesses, linkPosition, unlinkPosition }: Props) {
  const { data: allPositions } = usePositions(undefined, undefined);
  const { data: allAreas } = useAreas();
  const { data: allSubareas } = useSubareas();

  const [addPositionId, setAddPositionId] = useState<string>("");
  const [positionSearch, setPositionSearch] = useState<string>("");
  const [addByAreaId, setAddByAreaId] = useState<string>("");
  const [addBySubareaId, setAddBySubareaId] = useState<string>("");

  const areasWithPositions = useMemo(() => {
    const posAreaIds = new Set((allPositions || []).map((p: any) => p.area_id).filter(Boolean));
    return (allAreas || []).filter((a: any) => posAreaIds.has(a.id));
  }, [allAreas, allPositions]);

  const subareasWithPositions = useMemo(() => {
    const posSubareaIds = new Set((allPositions || []).map((p: any) => p.subarea_id).filter(Boolean));
    return (allSubareas || []).filter((s: any) => posSubareaIds.has(s.id));
  }, [allSubareas, allPositions]);

  return (
    <div className="bg-card rounded-xl border border-border/50 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold mb-1">Cargos Responsáveis</h3>
        <p className="text-xs text-muted-foreground">
          Cargos vinculados a este processo. Colaboradores nestes cargos têm visibilidade sobre ele.
        </p>
      </div>

      {((process as any).linked_positions || []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cargo vinculado ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {((process as any).linked_positions as any[]).map((lp: any) => (
            <div key={lp.id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{lp.position?.title || "Cargo"}</p>
                  {lp.position?.subarea?.name && (
                    <p className="text-xs text-muted-foreground">
                      {lp.position.subarea.area?.name} › {lp.position.subarea.name}
                    </p>
                  )}
                </div>
                {lp.is_primary && (
                  <Badge variant="secondary" className="text-2xs ml-1">Principal</Badge>
                )}
              </div>
              <PermissionGuard can="canManageProcesses">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unlinkPosition.mutateAsync({ processId: process.id, positionId: lp.position_id })}
                  disabled={unlinkPosition.isPending}
                >
                  <X className="w-4 h-4 text-danger" />
                </Button>
              </PermissionGuard>
            </div>
          ))}
        </div>
      )}

      <PermissionGuard can="canManageProcesses">
        {/* Vincular por Área */}
        <div className="border-t border-border/50 pt-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Vincular por Área</p>
          <div className="flex gap-2">
            <Select value={addByAreaId} onValueChange={setAddByAreaId}>
              <SelectTrigger className="flex-1 h-8 text-sm"><SelectValue placeholder="Selecionar área..." /></SelectTrigger>
              <SelectContent>
                {areasWithPositions.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              size="sm" className="h-8"
              disabled={!addByAreaId || linkPosition.isPending}
              onClick={async () => {
                if (!addByAreaId) return;
                const linkedIds = new Set(((process as any).linked_positions as any[])?.map((lp: any) => lp.position_id) || []);
                const toLink = (allPositions || []).filter((p: any) => p.area_id === addByAreaId && !linkedIds.has(p.id));
                if (toLink.length === 0) { toast.info("Todos os cargos desta área já estão vinculados"); return; }
                await Promise.all(toLink.map((p: any) => linkPosition.mutateAsync({ processId: process.id, positionId: p.id })));
                toast.success(`${toLink.length} cargo(s) vinculado(s)!`);
                setAddByAreaId("");
              }}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" />Vincular
            </Button>
          </div>
        </div>

        {/* Vincular por Subárea */}
        <div className="border-t border-border/50 pt-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Vincular por Subárea</p>
          <div className="flex gap-2">
            <Select value={addBySubareaId} onValueChange={setAddBySubareaId}>
              <SelectTrigger className="flex-1 h-8 text-sm"><SelectValue placeholder="Selecionar subárea..." /></SelectTrigger>
              <SelectContent>
                {subareasWithPositions.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              size="sm" className="h-8"
              disabled={!addBySubareaId || linkPosition.isPending}
              onClick={async () => {
                if (!addBySubareaId) return;
                const linkedIds = new Set(((process as any).linked_positions as any[])?.map((lp: any) => lp.position_id) || []);
                const toLink = (allPositions || []).filter((p: any) => p.subarea_id === addBySubareaId && !linkedIds.has(p.id));
                if (toLink.length === 0) { toast.info("Todos os cargos desta subárea já estão vinculados"); return; }
                await Promise.all(toLink.map((p: any) => linkPosition.mutateAsync({ processId: process.id, positionId: p.id })));
                toast.success(`${toLink.length} cargo(s) vinculado(s)!`);
                setAddBySubareaId("");
              }}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" />Vincular
            </Button>
          </div>
        </div>

        {/* Vincular cargo individual */}
        <div className="border-t border-border/50 pt-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Vincular cargo</p>
          <Input
            placeholder="Pesquisar cargo..."
            value={positionSearch}
            onChange={(e) => setPositionSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Select value={addPositionId} onValueChange={setAddPositionId}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="Selecionar cargo..." />
              </SelectTrigger>
              <SelectContent>
                {(allPositions || [])
                  .filter((p: any) =>
                    !((process as any).linked_positions as any[])?.some((lp: any) => lp.position_id === p.id) &&
                    (positionSearch === "" || (p.title || "").toLowerCase().includes(positionSearch.toLowerCase()))
                  )
                  .map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              disabled={!addPositionId || linkPosition.isPending}
              onClick={async () => {
                if (!addPositionId) return;
                await linkPosition.mutateAsync({ processId: process.id, positionId: addPositionId });
                setAddPositionId("");
                setPositionSearch("");
              }}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              Vincular
            </Button>
          </div>
        </div>
      </PermissionGuard>
    </div>
  );
}
