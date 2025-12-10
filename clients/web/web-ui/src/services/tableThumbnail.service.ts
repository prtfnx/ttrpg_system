/**
 * Table Thumbnail Service
 * 
 * Production-ready service for generating miniature previews of game tables
 * by capturing snapshots from the main game canvas (Figma-style approach).
 * 
 * Best Practices:
 * - Zero-copy pixel capture from main canvas (no duplicate rendering)
 * - Debounced regeneration (prevents thrashing during sprite drag)
 * - In-memory ImageData caching for instant display
 * - Automatic cache invalidation on table changes
 * - Proper error handling and logging
 * - Type-safe TypeScript implementation
 * 
 * Architecture Decision:
 * Copying from main canvas is CORRECT for real-time dynamic content because:
 * 1. No duplicate rendering overhead
 * 2. Always perfectly in sync with game view
 * 3. Minimal CPU usage (just pixel copy)
 * 4. Industry standard (Figma, Miro, etc. use this approach)
 */

import type { RenderEngine } from '../types/wasm';

interface ThumbnailCacheEntry {
  imageData: ImageData;
  timestamp: number;
  tableId: string;
}

class TableThumbnailService {
  private cache = new Map<string, ThumbnailCacheEntry>();
  private renderEngine: RenderEngine | null = null;
  private isGenerating = new Set<string>(); // Prevent concurrent generation
  private debounceTimers = new Map<string, number>(); // Debounce rapid invalidations
  private readonly DEBOUNCE_MS = 300; // Wait 300ms after last change before regenerating
  
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
      
      // Get the main game canvas - use data-testid selector since no id attribute exists
      const mainCanvas = document.querySelector('[data-testid="game-canvas"]') as HTMLCanvasElement;
      
      if (!mainCanvas) {
        console.warn('[ThumbnailService] Main canvas element not found in DOM');
        throw new Error('Main game canvas not found');
      }
      
      if (mainCanvas.width === 0 || mainCanvas.height === 0) {
        console.warn('[ThumbnailService] Main canvas has zero dimensions:', { width: mainCanvas.width, height: mainCanvas.height });
        throw new Error('Main game canvas not initialized (zero dimensions)');
      }
      
      // CRITICAL: Check if WASM and canvas are fully initialized
      // When opening Tables tab directly (without visiting Game tab first),
      // the canvas exists but hasn't rendered any frames yet
      const wasmReady = (window as any).wasmInitialized === true;
      if (!wasmReady) {
        console.warn('[ThumbnailService] WASM not fully initialized yet, waiting for first render...');
        
        // Wait for WASM to initialize (max 5 seconds)
        const maxWaitMs = 5000;
        const waitStart = Date.now();
        while (!(window as any).wasmInitialized && (Date.now() - waitStart < maxWaitMs)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (!(window as any).wasmInitialized) {
          throw new Error('WASM initialization timeout - canvas not ready');
        }
        
        // Wait one more frame to ensure at least one render cycle
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
        
        console.log('[ThumbnailService] WASM initialized, proceeding with capture');
      }
      
      // Additional check: Verify canvas has actual content (not all black)
      // by sampling a few pixels from the main canvas
      const ctx2d = mainCanvas.getContext('2d');
      if (ctx2d) {
        const sampleData = ctx2d.getImageData(
          Math.floor(mainCanvas.width / 2), 
          Math.floor(mainCanvas.height / 2), 
          1, 
          1
        ).data;
        
        const isBlank = sampleData[0] === 0 && sampleData[1] === 0 && sampleData[2] === 0 && sampleData[3] === 0;
        if (isBlank) {
          console.warn('[ThumbnailService] Canvas appears blank (all black), waiting for render...');
          
          // Wait for next render frame
          await new Promise(resolve => requestAnimationFrame(() => 
            requestAnimationFrame(() => resolve(undefined))
          ));
        }
      }
      
      // CRITICAL: Switch to the requested table before capturing
      // The main canvas only shows ONE table at a time (the active table)
      // We must switch to the correct table, capture, then switch back
      const originalTableId = this.renderEngine.get_active_table_id?.();
      const needsTableSwitch = originalTableId && originalTableId !== tableId;
      
      if (needsTableSwitch) {
        console.log(`[ThumbnailService] Switching from '${originalTableId}' to '${tableId}' for capture`);
        const switched = this.renderEngine.set_active_table?.(tableId);
        if (!switched) {
          console.error(`[ThumbnailService] Failed to switch to table '${tableId}'`);
          throw new Error(`Cannot switch to table ${tableId}`);
        }
        
        // Wait for one render frame after table switch
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
      }
      
      console.log('[ThumbnailService] Capturing from canvas:', { 
        canvasWidth: mainCanvas.width, 
        canvasHeight: mainCanvas.height,
        tableWidth,
        tableHeight,
        thumbnailWidth,
        thumbnailHeight
      });
      
      // Create temporary canvas for thumbnail
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
      
      try {
        // Calculate scale to fit entire table into thumbnail
        const scaleX = thumbnailWidth / tableWidth;
        const scaleY = thumbnailHeight / tableHeight;
        const scale = Math.min(scaleX, scaleY);
        
        // Calculate dimensions maintaining aspect ratio
        const scaledWidth = tableWidth * scale;
        const scaledHeight = tableHeight * scale;
        
        // Center the image in thumbnail
        const offsetX = (thumbnailWidth - scaledWidth) / 2;
        const offsetY = (thumbnailHeight - scaledHeight) / 2;
        
        // Fill background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, thumbnailWidth, thumbnailHeight);
        
        // Draw scaled version of main canvas (zero-copy approach like Figma)
        // This captures the current rendered state without re-rendering
        ctx.drawImage(
          mainCanvas,
          0, 0, mainCanvas.width, mainCanvas.height,
          offsetX, offsetY, scaledWidth, scaledHeight
        );
        
        // Extract ImageData
        const imageData = ctx.getImageData(0, 0, thumbnailWidth, thumbnailHeight);
        
        // Switch back to original table if we switched
        if (needsTableSwitch && originalTableId) {
          console.log(`[ThumbnailService] Switching back to original table '${originalTableId}'`);
          this.renderEngine.set_active_table?.(originalTableId);
          // Wait for one render frame after switching back
          await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
        }
        
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
        
      } catch (error) {
        // Make sure to switch back even if there's an error
        if (needsTableSwitch && originalTableId) {
          console.log(`[ThumbnailService] Error occurred, switching back to '${originalTableId}'`);
          this.renderEngine.set_active_table?.(originalTableId);
        }
        console.error('[ThumbnailService] Error during thumbnail generation:', error);
        throw error;
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
   * Uses debouncing to prevent thrashing during rapid sprite movements
   */
  invalidateTable(tableId: string): void {
    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(tableId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new debounce timer
    const timer = window.setTimeout(() => {
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
      
      this.debounceTimers.delete(tableId);
    }, this.DEBOUNCE_MS);
    
    this.debounceTimers.set(tableId, timer);
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
