import { useState, useMemo, useCallback } from 'react';
import { useAreas, useSubareas, usePositions } from './useAreas';

export interface HierarchyFilterState {
  area_id: string | null;
  subarea_id: string | null;
  position_id: string | null;
}

export interface UseHierarchyFilterReturn {
  filters: HierarchyFilterState;
  setArea: (id: string | null) => void;
  setSubarea: (id: string | null) => void;
  setPosition: (id: string | null) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  availableSubareas: Array<{ id: string; name: string; color?: string }>;
  availablePositions: Array<{ id: string; title: string }>;
  selectedAreaName: string | null;
  selectedSubareaName: string | null;
  selectedPositionName: string | null;
}

/**
 * Hook para gerenciar filtros hierárquicos em cascata (Área → Subárea → Cargo)
 * 
 * @example
 * const { filters, setArea, setSubarea, setPosition, clearFilters, availableSubareas } = useHierarchyFilter();
 * 
 * // Usar em uma query
 * const { data } = useProcesses({
 *   area_id: filters.area_id,
 *   subarea_id: filters.subarea_id,
 *   position_id: filters.position_id,
 * });
 */
export function useHierarchyFilter(): UseHierarchyFilterReturn {
  const [filters, setFilters] = useState<HierarchyFilterState>({
    area_id: null,
    subarea_id: null,
    position_id: null,
  });

  const areasQuery = useAreas();
  const subareasQuery = useSubareas();
  const positionsQuery = usePositions();
  const areas = areasQuery.data || [];
  const subareas = subareasQuery.data || [];
  const positions = positionsQuery.data || [];

  // Verifica se há filtros ativos
  const hasActiveFilters = useMemo(() => {
    return filters.area_id !== null || 
           filters.subarea_id !== null || 
           filters.position_id !== null;
  }, [filters]);

  // Subáreas disponíveis baseadas na área selecionada
  const availableSubareas = useMemo(() => {
    if (!filters.area_id) return [];
    return subareas
      .filter(s => s.area_id === filters.area_id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [subareas, filters.area_id]);

  // Cargos disponíveis baseados na subárea selecionada
  const availablePositions = useMemo(() => {
    if (!filters.subarea_id) return [];
    return positions
      .filter(p => p.subarea_id === filters.subarea_id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [positions, filters.subarea_id]);

  // Nomes selecionados para exibição
  const selectedAreaName = useMemo(() => {
    if (!filters.area_id) return null;
    const area = areas.find(a => a.id === filters.area_id);
    return area?.name || null;
  }, [areas, filters.area_id]);

  const selectedSubareaName = useMemo(() => {
    if (!filters.subarea_id) return null;
    const subarea = subareas.find(s => s.id === filters.subarea_id);
    return subarea?.name || null;
  }, [subareas, filters.subarea_id]);

  const selectedPositionName = useMemo(() => {
    if (!filters.position_id) return null;
    const position = positions.find(p => p.id === filters.position_id);
    return position?.title || null;
  }, [positions, filters.position_id]);

  // Handlers
  const setArea = useCallback((id: string | null) => {
    setFilters(prev => ({
      area_id: id,
      subarea_id: null,  // Reset subordinados
      position_id: null,
    }));
  }, []);

  const setSubarea = useCallback((id: string | null) => {
    setFilters(prev => ({
      ...prev,
      subarea_id: id,
      position_id: null,  // Reset cargo
    }));
  }, []);

  const setPosition = useCallback((id: string | null) => {
    setFilters(prev => ({ ...prev, position_id: id }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      area_id: null,
      subarea_id: null,
      position_id: null,
    });
  }, []);

  return {
    filters,
    setArea,
    setSubarea,
    setPosition,
    clearFilters,
    hasActiveFilters,
    availableSubareas,
    availablePositions,
    selectedAreaName,
    selectedSubareaName,
    selectedPositionName,
  };
}
