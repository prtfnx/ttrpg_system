import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFpsGetMetrics = vi.hoisted(() => vi.fn(() => ({ current: 60, average: 60, min: 55, max: 65, frameTime: 16.7 })));

vi.mock('../fps.service', () => ({
  default: { getMetrics: mockFpsGetMetrics },
}));

import { performanceService, PerformanceLevel } from '../performance.service';

type Svc = typeof performanceService & Record<string, unknown>;

function resetSvc() {
  const s = performanceService as Svc;
  s['isMonitoring'] = false;
  if (s['monitoringInterval']) { clearInterval(s['monitoringInterval'] as number); s['monitoringInterval'] = null; }
  s['renderEngine'] = null;
  s['spriteCache'] = new Map();
  s['textureCache'] = new Map();
  s['cacheHits'] = 0;
  s['cacheRequests'] = 0;
  s['performanceLog'] = [];
  s['frameTimeHistory'] = [];
  s['lastOptimizationTime'] = 0;
  localStorage.clear();
}

beforeEach(() => {
  vi.useFakeTimers();
  resetSvc();
  vi.clearAllMocks();
});

afterEach(() => {
  performanceService.stopMonitoring();
  vi.useRealTimers();
});

describe('PerformanceService', () => {
  describe('getMetrics / getSettings', () => {
    it('returns a metrics copy', () => {
      const m = performanceService.getMetrics();
      expect(m).toHaveProperty('fps');
      expect(m).toHaveProperty('memoryUsage');
      // Mutating result does not affect internal state
      m.fps = 999;
      expect(performanceService.getMetrics().fps).not.toBe(999);
    });

    it('returns a settings copy', () => {
      const s = performanceService.getSettings();
      expect(s).toHaveProperty('level');
      expect(s).toHaveProperty('maxSprites');
      s.maxSprites = 99999;
      expect(performanceService.getSettings().maxSprites).not.toBe(99999);
    });
  });

  describe('startMonitoring / stopMonitoring', () => {
    it('startMonitoring sets isMonitoring=true', () => {
      performanceService.startMonitoring();
      expect((performanceService as Svc)['isMonitoring']).toBe(true);
    });

    it('startMonitoring is idempotent', () => {
      performanceService.startMonitoring();
      const interval = (performanceService as Svc)['monitoringInterval'];
      performanceService.startMonitoring();
      expect((performanceService as Svc)['monitoringInterval']).toBe(interval);
    });

    it('stopMonitoring sets isMonitoring=false and clears interval', () => {
      performanceService.startMonitoring();
      performanceService.stopMonitoring();
      expect((performanceService as Svc)['isMonitoring']).toBe(false);
      expect((performanceService as Svc)['monitoringInterval']).toBeNull();
    });

    it('stopMonitoring is idempotent when already stopped', () => {
      expect(() => performanceService.stopMonitoring()).not.toThrow();
    });

    it('monitoring interval fires updateMetrics', () => {
      performanceService.startMonitoring();
      vi.advanceTimersByTime(300); // one 250ms tick
      const m = performanceService.getMetrics();
      expect(m.fps).toBe(60); // from fpsService mock
    });
  });

  describe('initialize', () => {
    it('sets renderEngine and starts monitoring', () => {
      const engine = { set_max_sprites: vi.fn(), set_texture_quality: vi.fn(), enable_sprite_pooling: vi.fn(), enable_frustum_culling: vi.fn(), set_max_render_distance: vi.fn() };
      performanceService.initialize(engine as never);
      expect((performanceService as Svc)['renderEngine']).toBe(engine);
      expect((performanceService as Svc)['isMonitoring']).toBe(true);
    });

    it('calls render engine optimization methods on initialize', () => {
      const engine = { set_max_sprites: vi.fn(), set_texture_quality: vi.fn(), enable_sprite_pooling: vi.fn(), enable_frustum_culling: vi.fn(), set_max_render_distance: vi.fn() };
      performanceService.initialize(engine as never);
      expect(engine.set_max_sprites).toHaveBeenCalled();
      expect(engine.enable_frustum_culling).toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    it('merges partial settings', () => {
      const before = performanceService.getSettings().enableVSync;
      performanceService.updateSettings({ enableVSync: !before });
      expect(performanceService.getSettings().enableVSync).toBe(!before);
    });

    it('persists settings to localStorage', () => {
      performanceService.updateSettings({ maxSprites: 123 });
      const saved = JSON.parse(localStorage.getItem('ttrpg_performance_settings')!);
      expect(saved.maxSprites).toBe(123);
    });
  });

  describe('sprite cache', () => {
    it('caches and retrieves sprite data', () => {
      performanceService.cacheSprite('s1', { texture: 'abc' });
      expect(performanceService.getCachedSprite('s1')).toEqual({ texture: 'abc' });
    });

    it('returns null for cache miss', () => {
      expect(performanceService.getCachedSprite('missing')).toBeNull();
    });

    it('tracks cache hit rate in metrics', () => {
      performanceService.cacheSprite('s1', {});
      performanceService.getCachedSprite('s1');    // hit
      performanceService.getCachedSprite('nope'); // miss
      // advance timer to let updateMetrics run
      performanceService.startMonitoring();
      vi.advanceTimersByTime(300);
      const m = performanceService.getMetrics();
      expect(m.cacheHitRate).toBe(50); // 1 hit / 2 requests
    });

    it('clearSpriteCache empties the cache', () => {
      performanceService.cacheSprite('s1', {});
      performanceService.clearSpriteCache();
      expect(performanceService.getCachedSprite('s1')).toBeNull();
    });
  });

  describe('texture cache', () => {
    it('caches and retrieves texture data', () => {
      performanceService.cacheTexture('t1', { width: 64, height: 64 });
      expect(performanceService.getCachedTexture('t1')).toEqual({ width: 64, height: 64 });
    });

    it('returns null for cache miss', () => {
      expect(performanceService.getCachedTexture('missing')).toBeNull();
    });

    it('clearTextureCache empties the cache', () => {
      performanceService.cacheTexture('t1', {});
      performanceService.clearTextureCache();
      expect(performanceService.getCachedTexture('t1')).toBeNull();
    });
  });

  describe('getPerformanceHistory', () => {
    it('returns empty array initially', () => {
      expect(performanceService.getPerformanceHistory()).toEqual([]);
    });

    it('records entries after monitoring interval fires', () => {
      performanceService.startMonitoring();
      vi.advanceTimersByTime(600); // two 250ms ticks
      const history = performanceService.getPerformanceHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('metrics');
    });

    it('returns a copy (mutation safe)', () => {
      performanceService.startMonitoring();
      vi.advanceTimersByTime(300);
      const h = performanceService.getPerformanceHistory();
      h.length = 0;
      expect(performanceService.getPerformanceHistory().length).toBeGreaterThan(0);
    });
  });

  describe('generateReport', () => {
    it('returns a non-empty string', () => {
      const report = performanceService.generateReport();
      expect(typeof report).toBe('string');
      expect(report.length).toBeGreaterThan(0);
    });

    it('includes FPS and memory info', () => {
      const report = performanceService.generateReport();
      expect(report).toContain('FPS');
      expect(report).toContain('Memory');
    });

    it('includes performance level', () => {
      const report = performanceService.generateReport();
      expect(report).toContain('Performance Level');
    });
  });

  describe('dispose', () => {
    it('stops monitoring and clears caches', () => {
      performanceService.startMonitoring();
      performanceService.cacheSprite('s1', {});
      performanceService.cacheTexture('t1', {});
      performanceService.dispose();
      expect((performanceService as Svc)['isMonitoring']).toBe(false);
      expect(performanceService.getCachedSprite('s1')).toBeNull();
      expect(performanceService.getCachedTexture('t1')).toBeNull();
    });
  });

  describe('PerformanceLevel auto-optimization', () => {
    it('downgrades from HIGH to MEDIUM when average FPS too low', () => {
      performanceService.updateSettings({ level: PerformanceLevel.HIGH });
      // Set far in the past so cooldown (10s) is not blocking
      (performanceService as Svc)['lastOptimizationTime'] = -1e9;
      // averageFPS < targetFPS * 0.7 → HIGH target=60, threshold=42
      mockFpsGetMetrics.mockReturnValue({ current: 10, average: 10, min: 10, max: 10, frameTime: 100 });
      performanceService.startMonitoring();
      vi.advanceTimersByTime(300);
      expect(performanceService.getSettings().level).toBe(PerformanceLevel.MEDIUM);
    });

    it('upgrades from LOW to MEDIUM when FPS is high and memory is free', () => {
      performanceService.updateSettings({ level: PerformanceLevel.LOW });
      (performanceService as Svc)['lastOptimizationTime'] = -1e9;
      // averageFPS > targetFPS * 1.5 → LOW target=30, threshold=45
      mockFpsGetMetrics.mockReturnValue({ current: 90, average: 90, min: 90, max: 90, frameTime: 11 });
      ((performanceService as Svc)['metrics'] as unknown as Record<string, unknown>)['memoryUsage'] =
        { usedJSHeapSize: 100, totalJSHeapSize: 1000, jsHeapSizeLimit: 10000 };
      performanceService.startMonitoring();
      vi.advanceTimersByTime(300);
      expect(performanceService.getSettings().level).toBe(PerformanceLevel.MEDIUM);
    });
  });
});
