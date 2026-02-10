import type { SpriteData, TableData } from '@features/table';
import { useTableSync } from '@features/table';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@lib/wasm/wasmManager', () => ({
  wasmManager: {
    isReady: vi.fn(() => true),
    getRenderManager: vi.fn(() => ({
      sync_table_data: vi.fn(),
      update_sprite: vi.fn(),
      remove_sprite: vi.fn(),
      add_sprite: vi.fn(),
    })),
  },
}));

vi.mock('@shared/hooks/useNetworkClient', () => ({
  useNetworkClient: vi.fn(() => ({
    sendMessage: vi.fn(),
    isConnected: true,
    lastMessage: null,
  })),
}));

// Mock auth
vi.mock('@features/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-1' },
    hasPermission: vi.fn(() => true),
  }),
}));

const mockTableData: TableData = {
  table_id: 'table1',
  table_name: 'Test Table',
  width: 1000,
  height: 800,
  scale_x: 1,
  scale_y: 1,
  offset_x: 0,
  offset_y: 0,
  sprites: [
    {
      sprite_id: 'sprite1',
      name: 'Test Sprite',
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      scale_x: 1,
      scale_y: 1,
      rotation: 0,
      layer: 'tokens',
      texture_path: '/assets/token.png',
      color: '#ffffff',
      visible: true,
    },
  ],
  fog_rectangles: [],
};

const mockNetworkClient = {
  sendMessage: vi.fn(),
  isConnected: true,
  lastMessage: null,
};

