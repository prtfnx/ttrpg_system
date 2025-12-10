/**
 * Unified FPS Measurement Service
 * Single source of truth for frame rate measurement across the application
 * 
 * Best Practices Implemented:
 * - Singleton pattern for global access
 * - Observer pattern for reactive updates
 * - Type-safe with full TypeScript support
 * - Event-driven architecture
 * - Rolling average for smooth metrics
 * - Automatic cleanup
 */

export interface FPSMetrics {
  current: number;      // Current FPS (updated every second)
  average: number;      // Rolling average over last 60 samples
  min: number;          // Minimum FPS in current session
  max: number;          // Maximum FPS in current session
  frameTime: number;    // Average frame time in ms
}

type FPSUpdateCallback = (metrics: FPSMetrics) => void;

class FPSService {
  private frameCount: number = 0;
  private lastUpdateTime: number = 0;
  private currentFPS: number = 0;
  private fpsHistory: number[] = [];
  private readonly HISTORY_SIZE = 60; // 60 seconds of data
  private readonly UPDATE_INTERVAL = 1000; // Update every 1 second
  
  private minFPS: number = Infinity;
  private maxFPS: number = 0;
  
  private subscribers: Set<FPSUpdateCallback> = new Set();
  private isInitialized: boolean = false;

  /**
   * Initialize the FPS service
   * Should be called once when the application starts
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('[FPSService] Already initialized');
      return;
    }
    
    this.lastUpdateTime = performance.now();
    this.isInitialized = true;
    console.log('[FPSService] ✅ Initialized - Single source of truth for FPS measurement');
  }

  /**
   * Record a frame
   * Should be called once per render frame (in requestAnimationFrame loop)
   * 
   * This is the ONLY place where frames should be counted in the application
   */
  recordFrame(): void {
    if (!this.isInitialized) {
      this.initialize();
    }

    this.frameCount++;
    const currentTime = performance.now();
    const elapsed = currentTime - this.lastUpdateTime;

    // Update FPS every second
    if (elapsed >= this.UPDATE_INTERVAL) {
      // Calculate current FPS
      this.currentFPS = Math.round((this.frameCount * 1000) / elapsed);
      
      // Update min/max
      if (this.currentFPS < this.minFPS) this.minFPS = this.currentFPS;
      if (this.currentFPS > this.maxFPS) this.maxFPS = this.currentFPS;
      
      // Add to history
      this.fpsHistory.push(this.currentFPS);
      if (this.fpsHistory.length > this.HISTORY_SIZE) {
        this.fpsHistory.shift();
      }

      // Reset counters
      this.frameCount = 0;
      this.lastUpdateTime = currentTime;

      // Notify subscribers
      this.notifySubscribers();
    }
  }

  /**
   * Get current FPS metrics
   * Can be called at any time without affecting measurement
   */
  getMetrics(): FPSMetrics {
    const average = this.fpsHistory.length > 0
      ? Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length)
      : this.currentFPS;

    const frameTime = this.currentFPS > 0 ? 1000 / this.currentFPS : 0;

    return {
      current: this.currentFPS,
      average,
      min: this.minFPS === Infinity ? 0 : this.minFPS,
      max: this.maxFPS,
      frameTime
    };
  }

  /**
   * Subscribe to FPS updates
   * Callback is called every time FPS is recalculated (every 1 second)
   * 
   * @returns Unsubscribe function
   * 
   * @example
   * const unsubscribe = fpsService.subscribe((metrics) => {
   *   console.log('Current FPS:', metrics.current);
   * });
   * // Later...
   * unsubscribe();
   */
  subscribe(callback: FPSUpdateCallback): () => void {
    this.subscribers.add(callback);
    
    // Immediately call with current metrics
    callback(this.getMetrics());
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get current subscriber count
   * Useful for debugging and monitoring
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Reset min/max statistics and history
   */
  resetStats(): void {
    this.minFPS = Infinity;
    this.maxFPS = 0;
    this.fpsHistory = [];
    console.log('[FPSService] Statistics reset');
  }

  /**
   * Notify all subscribers of updated metrics
   */
  private notifySubscribers(): void {
    const metrics = this.getMetrics();
    this.subscribers.forEach(callback => {
      try {
        callback(metrics);
      } catch (error) {
        console.error('[FPSService] Error in subscriber callback:', error);
      }
    });
  }

  /**
   * Clean up service
   * Removes all subscribers and resets state
   */
  destroy(): void {
    this.subscribers.clear();
    this.fpsHistory = [];
    this.isInitialized = false;
    console.log('[FPSService] Destroyed');
  }

  /**
   * Get service status for debugging
   */
  getStatus(): {
    initialized: boolean;
    subscribers: number;
    historySize: number;
    currentFPS: number;
  } {
    return {
      initialized: this.isInitialized,
      subscribers: this.subscribers.size,
      historySize: this.fpsHistory.length,
      currentFPS: this.currentFPS
    };
  }
}

// Export singleton instance
export const fpsService = new FPSService();
export default fpsService;
