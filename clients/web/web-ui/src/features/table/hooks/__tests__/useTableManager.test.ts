import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTableManager } from '../useTableManager';
import type { TableInfo, ScreenArea } from '../useTableManager';

// Mock WASM TableManager
const mockTableManager = {
  set_canvas_size: vi.fn(),
  get_all_tables: vi.fn(() => []),
  create_table: vi.fn(() => true),
  set_active_table: vi.fn(() => true),
  set_table_screen_area: vi.fn(() => true),
  table_to_screen: vi.fn(() => [100, 100]),
  screen_to_table: vi.fn(() => [50, 50]),
  is_point_in_table_area: vi.fn(() => true),
  pan_viewport: vi.fn(() => true),
  zoom_table: vi.fn(() => true),
  set_table_grid: vi.fn(() => true),
  get_visible_bounds: vi.fn(() => [0, 0, 1000, 1000]),
  snap_to_grid: vi.fn(() => [25, 25]),
  remove_table: vi.fn(() => true),
};

// Mock global WASM
const mockWasm = {
  TableManager: vi.fn(() => mockTableManager),
};

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks();
  
  // Mock window.wasm
  Object.defineProperty(window, 'wasm', {
    value: mockWasm,
    writable: true,
  });

  // Mock window.rustRenderManager
  Object.defineProperty(window, 'rustRenderManager', {
    value: true,
    writable: true,
  });

  // Mock canvas element
  const mockCanvas = document.createElement('canvas');
  mockCanvas.width = 800;
  mockCanvas.height = 600;
  document.body.appendChild(mockCanvas);

  // Mock querySelector to return our canvas
  const originalQuerySelector = document.querySelector;
  vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
    if (selector === 'canvas') {
      return mockCanvas;
    }
    return originalQuerySelector.call(document, selector);
  });
});

afterEach(() => {
  // Clean up DOM
  document.querySelectorAll('canvas').forEach(canvas => canvas.remove());
  vi.restoreAllMocks();
});

