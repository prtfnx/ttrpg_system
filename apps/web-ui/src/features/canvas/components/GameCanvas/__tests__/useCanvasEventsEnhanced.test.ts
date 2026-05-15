import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCanvasEventsEnhanced } from '../useCanvasEventsEnhanced';

// Mock InputManager singleton so we don't need real key bindings
vi.mock('@features/canvas/services/InputManager', () => ({
  inputManager: {
    updateContext: vi.fn(),
    onAction: vi.fn(),
    offAction: vi.fn(),
    handleKeyDown: vi.fn(),
  },
}));

import { inputManager } from '@features/canvas/services/InputManager';

function makeEngine(overrides: Record<string, unknown> = {}) {
  return {
    get_selected_sprites: vi.fn().mockReturnValue([]),
    can_undo: vi.fn().mockReturnValue(false),
    can_redo: vi.fn().mockReturnValue(false),
    handle_mouse_down_with_ctrl: vi.fn(),
    handle_mouse_move: vi.fn(),
    handle_mouse_up: vi.fn(),
    handle_wheel: vi.fn(),
    handle_right_click: vi.fn().mockReturnValue('sprite-99'),
    get_cursor_type: vi.fn().mockReturnValue('default'),
    screen_to_world: vi.fn().mockReturnValue([50, 80]),
    delete_sprite: vi.fn(),
    copy_sprite: vi.fn().mockReturnValue('{"id":"x"}'),
    paste_sprite: vi.fn(),
    get_sprite_scale: vi.fn().mockReturnValue([1, 1]),
    set_sprite_scale: vi.fn(),
    get_sprite_position: vi.fn().mockReturnValue([0, 0]),
    set_sprite_position: vi.fn(),
    select_all_sprites: vi.fn(),
    clear_selection: vi.fn(),
    ...overrides,
  };
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'width', { value: 800, configurable: true });
  Object.defineProperty(canvas, 'height', { value: 600, configurable: true });
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 800, height: 600,
    x: 0, y: 0, right: 800, bottom: 600, toJSON: () => ({})
  } as DOMRect);
  return canvas;
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  const canvas = makeCanvas();
  const engine = makeEngine();
  return {
    canvasRef: { current: canvas },
    rustRenderManagerRef: { current: engine },
    lightPlacementMode: null,
    setLightPlacementMode: vi.fn(),
    setContextMenu: vi.fn(),
    togglePerformanceMonitor: vi.fn(),
    protocol: null,
    engine,
    canvas,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCanvasEventsEnhanced', () => {
  it('returns all stable handlers', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const h = result.current;
    expect(typeof h.stableMouseDown).toBe('function');
    expect(typeof h.stableMouseMove).toBe('function');
    expect(typeof h.stableMouseUp).toBe('function');
    expect(typeof h.stableWheel).toBe('function');
    expect(typeof h.stableRightClick).toBe('function');
    expect(typeof h.stableKeyDown).toBe('function');
    expect(typeof h.handleCanvasFocus).toBe('function');
    expect(typeof h.handleCanvasBlur).toBe('function');
    expect(Array.isArray(h.selectedSpriteIds)).toBe(true);
  });

  it('registers action handlers on engine mount', () => {
    const props = defaultProps();
    renderHook(() => useCanvasEventsEnhanced(props));
    expect(inputManager.onAction).toHaveBeenCalled();
    expect(inputManager.updateContext).toHaveBeenCalled();
  });

  it('deregisters action handlers on unmount', () => {
    const props = defaultProps();
    const { unmount } = renderHook(() => useCanvasEventsEnhanced(props));
    unmount();
    expect(inputManager.offAction).toHaveBeenCalled();
  });

  it('does not register handlers when engine is null', () => {
    const props = defaultProps();
    props.rustRenderManagerRef = { current: null };
    renderHook(() => useCanvasEventsEnhanced(props));
    expect(inputManager.onAction).not.toHaveBeenCalled();
  });
});

describe('mouse event handlers', () => {
  it('stableMouseDown calls engine.handle_mouse_down_with_ctrl', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new MouseEvent('mousedown', { clientX: 100, clientY: 100, ctrlKey: false }) as MouseEvent;
    Object.defineProperty(event, 'offsetX', { value: 100 });
    Object.defineProperty(event, 'offsetY', { value: 100 });

    act(() => result.current.stableMouseDown(event));

    expect(props.engine.handle_mouse_down_with_ctrl).toHaveBeenCalled();
  });

  it('stableMouseDown in light placement mode dispatches lightPlaced event', () => {
    const setLightPlacementMode = vi.fn();
    const props = defaultProps({
      lightPlacementMode: { active: true, preset: { name: 'torch' } },
      setLightPlacementMode,
    });

    const eventSpy = vi.fn();
    window.addEventListener('lightPlaced', eventSpy);

    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new MouseEvent('mousedown', { clientX: 200, clientY: 150 }) as MouseEvent;
    Object.defineProperty(event, 'offsetX', { value: 200 });
    Object.defineProperty(event, 'offsetY', { value: 150 });

    act(() => result.current.stableMouseDown(event));

    expect(eventSpy).toHaveBeenCalled();
    expect(setLightPlacementMode).toHaveBeenCalledWith(null);

    window.removeEventListener('lightPlaced', eventSpy);
  });

  it('stableMouseMove calls engine.handle_mouse_move', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new MouseEvent('mousemove', { clientX: 50, clientY: 50 }) as MouseEvent;

    act(() => result.current.stableMouseMove(event));

    expect(props.engine.handle_mouse_move).toHaveBeenCalled();
  });

  it('stableMouseUp calls engine.handle_mouse_up', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new MouseEvent('mouseup', { clientX: 50, clientY: 50 }) as MouseEvent;

    act(() => result.current.stableMouseUp(event));

    expect(props.engine.handle_mouse_up).toHaveBeenCalled();
  });

  it('stableWheel calls engine.handle_wheel', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100 });

    act(() => result.current.stableWheel(event));

    expect(props.engine.handle_wheel).toHaveBeenCalled();
  });

  it('stableRightClick sets context menu visible with clicked sprite', () => {
    const setContextMenu = vi.fn();
    const props = defaultProps({ setContextMenu });
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new MouseEvent('contextmenu', { clientX: 300, clientY: 200 }) as MouseEvent;
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });

    act(() => result.current.stableRightClick(event));

    expect(setContextMenu).toHaveBeenCalled();
    const callArg = (setContextMenu.mock.calls[0][0] as (prev: object) => object)({});
    expect((callArg as { visible: boolean }).visible).toBe(true);
    expect((callArg as { spriteId: string }).spriteId).toBe('sprite-99');
  });
});

describe('focus/blur handlers', () => {
  it('handleCanvasFocus updates inputManager context', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));

    act(() => result.current.handleCanvasFocus());

    expect(inputManager.updateContext).toHaveBeenCalledWith({ isCanvasFocused: true });
  });

  it('handleCanvasBlur updates inputManager context', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));

    act(() => result.current.handleCanvasBlur());

    expect(inputManager.updateContext).toHaveBeenCalledWith({ isCanvasFocused: false });
  });
});

describe('stableKeyDown', () => {
  it('delegates to inputManager.handleKeyDown', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new KeyboardEvent('keydown', { key: 'Delete' });

    act(() => result.current.stableKeyDown(event));

    expect(inputManager.handleKeyDown).toHaveBeenCalledWith(event);
  });
});
