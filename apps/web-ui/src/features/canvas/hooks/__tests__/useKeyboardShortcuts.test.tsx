import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inputManager } from '../../services/InputManager';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

const resetContext = () => {
  inputManager.updateContext({
    selectedSpriteIds: [],
    selectedWallIds: [],
    hasClipboard: false,
    canUndo: false,
    canRedo: false,
    isCanvasFocused: false,
  });
};

describe('useKeyboardShortcuts', () => {
  beforeEach(resetContext);

  afterEach(() => {
    vi.restoreAllMocks();
    resetContext();
  });

  it('reacts to selection, clipboard, history, and focus context changes', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    const actions = () => result.current.getEnabledShortcuts().map(({ action }) => action);

    expect(actions()).not.toContain('delete_selected');
    expect(actions()).not.toContain('paste_sprites');
    expect(actions()).not.toContain('undo');
    expect(result.current.context.isCanvasFocused).toBe(false);

    act(() => {
      inputManager.updateContext({
        selectedSpriteIds: ['sprite-one'],
        hasClipboard: true,
        canUndo: true,
        canRedo: true,
        isCanvasFocused: true,
      });
    });

    expect(actions()).toEqual(expect.arrayContaining([
      'delete_selected',
      'copy_selected',
      'paste_sprites',
      'undo',
      'redo',
    ]));
    expect(result.current.context.selectedSpriteIds).toEqual(['sprite-one']);
    expect(result.current.context.isCanvasFocused).toBe(true);
  });

  it('unsubscribes from InputManager when unmounted', () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.spyOn(inputManager, 'subscribeContext')
      .mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useKeyboardShortcuts());
    expect(subscribe).toHaveBeenCalledOnce();

    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
