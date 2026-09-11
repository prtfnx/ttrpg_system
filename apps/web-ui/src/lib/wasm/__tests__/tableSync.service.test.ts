import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/store', () => ({
  useGameStore: Object.assign(vi.fn(), { getState: vi.fn() }),
}));

import { useGameStore } from '@/store';
import { TableSyncService } from '../tableSync.service';

const TABLE_A = '550e8400-e29b-41d4-a716-446655440000';
const TABLE_B = '550e8400-e29b-41d4-a716-446655440001';

const mockEngine = {
  handle_table_data: vi.fn(),
  set_grid_size: vi.fn(),
  set_grid_enabled: vi.fn(),
  set_grid_snapping: vi.fn(),
  set_layer_visibility: vi.fn(),
  set_background_color: vi.fn(),
  clear_walls: vi.fn(),
  add_wall: vi.fn(),
};

const mockSpriteSync = { addSpriteToWasm: vi.fn() };

const mockGameState = {
  tables: [] as Array<Record<string, unknown>>,
  activeTableId: null as string | null,
  setTables: vi.fn(),
  reconcileTableIdentity: vi.fn(),
  setActiveTableId: vi.fn(),
  hydrateTableSprites: vi.fn(),
};

const getState = useGameStore.getState as ReturnType<typeof vi.fn>;

function tableSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    table_id: TABLE_A,
    table_name: 'Cave',
    width: 1200,
    height: 800,
    scale: [1, 1],
    position: [0, 0],
    grid_cell_px: 50,
    cell_distance: 5,
    distance_unit: 'ft',
    grid_enabled: true,
    snap_to_grid: true,
    layers: {},
    walls: [],
    ...overrides,
  };
}

function makeService(engine: unknown = mockEngine) {
  return new TableSyncService(() => engine as never, mockSpriteSync as never);
}

function dispatch(type: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGameState.tables = [];
  mockGameState.activeTableId = null;
  getState.mockImplementation(() => mockGameState);
});

