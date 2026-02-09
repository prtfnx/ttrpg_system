/**
 * TableThumbnailService Integration Tests
 * Production-ready tests for table thumbnail generation and caching
 */

import { tableThumbnailService } from '@features/table';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TableThumbnailService', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';
  const validUUID2 = '0a577ca2-7f6a-400d-9758-26f232003cc5';
  
  let mockRenderEngine: any;
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    tableThumbnailService.clearCache();
    
    mockCanvas = document.createElement('canvas');
    mockCanvas.width = 1920;
    mockCanvas.height = 1080;
    mockCanvas.setAttribute('data-testid', 'game-canvas');
    document.body.appendChild(mockCanvas);
    
    const ctx = mockCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#333333';
      ctx.fillRect(0, 0, mockCanvas.width, mockCanvas.height);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(100, 100, 200, 200);
    }
    
    mockRenderEngine = {
      get_active_table_id: vi.fn().mockReturnValue(validUUID),
      render: vi.fn()
    };
    
    (window as any).wasmInitialized = true;
  });

  afterEach(() => {
    const canvas = document.querySelector('[data-testid="game-canvas"]');
    if (canvas) {
      canvas.remove();
    }
    tableThumbnailService.clearCache();
    delete (window as any).wasmInitialized;
  });

  describe('initialization', () => {
    it('initializes with render engine', () => {
      tableThumbnailService.initialize(mockRenderEngine);
      
      expect(tableThumbnailService.isInitialized()).toBe(true);
      expect(tableThumbnailService.getRenderEngine()).toBe(mockRenderEngine);
    });

    it('provides null render engine before initialization', () => {
      const service = new (tableThumbnailService.constructor as any)();
      
      expect(service.getRenderEngine()).toBeNull();
      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('UUID validation', () => {
    it('rejects invalid UUIDs', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      
      const result = await tableThumbnailService.generateThumbnail(
        'invalid-uuid',
        1000,
        800,
        200,
        150
      );
      
      expect(result).toBeNull();
    });

    it('accepts valid UUIDs', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      const result = await tableThumbnailService.generateThumbnail(
        validUUID,
        1000,
        800,
        200,
        150
      );
      
      expect(result).not.toBeNull();
    });
  });

  describe('thumbnail generation', () => {
    it('generates thumbnail for active table', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      const thumbnail = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        320,
        180
      );
      
      expect(thumbnail).not.toBeNull();
      expect(thumbnail?.width).toBe(320);
      expect(thumbnail?.height).toBe(180);
    });

    it('generates thumbnails for any table (regardless of active status)', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      // The service doesn't check active table - it generates thumbnails for any valid UUID
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      const thumbnail = await tableThumbnailService.generateThumbnail(
        validUUID2, // Different table ID
        1920,
        1080,
        320,
        180
      );
      
      // Service generates thumbnail regardless of active status
      expect(thumbnail).not.toBeNull();
      expect(thumbnail?.width).toBe(320);
      expect(thumbnail?.height).toBe(180);
    });

    it('throws error when render engine not initialized', async () => {
      // Create fresh service without initialization
      const freshService = new (tableThumbnailService.constructor as any)();
      
      await expect(
        freshService.generateThumbnail(
          validUUID,
          1920,
          1080,
          320,
          180
        )
      ).rejects.toThrow('RenderEngine not available');
    });

    it('triggers render before capture', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        320,
        180
      );
      
      expect(mockRenderEngine.render).toHaveBeenCalled();
    });

    it('generates ImageData with correct dimensions', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      const thumbnail = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        256,
        144
      );
      
      expect(thumbnail).not.toBeNull();
      expect(thumbnail?.width).toBe(256);
      expect(thumbnail?.height).toBe(144);
      expect(thumbnail?.data).toBeInstanceOf(Uint8ClampedArray);
      expect(thumbnail?.data.length).toBe(256 * 144 * 4);
    });
  });

  describe('caching behavior', () => {
    it('caches generated thumbnails', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      const first = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        200,
        150
      );
      
      mockRenderEngine.render.mockClear();
      
      const second = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        200,
        150
      );
      
      expect(first).toBe(second);
      expect(mockRenderEngine.render).not.toHaveBeenCalled();
    });

    it('generates new thumbnail when dimensions change', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      const first = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        200,
        150
      );
      
      const second = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        300,
        200
      );
      
      expect(first).not.toBe(second);
      expect(first?.width).toBe(200);
      expect(second?.width).toBe(300);
    });

    it('bypasses cache when forceRefresh is true', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      const first = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        200,
        150,
        false
      );
      
      mockRenderEngine.render.mockClear();
      
      const second = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        200,
        150,
        true
      );
      
      expect(mockRenderEngine.render).toHaveBeenCalled();
      expect(first).not.toBe(second);
    });

    it('provides accurate cache statistics', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      await tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 200, 150);
      await tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 300, 200);
      
      const stats = tableThumbnailService.getCacheStats();
      
      expect(stats.size).toBe(2);
      expect(stats.tables).toContain(validUUID);
    });
  });

  describe('cache invalidation', () => {
    it('invalidates table cache', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      await tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 200, 150);
      
      const statsBefore = tableThumbnailService.getCacheStats();
      expect(statsBefore.size).toBe(1);
      
      // Invalidate triggers debounced timer (300ms)
      tableThumbnailService.invalidateTable(validUUID);
      
      // Fast-forward past debounce delay
      await new Promise(resolve => setTimeout(resolve, 350));
      
      const statsAfter = tableThumbnailService.getCacheStats();
      expect(statsAfter.size).toBe(0);
    });

    it('invalidates specific thumbnail', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      await tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 200, 150);
      await tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 300, 200);
      
      tableThumbnailService.invalidateThumbnail(validUUID, 200, 150);
      
      const stats = tableThumbnailService.getCacheStats();
      expect(stats.size).toBe(1);
    });

    it('clears entire cache', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      await tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 200, 150);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID2);
      await tableThumbnailService.generateThumbnail(validUUID2, 1920, 1080, 200, 150);
      
      tableThumbnailService.clearCache();
      
      const stats = tableThumbnailService.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.tables.length).toBe(0);
    });

    it('debounces rapid invalidations', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      await tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 200, 150);
      
      tableThumbnailService.invalidateTable(validUUID);
      tableThumbnailService.invalidateTable(validUUID);
      tableThumbnailService.invalidateTable(validUUID);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const stats = tableThumbnailService.getCacheStats();
      expect(stats.size).toBe(1);
      
      await new Promise(resolve => setTimeout(resolve, 250));
      const statsAfter = tableThumbnailService.getCacheStats();
      expect(statsAfter.size).toBe(0);
    });
  });

  describe('cache pruning', () => {
    it('prunes old cache entries', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      await tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 200, 150);
      
      // Wait to ensure timestamp is in the past
      await new Promise(resolve => setTimeout(resolve, 10));
      
      tableThumbnailService.pruneCache(0);
      
      const stats = tableThumbnailService.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('keeps recent cache entries', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      await tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 200, 150);
      
      tableThumbnailService.pruneCache(10000);
      
      const stats = tableThumbnailService.getCacheStats();
      expect(stats.size).toBe(1);
    });
  });

  describe('concurrent generation prevention', () => {
    it('prevents concurrent generation of same thumbnail', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      const promise1 = tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        200,
        150
      );
      
      const promise2 = tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        200,
        150
      );
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      expect(result1).toBe(result2);
      expect(mockRenderEngine.render.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    it('handles missing canvas element', async () => {
      const canvas = document.querySelector('[data-testid="game-canvas"]');
      if (canvas) canvas.remove();
      
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      await expect(
        tableThumbnailService.generateThumbnail(validUUID, 1920, 1080, 200, 150)
      ).rejects.toThrow('Main game canvas not found');
    });

    it('handles render engine errors gracefully', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      mockRenderEngine.render.mockImplementation(() => {
        throw new Error('Render failed');
      });
      
      const result = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        200,
        150
      );
      
      expect(result).not.toBeNull();
    });

    it('validates invalid UUID returns null', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      
      const result = await tableThumbnailService.generateThumbnail(
        'not-a-uuid',
        1920,
        1080,
        200,
        150
      );
      
      expect(result).toBeNull();
    });
  });

  describe('aspect ratio handling', () => {
    it('maintains aspect ratio in thumbnails', async () => {
      tableThumbnailService.initialize(mockRenderEngine);
      mockRenderEngine.get_active_table_id.mockReturnValue(validUUID);
      
      const thumbnail = await tableThumbnailService.generateThumbnail(
        validUUID,
        1920,
        1080,
        320,
        180
      );
      
      expect(thumbnail).not.toBeNull();
      expect(thumbnail!.width / thumbnail!.height).toBeCloseTo(320 / 180, 1);
    });
  });
});
