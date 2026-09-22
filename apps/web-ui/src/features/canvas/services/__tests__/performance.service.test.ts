import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fpsService from '../fps.service';
import { performanceService } from '../performance.service';

vi.mock('../fps.service', () => ({
  default: { getMetrics: vi.fn(() => ({ current: 60, average: 58, min: 50, max: 60, frameTime: 16.7 })) },
}));

const diagnostics = {
  frameNumber: 9,
  spritesConsidered: 100,
  spritesDrawn: 75,
  spritesCulled: 25,
  drawCalls: 80,
  bufferUploads: 90,
  activeLights: 4,
  shadowSegmentsTotal: 800,
  shadowCandidates: 800,
  shadowSegmentsAccepted: 30,
  shadowDrawCalls: 30,
  occlusionRevision: 2,
  occlusionRebuilds: 3,
  residentTextures: 12,
  estimatedTextureBytes: 4096,
  textureBudgetBytes: 8192,
  textureOverBudgetBytes: 0,
};

describe('PerformanceService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    performanceService.dispose();
    vi.mocked(fpsService.getMetrics).mockReturnValue({
      current: 60, average: 58, min: 50, max: 60, frameTime: 16.7,
    });
  });

  afterEach(() => {
    performanceService.dispose();
    vi.useRealTimers();
  });

  it('derives render timing percentiles from frame samples instead of the polling interval', () => {
    performanceService.initialize(() => diagnostics);
    for (const cpuDurationMs of [1, 2, 3, 4, 20]) {
      performanceService.recordFrame({ timestamp: 100, cpuDurationMs });
    }
    vi.advanceTimersByTime(250);

    expect(performanceService.getMetrics()).toMatchObject({
      frameTime: 20,
      averageFrameTime: 6,
      frameTimeP50: 3,
      frameTimeP95: 20,
      frameTimeMax: 20,
    });
  });

  it('reads renderer-owned operation and resource counters at four hertz', () => {
    const source = vi.fn(() => diagnostics);
    performanceService.initialize(source);

    vi.advanceTimersByTime(1_000);

    expect(source).toHaveBeenCalledTimes(4);
    expect(performanceService.getMetrics()).toMatchObject(diagnostics);
  });

  it('ignores invalid frame samples', () => {
    performanceService.recordFrame({ timestamp: 1, cpuDurationMs: Number.NaN });
    performanceService.recordFrame({ timestamp: 1, cpuDurationMs: -1 });

    expect(performanceService.getMetrics().frameTime).toBe(0);
  });

  it('bounds the frame sample ring', () => {
    for (let index = 0; index < 700; index += 1) {
      performanceService.recordFrame({ timestamp: index, cpuDurationMs: index });
    }
    performanceService.startMonitoring();
    vi.advanceTimersByTime(250);

    expect(performanceService.getMetrics().frameTimeP50).toBe(399);
  });

  it('returns mutation-safe metrics and history', () => {
    performanceService.initialize(() => diagnostics);
    vi.advanceTimersByTime(250);

    const metrics = performanceService.getMetrics();
    metrics.memoryUsage.usedJSHeapSize = 999;
    const history = performanceService.getPerformanceHistory();
    history[0].metrics.drawCalls = 999;

    expect(performanceService.getMetrics().memoryUsage.usedJSHeapSize).not.toBe(999);
    expect(performanceService.getPerformanceHistory()[0].metrics.drawCalls).toBe(80);
  });

  it('generates a report from measured renderer values', () => {
    performanceService.initialize(() => diagnostics);
    performanceService.recordFrame({ timestamp: 1, cpuDurationMs: 2.5 });
    vi.advanceTimersByTime(250);

    const report = performanceService.generateReport();
    expect(report).toContain('CPU submission');
    expect(report).toContain('80 draws');
    expect(report).toContain('12');
  });

  it('stops polling and clears retained samples on dispose', () => {
    const source = vi.fn(() => diagnostics);
    performanceService.initialize(source);
    performanceService.recordFrame({ timestamp: 1, cpuDurationMs: 5 });
    performanceService.dispose();
    vi.advanceTimersByTime(500);

    expect(source).not.toHaveBeenCalled();
    expect(performanceService.getMetrics().frameTime).toBe(0);
  });
});