describe('TableSyncService', () => {
  describe('lifecycle', () => {
    it('registers listeners once and removes them on dispose', () => {
      const service = makeService();
      service.init();
      service.init();

      dispatch('table-data-received', tableSnapshot());
      expect(mockEngine.handle_table_data).toHaveBeenCalledOnce();

      service.dispose();
      dispatch('table-data-received', tableSnapshot());
      expect(mockEngine.handle_table_data).toHaveBeenCalledOnce();
    });

    it('does not apply a snapshot without a renderer', () => {
      const service = makeService(null);
      service.init();
      dispatch('table-data-received', tableSnapshot());
      expect(mockEngine.handle_table_data).not.toHaveBeenCalled();
      service.dispose();
    });
  });

  describe('authoritative hydration', () => {
    it('normalizes a server snapshot and applies it once through RenderEngine', () => {
      const service = makeService();
      service.init();
      dispatch('table-data-received', tableSnapshot({
        position: [-12, 4],
        grid_cell_px: 64,
        grid_enabled: false,
        snap_to_grid: false,
        layers: {
          tokens: {
            '9': {
              sprite_id: 'sprite-9',
              position: [0, 25],
              texture_path: null,
              scale_x: 1,
              scale_y: 1,
              width: 0,
              height: 50,
            },
          },
        },
      }));

      expect(mockEngine.handle_table_data).toHaveBeenCalledWith(expect.objectContaining({
        table_id: TABLE_A,
        scale: 1,
        x_moved: -12,
        y_moved: 4,
        grid_cell_px: 64,
        show_grid: false,
        layers: expect.objectContaining({
          tokens: [expect.objectContaining({
            sprite_id: 'sprite-9',
            coord_x: 0,
            coord_y: 25,
            texture_path: '',
          })],
        }),
      }));
      expect(mockSpriteSync.addSpriteToWasm).not.toHaveBeenCalled();
      expect(mockGameState.hydrateTableSprites).toHaveBeenCalledWith(TABLE_A, [
        expect.objectContaining({ id: 'sprite-9', tableId: TABLE_A, x: 0, y: 25 }),
      ]);
      expect(mockEngine.set_grid_enabled).toHaveBeenCalledWith(false);
      expect(mockEngine.set_grid_snapping).toHaveBeenCalledWith(false);
      expect(mockGameState.setActiveTableId).toHaveBeenCalledWith(TABLE_A);
      service.dispose();
    });

    it('uses an explicit post-stage only for special light and fog records', () => {
      const service = makeService();
      service.init();
      dispatch('table-data-received', tableSnapshot({
        layers: {
          light: [{ sprite_id: 'light-1', texture_path: '__LIGHT__', position: [5, 6] }],
          fog_of_war: [{ sprite_id: 'fog-1', texture_path: '__FOG_HIDE__', position: [1, 2] }],
        },
      }));

      const rendererInput = mockEngine.handle_table_data.mock.calls[0][0];
      expect(rendererInput.layers.light).toEqual([]);
      expect(rendererInput.layers.fog_of_war).toEqual([]);
      expect(mockSpriteSync.addSpriteToWasm).toHaveBeenCalledTimes(2);
      service.dispose();
    });

    it('applies walls, visibility, and background settings after successful hydration', () => {
      const service = makeService();
      service.init();
      dispatch('table-response', {
        table_data: tableSnapshot({
          layer_visibility: { tokens: false },
          background_color_hex: '#112233',
          walls: [{
            wall_id: 'wall-1', x1: 0, y1: 1, x2: 10, y2: 11,
            blocks_sound: false,
          }],
        }),
      });

      expect(mockEngine.set_layer_visibility).toHaveBeenCalledWith('tokens', false);
      expect(mockEngine.set_background_color).toHaveBeenCalledWith('#112233');
      expect(mockEngine.clear_walls).toHaveBeenCalledOnce();
      expect(mockEngine.add_wall).toHaveBeenCalledWith(expect.stringContaining('"wall_id":"wall-1"'));
      service.dispose();
    });

    it('validates the complete snapshot before changing the current renderer state', () => {
      const service = makeService();
      service.init();
      dispatch('table-data-received', tableSnapshot());
      dispatch('table-data-received', tableSnapshot({ scale: [1, 2] }));
      dispatch('table-data-received', { table_name: 'Missing ID' });

      expect(mockEngine.handle_table_data).toHaveBeenCalledOnce();
      expect(mockEngine.clear_walls).toHaveBeenCalledOnce();
      expect(mockGameState.setActiveTableId).toHaveBeenCalledOnce();
      service.dispose();
    });

    it('ignores a late response after the user requests another table', () => {
      mockGameState.activeTableId = TABLE_B;
      const service = makeService();
      service.init();
      dispatch('table-response', { table_data: tableSnapshot({ table_id: TABLE_A }) });

      expect(mockEngine.handle_table_data).not.toHaveBeenCalled();
      expect(mockGameState.setActiveTableId).not.toHaveBeenCalled();
      service.dispose();
    });

    it('reconciles a pending local summary with the server-assigned ID', () => {
      const localId = 'local_pending';
      mockGameState.activeTableId = localId;
      mockGameState.tables = [{ table_id: localId, table_name: 'Pending', width: 100, height: 100 }];
      const service = makeService();
      service.init();
      dispatch('new-table-response', {
        local_table_id: localId,
        table_data: tableSnapshot({ table_id: TABLE_A, table_name: 'Created' }),
      });

      expect(mockGameState.reconcileTableIdentity).toHaveBeenCalledWith(localId, {
        table_id: TABLE_A,
        table_name: 'Created',
        width: 1200,
        height: 800,
      });
      expect(mockGameState.setActiveTableId).toHaveBeenCalledWith(TABLE_A);
      service.dispose();
    });

    it('retains an early snapshot and hydrates it after a renderer is attached', () => {
      let engine: typeof mockEngine | null = null;
      const onHydrated = vi.fn();
      const service = new TableSyncService(
        () => engine as never,
        mockSpriteSync as never,
        { onHydrated },
      );
      service.init();
      dispatch('table-data-received', tableSnapshot());
      expect(mockEngine.handle_table_data).not.toHaveBeenCalled();

      engine = mockEngine;
      service.flushPending();
      expect(mockEngine.handle_table_data).toHaveBeenCalledOnce();
      expect(onHydrated).toHaveBeenCalledWith(TABLE_A);
      service.dispose();
    });

    it('reports validation failures through the hydration lifecycle callback', () => {
      const onHydrationError = vi.fn();
      const service = new TableSyncService(
        () => mockEngine as never,
        mockSpriteSync as never,
        { onHydrationError },
      );
      service.init();
      dispatch('table-data-received', tableSnapshot({ scale: [1, 2] }));

      expect(onHydrationError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('non-uniform'),
      }));
      service.dispose();
    });
  });

  describe('partial updates', () => {
    it('applies supported nested grid settings without treating them as snapshots', () => {
      const service = makeService();
      service.init();
      dispatch('table-updated', {
        category: 'table',
        type: 'table_update',
        data: { table_id: TABLE_A, grid_size: 40, grid_enabled: false, grid_snapping: true },
      });

      expect(mockEngine.set_grid_size).toHaveBeenCalledWith(40);
      expect(mockEngine.set_grid_enabled).toHaveBeenCalledWith(false);
      expect(mockEngine.set_grid_snapping).toHaveBeenCalledWith(true);
      expect(mockEngine.handle_table_data).not.toHaveBeenCalled();
      service.dispose();
    });
  });
});
