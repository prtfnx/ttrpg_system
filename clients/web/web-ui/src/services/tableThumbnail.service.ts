import { isValidUUID } from '../protocol/tableProtocolAdapter';
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
   * @returns ImageData containing the rendered thumbnail, or null if table is not active
   * @throws Error if RenderEngine is not available
   */
  async generateThumbnail(
    tableId: string,
    tableWidth: number,
    tableHeight: number,
    thumbnailWidth: number,
    thumbnailHeight: number,
    forceRefresh = false
  ): Promise<ImageData | null> {
    if (!isValidUUID(tableId)) {
      console.error(`[ThumbnailService] Invalid UUID: ${tableId}`);
      return null;
    }
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
      
      // Check if this is the currently active table
      // IMPORTANT: Only the active table is loaded in WASM memory
      // Other tables exist in server state but are not rendered until switched to
      // Note: We rely on the server marking tables as active/inactive
      console.log(`[ThumbnailService] Generating thumbnail for table '${tableId}'`);
      
      console.log(`[ThumbnailService] Generating thumbnail for active table '${tableId}'`);
      
      // CRITICAL: Trigger a render frame before capturing
      // The render loop runs in WASM Rust and may not be producing frames
      // when the GameCanvas is not visible (e.g., on Tables tab)
      console.log('[ThumbnailService] Triggering render frame before capture');
      try {
        this.renderEngine.render();
        // Wait for the render to complete (WebGL/WASM operations)
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
      } catch (renderError) {
        console.warn('[ThumbnailService] Failed to trigger render:', renderError);
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
        console.log('[ThumbnailService] Drawing canvas:', {
          source: { x: 0, y: 0, w: mainCanvas.width, h: mainCanvas.height },
          dest: { x: offsetX, y: offsetY, w: scaledWidth, h: scaledHeight },
          scale
        });
        
        ctx.drawImage(
          mainCanvas,
          0, 0, mainCanvas.width, mainCanvas.height,
          offsetX, offsetY, scaledWidth, scaledHeight
        );
        
        // Extract ImageData
        const imageData = ctx.getImageData(0, 0, thumbnailWidth, thumbnailHeight);
        
        // Diagnostic: Check if thumbnail is all black
        let nonBlackPixels = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          if (r > 30 || g > 30 || b > 30) {
            nonBlackPixels++;
          }
        }
        const totalPixels = (imageData.width * imageData.height);
        const percentVisible = (nonBlackPixels / totalPixels * 100).toFixed(1);
        console.log('[ThumbnailService] Content analysis:', {
          totalPixels,
          nonBlackPixels,
          percentVisible: `${percentVisible}%`,
          status: nonBlackPixels > 0 ? '✅ Has content' : '⚠️ All black/empty'
        });
        
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
    if (!isValidUUID(tableId)) return;
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
