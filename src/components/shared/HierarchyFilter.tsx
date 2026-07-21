import { useMemo } from 'react';
import { X, Circle, Building2, Users, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAreas, useSubareas, usePositions } from '@/hooks/useAreas';
import { cn } from '@/lib/utils';

interface HierarchyFilterProps {
  /** Área selecionada */
  areaId: string | null;
  /** Subárea selecionada */
  subareaId: string | null;
  /** Cargo selecionado */
  positionId: string | null;
  /** Callback quando área muda */
  onAreaChange: (id: string | null) => void;
  /** Callback quando subárea muda */
  onSubareaChange: (id: string | null) => void;
  /** Callback quando cargo muda */
  onPositionChange: (id: string | null) => void;
  /** Callback para limpar todos os filtros */
  onClear: () => void;
  /** Classe CSS adicional */
  className?: string;
  /** Variante de layout */
  variant?: 'default' | 'compact';
}

/**
 * Componente de filtros hierárquicos em cascata (Área → Subárea → Cargo)
 * 
 * @example
 * <HierarchyFilter
 *   areaId={filters.area_id}
 *   subareaId={filters.subarea_id}
 *   positionId={filters.position_id}
 *   onAreaChange={setArea}
 *   onSubareaChange={setSubarea}
 *   onPositionChange={setPosition}
 *   onClear={clearFilters}
 * />
 */
export function HierarchyFilter({
  areaId,
  subareaId,
  positionId,
  onAreaChange,
  onSubareaChange,
  onPositionChange,
  onClear,
  className,
  variant = 'default',
}: HierarchyFilterProps) {
  const areasQuery = useAreas();
  const subareasQuery = useSubareas();
  const positionsQuery = usePositions();
  const areas = areasQuery.data || [];
  const subareas = useMemo(() => subareasQuery.data || [], [subareasQuery.data]);
  const positions = useMemo(() => positionsQuery.data || [], [positionsQuery.data]);
  const isLoading = areasQuery.isLoading || subareasQuery.isLoading || positionsQuery.isLoading;

  // Subáreas filtradas pela área selecionada
  const availableSubareas = useMemo(() => {
    if (!areaId) return [];
    return subareas
      .filter(s => s.area_id === areaId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [subareas, areaId]);

  // Cargos filtrados pela subárea selecionada
  const availablePositions = useMemo(() => {
    if (!subareaId) return [];
    return positions
      .filter(p => p.subarea_id === subareaId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [positions, subareaId]);

  // Verifica se há filtros ativos
  const hasActiveFilters = areaId || subareaId || positionId;

  // Encontrar nomes para badges
  const selectedArea = areas.find(a => a.id === areaId);
  const selectedSubarea = subareas.find(s => s.id === subareaId);
  const selectedPosition = positions.find(p => p.id === positionId);

  if (isLoading) {
    return (
      <div className={cn("flex gap-3 animate-pulse", className)}>
        <div className="h-10 w-40 bg-muted rounded-md" />
        <div className="h-10 w-40 bg-muted rounded-md" />
        <div className="h-10 w-40 bg-muted rounded-md" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Selects de filtros */}
      <div className={cn(
        "flex flex-wrap items-center gap-3",
        variant === 'compact' && "gap-2"
      )}>
        {/* Área */}
        <Select
          value={areaId || 'all'}
          onValueChange={(value) => onAreaChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className={cn(
            "min-w-[180px]",
            variant === 'compact' && "h-8 text-xs min-w-[140px]"
          )}>
            <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Todas as áreas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {areas.map((area) => (
              <SelectItem key={area.id} value={area.id}>
                <span className="flex items-center gap-2">
                  <Circle
                    className="w-3 h-3 fill-current"
                    style={{ color: area.color || '#7C3AED' }}
                  />
                  {area.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Subárea */}
        <Select
          value={subareaId || 'all'}
          onValueChange={(value) => onSubareaChange(value === 'all' ? null : value)}
          disabled={!areaId}
        >
          <SelectTrigger className={cn(
            "min-w-[180px]",
            variant === 'compact' && "h-8 text-xs min-w-[140px]"
          )}>
            <Users className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder={areaId ? "Todas as subáreas" : "Selecione uma área"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as subáreas</SelectItem>
            {availableSubareas.map((subarea) => (
              <SelectItem key={subarea.id} value={subarea.id}>
                {subarea.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Cargo */}
        <Select
          value={positionId || 'all'}
          onValueChange={(value) => onPositionChange(value === 'all' ? null : value)}
          disabled={!subareaId}
        >
          <SelectTrigger className={cn(
            "min-w-[180px]",
            variant === 'compact' && "h-8 text-xs min-w-[140px]"
          )}>
            <Briefcase className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder={subareaId ? "Todos os cargos" : "Selecione uma subárea"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os cargos</SelectItem>
            {availablePositions.map((position) => (
              <SelectItem key={position.id} value={position.id}>
                {position.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Botão limpar */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size={variant === 'compact' ? 'sm' : 'default'}
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      {/* Badges de filtros ativos */}
      {hasActiveFilters && variant === 'default' && (
        <div className="flex flex-wrap gap-2">
          {selectedArea && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1"
              style={{
                backgroundColor: `${selectedArea.color}20`,
                borderColor: selectedArea.color,
                color: selectedArea.color
              }}
            >
              <Circle className="w-2 h-2 fill-current" />
              {selectedArea.name}
            </Badge>
          )}
          {selectedSubarea && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {selectedSubarea.name}
            </Badge>
          )}
          {selectedPosition && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {selectedPosition.title}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Versão simplificada do HierarchyFilter para uso em espaços compactos
 * Mostra apenas badges quando filtros estão ativos
 */
export function HierarchyFilterBadges({
  areaId,
  subareaId,
  positionId,
  onClear,
  className,
}: Omit<HierarchyFilterProps, 'onAreaChange' | 'onSubareaChange' | 'onPositionChange'>) {
  const areasQuery = useAreas();
  const subareasQuery = useSubareas();
  const positionsQuery = usePositions();
  const areas = areasQuery.data || [];
  const subareas = subareasQuery.data || [];
  const positions = positionsQuery.data || [];

  const selectedArea = areas.find(a => a.id === areaId);
  const selectedSubarea = subareas.find(s => s.id === subareaId);
  const selectedPosition = positions.find(p => p.id === positionId);

  const hasActiveFilters = areaId || subareaId || positionId;

  if (!hasActiveFilters) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm text-muted-foreground mr-1">Filtrando por:</span>

      {selectedArea && (
        <Badge
          variant="secondary"
          className="flex items-center gap-1"
          style={{
            backgroundColor: `${selectedArea.color}20`,
            color: selectedArea.color
          }}
        >
          {selectedArea.name}
        </Badge>
      )}

      {selectedSubarea && (
        <Badge variant="outline">{selectedSubarea.name}</Badge>
      )}

      {selectedPosition && (
        <Badge variant="outline">{selectedPosition.title}</Badge>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <X className="w-3 h-3 mr-1" />
        Limpar
      </Button>
    </div>
  );
}
