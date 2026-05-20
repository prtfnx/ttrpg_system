import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpriteSyncService } from '../spriteSync.service';

vi.mock('@/store', () => ({
  useGameStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({
      sprites: [],
      addSprite: vi.fn(),
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
    set_light_color: vi.fn(),
    set_light_intensity: vi.fn(),
    set_light_radius: vi.fn(),
    toggle_light: vi.fn(),
    add_fog_rectangle: vi.fn(),
    create_polygon_sprite: vi.fn(),
    add_sprite_to_layer: vi.fn(),
    remove_sprite: vi.fn(),
    set_sprite_position: vi.fn(() => true),
    rotate_sprite: vi.fn(),
  };
}

describe('SpriteSyncService', () => {
  let engine: ReturnType<typeof makeEngine>;
  let service: SpriteSyncService;

  beforeEach(() => {
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
    it('routes __LIGHT__ with layer=light to add_light', () => {
      service.addSpriteToWasm({ texture_path: '__LIGHT__', layer: 'light', sprite_id: 'l1', x: 10, y: 20 });
      expect(engine.add_light).toHaveBeenCalledWith('l1', 10, 20);
      expect(engine.add_sprite_to_layer).not.toHaveBeenCalled();
    });

    it('routes __FOG_HIDE__ to add_fog_rectangle with hide mode', () => {
      service.addSpriteToWasm({ texture_path: '__FOG_HIDE__', sprite_id: 'f1', x: 0, y: 0, scale_x: 100, scale_y: 100 });
      expect(engine.add_fog_rectangle).toHaveBeenCalledWith('f1', 0, 0, 100, 100, 'hide');
    });

    it('routes __FOG_REVEAL__ to add_fog_rectangle with reveal mode', () => {
      service.addSpriteToWasm({ texture_path: '__FOG_REVEAL__', sprite_id: 'f2', x: 5, y: 5, scale_x: 50, scale_y: 50 });
      expect(engine.add_fog_rectangle).toHaveBeenCalledWith('f2', 5, 5, 55, 55, 'reveal');
    });

    it('routes polygon obstacle to create_polygon_sprite', () => {
      const verts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }];
      service.addSpriteToWasm({ obstacle_type: 'polygon', polygon_vertices: verts });
      expect(engine.create_polygon_sprite).toHaveBeenCalled();
    });

    it('routes regular sprite to add_sprite_to_layer', () => {
      service.addSpriteToWasm({ texture_path: 'hero.png', sprite_id: 's1', layer: 'tokens', x: 5, y: 5 });
      expect(engine.add_sprite_to_layer).toHaveBeenCalledWith('tokens', expect.objectContaining({ id: 's1' }));
    });

    it('is a no-op when engine is null', () => {
      const nullService = new SpriteSyncService(() => null, mockAssetSync as never);
      expect(() => nullService.addSpriteToWasm({ texture_path: 'x.png' })).not.toThrow();
      expect(engine.add_sprite_to_layer).not.toHaveBeenCalled();
    });

    it('__LIGHT__ without layer=light falls through to regular sprite path', () => {
      service.addSpriteToWasm({ texture_path: '__LIGHT__', layer: 'tokens', sprite_id: 's2' });
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
        detail: { sprite_id: 'x1', texture_path: 'img.png', layer: 'tokens', x: 1, y: 2 },
      }));
      expect(engine.add_sprite_to_layer).toHaveBeenCalled();
    });

    it('sprite-removed dispatches remove_sprite', () => {
      window.dispatchEvent(new CustomEvent('sprite-removed', { detail: { sprite_id: 'x1' } }));
      expect(engine.remove_sprite).toHaveBeenCalledWith('x1');
    });

    it('sprite-revert move operation calls set_sprite_position', () => {
      window.dispatchEvent(new CustomEvent('sprite-revert', {
        detail: { spriteId: 'x1', operation: 'move', originalState: { x: 5, y: 10 } },
      }));
      expect(engine.set_sprite_position).toHaveBeenCalledWith('x1', 5, 10);
    });

    it('sprite-revert rotate operation calls rotate_sprite', () => {
      window.dispatchEvent(new CustomEvent('sprite-revert', {
        detail: { spriteId: 'x1', operation: 'rotate', originalState: { rotation: 45 } },
      }));
      expect(engine.rotate_sprite).toHaveBeenCalledWith('x1', 45);
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
        detail: { sprite_id: 'opt-1', texture_path: 'unit.png', layer: 'tokens', x: 0, y: 0 },
      }));
      expect(engine.add_sprite_to_layer).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('sprite-created with __LIGHT__ calls add_light', () => {
      window.dispatchEvent(new CustomEvent('sprite-created', {
        detail: { sprite_id: 'l2', texture_path: '__LIGHT__', layer: 'light', x: 0, y: 0 },
      }));
      expect(engine.add_light).toHaveBeenCalledWith('l2', 0, 0);
    });

    it('sprite-removed with no sprite_id is a no-op', () => {
      window.dispatchEvent(new CustomEvent('sprite-removed', { detail: {} }));
      expect(engine.remove_sprite).not.toHaveBeenCalled();
    });
  });
});
