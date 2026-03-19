import { useTableSync } from '@features/table';
import { useNetworkClient } from '@shared/hooks/useNetworkClient';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// useNetworkClient must return { client, networkState } to match hook destructuring
vi.mock('@shared/hooks/useNetworkClient', () => ({
  useNetworkClient: vi.fn(() => ({
    client: { sendMessage: vi.fn() },
    networkState: { isConnected: true },
  })),
}));

// Mock WASM table sync – never resolves so tableSyncRef stays null in unit tests
vi.mock('@lib/wasm/wasmManager', () => ({
  wasmManager: {
    getTableSync: vi.fn(() => new Promise(() => {})),
  },
}));

describe('useTableSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('returns null tableData and empty sprites', () => {
      const { result } = renderHook(() => useTableSync());
      expect(result.current.tableData).toBeNull();
      expect(result.current.tableId).toBeNull();
      expect(result.current.sprites).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('exposes action functions', () => {
      const { result } = renderHook(() => useTableSync());
      expect(typeof result.current.requestTable).toBe('function');
      expect(typeof result.current.moveSprite).toBe('function');
      expect(typeof result.current.scaleSprite).toBe('function');
      expect(typeof result.current.rotateSprite).toBe('function');
      expect(typeof result.current.createSprite).toBe('function');
      expect(typeof result.current.deleteSprite).toBe('function');
      expect(typeof result.current.handleNetworkMessage).toBe('function');
    });
  });

  describe('requestTable', () => {
    it('sets error when tableSync not initialized (WASM never ready in unit tests)', () => {
      const { result } = renderHook(() => useTableSync());

      act(() => {
        result.current.requestTable('test-table');
      });

      expect(result.current.error).toBe('Table sync not initialized');
    });

    it('also errors when not connected (same guard)', () => {
      vi.mocked(useNetworkClient).mockReturnValueOnce({
        client: { sendMessage: vi.fn() },
        networkState: { isConnected: false },
      });

      const { result } = renderHook(() => useTableSync());

      act(() => {
        result.current.requestTable('test-table');
      });

      // tableSyncRef is null before WASM resolves, so this guard fires first
      expect(result.current.error).toBe('Table sync not initialized');
    });
  });

  describe('sprite actions – not initialized guard', () => {
    it('moveSprite throws when table sync not ready', () => {
      const { result } = renderHook(() => useTableSync());
      expect(() => result.current.moveSprite('s1', 10, 20)).toThrow('Table sync not initialized');
    });

    it('scaleSprite throws when table sync not ready', () => {
      const { result } = renderHook(() => useTableSync());
      expect(() => result.current.scaleSprite('s1', 2, 2)).toThrow('Table sync not initialized');
    });

    it('rotateSprite throws when table sync not ready', () => {
      const { result } = renderHook(() => useTableSync());
      expect(() => result.current.rotateSprite('s1', 45)).toThrow('Table sync not initialized');
    });

    it('deleteSprite throws when table sync not ready', () => {
      const { result } = renderHook(() => useTableSync());
      expect(() => result.current.deleteSprite('s1')).toThrow('Table sync not initialized');
    });

    it('createSprite throws when table sync not ready', () => {
      const { result } = renderHook(() => useTableSync());
      const spriteData = { name: 'Test', x: 0, y: 0, width: 50, height: 50, scale_x: 1, scale_y: 1, rotation: 0, layer: 'tokens', texture_path: '/token.png', color: '#fff', visible: true };
      expect(() => result.current.createSprite(spriteData)).toThrow('Table sync not initialized');
    });
  });

  describe('window events trigger state updates', () => {
    it('table-data-received event updates loading state', async () => {
      const { result } = renderHook(() => useTableSync());

      // Dispatch a custom event to simulate WASM callback-less path
      act(() => {
        window.dispatchEvent(new CustomEvent('table-data-received', {
          detail: { table_id: 'table1', table_name: 'Test', width: 100, height: 100, scale_x: 1, scale_y: 1, offset_x: 0, offset_y: 0, sprites: [], fog_rectangles: [] }
        }));
      });

      // isLoading should be false (not started since tableSync is null)
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('handleNetworkMessage', () => {
    it('does not throw for unknown message type', () => {
      const { result } = renderHook(() => useTableSync());

      expect(() => {
        result.current.handleNetworkMessage('unknown_type', {});
      }).not.toThrow();
    });

    it('does not throw for table_data message when tableSync not ready', () => {
      const { result } = renderHook(() => useTableSync());

      expect(() => {
        result.current.handleNetworkMessage('table_data', { data: {} });
      }).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('unmounts without errors', () => {
      const { unmount } = renderHook(() => useTableSync());
      expect(() => unmount()).not.toThrow();
    });
  });
});
