import type { ScreenArea } from '@features/table';
import { useTableManager } from '@features/table';
import { act, waitFor } from '@testing-library/react';
import { createMockWasmRuntime, renderHookWithWasmRuntime, type MockWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock WASM TableManager
const mockTableManager = {
  set_canvas_size: vi.fn(),
  get_all_tables: vi.fn(() => '[]'),
  get_active_table_id: vi.fn(() => null),
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

let mockRuntime: MockWasmRuntime;

async function renderUseTableManager() {
  const hook = renderHookWithWasmRuntime(() => useTableManager(), mockRuntime);
  await waitFor(() => expect(hook.result.current.tableManager).toBe(mockTableManager));
  return hook;
}

function renderUseTableManagerWithoutWaiting() {
  return renderHookWithWasmRuntime(() => useTableManager(), mockRuntime);
}

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks();

  mockRuntime = createMockWasmRuntime({
    getTableManager: vi.fn(() => mockTableManager as never),
    getRenderEngine: vi.fn(() => ({ render: vi.fn() }) as never),
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
    it('initializes table manager on first render', async () => {
      const { result } = await renderUseTableManager();

      expect(mockRuntime.initialize).toHaveBeenCalledTimes(1);
      expect(result.current.tableManager).toBeTruthy();
      expect(result.current.activeTableId).toBeNull();
      expect(result.current.tables).toEqual([]);
    });

    it('sets canvas size when table manager and canvas are available', async () => {
      await renderUseTableManager();

      expect(mockTableManager.set_canvas_size).toHaveBeenCalledWith(800, 600);
    });

    it('handles table manager initialization failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(mockRuntime.initialize).mockRejectedValueOnce(new Error('WASM initialization failed'));

      const { result } = renderUseTableManagerWithoutWaiting();

      await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith('[ERROR] Failed to initialize Table Manager:', expect.any(Error)));
      expect(result.current.tableManager).toBeNull();
    });
  });

  describe('Table Creation', () => {
    it('creates a new table successfully', async () => {
      const { result } = await renderUseTableManager();
      act(() => {
        const success = result.current.createTable('table1', 'Test Table', 1000, 800);
        expect(success).toBe(true);
      });

      expect(mockTableManager.create_table).toHaveBeenCalledWith('table1', 'Test Table', 1000, 800);
    });

    it('returns false when table manager is not initialized', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(mockRuntime.initialize).mockRejectedValueOnce(new Error('simulated init failure'));
      const { result } = renderUseTableManagerWithoutWaiting();

      await waitFor(() => expect(mockRuntime.initialize).toHaveBeenCalled());
      act(() => {
        const success = result.current.createTable('table1', 'Test Table', 1000, 800);
        expect(success).toBe(false);
      });
    });

    it('handles table creation with invalid dimensions', async () => {
      // WASM create_table returns void and throws on error; hook returns false on throw
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTableManager.create_table.mockImplementationOnce(function() {
        throw new Error('invalid dimensions');
      });
      const { result } = await renderUseTableManager();

      act(() => {
        const success = result.current.createTable('table1', 'Test Table', -100, -100);
        expect(success).toBe(false);
      });
    });
  });

  describe('Table Management', () => {
    it('sets active table', async () => {
      const { result } = await renderUseTableManager();

      act(() => {
        const success = result.current.setActiveTable('table1');
        expect(success).toBe(true);
      });

      expect(mockTableManager.set_active_table).toHaveBeenCalledWith('table1');
    });

    it('removes table successfully', async () => {
      const { result } = await renderUseTableManager();

      act(() => {
        const success = result.current.removeTable('table1');
        expect(success).toBe(true);
      });

      expect(mockTableManager.remove_table).toHaveBeenCalledWith('table1');
    });

    it('refreshes table list', async () => {
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

      const tableDataJson = JSON.stringify(mockTableData);
      // Need two returnValues: one for the init refresh, one for the explicit call
      mockTableManager.get_all_tables.mockReturnValueOnce(tableDataJson);
      mockTableManager.get_all_tables.mockReturnValueOnce(tableDataJson);
      const { result } = await renderUseTableManager();

      act(() => {
        result.current.refreshTables();
      });

      expect(mockTableManager.get_all_tables).toHaveBeenCalled();
      expect(result.current.tables).toEqual(mockTableData);
    });
  });

  describe('Viewport Operations', () => {
    it('pans viewport correctly', async () => {
      const { result } = await renderUseTableManager();

      act(() => {
        const success = result.current.panViewport('table1', 10, 20);
        expect(success).toBe(true);
      });

      expect(mockTableManager.pan_viewport).toHaveBeenCalledWith('table1', 10, 20);
    });

    it('zooms table correctly', async () => {
      const { result } = await renderUseTableManager();

      act(() => {
        const success = result.current.zoomTable('table1', 1.5, 400, 300);
        expect(success).toBe(true);
      });

      expect(mockTableManager.zoom_table).toHaveBeenCalledWith('table1', 1.5, 400, 300);
    });

    it('gets visible bounds', async () => {
      const { result } = await renderUseTableManager();

      const bounds = result.current.getVisibleBounds('table1');
      
      expect(bounds).toEqual([0, 0, 1000, 1000]);
      expect(mockTableManager.get_visible_bounds).toHaveBeenCalledWith('table1');
    });
  });

  describe('Coordinate Transformations', () => {
    it('converts table coordinates to screen coordinates', async () => {
      const { result } = await renderUseTableManager();

      const screenCoords = result.current.tableToScreen('table1', 50, 75);
      
      expect(screenCoords).toEqual([100, 100]);
      expect(mockTableManager.table_to_screen).toHaveBeenCalledWith('table1', 50, 75);
    });

    it('converts screen coordinates to table coordinates', async () => {
      const { result } = await renderUseTableManager();

      const tableCoords = result.current.screenToTable('table1', 100, 100);
      
      expect(tableCoords).toEqual([50, 50]);
      expect(mockTableManager.screen_to_table).toHaveBeenCalledWith('table1', 100, 100);
    });

    it('checks if point is in table area', async () => {
      const { result } = await renderUseTableManager();

      const isInArea = result.current.isPointInTableArea('table1', 100, 100);
      
      expect(isInArea).toBe(true);
      expect(mockTableManager.is_point_in_table_area).toHaveBeenCalledWith('table1', 100, 100);
    });

    it('returns null for invalid table coordinates', async () => {
      mockTableManager.table_to_screen.mockReturnValueOnce(null as unknown as number[]);
      const { result } = await renderUseTableManager();

      const screenCoords = result.current.tableToScreen('invalid-table', 50, 75);
      
      expect(screenCoords).toBeNull();
    });
  });

  describe('Grid Operations', () => {
    it('sets table grid settings', async () => {
      const { result } = await renderUseTableManager();

      act(() => {
        const success = result.current.setTableGrid('table1', true, 25);
        expect(success).toBe(true);
      });

      expect(mockTableManager.set_table_grid).toHaveBeenCalledWith('table1', true, 25);
    });

    it('snaps coordinates to grid', async () => {
      const { result } = await renderUseTableManager();

      const snappedCoords = result.current.snapToGrid('table1', 23, 27);
      
      expect(snappedCoords).toEqual([25, 25]);
      expect(mockTableManager.snap_to_grid).toHaveBeenCalledWith('table1', 23, 27);
    });
  });

  describe('Screen Area Management', () => {
    it('sets table screen area', async () => {
      const { result } = await renderUseTableManager();
      const area: ScreenArea = { x: 0, y: 0, width: 800, height: 600 };

      act(() => {
        const success = result.current.setTableScreenArea('table1', area);
        expect(success).toBe(true);
      });

      expect(mockTableManager.set_table_screen_area).toHaveBeenCalledWith('table1', area.x, area.y, area.width, area.height);
    });
  });

  describe('Error Handling', () => {
    it('handles operations when table manager is null', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(mockRuntime.initialize).mockRejectedValueOnce(new Error('simulated null manager'));
      const { result } = renderUseTableManagerWithoutWaiting();

      await waitFor(() => expect(mockRuntime.initialize).toHaveBeenCalled());

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

    it('handles WASM method errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTableManager.get_all_tables.mockImplementationOnce(() => {
        throw new Error('WASM method error');
      });

      const { result } = await renderUseTableManager();

      act(() => {
        result.current.refreshTables();
      });

      expect(consoleSpy).toHaveBeenCalledWith('[ERROR] Failed to refresh tables:', expect.any(Error));
      expect(result.current.tables).toEqual([]); // Should remain empty on error
    });
  });
});




