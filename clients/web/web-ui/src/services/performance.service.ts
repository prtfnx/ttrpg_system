/**
 * Performance monitoring and optimization service for the TTRPG game client
 * Provides FPS monitoring, memory tracking, sprite caching, and performance analytics
 */

// Performance metrics interface
export interface PerformanceMetrics {
  fps: number;
  averageFPS: number;
  frameTime: number;
  averageFrameTime: number;
  memoryUsage: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  spriteCount: number;
  textureCount: number;
  renderCalls: number;
  cacheHitRate: number;
  networkLatency: number;
  wasmMemoryUsage: number;
}

// Performance targets for different quality levels
export const PerformanceLevel = {
  LOW: 'low',       // 30 FPS target
  MEDIUM: 'medium', // 45 FPS target  
  HIGH: 'high',     // 60 FPS target
  ULTRA: 'ultra'    // 120 FPS target
} as const;

export type PerformanceLevel = typeof PerformanceLevel[keyof typeof PerformanceLevel];

// Performance optimization settings
export interface PerformanceSettings {
  level: PerformanceLevel;
  maxSprites: number;
  textureQuality: number;
  enableVSync: boolean;
  enableSpritePooling: boolean;
  enableTextureCaching: boolean;
  enableFrustumCulling: boolean;
  maxRenderDistance: number;
  shadowQuality: number;
}

class PerformanceService {
  private metrics: PerformanceMetrics;
  private settings: PerformanceSettings;
  private frameTimeHistory: number[] = [];
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private startTime: number = 0;
  private isMonitoring: boolean = false;
  private monitoringInterval: number | null = null;
  private renderEngine: any = null;
  private lastOptimizationTime: number = 0;
  private readonly OPTIMIZATION_COOLDOWN_MS = 10000; // 10 seconds cooldown

  // Sprite and texture caching
  private spriteCache = new Map<string, any>();
  private textureCache = new Map<string, any>();
  private cacheHits: number = 0;
  private cacheRequests: number = 0;

  // Performance history for analytics
  private performanceLog: Array<{
    timestamp: number;
    metrics: PerformanceMetrics;
  }> = [];

  constructor() {
    this.metrics = this.initializeMetrics();
    this.settings = this.getOptimalSettings();
    this.startTime = performance.now();
  }

  private initializeMetrics(): PerformanceMetrics {
    const memory = (performance as any).memory;
    return {
      fps: 0,
      averageFPS: 0,
      frameTime: 0,
      averageFrameTime: 0,
      memoryUsage: {
        usedJSHeapSize: memory?.usedJSHeapSize || 0,
        totalJSHeapSize: memory?.totalJSHeapSize || 0,
        jsHeapSizeLimit: memory?.jsHeapSizeLimit || 0
      },
      spriteCount: 0,
      textureCount: 0,
      renderCalls: 0,
      cacheHitRate: 0,
      networkLatency: 0,
      wasmMemoryUsage: 0
    };
  }

