import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store';
import { SpriteSyncService } from '../spriteSync.service';

const mockAddSprite = vi.hoisted(() => vi.fn());
const mockSprites = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@/store', () => ({
  useGameStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({
      sprites: mockSprites,
      addSprite: mockAddSprite,
      moveSprite: vi.fn(),
    })),
    setState: vi.fn(),
  }),
}));

vi.mock('@features/table/services/tableThumbnail.service', () => ({
  tableThumbnailService: { invalidateTable: vi.fn() },
}));

vi.mock('../wasmBridge', () => ({
  wasmBridgeService: { seedSpriteState: vi.fn() },
}));

const mockAssetSync = {
  isAssetPending: vi.fn(() => false),
  trackPendingSprite: vi.fn(),
  requestAssetDownloadLink: vi.fn(),
};

function makeEngine() {
  return {
    add_light: vi.fn(),
    add_light_for_table: vi.fn(),
    set_light_color: vi.fn(),
    set_light_intensity: vi.fn(),
    set_light_radius: vi.fn(),
    set_light_enabled: vi.fn(),
    toggle_light: vi.fn(),
    add_fog_rectangle: vi.fn(),
    create_polygon_sprite: vi.fn(),
    add_sprite_to_layer: vi.fn(),
    remove_sprite: vi.fn(),
    remove_light: vi.fn(),
    remove_fog_rectangle: vi.fn(),
    update_sprite_position: vi.fn(() => true),
    update_light_position: vi.fn(),
    update_sprite_controlled_by: vi.fn(),
    rotate_sprite: vi.fn(),
    resize_sprite: vi.fn(),
    update_sprite_scale: vi.fn(),
    render: vi.fn(),
  };
}

