import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useContextMenu, useLightPlacement } from '../useContextMenu';

// useGameStore is called inside handleMoveToLayer (getState pattern)
vi.mock('@/store', () => ({
  useGameStore: Object.assign(
    vi.fn(() => ({})),
    { getState: vi.fn(() => ({ updateSprite: vi.fn() })) }
  ),
}));

function makeRefs(engineOverrides: Record<string, unknown> = {}) {
  const engine = {
    delete_sprite: vi.fn(),
    copy_sprite: vi.fn().mockReturnValue('{"id":"s1"}'),
    screen_to_world: vi.fn().mockReturnValue([10, 20]),
    paste_sprite: vi.fn(),
    resize_sprite: vi.fn(),
    rotate_sprite: vi.fn(),
    ...engineOverrides,
  };
  const canvasRef = { current: document.createElement('canvas') };
  const canvasEl = canvasRef.current;
  Object.defineProperty(canvasEl, 'width', { value: 800, configurable: true });
  Object.defineProperty(canvasEl, 'height', { value: 600, configurable: true });
  vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 800, height: 600, x: 0, y: 0, right: 800, bottom: 600, toJSON: () => ({})
  } as DOMRect);
  const rustRenderManagerRef = { current: engine };
  return { canvasRef, rustRenderManagerRef, engine };
}

describe('useContextMenu initial state', () => {
  it('starts with menu hidden', () => {
    const { canvasRef, rustRenderManagerRef } = makeRefs();
    const { result } = renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef, protocol: null })
    );
    expect(result.current.contextMenu.visible).toBe(false);
    expect(result.current.contextMenu.x).toBe(0);
    expect(result.current.contextMenu.y).toBe(0);
  });

  it('exposes setContextMenu to open the menu', () => {
    const { canvasRef, rustRenderManagerRef } = makeRefs();
    const { result } = renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef, protocol: null })
    );
    act(() => {
      result.current.setContextMenu({ visible: true, x: 100, y: 200, spriteId: 'abc' });
    });
    expect(result.current.contextMenu.visible).toBe(true);
    expect(result.current.contextMenu.spriteId).toBe('abc');
  });
});

describe('handleContextMenuAction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does nothing when engine is null', () => {
    const { canvasRef } = makeRefs();
    const { result } = renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef: { current: null }, protocol: null })
    );
    // Should not throw
    act(() => result.current.handleContextMenuAction('delete'));
  });

  it('delete: calls protocol.removeSprite when protocol and spriteId present', () => {
    const { canvasRef, rustRenderManagerRef } = makeRefs();
    const protocol = { removeSprite: vi.fn() } as never;
    const { result } = renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef, protocol })
    );
    act(() => {
      result.current.setContextMenu({ visible: true, x: 0, y: 0, spriteId: 'sprite-1' });
    });
    act(() => result.current.handleContextMenuAction('delete'));
    expect(protocol.removeSprite).toHaveBeenCalledWith('sprite-1');
  });

  it('delete: falls back to local delete when no protocol', () => {
    const { canvasRef, rustRenderManagerRef, engine } = makeRefs();
    const { result } = renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef, protocol: null })
    );
    act(() => {
      result.current.setContextMenu({ visible: true, x: 0, y: 0, spriteId: 'sprite-2' });
    });
    act(() => result.current.handleContextMenuAction('delete'));
    expect(engine.delete_sprite).toHaveBeenCalledWith('sprite-2');
  });

  it('copy: stores sprite data in copiedSprite', () => {
    const { canvasRef, rustRenderManagerRef } = makeRefs();
    const { result } = renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef, protocol: null })
    );
    act(() => {
      result.current.setContextMenu({ visible: true, x: 0, y: 0, spriteId: 'sprite-3' });
    });
    act(() => result.current.handleContextMenuAction('copy'));
    expect(result.current.contextMenu.copiedSprite).toBe('{"id":"s1"}');
  });

  it('unknown action: closes menu', () => {
    const { canvasRef, rustRenderManagerRef } = makeRefs();
    const { result } = renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef, protocol: null })
    );
    act(() => {
      result.current.setContextMenu({ visible: true, x: 50, y: 50 });
    });
    act(() => result.current.handleContextMenuAction('some_unknown_action'));
    expect(result.current.contextMenu.visible).toBe(false);
  });

  it('closes menu after delete action', () => {
    const { canvasRef, rustRenderManagerRef } = makeRefs();
    const { result } = renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef, protocol: null })
    );
    act(() => {
      result.current.setContextMenu({ visible: true, x: 10, y: 10, spriteId: 's-x' });
    });
    act(() => result.current.handleContextMenuAction('delete'));
    expect(result.current.contextMenu.visible).toBe(false);
  });
});

describe('click-outside closes menu', () => {
  it('closes on document click when visible', () => {
    const { canvasRef, rustRenderManagerRef } = makeRefs();
    const { result } = renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef, protocol: null })
    );
    act(() => {
      result.current.setContextMenu({ visible: true, x: 100, y: 100 });
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('click'));
    });
    expect(result.current.contextMenu.visible).toBe(false);
  });

  it('does not register click listener when menu hidden', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const { canvasRef, rustRenderManagerRef } = makeRefs();
    renderHook(() =>
      useContextMenu({ canvasRef, rustRenderManagerRef, protocol: null })
    );
    // No 'click' listener added (menu starts hidden)
    const clickListeners = addSpy.mock.calls.filter(([evt]) => evt === 'click');
    expect(clickListeners).toHaveLength(0);
  });
});

describe('useLightPlacement', () => {
  it('starts with no placement mode', () => {
    const canvasRef = { current: document.createElement('canvas') };
    const { result } = renderHook(() => useLightPlacement(canvasRef));
    expect(result.current.lightPlacementMode).toBeNull();
  });

  it('activates placement mode on startLightPlacement event', () => {
    const canvas = document.createElement('canvas');
    const canvasRef = { current: canvas };
    const { result } = renderHook(() => useLightPlacement(canvasRef));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('startLightPlacement', { detail: { preset: { name: 'torch', intensity: 1 } } })
      );
    });

    expect(result.current.lightPlacementMode?.active).toBe(true);
    expect(result.current.lightPlacementMode?.preset.name).toBe('torch');
    expect(canvas.style.cursor).toBe('crosshair');
  });

  it('cancels placement mode on cancelLightPlacement event', () => {
    const canvas = document.createElement('canvas');
    const canvasRef = { current: canvas };
    const { result } = renderHook(() => useLightPlacement(canvasRef));

    // Activate first
    act(() => {
      window.dispatchEvent(
        new CustomEvent('startLightPlacement', { detail: { preset: { name: 'torch', intensity: 1 } } })
      );
    });
    // Then cancel
    act(() => {
      window.dispatchEvent(new CustomEvent('cancelLightPlacement'));
    });

    expect(result.current.lightPlacementMode).toBeNull();
    expect(canvas.style.cursor).toBe('grab');
  });
});
