import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performanceOptimizedBackgroundSystem } from '../performanceOptimizedBackground.service';
import type { BackgroundConfiguration } from '../performanceOptimizedBackground.service';

// jsdom provides no real WebGL — canvas.getContext('webgl2') returns null
// so constructor sets performanceProfile = 'low' automatically

// Shared reset helper — the singleton keeps state between tests
function resetSystem() {
  (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).configurations = new Map();
  (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).activeConfiguration = null;
  (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).renderEngine = null;
  (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).animationFrame = null;
  // Restore default config that constructor would have created
  const def = buildDefaultConfig();
  (performanceOptimizedBackgroundSystem as unknown as Record<string, Map<string, unknown>>).configurations.set('default', def);
}

function buildDefaultConfig(): BackgroundConfiguration {
  return {
    id: 'default',
    name: 'Default Background',
    description: 'Basic background configuration',
    layers: [
      {
        id: 'base',
        name: 'Base Layer',
        textureUrl: '/assets/bg.jpg',
        width: 1024,
        height: 1024,
        opacity: 1.0,
        parallaxFactor: 1.0,
        repeat: 'repeat',
        blendMode: 'normal',
        animated: false,
        visible: true,
        zIndex: 0,
      },
    ],
    weatherEffects: [],
    ambientColor: '#ffffff',
    globalOpacity: 1.0,
    performanceProfile: 'low',
    streamingEnabled: true,
    maxTextureSize: 1024,
    compressionEnabled: false,
  };
}

function buildConfig(id: string): BackgroundConfiguration {
  return { ...buildDefaultConfig(), id, name: `Config ${id}` };
}

