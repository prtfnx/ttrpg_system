import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fpsService } from '../fps.service';

type FPSServicePrivate = Record<string, unknown>;

// Reset singleton state between tests
function resetService() {
  fpsService.destroy();
  fpsService.resetStats();
  // destroy() does not reset these fields
  (fpsService as unknown as FPSServicePrivate)['currentFPS'] = 0;
  (fpsService as unknown as FPSServicePrivate)['frameCount'] = 0;
  (fpsService as unknown as FPSServicePrivate)['lastUpdateTime'] = 0;
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetService();
});

afterEach(() => {
  resetService();
});

// ── initialize ────────────────────────────────────────────────────────────────

describe('initialize', () => {
  it('marks service as initialized', () => {
    fpsService.initialize();
    expect(fpsService.getStatus().initialized).toBe(true);
  });

  it('warns if called when already initialized', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fpsService.initialize();
    fpsService.initialize();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Already initialized'));
  });
});

// ── recordFrame ───────────────────────────────────────────────────────────────

describe('recordFrame', () => {
  it('auto-initializes when not already initialized', () => {
    fpsService.recordFrame();
    expect(fpsService.getStatus().initialized).toBe(true);
  });

  it('does not update FPS until 1 second has elapsed', () => {
    let mockTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    fpsService.initialize();
    mockTime = 500; // only 500ms passed
    fpsService.recordFrame();

    expect(fpsService.getMetrics().current).toBe(0); // no update yet
  });

  it('updates FPS after 1 second of frames', () => {
    let mockTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    fpsService.initialize();
    // Simulate 60 frames in 1000ms
    for (let i = 0; i < 60; i++) {
      mockTime = i * (1000 / 60); // spread frames evenly
      fpsService.recordFrame();
    }
    mockTime = 1001; // push past the 1s interval
    fpsService.recordFrame();

    expect(fpsService.getMetrics().current).toBeGreaterThan(0);
  });

  it('tracks min and max FPS across updates', () => {
    let mockTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    fpsService.initialize();
    // First second: 30 frames
    for (let i = 0; i < 30; i++) fpsService.recordFrame();
    mockTime = 1001;
    fpsService.recordFrame();

    const metrics = fpsService.getMetrics();
    expect(metrics.min).toBeGreaterThan(0);
    expect(metrics.max).toBeGreaterThanOrEqual(metrics.min);
  });

  it('notifies subscribers when FPS updates', () => {
    let mockTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);
    const callback = vi.fn();

    fpsService.initialize();
    fpsService.subscribe(callback);
    callback.mockClear(); // ignore the immediate call

    for (let i = 0; i < 10; i++) fpsService.recordFrame();
    mockTime = 1001;
    fpsService.recordFrame();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});

// ── getMetrics ────────────────────────────────────────────────────────────────

describe('getMetrics', () => {
  it('returns zero values on fresh service', () => {
    const m = fpsService.getMetrics();
    expect(m.current).toBe(0);
    expect(m.average).toBe(0);
    expect(m.min).toBe(0);
    expect(m.max).toBe(0);
    expect(m.frameTime).toBe(0);
  });

  it('computes average from history', () => {
    let mockTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    fpsService.initialize();
    // Two FPS-update cycles
    for (let cycle = 0; cycle < 2; cycle++) {
      for (let i = 0; i < 30; i++) fpsService.recordFrame();
      mockTime += 1001;
      fpsService.recordFrame();
    }

    const m = fpsService.getMetrics();
    expect(m.average).toBeGreaterThan(0);
  });

  it('computes frameTime from currentFPS', () => {
    let mockTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    fpsService.initialize();
    for (let i = 0; i < 60; i++) fpsService.recordFrame();
    mockTime = 1001;
    fpsService.recordFrame();

    const m = fpsService.getMetrics();
    if (m.current > 0) {
      expect(m.frameTime).toBeCloseTo(1000 / m.current, 0);
    }
  });
});

// ── subscribe ─────────────────────────────────────────────────────────────────

describe('subscribe', () => {
  it('immediately calls callback with current metrics', () => {
    const cb = vi.fn();
    fpsService.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toHaveProperty('current');
  });

  it('returns unsubscribe function that works', () => {
    const cb = vi.fn();
    const unsub = fpsService.subscribe(cb);
    cb.mockClear();
    unsub();
    expect(fpsService.getSubscriberCount()).toBe(0);
  });

  it('tracks subscriber count', () => {
    const unsub1 = fpsService.subscribe(() => {});
    const unsub2 = fpsService.subscribe(() => {});
    expect(fpsService.getSubscriberCount()).toBe(2);
    unsub1();
    unsub2();
    expect(fpsService.getSubscriberCount()).toBe(0);
  });

  it('handles errors in subscriber callback gracefully', () => {
    let mockTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    fpsService.initialize();
    // Throw only on subsequent calls (not the immediate one from subscribe)
    let callCount = 0;
    fpsService.subscribe(() => {
      callCount++;
      if (callCount > 1) throw new Error('subscriber error');
    });

    for (let i = 0; i < 10; i++) fpsService.recordFrame();
    mockTime = 1001;
    fpsService.recordFrame();

    expect(spy).toHaveBeenCalled();
  });
});

// ── resetStats ────────────────────────────────────────────────────────────────

describe('resetStats', () => {
  it('resets min, max and history', () => {
    let mockTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    fpsService.initialize();
    for (let i = 0; i < 60; i++) fpsService.recordFrame();
    mockTime = 1001;
    fpsService.recordFrame();

    fpsService.resetStats();

    const m = fpsService.getMetrics();
    expect(m.min).toBe(0);
    expect(m.max).toBe(0);
    expect(fpsService.getStatus().historySize).toBe(0);
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe('destroy', () => {
  it('clears all subscribers', () => {
    fpsService.subscribe(() => {});
    fpsService.subscribe(() => {});
    fpsService.destroy();
    expect(fpsService.getSubscriberCount()).toBe(0);
  });

  it('marks service as not initialized', () => {
    fpsService.initialize();
    fpsService.destroy();
    expect(fpsService.getStatus().initialized).toBe(false);
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe('getStatus', () => {
  it('returns status object with expected shape', () => {
    const status = fpsService.getStatus();
    expect(status).toHaveProperty('initialized');
    expect(status).toHaveProperty('subscribers');
    expect(status).toHaveProperty('historySize');
    expect(status).toHaveProperty('currentFPS');
  });

  it('reflects current state', () => {
    fpsService.initialize();
    fpsService.subscribe(() => {});
    const status = fpsService.getStatus();
    expect(status.initialized).toBe(true);
    expect(status.subscribers).toBe(1);
  });
});
