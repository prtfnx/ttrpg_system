import type { RenderDiagnostics, RenderFrameSample } from '@lib/wasm/runtime';
import { logger } from '@shared/utils/logger';
import fpsService from './fps.service';

type PerformanceWithMemory = Performance & {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
};

type DiagnosticsSource = () => RenderDiagnostics | null;

export interface PerformanceMetrics extends RenderDiagnostics {
  fps: number;
  averageFPS: number;
  frameTime: number;
  averageFrameTime: number;
  frameTimeP50: number;
  frameTimeP95: number;
  frameTimeMax: number;
  memoryUsage: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

const SAMPLE_CAPACITY = 600;
const HISTORY_CAPACITY = 1_200;
const MONITOR_INTERVAL_MS = 250;

const emptyDiagnostics = (): RenderDiagnostics => ({
  frameNumber: 0,
  spritesConsidered: 0,
  spritesDrawn: 0,
  spritesCulled: 0,
  drawCalls: 0,
  bufferUploads: 0,
  activeLights: 0,
  shadowSegmentsTotal: 0,
  shadowCandidates: 0,
  shadowSegmentsAccepted: 0,
  shadowDrawCalls: 0,
  occlusionRevision: 0,
  occlusionRebuilds: 0,
  residentTextures: 0,
  estimatedTextureBytes: 0,
  textureBudgetBytes: 0,
  textureOverBudgetBytes: 0,
});

const percentile = (sorted: readonly number[], fraction: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.ceil(sorted.length * fraction) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
};

class PerformanceService {
  private metrics: PerformanceMetrics = this.createInitialMetrics();
  private diagnosticsSource: DiagnosticsSource | null = null;
  private frameSamples: number[] = [];
  private isMonitoring = false;
  private monitoringInterval: number | null = null;
  private performanceLog: Array<{ timestamp: number; metrics: PerformanceMetrics }> = [];

  private createInitialMetrics(): PerformanceMetrics {
    const memory = (performance as PerformanceWithMemory).memory;
    return {
      ...emptyDiagnostics(),
      fps: 0,
      averageFPS: 0,
      frameTime: 0,
      averageFrameTime: 0,
      frameTimeP50: 0,
      frameTimeP95: 0,
      frameTimeMax: 0,
      memoryUsage: {
        usedJSHeapSize: memory?.usedJSHeapSize ?? 0,
        totalJSHeapSize: memory?.totalJSHeapSize ?? 0,
        jsHeapSizeLimit: memory?.jsHeapSizeLimit ?? 0,
      },
    };
  }

  initialize(diagnosticsSource: DiagnosticsSource): void {
    this.diagnosticsSource = diagnosticsSource;
    this.startMonitoring();
    logger.info('Renderer performance diagnostics initialized');
  }

  recordFrame(sample: RenderFrameSample): void {
    if (!Number.isFinite(sample.timestamp)
      || !Number.isFinite(sample.cpuDurationMs)
      || sample.cpuDurationMs < 0) return;

    this.frameSamples.push(sample.cpuDurationMs);
    if (this.frameSamples.length > SAMPLE_CAPACITY) this.frameSamples.shift();
    this.metrics.frameTime = sample.cpuDurationMs;
  }

  startMonitoring(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    this.monitoringInterval = window.setInterval(() => this.updateMetrics(), MONITOR_INTERVAL_MS);
    logger.info('Performance monitoring started');
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    this.isMonitoring = false;
    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.info('Performance monitoring stopped');
  }

  private updateMetrics(): void {
    const fps = fpsService.getMetrics();
    this.metrics.fps = fps.current;
    this.metrics.averageFPS = fps.average;

    if (this.frameSamples.length > 0) {
      const sorted = [...this.frameSamples].sort((a, b) => a - b);
      const total = this.frameSamples.reduce((sum, duration) => sum + duration, 0);
      this.metrics.averageFrameTime = total / this.frameSamples.length;
      this.metrics.frameTimeP50 = percentile(sorted, 0.5);
      this.metrics.frameTimeP95 = percentile(sorted, 0.95);
      this.metrics.frameTimeMax = sorted[sorted.length - 1];
    }

    const memory = (performance as PerformanceWithMemory).memory;
    if (memory) this.metrics.memoryUsage = { ...memory };

    try {
      const diagnostics = this.diagnosticsSource?.();
      if (diagnostics) Object.assign(this.metrics, diagnostics);
    } catch (error) {
      logger.warn('Failed to read renderer diagnostics', error);
    }

    this.performanceLog.push({
      timestamp: Date.now(),
      metrics: this.cloneMetrics(),
    });
    if (this.performanceLog.length > HISTORY_CAPACITY) this.performanceLog.shift();
  }

  private cloneMetrics(): PerformanceMetrics {
    return {
      ...this.metrics,
      memoryUsage: { ...this.metrics.memoryUsage },
    };
  }

  getMetrics(): PerformanceMetrics {
    return this.cloneMetrics();
  }

  getPerformanceHistory(): Array<{ timestamp: number; metrics: PerformanceMetrics }> {
    return this.performanceLog.map(entry => ({
      timestamp: entry.timestamp,
      metrics: { ...entry.metrics, memoryUsage: { ...entry.metrics.memoryUsage } },
    }));
  }

  generateReport(): string {
    const metrics = this.metrics;
    return [
      'TTRPG Renderer Performance Report',
      '=================================',
      `FPS: ${metrics.fps.toFixed(1)} (average ${metrics.averageFPS.toFixed(1)})`,
      `CPU submission: latest ${metrics.frameTime.toFixed(2)}ms, p50 ${metrics.frameTimeP50.toFixed(2)}ms, p95 ${metrics.frameTimeP95.toFixed(2)}ms, max ${metrics.frameTimeMax.toFixed(2)}ms`,
      `Sprites: ${metrics.spritesDrawn}/${metrics.spritesConsidered} drawn, ${metrics.spritesCulled} culled`,
      `GPU commands: ${metrics.drawCalls} draws, ${metrics.bufferUploads} buffer uploads`,
      `Lighting: ${metrics.activeLights} lights, ${metrics.shadowSegmentsAccepted}/${metrics.shadowCandidates} shadow segments, ${metrics.shadowDrawCalls} shadow draws`,
      `Occlusion: revision ${metrics.occlusionRevision}, ${metrics.occlusionRebuilds} rebuilds`,
      `Textures: ${metrics.residentTextures}, ${(metrics.estimatedTextureBytes / 1024 / 1024).toFixed(1)}MiB estimated / ${(metrics.textureBudgetBytes / 1024 / 1024).toFixed(1)}MiB policy budget, ${(metrics.textureOverBudgetBytes / 1024 / 1024).toFixed(1)}MiB over`,
      `JS memory: ${(metrics.memoryUsage.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB used`,
    ].join('\n');
  }

  dispose(): void {
    this.stopMonitoring();
    this.diagnosticsSource = null;
    this.frameSamples = [];
    this.performanceLog = [];
    this.metrics = this.createInitialMetrics();
    logger.info('Performance service disposed');
  }
}

export const performanceService = new PerformanceService();
export default performanceService;