describe('SpriteSyncService', () => {
  let engine: ReturnType<typeof makeEngine>;
  let service: SpriteSyncService;

  beforeEach(() => {
    mockSprites.length = 0;
    engine = makeEngine();
    service = new SpriteSyncService(() => engine as never, mockAssetSync as never);
  });

  afterEach(() => {
    service.dispose();
    vi.clearAllMocks();
  });

  describe('init / dispose', () => {
    it('registers event listeners on init', () => {
      const spy = vi.spyOn(window, 'addEventListener');
      service.init();
      const types = spy.mock.calls.map(c => c[0]);
      expect(types).toContain('sprite-created');
      expect(types).toContain('sprite-moved');
      expect(types).toContain('sprite-removed');
      expect(types).toContain('sprite-revert');
    });

    it('dispose removes all registered listeners', () => {
      service.init();
      const spy = vi.spyOn(window, 'removeEventListener');
      service.dispose();
      expect(spy.mock.calls.length).toBeGreaterThan(0);
    });

    it('does not register duplicate listeners when initialized twice', () => {
      service.init();
      service.init();

      window.dispatchEvent(new CustomEvent('sprite-removed', {
        detail: { sprite_id: 'sprite-1' },
      }));

      expect(engine.remove_sprite).toHaveBeenCalledOnce();
    });

    it('dispose clears pending optimistic timers', () => {
      vi.useFakeTimers();
      service.init();
      service.startOptimisticTimer('temp-id');
      service.dispose();
      vi.advanceTimersByTime(15_000);
      // Timer was cleared — remove_sprite should NOT have been called
      expect(engine.remove_sprite).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('addSpriteToWasm routing', () => {
    it('routes __LIGHT__ with layer=light to an explicitly scoped light', () => {
      service.addSpriteToWasm({ texture_path: '__LIGHT__', layer: 'light', sprite_id: 'l1', table_id: 'tbl1', x: 10, y: 20 });
      expect(engine.add_light_for_table).toHaveBeenCalledWith('l1', 10, 20, 'tbl1');
      expect(engine.set_light_enabled).toHaveBeenCalledWith('l1', true);
      expect(engine.add_sprite_to_layer).not.toHaveBeenCalled();
    });

    it('sets disabled lights idempotently instead of toggling them', () => {
      const light = {
        texture_path: '__LIGHT__', layer: 'light', sprite_id: 'l1', table_id: 'tbl1',
        metadata: JSON.stringify({ isOn: false }),
      };

      service.addSpriteToWasm(light);
      service.addSpriteToWasm(light);

      expect(engine.set_light_enabled).toHaveBeenCalledTimes(2);
      expect(engine.set_light_enabled).toHaveBeenNthCalledWith(1, 'l1', false);
      expect(engine.set_light_enabled).toHaveBeenNthCalledWith(2, 'l1', false);
      expect(engine.toggle_light).not.toHaveBeenCalled();
    });

    it('reconciles remote metadata for an existing light', () => {
      mockSprites.push({
        id: 'remote-light', layer: 'light', texture: '__LIGHT__',
        metadata: JSON.stringify({
          radius: 100, intensity: 0.5,
          color: { r: 1, g: 1, b: 1, a: 1 }, isOn: true,
        }),
      });
      service.init();

      window.dispatchEvent(new CustomEvent('sprite-updated', { detail: {
        sprite_id: 'remote-light', operation: 'metadata',
        updates: { metadata: JSON.stringify({
          radius: 240, intensity: 1.5,
          color: { r: 0.2, g: 0.4, b: 0.8, a: 1 }, isOn: false,
        }) },
      } }));

      expect(engine.set_light_radius).toHaveBeenCalledWith('remote-light', 240);
      expect(engine.set_light_intensity).toHaveBeenCalledWith('remote-light', 1.5);
      expect(engine.set_light_color).toHaveBeenCalledWith('remote-light', 0.2, 0.4, 0.8, 1);
      expect(engine.set_light_enabled).toHaveBeenCalledWith('remote-light', false);
    });

    it('routes __FOG_HIDE__ to add_fog_rectangle with hide mode', () => {
      service.addSpriteToWasm({ texture_path: '__FOG_HIDE__', sprite_id: 'f1', table_id: 'tbl1', x: 0, y: 0, scale_x: 100, scale_y: 100 });
      expect(engine.add_fog_rectangle).toHaveBeenCalledWith('f1', 0, 0, 100, 100, 'hide');
    });

    it('routes __FOG_REVEAL__ to add_fog_rectangle with reveal mode', () => {
      service.addSpriteToWasm({ texture_path: '__FOG_REVEAL__', sprite_id: 'f2', table_id: 'tbl1', x: 5, y: 5, scale_x: 50, scale_y: 50 });
      expect(engine.add_fog_rectangle).toHaveBeenCalledWith('f2', 5, 5, 55, 55, 'reveal');
    });

    it('routes polygon obstacle to add_sprite_to_layer with obstacle_type and normalized vertices', () => {
      const verts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
      service.addSpriteToWasm({ obstacle_type: 'polygon', polygon_vertices: verts, sprite_id: 'poly1', table_id: 'tbl1' });
      expect(engine.add_sprite_to_layer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ id: 'poly1', obstacle_type: 'polygon', polygon_vertices: [[0, 0], [10, 0], [5, 10]] }),
      );
    });

    it('routes polygon obstacle with server array-format vertices correctly', () => {
      // Server sends obstacle_data.vertices as [[x,y]] arrays, not {x,y} objects
      const arrayVerts = [[0, 0], [10, 0], [5, 10]];
      service.addSpriteToWasm({ obstacle_type: 'polygon', obstacle_data: { vertices: arrayVerts as never }, sprite_id: 'poly2', table_id: 'tbl1' });
      expect(engine.add_sprite_to_layer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ id: 'poly2', obstacle_type: 'polygon', polygon_vertices: [[0, 0], [10, 0], [5, 10]] }),
      );
    });

    it('routes regular sprite to add_sprite_to_layer', () => {
      service.addSpriteToWasm({ texture_path: 'hero.png', sprite_id: 's1', table_id: 'tbl1', layer: 'tokens', x: 5, y: 5 });
      expect(engine.add_sprite_to_layer).toHaveBeenCalledWith(
        'tokens',
        expect.objectContaining({ id: 's1', table_id: 'tbl1' }),
      );
    });

    it('uses safe light defaults when metadata JSON is not an object', () => {
      expect(() => service.addSpriteToWasm({
        texture_path: '__LIGHT__',
        layer: 'light',
        sprite_id: 'light-null',
        table_id: 'tbl1',
        metadata: 'null',
      })).not.toThrow();
      expect(engine.set_light_radius).toHaveBeenCalledWith('light-null', 150);
      expect(engine.set_light_intensity).toHaveBeenCalledWith('light-null', 1);
    });

    it('normalizes controller IDs for both WASM and the client store', () => {
      service.addSpriteToWasm({
        texture_path: 'hero.png',
        sprite_id: 'controlled',
        table_id: 'tbl1',
        layer: 'tokens',
        controlled_by: '["4", 7, -1, "invalid"]',
      });

      expect(engine.add_sprite_to_layer).toHaveBeenCalledWith(
        'tokens',
        expect.objectContaining({ controlled_by: [4, 7] }),
      );
      expect(mockAddSprite).toHaveBeenCalledWith(
        expect.objectContaining({ controlledBy: ['4', '7'] }),
      );
    });

    it('does not let non-array controller JSON abort sprite creation', () => {
      expect(() => service.addSpriteToWasm({
        texture_path: 'hero.png',
        sprite_id: 'bad-controllers',
        table_id: 'tbl1',
        layer: 'tokens',
        controlled_by: '{}',
      })).not.toThrow();
      expect(engine.add_sprite_to_layer).toHaveBeenCalledWith(
        'tokens',
        expect.objectContaining({ controlled_by: [] }),
      );
    });

    it('rejects a sprite without an authoritative table_id', () => {
      service.addSpriteToWasm({ texture_path: 'hero.png', sprite_id: 's1', layer: 'tokens' });
      expect(engine.add_sprite_to_layer).not.toHaveBeenCalled();
      expect(engine.add_light).not.toHaveBeenCalled();
      expect(engine.add_fog_rectangle).not.toHaveBeenCalled();
    });

    it('is a no-op when engine is null', () => {
      const nullService = new SpriteSyncService(() => null, mockAssetSync as never);
      expect(() => nullService.addSpriteToWasm({ texture_path: 'x.png' })).not.toThrow();
      expect(engine.add_sprite_to_layer).not.toHaveBeenCalled();
    });

    it('__LIGHT__ without layer=light falls through to regular sprite path', () => {
      service.addSpriteToWasm({ texture_path: '__LIGHT__', layer: 'tokens', sprite_id: 's2', table_id: 'tbl1' });
      // isLight requires BOTH texture_path === '__LIGHT__' AND layer === 'light'
      expect(engine.add_light).not.toHaveBeenCalled();
      expect(engine.add_sprite_to_layer).toHaveBeenCalled();
    });
  });

  describe('optimistic timers', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('clearOptimisticTimer on non-existent id is a no-op', () => {
      expect(() => service.clearOptimisticTimer('nope')).not.toThrow();
    });

    it('clearOptimisticTimer cancels the timer before it fires', () => {
      service.startOptimisticTimer('tmp-2');
      service.clearOptimisticTimer('tmp-2');
      vi.advanceTimersByTime(15_000);
      expect(engine.remove_sprite).not.toHaveBeenCalled();
    });

    it('expired timer calls remove_sprite', () => {
      service.startOptimisticTimer('tmp-3');
      vi.advanceTimersByTime(11_000);
      expect(engine.remove_sprite).toHaveBeenCalledWith('tmp-3');
    });

    it('starting a timer twice replaces the old one', () => {
      service.startOptimisticTimer('tmp-4');
      service.startOptimisticTimer('tmp-4'); // re-registers
      vi.advanceTimersByTime(11_000);
      // Should only fire once
      expect(engine.remove_sprite).toHaveBeenCalledTimes(1);
    });
  });

  describe('event handling via init', () => {
    beforeEach(() => { service.init(); });

    it('sprite-created dispatches add_sprite_to_layer', () => {
      window.dispatchEvent(new CustomEvent('sprite-created', {
        detail: { sprite_id: 'x1', texture_path: 'img.png', layer: 'tokens', table_id: 'tbl1', x: 1, y: 2 },
      }));
      expect(engine.add_sprite_to_layer).toHaveBeenCalled();
    });

    it('sprite-removed dispatches remove_sprite', () => {
      window.dispatchEvent(new CustomEvent('sprite-removed', { detail: { sprite_id: 'x1' } }));
      expect(engine.remove_sprite).toHaveBeenCalledWith('x1');
      expect(engine.remove_light).toHaveBeenCalledWith('x1');
      expect(engine.remove_fog_rectangle).toHaveBeenCalledWith('x1');
      expect(useGameStore.setState).toHaveBeenCalled();
    });

    it('mirrors authoritative resize and rotation events into the store', () => {
      window.dispatchEvent(new CustomEvent('sprite-scaled', {
        detail: { sprite_id: 'x1', width: 80, height: 90, table_id: 'tbl1' },
      }));
      window.dispatchEvent(new CustomEvent('sprite-rotated', {
        detail: { sprite_id: 'x1', rotation: 45, table_id: 'tbl1' },
      }));

      expect(engine.resize_sprite).toHaveBeenCalledWith('x1', 80, 90);
      expect(engine.rotate_sprite).toHaveBeenCalledWith('x1', 45);
      expect(useGameStore.setState).toHaveBeenCalledTimes(2);
    });

    it('sprite-revert move operation restores renderer and store position', () => {
      window.dispatchEvent(new CustomEvent('sprite-revert', {
        detail: { spriteId: 'x1', operation: 'move', originalState: { x: 5, y: 10 } },
      }));
      expect(engine.update_sprite_position).toHaveBeenCalledWith('x1', 5, 10);
      expect(useGameStore.setState).toHaveBeenCalledOnce();
    });

    it('sprite-revert rotate operation calls rotate_sprite', () => {
      window.dispatchEvent(new CustomEvent('sprite-revert', {
        detail: { spriteId: 'x1', operation: 'rotate', originalState: { rotation: 45 } },
      }));
      expect(engine.rotate_sprite).toHaveBeenCalledWith('x1', 45);
      expect(useGameStore.setState).toHaveBeenCalledOnce();
    });

    it('protocol-error clears optimistic timer and removes sprite', () => {
      vi.useFakeTimers();
      service.startOptimisticTimer('tmp-err');
      window.dispatchEvent(new CustomEvent('protocol-error', { detail: { client_temp_id: 'tmp-err' } }));
      expect(engine.remove_sprite).toHaveBeenCalledWith('tmp-err');
      vi.runAllTimers();
      // Should not fire again after being cleared
      expect(engine.remove_sprite).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('optimistic-sprite-create event adds sprite', () => {
      vi.useFakeTimers();
      window.dispatchEvent(new CustomEvent('optimistic-sprite-create', {
        detail: { sprite_id: 'opt-1', texture_path: 'unit.png', layer: 'tokens', table_id: 'tbl1', x: 0, y: 0 },
      }));
      expect(engine.add_sprite_to_layer).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('sprite-created with __LIGHT__ adds a table-scoped light', () => {
      window.dispatchEvent(new CustomEvent('sprite-created', {
        detail: { sprite_id: 'l2', texture_path: '__LIGHT__', layer: 'light', table_id: 'tbl1', x: 0, y: 0 },
      }));
      expect(engine.add_light_for_table).toHaveBeenCalledWith('l2', 0, 0, 'tbl1');
    });

    it('sprite-removed with no sprite_id is a no-op', () => {
      window.dispatchEvent(new CustomEvent('sprite-removed', { detail: {} }));
      expect(engine.remove_sprite).not.toHaveBeenCalled();
    });
  });
});