describe('useTableManager', () => {
  describe('Initialization', () => {
    it('initializes table manager on first render', () => {
      const { result } = renderHook(() => useTableManager());

      expect(mockWasm.TableManager).toHaveBeenCalledTimes(1);
      expect(result.current.tableManager).toBeTruthy();
      expect(result.current.activeTableId).toBeNull();
      expect(result.current.tables).toEqual([]);
    });

    it('sets canvas size when table manager and canvas are available', () => {
      renderHook(() => useTableManager());

      expect(mockTableManager.set_canvas_size).toHaveBeenCalledWith(800, 600);
    });

    it('handles table manager initialization failure gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockWasm.TableManager.mockImplementationOnce(() => {
        throw new Error('WASM initialization failed');
      });

      const { result } = renderHook(() => useTableManager());

      expect(result.current.tableManager).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize Table Manager:', expect.any(Error));
    });
  });

  describe('Table Creation', () => {
    it('creates a new table successfully', () => {
      const { result } = renderHook(() => useTableManager());

      act(() => {
        const success = result.current.createTable('table1', 'Test Table', 1000, 800);
        expect(success).toBe(true);
      });

      expect(mockTableManager.create_table).toHaveBeenCalledWith('table1', 'Test Table', 1000, 800);
    });

    it('returns false when table manager is not initialized', () => {
      mockWasm.TableManager.mockReturnValueOnce(null);
      const { result } = renderHook(() => useTableManager());

      act(() => {
        const success = result.current.createTable('table1', 'Test Table', 1000, 800);
        expect(success).toBe(false);
      });
    });

    it('handles table creation with invalid dimensions', () => {
      mockTableManager.create_table.mockReturnValueOnce(false);
      const { result } = renderHook(() => useTableManager());

      act(() => {
        const success = result.current.createTable('table1', 'Test Table', -100, -100);
        expect(success).toBe(false);
      });
    });
  });

  describe('Table Management', () => {
    it('sets active table', () => {
      const { result } = renderHook(() => useTableManager());

      act(() => {
        const success = result.current.setActiveTable('table1');
        expect(success).toBe(true);
      });

      expect(mockTableManager.set_active_table).toHaveBeenCalledWith('table1');
    });

    it('removes table successfully', () => {
      const { result } = renderHook(() => useTableManager());

      act(() => {
        const success = result.current.removeTable('table1');
        expect(success).toBe(true);
      });

      expect(mockTableManager.remove_table).toHaveBeenCalledWith('table1');
    });

    it('refreshes table list', () => {
      const mockTableData = [
        {
          table_id: 'table1',
          table_name: 'Test Table',
          width: 1000,
          height: 800,
          scale: 1,
          table_x: 0,
          table_y: 0,
          viewport_x: 0,
          viewport_y: 0,
          table_scale: 1,
          show_grid: true,
          cell_side: 50,
        },
      ];

      mockTableManager.get_all_tables.mockReturnValueOnce(mockTableData);
      const { result } = renderHook(() => useTableManager());

      act(() => {
        result.current.refreshTables();
      });

      expect(mockTableManager.get_all_tables).toHaveBeenCalled();
      expect(result.current.tables).toEqual(mockTableData);
    });
  });

  describe('Viewport Operations', () => {
    it('pans viewport correctly', () => {
      const { result } = renderHook(() => useTableManager());

      act(() => {
        const success = result.current.panViewport('table1', 10, 20);
        expect(success).toBe(true);
      });

      expect(mockTableManager.pan_viewport).toHaveBeenCalledWith('table1', 10, 20);
    });

    it('zooms table correctly', () => {
      const { result } = renderHook(() => useTableManager());

      act(() => {
        const success = result.current.zoomTable('table1', 1.5, 400, 300);
        expect(success).toBe(true);
      });

      expect(mockTableManager.zoom_table).toHaveBeenCalledWith('table1', 1.5, 400, 300);
    });

    it('gets visible bounds', () => {
      const { result } = renderHook(() => useTableManager());

      const bounds = result.current.getVisibleBounds('table1');
      
      expect(bounds).toEqual([0, 0, 1000, 1000]);
      expect(mockTableManager.get_visible_bounds).toHaveBeenCalledWith('table1');
    });
  });

  describe('Coordinate Transformations', () => {
    it('converts table coordinates to screen coordinates', () => {
      const { result } = renderHook(() => useTableManager());

      const screenCoords = result.current.tableToScreen('table1', 50, 75);
      
      expect(screenCoords).toEqual([100, 100]);
      expect(mockTableManager.table_to_screen).toHaveBeenCalledWith('table1', 50, 75);
    });

    it('converts screen coordinates to table coordinates', () => {
      const { result } = renderHook(() => useTableManager());

      const tableCoords = result.current.screenToTable('table1', 100, 100);
      
      expect(tableCoords).toEqual([50, 50]);
      expect(mockTableManager.screen_to_table).toHaveBeenCalledWith('table1', 100, 100);
    });

    it('checks if point is in table area', () => {
      const { result } = renderHook(() => useTableManager());

      const isInArea = result.current.isPointInTableArea('table1', 100, 100);
      
      expect(isInArea).toBe(true);
      expect(mockTableManager.is_point_in_table_area).toHaveBeenCalledWith('table1', 100, 100);
    });

    it('returns null for invalid table coordinates', () => {
      mockTableManager.table_to_screen.mockReturnValueOnce(null);
      const { result } = renderHook(() => useTableManager());

      const screenCoords = result.current.tableToScreen('invalid-table', 50, 75);
      
      expect(screenCoords).toBeNull();
    });
  });

  describe('Grid Operations', () => {
    it('sets table grid settings', () => {
      const { result } = renderHook(() => useTableManager());

      act(() => {
        const success = result.current.setTableGrid('table1', true, 25);
        expect(success).toBe(true);
      });

      expect(mockTableManager.set_table_grid).toHaveBeenCalledWith('table1', true, 25);
    });

    it('snaps coordinates to grid', () => {
      const { result } = renderHook(() => useTableManager());

      const snappedCoords = result.current.snapToGrid('table1', 23, 27);
      
      expect(snappedCoords).toEqual([25, 25]);
      expect(mockTableManager.snap_to_grid).toHaveBeenCalledWith('table1', 23, 27);
    });
  });

  describe('Screen Area Management', () => {
    it('sets table screen area', () => {
      const { result } = renderHook(() => useTableManager());
      const area: ScreenArea = { x: 0, y: 0, width: 800, height: 600 };

      act(() => {
        const success = result.current.setTableScreenArea('table1', area);
        expect(success).toBe(true);
      });

      expect(mockTableManager.set_table_screen_area).toHaveBeenCalledWith('table1', area);
    });
  });

  describe('Error Handling', () => {
    it('handles operations when table manager is null', () => {
      mockWasm.TableManager.mockReturnValueOnce(null);
      const { result } = renderHook(() => useTableManager());

      // All operations should return false when manager is null
      act(() => {
        expect(result.current.createTable('table1', 'Test', 100, 100)).toBe(false);
        expect(result.current.setActiveTable('table1')).toBe(false);
        expect(result.current.removeTable('table1')).toBe(false);
        expect(result.current.panViewport('table1', 10, 10)).toBe(false);
        expect(result.current.zoomTable('table1', 1.5, 0, 0)).toBe(false);
        expect(result.current.setTableGrid('table1', true, 25)).toBe(false);
        expect(result.current.setTableScreenArea('table1', { x: 0, y: 0, width: 100, height: 100 })).toBe(false);
      });

      // Coordinate operations should return null
      expect(result.current.tableToScreen('table1', 50, 50)).toBeNull();
      expect(result.current.screenToTable('table1', 100, 100)).toBeNull();
      expect(result.current.getVisibleBounds('table1')).toBeNull();
      expect(result.current.snapToGrid('table1', 23, 27)).toBeNull();
      expect(result.current.isPointInTableArea('table1', 100, 100)).toBe(false);
    });

    it('handles WASM method errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTableManager.get_all_tables.mockImplementationOnce(() => {
        throw new Error('WASM method error');
      });

      const { result } = renderHook(() => useTableManager());

      act(() => {
        result.current.refreshTables();
      });

      expect(consoleSpy).toHaveBeenCalledWith('Error refreshing tables:', expect.any(Error));
      expect(result.current.tables).toEqual([]); // Should remain empty on error
    });
  });
});