describe('PerformanceOptimizedBackgroundSystem (singleton)', () => {
  beforeEach(() => {
    resetSystem();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('performanceProfile is detected from device capabilities', () => {
      // jsdom WebGL returns a context stub without RENDERER/VENDOR → 'medium' fallback
      const profile = (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).performanceProfile;
      expect(['low', 'medium', 'high', 'ultra']).toContain(profile);
    });

    it('default configuration is created on construction', () => {
      const configs = (performanceOptimizedBackgroundSystem as unknown as Record<string, Map<string, unknown>>).configurations;
      expect(configs.has('default')).toBe(true);
    });
  });

  // ── getPerformanceMetrics ─────────────────────────────────────────────────

  describe('getPerformanceMetrics', () => {
    it('returns a copy — not the internal reference', () => {
      const a = performanceOptimizedBackgroundSystem.getPerformanceMetrics();
      const b = performanceOptimizedBackgroundSystem.getPerformanceMetrics();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('mutation of returned object does not affect internal metrics', () => {
      const metrics = performanceOptimizedBackgroundSystem.getPerformanceMetrics();
      metrics.fps = 9999;
      const again = performanceOptimizedBackgroundSystem.getPerformanceMetrics();
      expect(again.fps).not.toBe(9999);
    });
  });

  // ── setPerformanceProfile ─────────────────────────────────────────────────

  describe('setPerformanceProfile', () => {
    it('updates the performance profile', () => {
      performanceOptimizedBackgroundSystem.setPerformanceProfile('high');
      const profile = (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).performanceProfile;
      expect(profile).toBe('high');
    });

    it('accepts all valid profiles', () => {
      for (const p of ['low', 'medium', 'high', 'ultra'] as const) {
        performanceOptimizedBackgroundSystem.setPerformanceProfile(p);
        const stored = (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).performanceProfile;
        expect(stored).toBe(p);
      }
    });
  });

  // ── setStreamingEnabled ───────────────────────────────────────────────────

  describe('setStreamingEnabled', () => {
    it('updates streaming options flag', () => {
      performanceOptimizedBackgroundSystem.setStreamingEnabled(false);
      const opts = (performanceOptimizedBackgroundSystem as unknown as Record<string, { enabled: boolean }>).streamingOptions;
      expect(opts.enabled).toBe(false);
    });

    it('re-enables streaming', () => {
      performanceOptimizedBackgroundSystem.setStreamingEnabled(false);
      performanceOptimizedBackgroundSystem.setStreamingEnabled(true);
      const opts = (performanceOptimizedBackgroundSystem as unknown as Record<string, { enabled: boolean }>).streamingOptions;
      expect(opts.enabled).toBe(true);
    });
  });

  // ── updateZoom (LOD threshold) ────────────────────────────────────────────

  describe('updateZoom', () => {
    it('does not update when change is below threshold (0.1)', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, number>).currentZoom = 1.0;
      const before = (performanceOptimizedBackgroundSystem as unknown as Record<string, number>).currentZoom;
      performanceOptimizedBackgroundSystem.updateZoom(1.05); // delta = 0.05 < 0.1
      const after = (performanceOptimizedBackgroundSystem as unknown as Record<string, number>).currentZoom;
      expect(after).toBe(before);
    });

    it('updates zoom when change exceeds threshold', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, number>).currentZoom = 1.0;
      performanceOptimizedBackgroundSystem.updateZoom(1.2); // delta = 0.2 > 0.1
      const after = (performanceOptimizedBackgroundSystem as unknown as Record<string, number>).currentZoom;
      expect(after).toBe(1.2);
    });
  });

  // ── setActiveConfiguration (error paths) ─────────────────────────────────

  describe('setActiveConfiguration', () => {
    it('throws when config id is not found', async () => {
      await expect(performanceOptimizedBackgroundSystem.setActiveConfiguration('nonexistent'))
        .rejects.toThrow("Background configuration 'nonexistent' not found");
    });

    it('throws when renderEngine is not initialized', async () => {
      const configs = (performanceOptimizedBackgroundSystem as unknown as Record<string, Map<string, unknown>>).configurations;
      configs.set('test-cfg', buildConfig('test-cfg'));
      await expect(performanceOptimizedBackgroundSystem.setActiveConfiguration('test-cfg'))
        .rejects.toThrow('Render engine not initialized');
    });
  });

  // ── addWeatherEffect / removeWeatherEffect ────────────────────────────────

  describe('addWeatherEffect', () => {
    it('throws when no active configuration', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).activeConfiguration = null;
      expect(() =>
        performanceOptimizedBackgroundSystem.addWeatherEffect({
          id: 'rain', type: 'rain', intensity: 0.5, direction: { x: 0, y: 1 },
          speed: 1, particleCount: 100, opacity: 0.8, color: '#fff', enabled: true,
        })
      ).toThrow('No active background configuration');
    });

    it('adds weather effect to active config', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).activeConfiguration = 'default';
      performanceOptimizedBackgroundSystem.addWeatherEffect({
        id: 'snow', type: 'snow', intensity: 0.3, direction: { x: 0, y: 1 },
        speed: 0.5, particleCount: 50, opacity: 0.6, color: '#eee', enabled: true,
      });
      const cfg = (performanceOptimizedBackgroundSystem as unknown as Record<string, Map<string, BackgroundConfiguration>>)
        .configurations.get('default')!;
      expect(cfg.weatherEffects.find(e => e.id === 'snow')).toBeDefined();
    });

    it('replaces effect with same id', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).activeConfiguration = 'default';
      const effect = { id: 'wind', type: 'wind' as const, intensity: 0.2, direction: { x: 1, y: 0 }, speed: 2, particleCount: 10, opacity: 0.5, color: '#aaa', enabled: true };
      performanceOptimizedBackgroundSystem.addWeatherEffect(effect);
      performanceOptimizedBackgroundSystem.addWeatherEffect({ ...effect, intensity: 0.9 });
      const cfg = (performanceOptimizedBackgroundSystem as unknown as Record<string, Map<string, BackgroundConfiguration>>)
        .configurations.get('default')!;
      const winds = cfg.weatherEffects.filter(e => e.id === 'wind');
      expect(winds).toHaveLength(1);
      expect(winds[0].intensity).toBe(0.9);
    });
  });

  describe('removeWeatherEffect', () => {
    it('is a no-op when no active configuration', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).activeConfiguration = null;
      expect(() => performanceOptimizedBackgroundSystem.removeWeatherEffect('rain')).not.toThrow();
    });

    it('removes a weather effect from active config', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).activeConfiguration = 'default';
      performanceOptimizedBackgroundSystem.addWeatherEffect({
        id: 'fog', type: 'fog', intensity: 0.7, direction: { x: 0, y: 0 },
        speed: 0.1, particleCount: 200, opacity: 0.4, color: '#ccc', enabled: true,
      });
      performanceOptimizedBackgroundSystem.removeWeatherEffect('fog');
      const cfg = (performanceOptimizedBackgroundSystem as unknown as Record<string, Map<string, BackgroundConfiguration>>)
        .configurations.get('default')!;
      expect(cfg.weatherEffects.find(e => e.id === 'fog')).toBeUndefined();
    });
  });

  // ── updateBackgroundLayer ─────────────────────────────────────────────────

  describe('updateBackgroundLayer', () => {
    it('is a no-op when no active configuration', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).activeConfiguration = null;
      expect(() => performanceOptimizedBackgroundSystem.updateBackgroundLayer('base', { opacity: 0.5 })).not.toThrow();
    });

    it('throws when layer id is not found', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).activeConfiguration = 'default';
      expect(() => performanceOptimizedBackgroundSystem.updateBackgroundLayer('nonexistent', { opacity: 0.5 }))
        .toThrow("Background layer 'nonexistent' not found");
    });

    it('applies updates to the correct layer', () => {
      (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).activeConfiguration = 'default';
      performanceOptimizedBackgroundSystem.updateBackgroundLayer('base', { opacity: 0.3 });
      const cfg = (performanceOptimizedBackgroundSystem as unknown as Record<string, Map<string, BackgroundConfiguration>>)
        .configurations.get('default')!;
      expect(cfg.layers.find(l => l.id === 'base')!.opacity).toBe(0.3);
    });
  });

  // ── cleanup ───────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('clears configurations and textures', () => {
      performanceOptimizedBackgroundSystem.cleanup();
      const configs = (performanceOptimizedBackgroundSystem as unknown as Record<string, Map<string, unknown>>).configurations;
      const textures = (performanceOptimizedBackgroundSystem as unknown as Record<string, Map<string, unknown>>).loadedTextures;
      expect(configs.size).toBe(0);
      expect(textures.size).toBe(0);
    });

    it('cancels animationFrame if set', () => {
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
      (performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).animationFrame = 42;
      performanceOptimizedBackgroundSystem.cleanup();
      expect(cancelSpy).toHaveBeenCalledWith(42);
      expect((performanceOptimizedBackgroundSystem as unknown as Record<string, unknown>).animationFrame).toBeNull();
    });
  });
});