const mockWasmManager = {
  isReady: vi.fn(() => true),
  getRenderManager: vi.fn(() => ({
    sync_table_data: vi.fn(),
    update_sprite: vi.fn(),
    remove_sprite: vi.fn(),
    add_sprite: vi.fn(),
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(require('@shared/hooks/useNetworkClient').useNetworkClient).mockReturnValue(mockNetworkClient);
  vi.mocked(require('@lib/wasm/wasmManager').wasmManager).mockReturnValue(mockWasmManager);
});

describe('useTableSync', () => {
  describe('Initialization', () => {
    it('initializes with empty state', () => {
      const { result } = renderHook(() => useTableSync());

      expect(result.current.tableData).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.lastSyncTime).toBeNull();
      expect(result.current.syncStatus).toBe('disconnected');
    });

    it('sets sync status to connected when network is connected and WASM is ready', () => {
      mockNetworkClient.isConnected = true;
      mockWasmManager.isReady.mockReturnValue(true);

      const { result } = renderHook(() => useTableSync());

      expect(result.current.syncStatus).toBe('connected');
    });

    it('sets sync status to disconnected when network is not connected', () => {
      mockNetworkClient.isConnected = false;

      const { result } = renderHook(() => useTableSync());

      expect(result.current.syncStatus).toBe('disconnected');
    });
  });

  describe('Table Loading', () => {
    it('loads table data successfully', async () => {
      const { result } = renderHook(() => useTableSync());

      await act(async () => {
        await result.current.loadTable('table1');
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockNetworkClient.sendMessage).toHaveBeenCalledWith({
        type: 'load_table',
        table_id: 'table1',
      });
    });

    it('handles loading state correctly', () => {
      const { result } = renderHook(() => useTableSync());

      act(() => {
        result.current.loadTable('table1');
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles load error gracefully', async () => {
      mockNetworkClient.sendMessage.mockRejectedValueOnce(new Error('Network error'));
      const { result } = renderHook(() => useTableSync());

      await act(async () => {
        await result.current.loadTable('table1');
      });

      expect(result.current.error).toBe('Failed to load table: Network error');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Table Synchronization', () => {
    it('syncs table data to WASM when data is available', () => {
      const { result } = renderHook(() => useTableSync());
      const mockRenderManager = mockWasmManager.getRenderManager();

      act(() => {
        result.current.syncTableData(mockTableData);
      });

      expect(mockRenderManager.sync_table_data).toHaveBeenCalledWith(mockTableData);
      expect(result.current.tableData).toEqual(mockTableData);
      expect(result.current.lastSyncTime).toBeTruthy();
    });

    it('does not sync when WASM is not ready', () => {
      mockWasmManager.isReady.mockReturnValue(false);
      const { result } = renderHook(() => useTableSync());

      act(() => {
        result.current.syncTableData(mockTableData);
      });

      expect(result.current.error).toBe('WASM not ready for synchronization');
    });

    it('handles sync errors gracefully', () => {
      const mockRenderManager = mockWasmManager.getRenderManager();
      mockRenderManager.sync_table_data.mockImplementationOnce(() => {
        throw new Error('WASM sync error');
      });

      const { result } = renderHook(() => useTableSync());

      act(() => {
        result.current.syncTableData(mockTableData);
      });

      expect(result.current.error).toBe('Failed to sync table data: WASM sync error');
    });
  });

  describe('Sprite Operations', () => {
    beforeEach(() => {
      // Set up initial table data
      const { result } = renderHook(() => useTableSync());
      act(() => {
        result.current.syncTableData(mockTableData);
      });
    });

    it('updates sprite position', async () => {
      const { result } = renderHook(() => useTableSync());

      await act(async () => {
        await result.current.updateSpritePosition('sprite1', 150, 200);
      });

      expect(mockNetworkClient.sendMessage).toHaveBeenCalledWith({
        type: 'sprite_update',
        sprite_id: 'sprite1',
        table_id: 'table1',
        update_type: 'position',
        data: { x: 150, y: 200 },
      });
    });

    it('adds new sprite', async () => {
      const newSprite: SpriteData = {
        sprite_id: 'sprite2',
        name: 'New Sprite',
        x: 200,
        y: 200,
        width: 40,
        height: 40,
        scale_x: 1,
        scale_y: 1,
        rotation: 0,
        layer: 'tokens',
        texture_path: '/assets/new-token.png',
        color: '#ff0000',
        visible: true,
      };

      const { result } = renderHook(() => useTableSync());

      await act(async () => {
        await result.current.addSprite(newSprite);
      });

      expect(mockNetworkClient.sendMessage).toHaveBeenCalledWith({
        type: 'sprite_add',
        table_id: 'table1',
        sprite_data: newSprite,
      });
    });

    it('removes sprite', async () => {
      const { result } = renderHook(() => useTableSync());

      await act(async () => {
        await result.current.removeSprite('sprite1');
      });

      expect(mockNetworkClient.sendMessage).toHaveBeenCalledWith({
        type: 'sprite_remove',
        sprite_id: 'sprite1',
        table_id: 'table1',
      });
    });

    it('handles sprite operation errors', async () => {
      mockNetworkClient.sendMessage.mockRejectedValueOnce(new Error('Sprite update failed'));
      const { result } = renderHook(() => useTableSync());

      await act(async () => {
        await result.current.updateSpritePosition('sprite1', 150, 200);
      });

      expect(result.current.error).toBe('Failed to update sprite: Sprite update failed');
    });
  });

  describe('Network Message Handling', () => {
    it('processes incoming table data message', () => {
      mockNetworkClient.lastMessage = {
        type: 'table_data',
        data: mockTableData,
      };

      const { result } = renderHook(() => useTableSync());

      expect(result.current.tableData).toEqual(mockTableData);
    });

    it('processes sprite update message', () => {
      // Set up initial table data first
      const { result } = renderHook(() => useTableSync());
      act(() => {
        result.current.syncTableData(mockTableData);
      });

      // Simulate incoming sprite update
      mockNetworkClient.lastMessage = {
        type: 'sprite_update',
        sprite_id: 'sprite1',
        update_type: 'position',
        data: { x: 300, y: 400 },
      };

      // Re-render to process the message
      renderHook(() => useTableSync());

      expect(result.current.tableData?.sprites[0].x).toBe(300);
      expect(result.current.tableData?.sprites[0].y).toBe(400);
    });

    it('ignores unknown message types', () => {
      mockNetworkClient.lastMessage = {
        type: 'unknown_message',
        data: 'some data',
      };

      const { result } = renderHook(() => useTableSync());

      expect(result.current.tableData).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('State Management', () => {
    it('clears error when operation succeeds', async () => {
      const { result } = renderHook(() => useTableSync());

      // Set an error first
      act(() => {
        result.current.syncTableData(mockTableData);
      });
      mockWasmManager.isReady.mockReturnValue(false);
      act(() => {
        result.current.syncTableData(mockTableData);
      });
      expect(result.current.error).toBeTruthy();

      // Clear error with successful operation
      mockWasmManager.isReady.mockReturnValue(true);
      await act(async () => {
        await result.current.loadTable('table1');
      });

      expect(result.current.error).toBeNull();
    });

    it('updates sync status based on connection state', () => {
      mockNetworkClient.isConnected = false;
      const { result } = renderHook(() => useTableSync());

      expect(result.current.syncStatus).toBe('disconnected');

      // Simulate connection
      mockNetworkClient.isConnected = true;
      const { result: result2 } = renderHook(() => useTableSync());

      expect(result2.current.syncStatus).toBe('connected');
    });

    it('provides correct loading state during async operations', () => {
      const { result } = renderHook(() => useTableSync());

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.loadTable('table1');
      });

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('cleans up resources on unmount', () => {
      const { unmount } = renderHook(() => useTableSync());

      // Should not throw any errors
      expect(() => unmount()).not.toThrow();
    });
  });
});
