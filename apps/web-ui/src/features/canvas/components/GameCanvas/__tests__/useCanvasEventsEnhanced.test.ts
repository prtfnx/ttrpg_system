import type { RenderEngine } from '@lib/wasm/runtime';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    get_selected_walls: vi.fn().mockReturnValue([]),
    can_undo: vi.fn().mockReturnValue(false),
    can_redo: vi.fn().mockReturnValue(false),
    handle_mouse_down_full: vi.fn(),
    handle_mouse_move: vi.fn(),
    handle_mouse_up: vi.fn(),
    set_alt_pressed: vi.fn(),
    handle_wheel: vi.fn(),
    handle_right_click: vi.fn().mockReturnValue('sprite-99'),
    get_cursor_type: vi.fn().mockReturnValue('default'),
    screen_to_world: vi.fn().mockReturnValue([50, 80]),
    remove_sprite: vi.fn(),
    copy_sprite: vi.fn().mockReturnValue('{"id":"x"}'),
    paste_sprite: vi.fn(),
    get_sprite_scale: vi.fn().mockReturnValue([1, 1]),
    update_sprite_scale: vi.fn(),
    get_sprite_position: vi.fn().mockReturnValue([0, 0]),
    update_sprite_position: vi.fn(),
    translate_selected_walls: vi.fn().mockReturnValue([]),
    remove_selected_walls: vi.fn().mockReturnValue([]),
    select_all_sprites: vi.fn(),
    clear_selection: vi.fn(),
    cancel_current_operation: vi.fn().mockReturnValue(false),
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
    rustRenderManagerRef: { current: engine as unknown as RenderEngine },
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

  it('registers safe handlers before the renderer attaches', () => {
    const props = defaultProps();
    props.rustRenderManagerRef = { current: null as unknown as RenderEngine };
    renderHook(() => useCanvasEventsEnhanced(props));
    expect(inputManager.onAction).toHaveBeenCalled();
  });
});

describe('confirmed default sprite commands', () => {
  function setup() {
    const props = defaultProps();
    props.engine.get_selected_sprites.mockReturnValue(['first', 'second']);
    const editor = {
      getState: vi.fn(() => ({ canPaste: false, commandPending: false, canUndo: false, canRedo: false })),
      subscribe: vi.fn(() => vi.fn()), spriteSelectionCommand: vi.fn(() => true),
      pasteSelection: vi.fn(() => true), transformSprites: vi.fn(() => true),
    };
    const rendered = renderHook(() => useCanvasEventsEnhanced({ ...props,
      editor: editor as unknown as NonNullable<Parameters<typeof useCanvasEventsEnhanced>[0]['editor']> }));
    const action = (name: string) => {
      const handler = vi.mocked(inputManager.onAction).mock.calls.find(([key]) => key === name)?.[1];
      expect(handler).toBeDefined();
      act(() => handler!(new KeyboardEvent('keydown')));
    };
    return { props, editor, action, unmount: rendered.unmount };
  }

  it.each([['copy_selected', 'copy'], ['cut_selected', 'cut'], ['duplicate_selected', 'duplicate'], ['delete_selected', 'delete']])(
    'routes all selected sprites for %s', (actionName, mode) => {
      const h = setup();
      h.action(actionName);
      expect(h.editor.spriteSelectionCommand).toHaveBeenCalledWith(['first', 'second'], mode);
      expect(h.props.engine.copy_sprite).not.toHaveBeenCalled();
      expect(h.props.engine.remove_sprite).not.toHaveBeenCalled();
    });

  it('pastes and scales through the owner without optimistic mutation', () => {
    const h = setup();
    h.action('paste_sprites'); h.action('scale_up'); h.action('scale_down');
    expect(h.editor.pasteSelection).toHaveBeenCalledOnce();
    expect(h.editor.transformSprites).toHaveBeenNthCalledWith(1, ['first', 'second'], { scale: 1.1 });
    expect(h.editor.transformSprites).toHaveBeenNthCalledWith(2, ['first', 'second'], { scale: 0.9 });
    expect(h.props.engine.paste_sprite).not.toHaveBeenCalled();
    expect(h.props.engine.update_sprite_scale).not.toHaveBeenCalled();
  });

  it('nudges the group without renderer writes or synthetic acceptance events', () => {
    const h = setup();
    const moved = vi.fn(); window.addEventListener('sprite-moved', moved);
    h.action('move_right');
    expect(h.editor.transformSprites).toHaveBeenCalledWith(['first', 'second'], { dx: 50, dy: 0 });
    expect(h.props.engine.update_sprite_position).not.toHaveBeenCalled();
    expect(moved).not.toHaveBeenCalled(); window.removeEventListener('sprite-moved', moved);
  });

  it('resolves a replacement renderer and clears clipboard context on unmount', () => {
    const h = setup();
    const replacement = makeEngine({ get_selected_sprites: vi.fn(() => ['replacement']) });
    h.props.rustRenderManagerRef.current = replacement as unknown as RenderEngine;
    h.action('copy_selected');
    expect(h.editor.spriteSelectionCommand).toHaveBeenCalledWith(['replacement'], 'copy');
    h.props.rustRenderManagerRef.current = null as unknown as RenderEngine;
    h.action('paste_sprites');
    expect(h.editor.pasteSelection).not.toHaveBeenCalled();
    h.unmount();
    expect(inputManager.updateContext).toHaveBeenLastCalledWith(expect.objectContaining({ hasClipboard: false, isCanvasFocused: false }));
  });
});

describe('mouse event handlers', () => {
  it('stableMouseDown calls engine.handle_mouse_down_full', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new MouseEvent('mousedown', { clientX: 100, clientY: 100, ctrlKey: false }) as MouseEvent;
    Object.defineProperty(event, 'offsetX', { value: 100 });
    Object.defineProperty(event, 'offsetY', { value: 100 });

    act(() => result.current.stableMouseDown(event));

    expect(props.engine.handle_mouse_down_full).toHaveBeenCalledWith(100, 100, false, false);
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

  it('stableMouseUp syncs alt state and calls engine.handle_mouse_up', () => {
    const props = defaultProps();
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new MouseEvent('mouseup', { clientX: 50, clientY: 50, altKey: true }) as MouseEvent;

    act(() => result.current.stableMouseUp(event));

    expect(props.engine.set_alt_pressed).toHaveBeenCalledWith(true);
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

  it('cancels an active WASM operation on Escape before shortcut handling', () => {
    const engine = makeEngine({ cancel_current_operation: vi.fn().mockReturnValue(true) });
    const props = defaultProps({ rustRenderManagerRef: { current: engine as unknown as RenderEngine }, engine });
    const { result } = renderHook(() => useCanvasEventsEnhanced(props));
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    const stopPropagation = vi.spyOn(event, 'stopPropagation');

    act(() => result.current.stableKeyDown(event));

    expect(engine.cancel_current_operation).toHaveBeenCalled();
    expect(inputManager.handleKeyDown).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalled();
  });
});
