import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store';
import { usePaintInputRouting } from '../usePaintInputRouting';

describe('usePaintInputRouting', () => {
  beforeEach(() => useGameStore.setState({ activeTool: 'select' }));

  it('retains listener identities across tool changes and reads the current mode at dispatch', () => {
    const handlers = { mouseDown: vi.fn(), mouseMove: vi.fn(), mouseUp: vi.fn(), keyDown: vi.fn() };
    const { result, rerender } = renderHook(() => usePaintInputRouting(handlers));
    const original = result.current;
    act(() => useGameStore.setState({ activeTool: 'paint' }));
    rerender();
    expect(result.current).toBe(original);
    result.current.routedMouseDown(new MouseEvent('mousedown', { button: 0 }));
    result.current.routedMouseMove(new MouseEvent('mousemove', { buttons: 1 }));
    result.current.routedMouseUp(new MouseEvent('mouseup', { button: 0 }));
    result.current.routedKeyDown(new KeyboardEvent('keydown', { key: 'Delete' }));
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
    act(() => useGameStore.setState({ activeTool: 'select' }));
    original.routedMouseDown(new MouseEvent('mousedown', { button: 0 }));
    expect(handlers.mouseDown).toHaveBeenCalledOnce();
  });

  it('preserves camera/hover input and non-paint keyboard handlers', () => {
    useGameStore.setState({ activeTool: 'paint' });
    const handlers = { mouseDown: vi.fn(), mouseMove: vi.fn(), mouseUp: vi.fn(), keyDown: vi.fn() };
    const { result } = renderHook(() => usePaintInputRouting(handlers));
    for (const button of [1, 2]) {
      result.current.routedMouseDown(new MouseEvent('mousedown', { button }));
      result.current.routedMouseUp(new MouseEvent('mouseup', { button }));
    }
    result.current.routedMouseMove(new MouseEvent('mousemove', { buttons: 0 }));
    result.current.routedMouseMove(new MouseEvent('mousemove', { buttons: 2 }));
    result.current.routedKeyDown(new KeyboardEvent('keydown', { key: 'a' }));
    expect(handlers.mouseDown).toHaveBeenCalledTimes(2);
    expect(handlers.mouseUp).toHaveBeenCalledTimes(2);
    expect(handlers.mouseMove).toHaveBeenCalledTimes(2);
    expect(handlers.keyDown).toHaveBeenCalledOnce();
  });
});
