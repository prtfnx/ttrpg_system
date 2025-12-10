/**
 * Table Thumbnail Service
 * 
 * Production-ready service for generating miniature previews of game tables
 * using the WASM RenderEngine. Implements caching and automatic invalidation.
 * 
 * Best Practices:
 * - Uses actual WASM rendering (no mockups)
 * - Implements Map-based caching for performance
 * - Automatic cache invalidation on table changes
 * - Proper error handling and logging
 * - Type-safe TypeScript implementation
 */

import type { RenderEngine } from '../types';

interface ThumbnailCacheEntry {
  imageData: ImageData;
  timestamp: number;
  tableId: string;
}

class TableThumbnailService {
  private cache = new Map<string, ThumbnailCacheEntry>();
  private renderEngine: RenderEngine | null = null;
  private isGenerating = new Set<string>(); // Prevent concurrent generation
  
  /**
   * Set the WASM RenderEngine instance
   * Must be called before generating thumbnails
   */
  initialize(engine: RenderEngine): void {
    this.renderEngine = engine;
    console.log('[ThumbnailService] RenderEngine initialized');
  }
  
  /**
   * Check if the service is initialized with a RenderEngine
   */
  isInitialized(): boolean {
    return this.renderEngine !== null;
  }
  
  /**
   * Get the current RenderEngine instance
   */
  getRenderEngine(): RenderEngine | null {
    return this.renderEngine;
  }
  
  /**
   * Generate thumbnail for a table using actual WASM rendering
   * 
   * @param tableId - Unique table identifier
   * @param tableWidth - Full table width in pixels
   * @param tableHeight - Full table height in pixels
   * @param thumbnailWidth - Desired thumbnail width
   * @param thumbnailHeight - Desired thumbnail height
   * @param forceRefresh - Skip cache and regenerate
   * @returns ImageData containing the rendered thumbnail
   * @throws Error if RenderEngine is not available
   */
  async generateThumbnail(
    tableId: string,
    tableWidth: number,
    tableHeight: number,
    thumbnailWidth: number,
    thumbnailHeight: number,
    forceRefresh = false
  ): Promise<ImageData> {
    const cacheKey = `${tableId}_${thumbnailWidth}x${thumbnailHeight}`;
    
    // Return cached version if available
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      console.log(`[ThumbnailService] Using cached thumbnail for ${tableId}`);
      return cached.imageData;
    }
    
    // Prevent concurrent generation for same thumbnail
    if (this.isGenerating.has(cacheKey)) {
      console.log(`[ThumbnailService] Already generating ${cacheKey}, waiting...`);
      // Wait for ongoing generation
      await this.waitForGeneration(cacheKey);
      // Should be cached now
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!.imageData;
      }
    }
    
    if (!this.renderEngine) {
      throw new Error('RenderEngine not available - cannot generate thumbnail');
    }
    
    this.isGenerating.add(cacheKey);
    
    try {
      console.log(`[ThumbnailService] Generating thumbnail for ${tableId} at ${thumbnailWidth}x${thumbnailHeight}`);
      
      const startTime = performance.now();
      
      // Create temporary canvas for rendering
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = thumbnailWidth;
      tempCanvas.height = thumbnailHeight;
      const ctx = tempCanvas.getContext('2d', { 
        alpha: true,
        desynchronized: true // Performance optimization
      });
      
      if (!ctx) {
        throw new Error('Failed to get 2D context for thumbnail canvas');
      }
      
      // Calculate scale to fit entire table into thumbnail
      const scaleX = thumbnailWidth / tableWidth;
      const scaleY = thumbnailHeight / tableHeight;
      const scale = Math.min(scaleX, scaleY);
      
      // Calculate centered viewport
      const centerX = tableWidth / 2;
      const centerY = tableHeight / 2;
      
      // Save current camera state
      const savedCamera = this.renderEngine.get_camera?.() || [0, 0, 1];
      
      try {
        // Set camera to view entire table
        this.renderEngine.set_camera(centerX, centerY, scale);
        
        // Render the table
        this.renderEngine.render(tempCanvas);
        
        // Extract ImageData
        const imageData = ctx.getImageData(0, 0, thumbnailWidth, thumbnailHeight);
        
        // Cache the result
        const cacheEntry: ThumbnailCacheEntry = {
          imageData,
          timestamp: Date.now(),
          tableId
        };
        this.cache.set(cacheKey, cacheEntry);
        
        const duration = performance.now() - startTime;
        console.log(`[ThumbnailService] Generated thumbnail in ${duration.toFixed(2)}ms`);
        
        return imageData;
        
      } finally {
        // Always restore camera state
        this.renderEngine.set_camera(savedCamera[0], savedCamera[1], savedCamera[2]);
      }
      
    } catch (error) {
      console.error('[ThumbnailService] Failed to generate thumbnail:', error);
      throw error;
    } finally {
      this.isGenerating.delete(cacheKey);
    }
  }
  
  /**
   * Wait for ongoing thumbnail generation to complete
   */
  private async waitForGeneration(cacheKey: string, timeoutMs = 5000): Promise<void> {
    const startTime = Date.now();
    while (this.isGenerating.has(cacheKey)) {
      if (Date.now() - startTime > timeoutMs) {
        console.warn(`[ThumbnailService] Timeout waiting for ${cacheKey}`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  /**
   * Invalidate cache for a specific table
   * Call this when table content changes (sprites added/moved/removed)
   */
  invalidateTable(tableId: string): void {
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (entry.tableId === tableId) {
        keysToDelete.push(key);
      }
    });
    
    if (keysToDelete.length > 0) {
      keysToDelete.forEach(key => this.cache.delete(key));
      console.log(`[ThumbnailService] Invalidated ${keysToDelete.length} cached thumbnails for table ${tableId}`);
    }
  }
  
  /**
   * Invalidate specific thumbnail by exact cache key
   */
  invalidateThumbnail(tableId: string, width: number, height: number): void {
    const cacheKey = `${tableId}_${width}x${height}`;
    if (this.cache.delete(cacheKey)) {
      console.log(`[ThumbnailService] Invalidated thumbnail: ${cacheKey}`);
    }
  }
  
  /**
   * Clear entire thumbnail cache
   */
  clearCache(): void {
    const count = this.cache.size;
    this.cache.clear();
    console.log(`[ThumbnailService] Cleared ${count} cached thumbnails`);
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; tables: string[] } {
    const tables = new Set<string>();
    this.cache.forEach(entry => tables.add(entry.tableId));
    
    return {
      size: this.cache.size,
      tables: Array.from(tables)
    };
  }
  
  /**
   * Prune old cache entries
   * @param maxAgeMs - Maximum age in milliseconds (default 5 minutes)
   */
  pruneCache(maxAgeMs = 5 * 60 * 1000): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > maxAgeMs) {
        keysToDelete.push(key);
      }
    });
    
    if (keysToDelete.length > 0) {
      keysToDelete.forEach(key => this.cache.delete(key));
      console.log(`[ThumbnailService] Pruned ${keysToDelete.length} old thumbnails`);
    }
  }
}

// Singleton instance
export const tableThumbnailService = new TableThumbnailService();

// Auto-prune cache every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    tableThumbnailService.pruneCache();
  }, 5 * 60 * 1000);
}
