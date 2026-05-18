import { describe, it, expect, beforeEach } from 'vitest';
import {
  MouseMultiSelectStrategy,
  MultiSelectManager,
  MultiSelectMode,
} from '../MultiSelectManager';

// Helper to build a minimal MouseEvent
function mouseEvent(opts: Partial<{ ctrlKey: boolean; shiftKey: boolean }> = {}): MouseEvent {
  return { ctrlKey: false, shiftKey: false, ...opts } as unknown as MouseEvent;
}

const pos = (x: number, y: number) => ({ x, y });

describe('MouseMultiSelectStrategy', () => {
  let strategy: MouseMultiSelectStrategy;

  beforeEach(() => {
    strategy = new MouseMultiSelectStrategy();
  });

  describe('handleMouseDown', () => {
    it('plain click starts DRAG_RECTANGLE selection', () => {
      const result = strategy.handleMouseDown(mouseEvent(), pos(10, 20));
      expect(result.handled).toBe(true);
      expect(result.mode).toBe(MultiSelectMode.DRAG_RECTANGLE);
      expect(result.action).toBe('start_selection');
      expect(result.selectionRect).toEqual({ x1: 10, y1: 20, x2: 10, y2: 20 });
    });

    it('ctrl click starts CTRL_DRAG_RECTANGLE', () => {
      const result = strategy.handleMouseDown(mouseEvent({ ctrlKey: true }), pos(5, 5));
      expect(result.mode).toBe(MultiSelectMode.CTRL_DRAG_RECTANGLE);
      expect(result.handled).toBe(true);
    });

    it('shift click returns not handled', () => {
      const result = strategy.handleMouseDown(mouseEvent({ shiftKey: true }), pos(0, 0));
      expect(result.handled).toBe(false);
    });
  });

  describe('handleMouseMove', () => {
    it('updates selection rect during drag', () => {
      strategy.handleMouseDown(mouseEvent(), pos(0, 0));
      const result = strategy.handleMouseMove(mouseEvent(), pos(50, 60));
      expect(result.handled).toBe(true);
      expect(result.action).toBe('update_selection');
      expect(result.selectionRect).toEqual({ x1: 0, y1: 0, x2: 50, y2: 60 });
    });

    it('returns not handled when no drag is active', () => {
      const result = strategy.handleMouseMove(mouseEvent(), pos(10, 10));
      expect(result.handled).toBe(false);
    });
  });

  describe('handleMouseUp', () => {
    it('ends selection and returns correct rect', () => {
      strategy.handleMouseDown(mouseEvent(), pos(0, 0));
      const result = strategy.handleMouseUp(mouseEvent(), pos(100, 100));
      expect(result.handled).toBe(true);
      expect(result.action).toBe('end_selection');
      expect(result.selectionRect).toEqual({ x1: 0, y1: 0, x2: 100, y2: 100 });
    });

    it('returns not handled when no mode is active', () => {
      const result = strategy.handleMouseUp(mouseEvent(), pos(10, 10));
      expect(result.handled).toBe(false);
    });

    it('resets mode after mouse up', () => {
      strategy.handleMouseDown(mouseEvent(), pos(0, 0));
      strategy.handleMouseUp(mouseEvent(), pos(50, 50));
      expect(strategy.getCurrentMode()).toBeNull();
    });
  });

  describe('getCurrentMode + getCurrentSelectionRect', () => {
    it('initially null', () => {
      expect(strategy.getCurrentMode()).toBeNull();
      expect(strategy.getCurrentSelectionRect()).toBeNull();
    });

    it('returns mode after mouse down', () => {
      strategy.handleMouseDown(mouseEvent(), pos(0, 0));
      expect(strategy.getCurrentMode()).toBe(MultiSelectMode.DRAG_RECTANGLE);
    });

    it('returns rect after mouse move', () => {
      strategy.handleMouseDown(mouseEvent(), pos(10, 10));
      strategy.handleMouseMove(mouseEvent(), pos(20, 30));
      expect(strategy.getCurrentSelectionRect()).toEqual({ x1: 10, y1: 10, x2: 20, y2: 30 });
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      strategy.handleMouseDown(mouseEvent(), pos(5, 5));
      strategy.reset();
      expect(strategy.getCurrentMode()).toBeNull();
      expect(strategy.getCurrentSelectionRect()).toBeNull();
    });
  });
});

describe('MultiSelectManager', () => {
  // Build a minimal render engine mock with jest spy functions
  const makeEngine = () => ({
    clear_selection: vi.fn(),
    update_selection_rect: vi.fn(),
    select_sprites_in_rect: vi.fn(),
    clear_selection_rect: vi.fn(),
  });

  it('initial state is not active', () => {
    const mgr = new MultiSelectManager(null);
    expect(mgr.isSelectionActive()).toBe(false);
    expect(mgr.getCurrentMode()).toBeNull();
  });

  it('mouseDown activates and returns true', () => {
    const mgr = new MultiSelectManager(null);
    expect(mgr.handleMouseDown(mouseEvent(), pos(0, 0))).toBe(true);
    expect(mgr.isSelectionActive()).toBe(true);
  });

  it('mouseMove returns false when not active', () => {
    const mgr = new MultiSelectManager(null);
    expect(mgr.handleMouseMove(mouseEvent(), pos(10, 10))).toBe(false);
  });

  it('full drag cycle: down → move → up', () => {
    const engine = makeEngine();
    const mgr = new MultiSelectManager(engine as unknown as Parameters<typeof MultiSelectManager['prototype']['setRenderEngine']>[0]);
    mgr.handleMouseDown(mouseEvent(), pos(0, 0));
    mgr.handleMouseMove(mouseEvent(), pos(50, 50));
    mgr.handleMouseUp(mouseEvent(), pos(100, 100));
    expect(engine.select_sprites_in_rect).toHaveBeenCalledWith(0, 0, 100, 100, false);
    expect(mgr.isSelectionActive()).toBe(false);
  });

  it('ctrl drag calls select with addToSelection=true', () => {
    const engine = makeEngine();
    const mgr = new MultiSelectManager(engine as unknown as Parameters<typeof MultiSelectManager['prototype']['setRenderEngine']>[0]);
    mgr.handleMouseDown(mouseEvent({ ctrlKey: true }), pos(0, 0));
    mgr.handleMouseMove(mouseEvent({ ctrlKey: true }), pos(10, 10));
    mgr.handleMouseUp(mouseEvent({ ctrlKey: true }), pos(20, 20));
    expect(engine.select_sprites_in_rect).toHaveBeenCalledWith(0, 0, 20, 20, true);
  });

  it('DRAG_RECTANGLE calls clear_selection on start', () => {
    const engine = makeEngine();
    const mgr = new MultiSelectManager(engine as unknown as Parameters<typeof MultiSelectManager['prototype']['setRenderEngine']>[0]);
    mgr.handleMouseDown(mouseEvent(), pos(0, 0));
    expect(engine.clear_selection).toHaveBeenCalled();
  });

  it('setRenderEngine updates engine reference', () => {
    const mgr = new MultiSelectManager(null);
    const engine = makeEngine();
    mgr.setRenderEngine(engine as unknown as Parameters<typeof MultiSelectManager['prototype']['setRenderEngine']>[0]);
    mgr.handleMouseDown(mouseEvent(), pos(0, 0));
    expect(engine.clear_selection).toHaveBeenCalled();
  });
});
