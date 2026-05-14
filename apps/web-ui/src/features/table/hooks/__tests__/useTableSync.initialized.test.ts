/**
 * Tests for useTableSync when WASM is fully initialized.
 * Separate file so we can use a resolving WASM mock without
 * breaking the existing guard-path tests.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTableSync } from '@features/table';

// Shared mock instance captured at construction time
let capturedTableSync: {
  tableReceivedHandler: ((d: unknown) => void) | null;
  spriteUpdateHandler: ((d: unknown) => void) | null;
  errorHandler: ((e: string) => void) | null;
  handle_table_data: ReturnType<typeof vi.fn>;
  handle_sprite_update: ReturnType<typeof vi.fn>;
  request_table: ReturnType<typeof vi.fn>;
  send_sprite_move: ReturnType<typeof vi.fn>;
  send_sprite_scale: ReturnType<typeof vi.fn>;
  send_sprite_rotate: ReturnType<typeof vi.fn>;
  send_sprite_delete: ReturnType<typeof vi.fn>;
  send_sprite_create: ReturnType<typeof vi.fn>;
  set_network_client: ReturnType<typeof vi.fn>;
} | null = null;

// hoisted mock fn so the factory can reference it
const mockGetWasmModule = vi.hoisted(() => vi.fn());

vi.mock('@lib/wasm/wasmManager', () => ({
  wasmManager: { getWasmModule: mockGetWasmModule },
}));

vi.mock('@shared/hooks/useNetworkClient', () => ({
  useNetworkClient: vi.fn(() => ({
    client: { sendMessage: vi.fn() },
    networkState: { isConnected: true },
  })),
}));

function buildMockTableSync() {
  capturedTableSync = {
    tableReceivedHandler: null,
    spriteUpdateHandler: null,
    errorHandler: null,
    handle_table_data: vi.fn(),
    handle_sprite_update: vi.fn(),
    request_table: vi.fn(),
    send_sprite_move: vi.fn(),
    send_sprite_scale: vi.fn(),
    send_sprite_rotate: vi.fn(),
    send_sprite_delete: vi.fn(),
    send_sprite_create: vi.fn(),
    set_network_client: vi.fn(),
  };

  class MockTableSync {
    set_table_received_handler(h: (d: unknown) => void) { capturedTableSync!.tableReceivedHandler = h; }
    set_sprite_update_handler(h: (d: unknown) => void) { capturedTableSync!.spriteUpdateHandler = h; }
    set_error_handler(h: (e: string) => void) { capturedTableSync!.errorHandler = h; }
    handle_table_data = capturedTableSync!.handle_table_data;
    handle_sprite_update = capturedTableSync!.handle_sprite_update;
    request_table = capturedTableSync!.request_table;
    send_sprite_move = capturedTableSync!.send_sprite_move;
    send_sprite_scale = capturedTableSync!.send_sprite_scale;
    send_sprite_rotate = capturedTableSync!.send_sprite_rotate;
    send_sprite_delete = capturedTableSync!.send_sprite_delete;
    send_sprite_create = capturedTableSync!.send_sprite_create;
    set_network_client = capturedTableSync!.set_network_client;
  }

  return MockTableSync;
}

function makeTableData(overrides = {}) {
  return {
    table_id: 'tbl-1',
    table_name: 'Test Table',
    width: 800,
    height: 600,
    scale_x: 1,
    scale_y: 1,
    offset_x: 0,
    offset_y: 0,
    sprites: [] as unknown[],
    fog_rectangles: [],
    ...overrides,
  };
}

async function initHook(options = {}) {
  const MockTableSync = buildMockTableSync();
  mockGetWasmModule.mockResolvedValue({ TableSync: MockTableSync });

  const hook = renderHook(() => useTableSync(options));

  // Flush the async getWasmModule promise and the then() callback
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedTableSync = null;
});

describe('useTableSync – WASM initialized', () => {
  describe('initialization', () => {
    it('calls getWasmModule on mount', async () => {
      await initHook();
      expect(mockGetWasmModule).toHaveBeenCalledOnce();
    });

    it('registers all three WASM handlers', async () => {
      await initHook();
      expect(capturedTableSync!.tableReceivedHandler).toBeTypeOf('function');
      expect(capturedTableSync!.spriteUpdateHandler).toBeTypeOf('function');
      expect(capturedTableSync!.errorHandler).toBeTypeOf('function');
    });

    it('calls onError when WASM rejects', async () => {
      const onError = vi.fn();
      mockGetWasmModule.mockRejectedValue(new Error('WASM load failed'));
      const { result } = renderHook(() => useTableSync({ onError }));

      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      await waitFor(() => expect(result.current.error).toMatch('Failed to initialize table sync'));
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('tableReceivedHandler callback', () => {
    it('updates tableData, tableId, and sprites on success', async () => {
      const { result } = await initHook();

      const sprites = [{ sprite_id: 's1', name: 'Hero', x: 10, y: 20, width: 50, height: 50, scale_x: 1, scale_y: 1, rotation: 0, layer: 'tokens', texture_path: '/hero.png', color: '#fff', visible: true }];
      const tableData = makeTableData({ sprites });

      act(() => {
        capturedTableSync!.tableReceivedHandler!(tableData);
      });

      await waitFor(() => expect(result.current.tableData?.table_id).toBe('tbl-1'));
      expect(result.current.tableId).toBe('tbl-1');
      expect(result.current.sprites).toHaveLength(1);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('calls onTableReceived option callback', async () => {
      const onTableReceived = vi.fn();
      const { result } = await initHook({ onTableReceived });

      act(() => { capturedTableSync!.tableReceivedHandler!(makeTableData()); });
      await waitFor(() => expect(result.current.tableData).not.toBeNull());

      expect(onTableReceived).toHaveBeenCalledWith(expect.objectContaining({ table_id: 'tbl-1' }));
    });
  });

  describe('spriteUpdateHandler callback', () => {
    it('updates sprite position on sprite_move', async () => {
      const { result } = await initHook();

      const sprites = [{ sprite_id: 's1', name: 'Hero', x: 0, y: 0, width: 50, height: 50, scale_x: 1, scale_y: 1, rotation: 0, layer: 'tokens', texture_path: '/hero.png', color: '#fff', visible: true }];
      act(() => { capturedTableSync!.tableReceivedHandler!(makeTableData({ sprites })); });
      await waitFor(() => expect(result.current.sprites).toHaveLength(1));

      act(() => {
        capturedTableSync!.spriteUpdateHandler!({
          sprite_id: 's1',
          table_id: 'tbl-1',
          update_type: 'sprite_move',
          data: { to: { x: 100, y: 200 } },
        });
      });

      await waitFor(() => expect(result.current.sprites[0].x).toBe(100));
      expect(result.current.sprites[0].y).toBe(200);
    });

    it('updates sprite scale on sprite_scale', async () => {
      const { result } = await initHook();
      const sprites = [{ sprite_id: 's1', name: 'Hero', x: 0, y: 0, width: 50, height: 50, scale_x: 1, scale_y: 1, rotation: 0, layer: 'tokens', texture_path: '/hero.png', color: '#fff', visible: true }];
      act(() => { capturedTableSync!.tableReceivedHandler!(makeTableData({ sprites })); });
      await waitFor(() => expect(result.current.sprites).toHaveLength(1));

      act(() => {
        capturedTableSync!.spriteUpdateHandler!({
          sprite_id: 's1', table_id: 'tbl-1', update_type: 'sprite_scale',
          data: { scale_x: 2, scale_y: 3 },
        });
      });

      await waitFor(() => expect(result.current.sprites[0].scale_x).toBe(2));
      expect(result.current.sprites[0].scale_y).toBe(3);
    });

    it('updates sprite rotation on sprite_rotate', async () => {
      const { result } = await initHook();
      const sprites = [{ sprite_id: 's1', name: 'Hero', x: 0, y: 0, width: 50, height: 50, scale_x: 1, scale_y: 1, rotation: 0, layer: 'tokens', texture_path: '/hero.png', color: '#fff', visible: true }];
      act(() => { capturedTableSync!.tableReceivedHandler!(makeTableData({ sprites })); });
      await waitFor(() => expect(result.current.sprites).toHaveLength(1));

      act(() => {
        capturedTableSync!.spriteUpdateHandler!({
          sprite_id: 's1', table_id: 'tbl-1', update_type: 'sprite_rotate',
          data: { rotation: 90 },
        });
      });

      await waitFor(() => expect(result.current.sprites[0].rotation).toBe(90));
    });

    it('calls onSpriteUpdate option', async () => {
      const onSpriteUpdate = vi.fn();
      const { result } = await initHook({ onSpriteUpdate });
      const sprites = [{ sprite_id: 's1', name: 'Hero', x: 0, y: 0, width: 50, height: 50, scale_x: 1, scale_y: 1, rotation: 0, layer: 'tokens', texture_path: '/hero.png', color: '#fff', visible: true }];
      act(() => { capturedTableSync!.tableReceivedHandler!(makeTableData({ sprites })); });
      await waitFor(() => expect(result.current.sprites).toHaveLength(1));

      act(() => {
        capturedTableSync!.spriteUpdateHandler!({ sprite_id: 's1', table_id: 'tbl-1', update_type: 'sprite_move', data: { to: { x: 5, y: 5 } } });
      });

      await waitFor(() => expect(onSpriteUpdate).toHaveBeenCalled());
    });
  });

  describe('errorHandler callback', () => {
    it('sets error state', async () => {
      const { result } = await initHook();

      act(() => { capturedTableSync!.errorHandler!('WASM error!'); });

      await waitFor(() => expect(result.current.error).toBe('WASM error!'));
      expect(result.current.isLoading).toBe(false);
    });

    it('calls onError option', async () => {
      const onError = vi.fn();
      await initHook({ onError });

      act(() => { capturedTableSync!.errorHandler!('oops'); });

      await waitFor(() => expect(onError).toHaveBeenCalledWith('oops'));
    });
  });

  describe('requestTable', () => {
    it('calls request_table on tableSync and sets loading', async () => {
      const { result } = await initHook();

      act(() => { result.current.requestTable('TestMap'); });

      expect(capturedTableSync!.request_table).toHaveBeenCalledWith('TestMap');
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('sprite action forwarding', () => {
    it('moveSprite calls send_sprite_move', async () => {
      const { result } = await initHook();

      act(() => { result.current.moveSprite('s1', 50, 75); });

      expect(capturedTableSync!.send_sprite_move).toHaveBeenCalledWith('s1', 50, 75);
    });

    it('scaleSprite calls send_sprite_scale', async () => {
      const { result } = await initHook();

      act(() => { result.current.scaleSprite('s1', 2, 2); });

      expect(capturedTableSync!.send_sprite_scale).toHaveBeenCalledWith('s1', 2, 2);
    });

    it('rotateSprite calls send_sprite_rotate', async () => {
      const { result } = await initHook();

      act(() => { result.current.rotateSprite('s1', 45); });

      expect(capturedTableSync!.send_sprite_rotate).toHaveBeenCalledWith('s1', 45);
    });

    it('deleteSprite calls send_sprite_delete', async () => {
      const { result } = await initHook();

      act(() => { result.current.deleteSprite('s1'); });

      expect(capturedTableSync!.send_sprite_delete).toHaveBeenCalledWith('s1');
    });

    it('createSprite calls send_sprite_create and returns an id', async () => {
      const { result } = await initHook();
      const spriteData = { name: 'Orc', x: 0, y: 0, width: 50, height: 50, scale_x: 1, scale_y: 1, rotation: 0, layer: 'tokens', texture_path: '/orc.png', color: '#000', visible: true };

      let id: string | undefined;
      act(() => { id = result.current.createSprite(spriteData); });

      expect(id).toMatch(/^sprite_/);
      expect(capturedTableSync!.send_sprite_create).toHaveBeenCalledOnce();
    });
  });

  describe('handleNetworkMessage', () => {
    it('routes table_data type to handle_table_data', async () => {
      const { result } = await initHook();
      const tableData = makeTableData();

      act(() => { result.current.handleNetworkMessage('table_data', { data: tableData }); });

      expect(capturedTableSync!.handle_table_data).toHaveBeenCalledWith(tableData);
    });

    it('routes table_response type to handle_table_data', async () => {
      const { result } = await initHook();
      const tableData = makeTableData();

      act(() => { result.current.handleNetworkMessage('table_response', { table_data: tableData }); });

      expect(capturedTableSync!.handle_table_data).toHaveBeenCalledWith(tableData);
    });

    it('routes sprite_update to handle_sprite_update', async () => {
      const { result } = await initHook();
      const update = { sprite_id: 's1', table_id: 'tbl-1', update_type: 'sprite_move', data: {} };

      act(() => { result.current.handleNetworkMessage('sprite_update', update); });

      expect(capturedTableSync!.handle_sprite_update).toHaveBeenCalledWith(update);
    });

    it('routes table_update with sprite category', async () => {
      const { result } = await initHook();

      act(() => {
        result.current.handleNetworkMessage('table_update', {
          category: 'sprite',
          type: 'sprite_move',
          data: { sprite_id: 's1', table_id: 'tbl-1' },
        });
      });

      expect(capturedTableSync!.handle_sprite_update).toHaveBeenCalledOnce();
    });
  });

  describe('window event forwarding', () => {
    it('table-data-received with table_data forwards to WASM', async () => {
      await initHook();

      act(() => {
        window.dispatchEvent(new CustomEvent('table-data-received', {
          detail: { table_data: makeTableData() },
        }));
      });

      expect(capturedTableSync!.handle_table_data).toHaveBeenCalledOnce();
    });

    it('table-response with table_data forwards to WASM', async () => {
      await initHook();

      act(() => {
        window.dispatchEvent(new CustomEvent('table-response', {
          detail: { table_data: makeTableData() },
        }));
      });

      expect(capturedTableSync!.handle_table_data).toHaveBeenCalledOnce();
    });

    it('new-table-response with table_data forwards to WASM', async () => {
      await initHook();

      act(() => {
        window.dispatchEvent(new CustomEvent('new-table-response', {
          detail: { table_data: makeTableData() },
        }));
      });

      expect(capturedTableSync!.handle_table_data).toHaveBeenCalledOnce();
    });

    it('sprite-updated event forwards to WASM', async () => {
      await initHook();

      act(() => {
        window.dispatchEvent(new CustomEvent('sprite-updated', {
          detail: { sprite_id: 's1', update_type: 'sprite_move', data: {} },
        }));
      });

      expect(capturedTableSync!.handle_sprite_update).toHaveBeenCalledOnce();
    });
  });
});
