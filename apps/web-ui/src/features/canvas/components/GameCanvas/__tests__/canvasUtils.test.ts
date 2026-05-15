import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGridCoord, getRelativeCoords, resizeCanvas } from '../canvasUtils';

describe('getGridCoord', () => {
  it('snaps to nearest grid cell', () => {
    expect(getGridCoord({ x: 60, y: 80 })).toEqual({ x: 50, y: 100 });
  });

  it('uses default grid size 50', () => {
    expect(getGridCoord({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(getGridCoord({ x: 24, y: 24 })).toEqual({ x: 0, y: 0 }); // rounds down
    expect(getGridCoord({ x: 25, y: 25 })).toEqual({ x: 50, y: 50 }); // rounds up (0.5 → 1)
    expect(getGridCoord({ x: 26, y: 26 })).toEqual({ x: 50, y: 50 });
  });

  it('uses custom grid size', () => {
    expect(getGridCoord({ x: 30, y: 60 }, 100)).toEqual({ x: 0, y: 100 });
    expect(getGridCoord({ x: 55, y: 55 }, 100)).toEqual({ x: 100, y: 100 });
  });

  it('handles negative coordinates', () => {
    const result = getGridCoord({ x: -30, y: -80 });
    expect(result.x).toBe(-50);
    expect(result.y).toBe(-100);
  });
});

describe('getRelativeCoords', () => {
  function makeCanvas(rect: DOMRect, width = 800, height = 600): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect);
    return canvas;
  }

  it('computes relative coords with no DPR scaling', () => {
    const rect = { left: 100, top: 50, width: 800, height: 600 } as DOMRect;
    const canvas = makeCanvas(rect, 800, 600);
    const event = { clientX: 200, clientY: 150 } as MouseEvent;

    const result = getRelativeCoords(event, canvas);
    expect(result.x).toBe(100); // 200 - 100
    expect(result.y).toBe(100); // 150 - 50
  });

  it('scales for DPR (canvas 2x larger than display)', () => {
    const rect = { left: 0, top: 0, width: 400, height: 300 } as DOMRect;
    const canvas = makeCanvas(rect, 800, 600); // 2x DPR
    const event = { clientX: 100, clientY: 75 } as MouseEvent;

    const result = getRelativeCoords(event, canvas);
    expect(result.x).toBe(200); // 100 * (800/400)
    expect(result.y).toBe(150); // 75 * (600/300)
  });

  it('handles zero offset canvas', () => {
    const rect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
    const canvas = makeCanvas(rect, 800, 600);
    const event = { clientX: 400, clientY: 300 } as MouseEvent;

    const result = getRelativeCoords(event, canvas);
    expect(result.x).toBe(400);
    expect(result.y).toBe(300);
  });
});

describe('resizeCanvas', () => {
  function makeSetup(containerRect: { width: number; height: number }, dpr = 1) {
    Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true, writable: true });

    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;

    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      ...containerRect,
      x: 0, y: 0, top: 0, left: 0, bottom: containerRect.height, right: containerRect.width,
      toJSON: () => ({}),
    } as DOMRect);
    container.appendChild(canvas);
    document.body.appendChild(container);

    const dprRef = { current: 1 };
    return { canvas, container, dprRef };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('sets canvas dimensions from container size', () => {
    const { canvas, dprRef } = makeSetup({ width: 800, height: 600 });

    resizeCanvas(canvas, dprRef, null);

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('600px');
    expect(dprRef.current).toBe(1);
  });

  it('applies device pixel ratio', () => {
    const { canvas, dprRef } = makeSetup({ width: 400, height: 300 }, 2);

    resizeCanvas(canvas, dprRef, null);

    expect(canvas.width).toBe(800);   // 400 * 2
    expect(canvas.height).toBe(600);  // 300 * 2
    expect(dprRef.current).toBe(2);
  });

  it('skips resize when dimensions unchanged', () => {
    const { canvas, dprRef } = makeSetup({ width: 800, height: 600 });
    canvas.width = 800;
    canvas.height = 600;

    const spy = vi.spyOn(console, 'warn');
    resizeCanvas(canvas, dprRef, null);

    // No warn, no change
    expect(spy).not.toHaveBeenCalled();
  });

  it('warns when canvas has no parent', () => {
    const canvas = document.createElement('canvas');
    const dprRef = { current: 1 };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    resizeCanvas(canvas, dprRef, null);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no parent container'));
  });

  it('calls rustRenderManager.resize_canvas and center_camera after resize', () => {
    const { canvas, dprRef } = makeSetup({ width: 800, height: 600 });

    const mockEngine = {
      screen_to_world: vi.fn().mockReturnValue([100, 200]),
      resize_canvas: vi.fn(),
      center_camera: vi.fn(),
      render: vi.fn(),
    };

    resizeCanvas(canvas, dprRef, mockEngine as never);

    expect(mockEngine.resize_canvas).toHaveBeenCalledWith(800, 600);
    expect(mockEngine.center_camera).toHaveBeenCalledWith(100, 200);
    expect(mockEngine.render).toHaveBeenCalled();
  });

  it('falls back to resize() if resize_canvas throws', () => {
    const { canvas, dprRef } = makeSetup({ width: 800, height: 600 });

    const mockEngine = {
      screen_to_world: vi.fn().mockReturnValue([0, 0]),
      resize_canvas: vi.fn().mockImplementation(() => { throw new Error('not impl'); }),
      resize: vi.fn(),
      center_camera: vi.fn(),
      render: vi.fn(),
    };

    resizeCanvas(canvas, dprRef, mockEngine as never);

    expect(mockEngine.resize).toHaveBeenCalledWith(800, 600);
  });
});
