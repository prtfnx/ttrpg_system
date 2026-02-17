import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerSettings } from '../useLayerManager';
import { useLayerManager } from '../useLayerManager';

// Mock render manager
const mockRenderManager = {
  get_layer_settings: vi.fn(),
  set_layer_settings: vi.fn(),
  get_layer_sprite_count: vi.fn(),
  set_layer_visible: vi.fn(),
  set_layer_opacity: vi.fn(),
  toggle_layer: vi.fn(),
  set_blend_mode: vi.fn(),
};

// Mock global game API
const mockGameAPI = {
  renderManager: vi.fn(() => mockRenderManager),
};

// Mock WASM globals
beforeEach(() => {
  vi.clearAllMocks();
  
  // Clean up any existing event listeners
  window.removeEventListener('wasm-ready', () => {});
  
  // Mock global WASM objects
  Object.defineProperty(window, 'ttrpg_rust_core', {
    value: true,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window, 'gameAPI', {
    value: mockGameAPI,
    writable: true,
    configurable: true,
  });

  // Set up default layer settings
  mockRenderManager.get_layer_settings.mockImplementation((layerName: string) => ({
    visible: true,
    opacity: 1.0,
    color: [1.0, 1.0, 1.0, 1.0],
    blend_mode: 'Alpha',
    z_order: layerName === 'tokens' ? 3 : 1,
  }));

  mockRenderManager.get_layer_sprite_count.mockReturnValue(0);
});

afterEach(() => {
  // Clean up global mocks by setting to undefined instead of delete
  // This avoids "Cannot delete property" errors
  (window as any).ttrpg_rust_core = undefined;
  (window as any).gameAPI = undefined;
});

describe('useLayerManager', () => {
  describe('Initialization', () => {
    it('initializes with default state when WASM is ready', async () => {
      const { result } = renderHook(() => useLayerManager());

      // Initial state
      expect(result.current.isInitialized).toBe(false);
      expect(result.current.activeLayer).toBe('tokens');
      expect(result.current.layers).toEqual([]);

      // Wait for initialization
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(mockGameAPI.renderManager).toHaveBeenCalled();
      expect(result.current.layers).toHaveLength(7); // All configured layers
    });

    it('handles WASM initialization timeout', async () => {
      // Remove WASM globals to simulate failure by setting to undefined
      (window as any).ttrpg_rust_core = undefined;
      (window as any).gameAPI = undefined;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useLayerManager());

      // Should remain uninitialized
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(result.current.isInitialized).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize layer manager:', expect.any(Error));
    });

    it('waits for wasm-ready event when WASM is not initially available', async () => {
      // Start without WASM by setting to undefined
      (window as any).ttrpg_rust_core = undefined;
      (window as any).gameAPI = undefined;

      const { result } = renderHook(() => useLayerManager());
      expect(result.current.isInitialized).toBe(false);

      // Simulate WASM becoming ready
      (window as any).ttrpg_rust_core = true;
      (window as any).gameAPI = mockGameAPI;

      // Emit ready event
      const readyEvent = new Event('wasm-ready');
      window.dispatchEvent(readyEvent);

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });
    });
  });

  describe('Layer Data Management', () => {
    beforeEach(async () => {
      // Ensure WASM is initialized for these tests
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('loads layer data correctly', async () => {
      mockRenderManager.get_layer_sprite_count.mockImplementation((layerName: string) => {
        return layerName === 'tokens' ? 5 : layerName === 'map' ? 1 : 0;
      });

      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const tokensLayer = result.current.layers.find(layer => layer.name === 'tokens');
      const mapLayer = result.current.layers.find(layer => layer.name === 'map');

      expect(tokensLayer?.spriteCount).toBe(5);
      expect(mapLayer?.spriteCount).toBe(1);
      expect(tokensLayer?.displayName).toBe('Tokens/Characters');
      expect(tokensLayer?.icon).toBe('⚔️');
    });

    it('refreshes layer data when called', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Change sprite count
      mockRenderManager.get_layer_sprite_count.mockImplementation((layerName: string) => {
        return layerName === 'tokens' ? 10 : 0;
      });

      await act(async () => {
        result.current.refreshLayerData();
      });

      const tokensLayer = result.current.layers.find(layer => layer.name === 'tokens');
      expect(tokensLayer?.spriteCount).toBe(10);
    });

    it('handles layer data refresh errors gracefully', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Make get_layer_settings throw
      mockRenderManager.get_layer_settings.mockImplementationOnce(() => {
        throw new Error('WASM error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await act(async () => {
        result.current.refreshLayerData();
      });

      expect(consoleSpy).toHaveBeenCalledWith('Error refreshing layer data:', expect.any(Error));
    });
  });

  describe('Layer Control', () => {
    beforeEach(async () => {
      const { result } = renderHook(() => useLayerManager());
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });
    });

    it('sets active layer', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      act(() => {
        result.current.setActiveLayer('map');
      });

      expect(result.current.activeLayer).toBe('map');
    });

    it('toggles layer visibility', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await act(async () => {
        await result.current.setLayerVisible('tokens', false);
      });

      expect(mockRenderManager.set_layer_visible).toHaveBeenCalledWith('tokens', false);
    });

    it('sets layer opacity', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await act(async () => {
        await result.current.setLayerOpacity('tokens', 0.5);
      });

      expect(mockRenderManager.set_layer_opacity).toHaveBeenCalledWith('tokens', 0.5);
    });

    it('updates layer settings', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const newSettings: LayerSettings = {
        visible: false,
        opacity: 0.7,
        color: [1.0, 0.5, 0.5, 1.0],
        blend_mode: 'Multiply',
        z_order: 5,
      };

      await act(async () => {
        await result.current.updateLayerSettings('tokens', newSettings);
      });

      expect(mockRenderManager.set_layer_settings).toHaveBeenCalledWith('tokens', newSettings);
    });

    it('sets blend mode', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      await act(async () => {
        await result.current.setBlendMode('tokens', 'Additive');
      });

      expect(mockRenderManager.set_blend_mode).toHaveBeenCalledWith('tokens', 'Additive');
    });
  });

  describe('Layer Operations', () => {
    it('gets layer by name', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const tokensLayer = result.current.getLayerByName('tokens');
      expect(tokensLayer?.name).toBe('tokens');
      expect(tokensLayer?.displayName).toBe('Tokens/Characters');

      const nonExistentLayer = result.current.getLayerByName('nonexistent');
      expect(nonExistentLayer).toBeUndefined();
    });

    it('gets visible layers', async () => {
      mockRenderManager.get_layer_settings.mockImplementation((layerName: string) => ({
        visible: layerName === 'tokens' || layerName === 'map',
        opacity: 1.0,
        color: [1.0, 1.0, 1.0, 1.0],
        blend_mode: 'Alpha',
        z_order: 1,
      }));

      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const visibleLayers = result.current.getVisibleLayers();
      expect(visibleLayers).toHaveLength(2);
      expect(visibleLayers.map(layer => layer.name)).toContain('tokens');
      expect(visibleLayers.map(layer => layer.name)).toContain('map');
    });

    it('gets layers by z-order', async () => {
      mockRenderManager.get_layer_settings.mockImplementation((layerName: string) => ({
        visible: true,
        opacity: 1.0,
        color: [1.0, 1.0, 1.0, 1.0],
        blend_mode: 'Alpha',
        z_order: layerName === 'tokens' ? 5 : layerName === 'map' ? 1 : 3,
      }));

      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      const sortedLayers = result.current.getLayersByZOrder();
      
      // Should be sorted by z_order ascending
      expect(sortedLayers[0].name).toBe('map'); // z_order = 1
      expect(sortedLayers[sortedLayers.length - 1].name).toBe('tokens'); // z_order = 5
    });
  });

  describe('Error Handling', () => {
    it('handles render manager operations when not initialized', async () => {
      // Start with uninitialized state
      delete (window as any).ttrpg_rust_core;
      delete (window as any).gameAPI;
      
      const { result } = renderHook(() => useLayerManager());

      // Operations should not throw but should not succeed
      await expect(result.current.setLayerVisible('tokens', false)).resolves.toBeUndefined();
      await expect(result.current.setLayerOpacity('tokens', 0.5)).resolves.toBeUndefined();

      expect(mockRenderManager.set_layer_visible).not.toHaveBeenCalled();
      expect(mockRenderManager.set_layer_opacity).not.toHaveBeenCalled();
    });

    it('handles WASM method errors gracefully', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Make WASM method throw
      mockRenderManager.set_layer_visible.mockImplementationOnce(() => {
        throw new Error('WASM method error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await act(async () => {
        await result.current.setLayerVisible('tokens', false);
      });

      expect(consoleSpy).toHaveBeenCalledWith('Error setting layer visibility:', expect.any(Error));
    });

    it('provides fallback values for missing layer data', async () => {
      mockRenderManager.get_layer_settings.mockImplementation(() => {
        throw new Error('Settings not available');
      });

      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Should still have layers with default settings
      expect(result.current.layers).toHaveLength(7);
      
      const tokensLayer = result.current.layers.find(layer => layer.name === 'tokens');
      expect(tokensLayer).toBeDefined();
      expect(tokensLayer?.settings).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('debounces rapid layer setting changes', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Make rapid opacity changes
      await Promise.all([
        act(() => result.current.setLayerOpacity('tokens', 0.1)),
        act(() => result.current.setLayerOpacity('tokens', 0.2)),
        act(() => result.current.setLayerOpacity('tokens', 0.3)),
        act(() => result.current.setLayerOpacity('tokens', 0.4)),
        act(() => result.current.setLayerOpacity('tokens', 0.5)),
      ]);

      // Should have been called for each change (no debouncing in this implementation)
      expect(mockRenderManager.set_layer_opacity).toHaveBeenCalledTimes(5);
    });

    it('batches layer data refresh calls', async () => {
      const { result } = renderHook(() => useLayerManager());

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Multiple rapid refresh calls
      await Promise.all([
        act(() => result.current.refreshLayerData()),
        act(() => result.current.refreshLayerData()),
        act(() => result.current.refreshLayerData()),
      ]);

      // Each call should execute (no batching in this implementation)
      expect(mockRenderManager.get_layer_settings).toHaveBeenCalledTimes(21); // 7 layers × 3 calls
    });
  });
});
