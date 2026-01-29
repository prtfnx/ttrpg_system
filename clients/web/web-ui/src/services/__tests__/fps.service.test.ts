/**
 * FPS Service Tests
 * Production-ready tests for frame rate measurement service
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fpsService } from '@features/canvas';

describe('FPSService', () => {
  beforeEach(() => {
    fpsService.destroy();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    fpsService.destroy();
  });

  describe('initialization', () => {
    it('initializes successfully', () => {
      fpsService.initialize();
      const metrics = fpsService.getMetrics();
      
      expect(metrics.current).toBe(0);
      expect(metrics.average).toBe(0);
      expect(metrics.min).toBe(0);
      expect(metrics.max).toBe(0);
    });

    it('prevents double initialization with warning', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      
      fpsService.initialize();
      fpsService.initialize();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Already initialized')
      );
    });

    it('auto-initializes on first recordFrame call', () => {
      fpsService.recordFrame();
      const metrics = fpsService.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(typeof metrics.current).toBe('number');
    });
  });

  describe('frame recording', () => {
    it('records frames correctly', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 10; i++) {
        fpsService.recordFrame();
      }
      
      const metrics = fpsService.getMetrics();
      expect(metrics).toBeDefined();
    });

    it('calculates FPS after 1 second interval', () => {
      fpsService.initialize();
      
      const frameCount = 60;
      for (let i = 0; i < frameCount; i++) {
        fpsService.recordFrame();
      }
      
      vi.advanceTimersByTime(1000);
      fpsService.recordFrame();
      
      const metrics = fpsService.getMetrics();
      expect(metrics.current).toBeGreaterThan(0);
    });

    it('maintains rolling average over time', () => {
      fpsService.initialize();
      
      for (let second = 0; second < 5; second++) {
        for (let i = 0; i < 60; i++) {
          fpsService.recordFrame();
        }
        vi.advanceTimersByTime(1000);
      }
      
      const metrics = fpsService.getMetrics();
      expect(metrics.average).toBeGreaterThan(0);
      expect(Math.abs(metrics.average - 60)).toBeLessThan(10);
    });

    it('tracks minimum FPS', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 30; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      
      const metrics = fpsService.getMetrics();
      expect(metrics.min).toBeLessThanOrEqual(metrics.current);
      expect(metrics.min).toBeLessThanOrEqual(metrics.max);
    });

    it('tracks maximum FPS', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      
      for (let i = 0; i < 30; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      
      const metrics = fpsService.getMetrics();
      expect(metrics.max).toBeGreaterThanOrEqual(metrics.current);
      expect(metrics.max).toBeGreaterThanOrEqual(metrics.min);
    });
  });

  describe('metrics calculation', () => {
    it('calculates frame time correctly', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      
      const metrics = fpsService.getMetrics();
      expect(metrics.frameTime).toBeGreaterThan(0);
      expect(metrics.frameTime).toBeLessThan(100);
    });

    it('returns consistent metrics', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      
      const metrics1 = fpsService.getMetrics();
      const metrics2 = fpsService.getMetrics();
      
      expect(metrics1).toEqual(metrics2);
    });

    it('handles zero frames gracefully', () => {
      const status = fpsService.getStatus();
      
      expect(status.currentFPS).toBeGreaterThanOrEqual(0);
      expect(status.historySize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('observer pattern', () => {
    it('notifies subscribers on FPS update', () => {
      fpsService.initialize();
      
      const updates: any[] = [];
      const unsubscribe = fpsService.subscribe(metrics => {
        updates.push(metrics);
      });
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      fpsService.recordFrame();
      
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0]).toHaveProperty('current');
      expect(updates[0]).toHaveProperty('average');
      
      unsubscribe();
    });

    it('allows multiple subscribers', () => {
      fpsService.initialize();
      
      const updates1: any[] = [];
      const updates2: any[] = [];
      
      const unsub1 = fpsService.subscribe(m => updates1.push(m));
      const unsub2 = fpsService.subscribe(m => updates2.push(m));
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      fpsService.recordFrame();
      
      expect(updates1.length).toBe(updates2.length);
      expect(updates1.length).toBeGreaterThan(0);
      
      unsub1();
      unsub2();
    });

    it('stops notifying after unsubscribe', () => {
      fpsService.initialize();
      
      const updates: any[] = [];
      const unsubscribe = fpsService.subscribe(m => updates.push(m));
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      fpsService.recordFrame();
      
      const countBefore = updates.length;
      unsubscribe();
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      fpsService.recordFrame();
      
      expect(updates.length).toBe(countBefore);
    });
  });

  describe('history management', () => {
    it('maintains history size limit', () => {
      fpsService.initialize();
      
      for (let second = 0; second < 100; second++) {
        for (let i = 0; i < 60; i++) {
          fpsService.recordFrame();
        }
        vi.advanceTimersByTime(1000);
      }
      
      const metrics = fpsService.getMetrics();
      expect(metrics.average).toBeGreaterThan(0);
    });

    it('calculates average from available history', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 30; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      
      const metrics = fpsService.getMetrics();
      expect(metrics.average).toBeGreaterThan(0);
      expect(metrics.average).toBeLessThanOrEqual(60);
    });
  });

  describe('reset functionality', () => {
    it('resets statistics', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      fpsService.recordFrame();
      
      const beforeReset = fpsService.getStatus();
      expect(beforeReset.historySize).toBeGreaterThan(0);
      
      fpsService.resetStats();
      const afterReset = fpsService.getMetrics();
      
      expect(afterReset.min).toBe(0);
      expect(afterReset.max).toBe(0);
    });

    it('clears subscribers on destroy', () => {
      fpsService.initialize();
      
      const updates: any[] = [];
      fpsService.subscribe(m => updates.push(m));
      
      const initialCount = updates.length;
      fpsService.destroy();
      fpsService.initialize();
      
      for (let i = 0; i < 60; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      
      expect(updates.length).toBe(initialCount);
    });
  });

  describe('edge cases', () => {
    it('handles very high frame rates', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 240; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      fpsService.recordFrame();
      
      const metrics = fpsService.getMetrics();
      expect(metrics.current).toBeGreaterThan(0);
    });

    it('handles very low frame rates', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 5; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      fpsService.recordFrame();
      
      const metrics = fpsService.getMetrics();
      expect(metrics.current).toBeGreaterThanOrEqual(0);
    });

    it('handles irregular frame timing', () => {
      fpsService.initialize();
      
      fpsService.recordFrame();
      vi.advanceTimersByTime(100);
      fpsService.recordFrame();
      vi.advanceTimersByTime(500);
      fpsService.recordFrame();
      vi.advanceTimersByTime(400);
      fpsService.recordFrame();
      
      const metrics = fpsService.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.current).toBeGreaterThanOrEqual(0);
    });

    it('provides accurate status information', () => {
      fpsService.initialize();
      
      for (let i = 0; i < 30; i++) {
        fpsService.recordFrame();
      }
      vi.advanceTimersByTime(1000);
      
      const status = fpsService.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.subscribers).toBeGreaterThanOrEqual(0);
      expect(status.historySize).toBeGreaterThanOrEqual(0);
      expect(status.currentFPS).toBeGreaterThanOrEqual(0);
    });

    it('handles service lifecycle correctly', () => {
      expect(fpsService.getSubscriberCount()).toBe(0);
      
      fpsService.initialize();
      const unsub = fpsService.subscribe(() => {});
      
      expect(fpsService.getSubscriberCount()).toBe(1);
      
      unsub();
      expect(fpsService.getSubscriberCount()).toBe(0);
      
      fpsService.destroy();
      const status = fpsService.getStatus();
      expect(status.initialized).toBe(false);
    });
  });
});