  /**
   * Initialize performance monitoring with render engine reference
   */
  initialize(renderEngine: any): void {
    this.renderEngine = renderEngine;
    this.startMonitoring();
    this.applyOptimizations();
    console.log('🚀 Performance service initialized');
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.lastFrameTime = performance.now();

    // Monitor at 4Hz (every 250ms) to avoid performance overhead
    this.monitoringInterval = window.setInterval(() => {
      this.updateMetrics();
      this.logPerformanceData();
      this.optimizeIfNeeded();
    }, 250);

    console.log('📊 Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('📊 Performance monitoring stopped');
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(): void {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    
    // Calculate FPS based on actual render engine frame rate
    // Query WASM render engine for accurate frame timing
    if (this.renderEngine && typeof this.renderEngine.get_fps === 'function') {
      try {
        this.metrics.fps = this.renderEngine.get_fps();
        this.metrics.averageFPS = this.metrics.fps; // Use engine FPS as average
      } catch (error) {
        // Fallback to estimation if WASM not available
        this.metrics.fps = deltaTime > 0 ? 1000 / deltaTime : 0;
      }
    } else {
      // Fallback: estimate from monitoring interval (should be updated by actual render loop)
      // This monitoring runs at 4Hz, so we can't measure actual FPS here
      // Instead, default to expected performance level target
      this.metrics.fps = this.getTargetFPS();
    }

    // Update frame time
    this.metrics.frameTime = deltaTime;
    this.frameTimeHistory.push(deltaTime);
    if (this.frameTimeHistory.length > 60) {
      this.frameTimeHistory.shift();
    }

    // Calculate averages
    if (this.frameTimeHistory.length > 0) {
      this.metrics.averageFrameTime = 
        this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
      // Only update averageFPS from frameTime if we don't have engine FPS
      if (!this.renderEngine || typeof this.renderEngine.get_fps !== 'function') {
        this.metrics.averageFPS = 1000 / this.metrics.averageFrameTime;
      }
    }

    // Update memory metrics
    const memory = (performance as any).memory;
    if (memory) {
      this.metrics.memoryUsage = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      };
    }

    // Update WASM metrics if available
    if (this.renderEngine && typeof this.renderEngine.get_memory_usage === 'function') {
      this.metrics.wasmMemoryUsage = this.renderEngine.get_memory_usage();
    }

    // Update sprite and texture counts from render engine
    if (this.renderEngine) {
      this.metrics.spriteCount = this.getSpriteCount();
      this.metrics.textureCount = this.getTextureCount();
    }

    // Update cache hit rate
    this.metrics.cacheHitRate = this.cacheRequests > 0 ? 
      (this.cacheHits / this.cacheRequests) * 100 : 0;

    this.lastFrameTime = currentTime;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance settings
   */
  getSettings(): PerformanceSettings {
    return { ...this.settings };
  }

  /**
   * Update performance settings
   */
  updateSettings(newSettings: Partial<PerformanceSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.applyOptimizations();
    this.saveSettings();
    console.log('⚙️ Performance settings updated:', newSettings);
  }

  /**
   * Determine optimal settings based on device capabilities
   */
  private getOptimalSettings(): PerformanceSettings {
    // Check device memory and GPU capabilities
    const memory = (navigator as any).deviceMemory || 4; // Default to 4GB
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    
    // Detect performance level based on hardware
    let level: PerformanceLevel = PerformanceLevel.MEDIUM;
    if (memory >= 8 && hardwareConcurrency >= 8) {
      level = PerformanceLevel.HIGH;
    } else if (memory <= 2 || hardwareConcurrency <= 2) {
      level = PerformanceLevel.LOW;
    }

    // Load saved settings or use defaults
    const saved = this.loadSettings();
    
    return {
      level: saved.level || level,
      maxSprites: saved.maxSprites || this.getMaxSpritesForLevel(level),
      textureQuality: saved.textureQuality || this.getTextureQualityForLevel(level),
      enableVSync: saved.enableVSync !== undefined ? saved.enableVSync : true,
      enableSpritePooling: saved.enableSpritePooling !== undefined ? saved.enableSpritePooling : true,
      enableTextureCaching: saved.enableTextureCaching !== undefined ? saved.enableTextureCaching : true,
      enableFrustumCulling: saved.enableFrustumCulling !== undefined ? saved.enableFrustumCulling : true,
      maxRenderDistance: saved.maxRenderDistance || this.getMaxRenderDistanceForLevel(level),
      shadowQuality: saved.shadowQuality || this.getShadowQualityForLevel(level)
    };
  }

  private getMaxSpritesForLevel(level: PerformanceLevel): number {
    switch (level) {
      case PerformanceLevel.LOW: return 100;
      case PerformanceLevel.MEDIUM: return 250;
      case PerformanceLevel.HIGH: return 500;
      case PerformanceLevel.ULTRA: return 1000;
      default: return 250;
    }
  }

  private getTextureQualityForLevel(level: PerformanceLevel): number {
    switch (level) {
      case PerformanceLevel.LOW: return 0.5;
      case PerformanceLevel.MEDIUM: return 0.75;
      case PerformanceLevel.HIGH: return 1.0;
      case PerformanceLevel.ULTRA: return 1.0;
      default: return 0.75;
    }
  }

  private getMaxRenderDistanceForLevel(level: PerformanceLevel): number {
    switch (level) {
      case PerformanceLevel.LOW: return 500;
      case PerformanceLevel.MEDIUM: return 1000;
      case PerformanceLevel.HIGH: return 2000;
      case PerformanceLevel.ULTRA: return 4000;
      default: return 1000;
    }
  }

  private getShadowQualityForLevel(level: PerformanceLevel): number {
    switch (level) {
      case PerformanceLevel.LOW: return 0;
      case PerformanceLevel.MEDIUM: return 1;
      case PerformanceLevel.HIGH: return 2;
      case PerformanceLevel.ULTRA: return 3;
      default: return 1;
    }
  }

  /**
   * Apply performance optimizations to render engine
   */
  private applyOptimizations(): void {
    if (!this.renderEngine) return;

    try {
      // Apply sprite count limits
      if (typeof this.renderEngine.set_max_sprites === 'function') {
        this.renderEngine.set_max_sprites(this.settings.maxSprites);
      }

      // Apply texture quality settings
      if (typeof this.renderEngine.set_texture_quality === 'function') {
        this.renderEngine.set_texture_quality(this.settings.textureQuality);
      }

      // Enable/disable features based on settings
      if (typeof this.renderEngine.enable_sprite_pooling === 'function') {
        this.renderEngine.enable_sprite_pooling(this.settings.enableSpritePooling);
      }

      if (typeof this.renderEngine.enable_frustum_culling === 'function') {
        this.renderEngine.enable_frustum_culling(this.settings.enableFrustumCulling);
      }

      if (typeof this.renderEngine.set_max_render_distance === 'function') {
        this.renderEngine.set_max_render_distance(this.settings.maxRenderDistance);
      }

      console.log('🔧 Performance optimizations applied');
    } catch (error) {
      console.error('❌ Failed to apply performance optimizations:', error);
    }
  }

  /**
   * Auto-optimize based on current performance
   */
  private optimizeIfNeeded(): void {
    const now = performance.now();
    
    // Enforce cooldown to prevent oscillation
    if (now - this.lastOptimizationTime < this.OPTIMIZATION_COOLDOWN_MS) {
      return;
    }
    
    const targetFPS = this.getTargetFPS();
    
    // Require more extreme conditions to trigger optimization
    // If FPS is consistently below 70% of target, reduce quality
    if (this.metrics.averageFPS < targetFPS * 0.7) {
      console.log(`📉 Auto-downgrading: FPS ${this.metrics.averageFPS.toFixed(1)} < ${(targetFPS * 0.7).toFixed(1)} (70% of target ${targetFPS})`);
      this.downgradePerformance();
      this.lastOptimizationTime = now;
    }
    // If FPS is consistently above 150% of target with memory headroom, upgrade quality
    else if (this.metrics.averageFPS > targetFPS * 1.5 && this.metrics.memoryUsage.usedJSHeapSize < this.metrics.memoryUsage.jsHeapSizeLimit * 0.6) {
      console.log(`📈 Auto-upgrading: FPS ${this.metrics.averageFPS.toFixed(1)} > ${(targetFPS * 1.5).toFixed(1)} (150% of target ${targetFPS})`);
      this.upgradePerformance();
      this.lastOptimizationTime = now;
    }
  }

  private getTargetFPS(): number {
    switch (this.settings.level) {
      case PerformanceLevel.LOW: return 30;
      case PerformanceLevel.MEDIUM: return 45;
      case PerformanceLevel.HIGH: return 60;
      case PerformanceLevel.ULTRA: return 120;
      default: return 60;
    }
  }

  private downgradePerformance(): void {
    if (this.settings.level === PerformanceLevel.HIGH) {
      this.updateSettings({ level: PerformanceLevel.MEDIUM });
    } else if (this.settings.level === PerformanceLevel.MEDIUM) {
      this.updateSettings({ level: PerformanceLevel.LOW });
    } else if (this.settings.level === PerformanceLevel.ULTRA) {
      this.updateSettings({ level: PerformanceLevel.HIGH });
    }
  }

  private upgradePerformance(): void {
    if (this.settings.level === PerformanceLevel.LOW) {
      this.updateSettings({ level: PerformanceLevel.MEDIUM });
    } else if (this.settings.level === PerformanceLevel.MEDIUM) {
      this.updateSettings({ level: PerformanceLevel.HIGH });
    } else if (this.settings.level === PerformanceLevel.HIGH) {
      this.updateSettings({ level: PerformanceLevel.ULTRA });
    }
  }

  /**
   * Sprite caching functionality
   */
  cacheSprite(id: string, spriteData: any): void {
    this.spriteCache.set(id, {
      data: spriteData,
      timestamp: Date.now(),
      accessCount: 0
    });
  }

  getCachedSprite(id: string): any | null {
    this.cacheRequests++;
    const cached = this.spriteCache.get(id);
    
    if (cached) {
      this.cacheHits++;
      cached.accessCount++;
      return cached.data;
    }
    
    return null;
  }

  clearSpriteCache(): void {
    this.spriteCache.clear();
    console.log('🗑️ Sprite cache cleared');
  }

  /**
   * Texture caching functionality
   */
  cacheTexture(id: string, textureData: any): void {
    this.textureCache.set(id, {
      data: textureData,
      timestamp: Date.now(),
      size: this.estimateTextureSize(textureData)
    });
  }

  getCachedTexture(id: string): any | null {
    const cached = this.textureCache.get(id);
    return cached ? cached.data : null;
  }

  clearTextureCache(): void {
    this.textureCache.clear();
    console.log('🗑️ Texture cache cleared');
  }

  private estimateTextureSize(textureData: any): number {
    // Rough estimation of texture memory usage
    if (textureData && textureData.width && textureData.height) {
      return textureData.width * textureData.height * 4; // RGBA
    }
    return 1024; // Default estimate
  }

  /**
   * Get sprite count from render engine
   */
  private getSpriteCount(): number {
    if (this.renderEngine && typeof this.renderEngine.get_sprite_count === 'function') {
      return this.renderEngine.get_sprite_count();
    }
    return 0;
  }

  /**
   * Get texture count from render engine
   */
  private getTextureCount(): number {
    if (this.renderEngine && typeof this.renderEngine.get_texture_count === 'function') {
      return this.renderEngine.get_texture_count();
    }
    return 0;
  }

  /**
   * Log performance data for analytics
   */
  private logPerformanceData(): void {
    this.performanceLog.push({
      timestamp: Date.now(),
      metrics: { ...this.metrics }
    });

    // Keep only last 5 minutes of data
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    this.performanceLog = this.performanceLog.filter(
      entry => entry.timestamp > fiveMinutesAgo
    );
  }

  /**
   * Get performance history for analytics
   */
  getPerformanceHistory(): Array<{ timestamp: number; metrics: PerformanceMetrics }> {
    return [...this.performanceLog];
  }

  /**
   * Save settings to localStorage
   */
  private saveSettings(): void {
    try {
      localStorage.setItem('ttrpg_performance_settings', JSON.stringify(this.settings));
    } catch (error) {
      console.warn('Failed to save performance settings:', error);
    }
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): Partial<PerformanceSettings> {
    try {
      const saved = localStorage.getItem('ttrpg_performance_settings');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.warn('Failed to load performance settings:', error);
      return {};
    }
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const report = `
TTRPG Performance Report
========================

Current Metrics:
- FPS: ${this.metrics.fps.toFixed(1)} (avg: ${this.metrics.averageFPS.toFixed(1)})
- Frame Time: ${this.metrics.frameTime.toFixed(2)}ms (avg: ${this.metrics.averageFrameTime.toFixed(2)}ms)
- Memory Usage: ${(this.metrics.memoryUsage.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB / ${(this.metrics.memoryUsage.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB
- Sprites: ${this.metrics.spriteCount}
- Textures: ${this.metrics.textureCount}
- Cache Hit Rate: ${this.metrics.cacheHitRate.toFixed(1)}%

Settings:
- Performance Level: ${this.settings.level}
- Max Sprites: ${this.settings.maxSprites}
- Texture Quality: ${this.settings.textureQuality}
- Sprite Pooling: ${this.settings.enableSpritePooling ? 'Enabled' : 'Disabled'}
- Texture Caching: ${this.settings.enableTextureCaching ? 'Enabled' : 'Disabled'}
- Frustum Culling: ${this.settings.enableFrustumCulling ? 'Enabled' : 'Disabled'}

Recommendations:
${this.generateRecommendations()}
    `.trim();

    return report;
  }

  private generateRecommendations(): string {
    const recommendations: string[] = [];
    
    if (this.metrics.averageFPS < 30) {
      recommendations.push('- Consider reducing performance level for better FPS');
    }
    
    if (this.metrics.memoryUsage.usedJSHeapSize > this.metrics.memoryUsage.jsHeapSizeLimit * 0.8) {
      recommendations.push('- High memory usage detected, consider clearing caches');
    }
    
    if (this.metrics.cacheHitRate < 50) {
      recommendations.push('- Low cache hit rate, consider increasing cache size');
    }
    
    if (this.metrics.spriteCount > this.settings.maxSprites * 0.9) {
      recommendations.push('- Approaching sprite limit, consider increasing max sprites');
    }

    return recommendations.length > 0 ? recommendations.join('\n') : '- Performance looks good!';
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopMonitoring();
    this.clearSpriteCache();
    this.clearTextureCache();
    this.performanceLog = [];
    console.log('🧹 Performance service disposed');
  }
}

// Singleton instance
export const performanceService = new PerformanceService();
export default performanceService;