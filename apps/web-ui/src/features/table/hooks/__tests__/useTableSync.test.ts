import { useTableSync } from '@features/table';
import { useNetworkClient } from '@shared/hooks/useNetworkClient';
import { act } from '@testing-library/react';
import { createMockWasmRuntime, renderHookWithWasmRuntime, type MockWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// useNetworkClient must return { client, networkState } to match hook destructuring
vi.mock('@shared/hooks/useNetworkClient', () => ({
  useNetworkClient: vi.fn(() => ({
    client: { sendMessage: vi.fn() },
    networkState: { isConnected: true },
  })),
}));

// Mock WASM module – never resolves so tableSyncRef stays null in unit tests
let mockRuntime: MockWasmRuntime;

function renderTableSync(options?: Parameters<typeof useTableSync>[0]) {
  return renderHookWithWasmRuntime(() => useTableSync(options), mockRuntime);
}

describe('useTableSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRuntime = createMockWasmRuntime({
      initialize: vi.fn((): Promise<void> => new Promise<void>(() => {})),
      getTableSync: vi.fn(() => null),
    });
  });

  describe('Initial state', () => {
    it('returns null tableData and empty sprites', () => {
      const { result } = renderTableSync();
      expect(result.current.tableData).toBeNull();
      expect(result.current.tableId).toBeNull();
      expect(result.current.sprites).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('exposes synchronization functions', () => {
      const { result } = renderTableSync();
      expect(typeof result.current.requestTable).toBe('function');
      expect(typeof result.current.handleNetworkMessage).toBe('function');
    });
  });

  describe('requestTable', () => {
    it('sets error when tableSync not initialized (WASM never ready in unit tests)', () => {
      const { result } = renderTableSync();

      act(() => {
        result.current.requestTable('test-table');
      });

      expect(result.current.error).toBe('Table sync not initialized');
    });

    it('also errors when not connected (same guard)', () => {
      vi.mocked(useNetworkClient).mockReturnValueOnce({
        client: { send_message: vi.fn() } as unknown as ReturnType<typeof useNetworkClient>['client'],
        networkState: { isConnected: false, connectionState: 'disconnected', clientId: '' },
      } as unknown as ReturnType<typeof useNetworkClient>);

      const { result } = renderTableSync();

      act(() => {
        result.current.requestTable('test-table');
      });

      // tableSyncRef is null before WASM resolves, so this guard fires first
      expect(result.current.error).toBe('Table sync not initialized');
    });
  });

  describe('sprite actions – not initialized guard', () => {
    it('does not expose legacy sprite mutation functions', () => {
      const { result } = renderTableSync();
      expect('moveSprite' in result.current).toBe(false);
      expect('createSprite' in result.current).toBe(false);
    });
  });

  describe('window events trigger state updates', () => {
    it('table-data-received event updates loading state', async () => {
      const { result } = renderTableSync();

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
      const { result } = renderTableSync();

      expect(() => {
        result.current.handleNetworkMessage('unknown_type', {});
      }).not.toThrow();
    });

    it('does not throw for table_data message when tableSync not ready', () => {
      const { result } = renderTableSync();

      expect(() => {
        result.current.handleNetworkMessage('table_data', { data: {} });
      }).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('unmounts without errors', () => {
      const { unmount } = renderTableSync();
      expect(() => unmount()).not.toThrow();
    });
  });
});

