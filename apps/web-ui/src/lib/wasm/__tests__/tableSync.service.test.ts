import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/store', () => ({
  useGameStore: Object.assign(
    vi.fn(),
    {
      getState: vi.fn(),
    }
  ),
}));

import { TableSyncService } from '../tableSync.service';
import { useGameStore } from '@/store';

const mockEngine = {
  handle_table_data: vi.fn(),
  set_grid_size: vi.fn(),
  set_grid_enabled: vi.fn(),
  set_grid_snapping: vi.fn(),
  add_sprite_to_layer: vi.fn(),
  clear_all_sprites: vi.fn(),
};

const mockSpriteSync = {
  addSpriteToWasm: vi.fn(),
};

const mockGameState = {
  tables: [],
  activeTableId: null as string | null,
  setTables: vi.fn(),
  switchToTable: vi.fn(),
  setActiveTableId: vi.fn(),
};

const getState = useGameStore.getState as ReturnType<typeof vi.fn>;

function makeService(engine = mockEngine as unknown) {
  return new TableSyncService(
    () => engine as never,
    mockSpriteSync as never,
  );
}

function dispatch(type: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getState.mockReturnValue(mockGameState);
  mockGameState.tables = [];
  mockGameState.activeTableId = null;
});

describe('TableSyncService', () => {
  describe('init / dispose', () => {
    it('listens for table-data-received and table-updated', () => {
      const svc = makeService();
      svc.init();
      dispatch('table-data-received', { table_id: 't1', grid_size: 64 });
      expect(mockEngine.handle_table_data).toHaveBeenCalled();
      svc.dispose();
    });

    it('removes listeners on dispose', () => {
      const svc = makeService();
      svc.init();
      svc.dispose();
      dispatch('table-data-received', { table_id: 't2' });
      // After dispose, handler should not fire again
      expect(mockEngine.handle_table_data).not.toHaveBeenCalled();
    });
  });

  describe('handleTableDataReceived', () => {
    it('skips when engine is null', () => {
      const svc = new TableSyncService(() => null, mockSpriteSync as never);
      svc.init();
      dispatch('table-data-received', { table_id: 't1' });
      expect(mockEngine.handle_table_data).not.toHaveBeenCalled();
      svc.dispose();
    });

    it('calls handle_table_data with defaults', () => {
      const svc = makeService();
      svc.init();
      dispatch('table-data-received', { table_id: 't1', table_name: 'Cave' });
      expect(mockEngine.handle_table_data).toHaveBeenCalledWith(
        expect.objectContaining({ table_id: 't1', table_name: 'Cave' })
      );
      svc.dispose();
    });

    it('sets grid config when provided', () => {
      const svc = makeService();
      svc.init();
      dispatch('table-data-received', {
        table_id: 't1',
        grid_size: 50,
        grid_enabled: false,
        grid_snapping: true,
      });
      expect(mockEngine.set_grid_size).toHaveBeenCalledWith(50);
      expect(mockEngine.set_grid_enabled).toHaveBeenCalledWith(false);
      expect(mockEngine.set_grid_snapping).toHaveBeenCalledWith(true);
      svc.dispose();
    });

    it('loads sprites from layer array structure', () => {
      const svc = makeService();
      svc.init();
      dispatch('table-data-received', {
        table_id: 't1',
        layers: {
          tokens: [{ sprite_id: 's1', x: 0, y: 0 }],
        },
      });
      expect(mockSpriteSync.addSpriteToWasm).toHaveBeenCalled();
      svc.dispose();
    });

    it('loads sprites from flat data.sprites array', () => {
      const svc = makeService();
      svc.init();
      dispatch('table-data-received', {
        table_id: 't1',
        sprites: [{ sprite_id: 's2' }],
      });
      expect(mockSpriteSync.addSpriteToWasm).toHaveBeenCalledWith(expect.objectContaining({ sprite_id: 's2' }));
      svc.dispose();
    });

    it('updates table UUID in store when server returns authoritative UUID', () => {
      mockGameState.tables = [{ table_id: 'temp-id', table_name: 'Forest' }] as never[];
      mockGameState.activeTableId = 'temp-id';
      const svc = makeService();
      svc.init();
      dispatch('table-data-received', {
        table_id: '00000000-0000-4000-8000-000000000001',
        table_name: 'Forest',
      });
      expect(mockGameState.setTables).toHaveBeenCalled();
      svc.dispose();
    });

    it('loads background image when provided', () => {
      const svc = makeService();
      svc.init();
      dispatch('table-data-received', {
        table_id: 't1',
        background_image: '/assets/bg.png',
      });
      expect(mockEngine.add_sprite_to_layer).toHaveBeenCalledWith(
        'background',
        expect.objectContaining({ texture_id: '/assets/bg.png' })
      );
      svc.dispose();
    });

    it('wraps table_data payload', () => {
      const svc = makeService();
      svc.init();
      dispatch('table-response', {
        table_data: { table_id: 't2', table_name: 'Dungeon' },
      });
      expect(mockEngine.handle_table_data).toHaveBeenCalledWith(
        expect.objectContaining({ table_id: 't2' })
      );
      svc.dispose();
    });
  });

  describe('handleTableUpdate', () => {
    it('updates grid settings on table-updated event', () => {
      const svc = makeService();
      svc.init();
      dispatch('table-updated', { grid_size: 32, grid_enabled: true });
      expect(mockEngine.set_grid_size).toHaveBeenCalledWith(32);
      expect(mockEngine.set_grid_enabled).toHaveBeenCalledWith(true);
      svc.dispose();
    });

    it('skips when engine is null', () => {
      const svc = new TableSyncService(() => null, mockSpriteSync as never);
      svc.init();
      dispatch('table-updated', { grid_size: 32 });
      expect(mockEngine.set_grid_size).not.toHaveBeenCalled();
      svc.dispose();
    });
  });
});
