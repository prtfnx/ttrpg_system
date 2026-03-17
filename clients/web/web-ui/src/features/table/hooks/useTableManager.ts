import { useCallback, useEffect, useState } from 'react';

export interface TableInfo {
  table_id: string;
  table_name: string;
  width: number;
  height: number;
  scale: number;
  table_x: number;
  table_y: number;
  viewport_x: number;
  viewport_y: number;
  table_scale: number;
  show_grid: boolean;
  cell_side: number;
  // Sync state tracking (best practice: local-first architecture)
  syncStatus?: 'local' | 'syncing' | 'synced' | 'error';
  lastSyncTime?: number;
  syncError?: string;
}

export interface ScreenArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseTableManagerReturn {
  tableManager: any;
  activeTableId: string | null;
  tables: TableInfo[];
  createTable: (tableId: string, tableName: string, width: number, height: number) => boolean;
  setActiveTable: (tableId: string) => boolean;
  setTableScreenArea: (tableId: string, area: ScreenArea) => boolean;
  tableToScreen: (tableId: string, tableX: number, tableY: number) => [number, number] | null;
  screenToTable: (tableId: string, screenX: number, screenY: number) => [number, number] | null;
  isPointInTableArea: (tableId: string, screenX: number, screenY: number) => boolean;
  panViewport: (tableId: string, dx: number, dy: number) => boolean;
  zoomTable: (tableId: string, zoomFactor: number, centerX: number, centerY: number) => boolean;
  setTableGrid: (tableId: string, showGrid: boolean, cellSize: number) => boolean;
  getVisibleBounds: (tableId: string) => [number, number, number, number] | null;
  snapToGrid: (tableId: string, x: number, y: number) => [number, number] | null;
  removeTable: (tableId: string) => boolean;
  refreshTables: () => void;
}

export const useTableManager = (): UseTableManagerReturn => {
  const [tableManager, setTableManager] = useState<any>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);

  // Initialize table manager
  useEffect(() => {
    if (!tableManager) {
      try {
        const manager = new (window as any).wasm.TableManager();
        setTableManager(manager);
        console.log('Table Manager initialized');
      } catch (error) {
        console.error('Failed to initialize Table Manager:', error);
      }
    }
  }, [tableManager]);

  // Update canvas size when available
  useEffect(() => {
    if (tableManager && window.rustRenderManager) {
      // Get canvas from render manager if available
      const canvas = document.querySelector('canvas');
      if (canvas) {
        tableManager.set_canvas_size(canvas.width, canvas.height);
      }
    }
  }, [tableManager]);

  const refreshTables = useCallback(() => {
    if (!tableManager) return;
    
    try {
      const tablesJson = tableManager.get_all_tables();
      const parsedTables = JSON.parse(tablesJson) as TableInfo[];
      setTables(parsedTables);
      
      const activeId = tableManager.get_active_table_id();
      setActiveTableId(activeId);
    } catch (error) {
      console.error('Failed to refresh tables:', error);
    }
  }, [tableManager]);

  const createTable = useCallback((tableId: string, tableName: string, width: number, height: number): boolean => {
    if (!tableManager) return false;
    
    try {
      tableManager.create_table(tableId, tableName, width, height);
      
      // BEST PRACTICE: Mark newly created tables as 'local' (optimistic UI update)
      // They will be marked as 'synced' after successful server confirmation
      refreshTables();
      
      // Update the sync status of the newly created table
      setTables(prev => prev.map(t => 
        t.table_id === tableId 
          ? { ...t, syncStatus: 'local' as const, lastSyncTime: undefined }
          : t
      ));
      
      return true;
    } catch (error) {
      console.error('Failed to create table:', error);
      return false;
    }
  }, [tableManager, refreshTables]);

  const setActiveTable = useCallback((tableId: string): boolean => {
    if (!tableManager) return false;
    
    const success = tableManager.set_active_table(tableId);
    if (success) {
      setActiveTableId(tableId);
    }
    return success;
  }, [tableManager]);

  const setTableScreenArea = useCallback((tableId: string, area: ScreenArea): boolean => {
    if (!tableManager) return false;
    
    return tableManager.set_table_screen_area(tableId, area.x, area.y, area.width, area.height);
  }, [tableManager]);

  const tableToScreen = useCallback((tableId: string, tableX: number, tableY: number): [number, number] | null => {
    if (!tableManager) return null;
    
    const result = tableManager.table_to_screen(tableId, tableX, tableY);
    return result ? [result[0], result[1]] : null;
  }, [tableManager]);

  const screenToTable = useCallback((tableId: string, screenX: number, screenY: number): [number, number] | null => {
    if (!tableManager) return null;
    
    const result = tableManager.screen_to_table(tableId, screenX, screenY);
    return result ? [result[0], result[1]] : null;
  }, [tableManager]);

  const isPointInTableArea = useCallback((tableId: string, screenX: number, screenY: number): boolean => {
    if (!tableManager) return false;
    
    return tableManager.is_point_in_table_area(tableId, screenX, screenY);
  }, [tableManager]);

  const panViewport = useCallback((tableId: string, dx: number, dy: number): boolean => {
    if (!tableManager) return false;
    
    return tableManager.pan_viewport(tableId, dx, dy);
  }, [tableManager]);

  const zoomTable = useCallback((tableId: string, zoomFactor: number, centerX: number, centerY: number): boolean => {
    if (!tableManager) return false;
    
    return tableManager.zoom_table(tableId, zoomFactor, centerX, centerY);
  }, [tableManager]);

  const setTableGrid = useCallback((tableId: string, showGrid: boolean, cellSize: number): boolean => {
    if (!tableManager) return false;
    
    return tableManager.set_table_grid(tableId, showGrid, cellSize);
  }, [tableManager]);

  const getVisibleBounds = useCallback((tableId: string): [number, number, number, number] | null => {
    if (!tableManager) return null;
    
    const result = tableManager.get_visible_bounds(tableId);
    return result ? [result[0], result[1], result[2], result[3]] : null;
  }, [tableManager]);

  const snapToGrid = useCallback((tableId: string, x: number, y: number): [number, number] | null => {
    if (!tableManager) return null;
    
    const result = tableManager.snap_to_grid(tableId, x, y);
    return result ? [result[0], result[1]] : null;
  }, [tableManager]);

  const removeTable = useCallback((tableId: string): boolean => {
    if (!tableManager) return false;
    
    const success = tableManager.remove_table(tableId);
    if (success) {
      refreshTables();
    }
    return success;
  }, [tableManager, refreshTables]);

  // Refresh tables when table manager is available
  useEffect(() => {
    if (tableManager) {
      refreshTables();
    }
  }, [tableManager, refreshTables]);

  return {
    tableManager,
    activeTableId,
    tables,
    createTable,
    setActiveTable,
    setTableScreenArea,
    tableToScreen,
    screenToTable,
    isPointInTableArea,
    panViewport,
    zoomTable,
    setTableGrid,
    getVisibleBounds,
    snapToGrid,
    removeTable,
    refreshTables,
  };
};
