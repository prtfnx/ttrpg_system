import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputManager } from '../InputManager';

function makeKey(opts: {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: opts.key,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
    bubbles: true,
    cancelable: true,
  });
}

describe('InputManager', () => {
  let manager: InputManager;

  beforeEach(() => {
    manager = new InputManager();
  });

  describe('context', () => {
    it('starts with default context', () => {
      const ctx = manager.getContext();
      expect(ctx.isCanvasFocused).toBe(false);
      expect(ctx.selectedSpriteIds).toEqual([]);
      expect(ctx.canUndo).toBe(false);
    });

    it('updateContext merges partial update', () => {
      manager.updateContext({ isCanvasFocused: true, canUndo: true });
      const ctx = manager.getContext();
      expect(ctx.isCanvasFocused).toBe(true);
      expect(ctx.canUndo).toBe(true);
      expect(ctx.canRedo).toBe(false); // unchanged
    });

    it('notifies context listeners on update', () => {
      const cb = vi.fn();
      manager.onContextChange(cb);
      manager.updateContext({ hasClipboard: true });
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ hasClipboard: true }));
    });

    it('unsubscribing context listener stops notifications', () => {
      const cb = vi.fn();
      const unsubscribe = manager.onContextChange(cb);
      unsubscribe();
      manager.updateContext({ hasClipboard: true });
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('handleKeyDown', () => {
    it('returns false when canvas is not focused', () => {
      manager.updateContext({ selectedSpriteIds: ['s1'] });
      const event = makeKey({ key: 'Delete' });
      expect(manager.handleKeyDown(event)).toBe(false);
    });

    it('ignores shortcut when enabled() returns false', () => {
      manager.updateContext({ isCanvasFocused: true }); // no selectedSpriteIds
      const handler = vi.fn();
      manager.onAction('delete_selected', handler);
      const event = makeKey({ key: 'Delete' });
      manager.handleKeyDown(event);
      expect(handler).not.toHaveBeenCalled();
    });

    it('fires action when shortcut matches and enabled', () => {
      manager.updateContext({ isCanvasFocused: true, selectedSpriteIds: ['s1'] });
      const handler = vi.fn();
      manager.onAction('delete_selected', handler);
      const event = makeKey({ key: 'Delete' });
      expect(manager.handleKeyDown(event)).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires Ctrl+C copy_selected', () => {
      manager.updateContext({ isCanvasFocused: true, selectedSpriteIds: ['s1'] });
      const handler = vi.fn();
      manager.onAction('copy_selected', handler);
      manager.handleKeyDown(makeKey({ key: 'c', ctrlKey: true }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires Ctrl+Z undo when canUndo is true', () => {
      manager.updateContext({ isCanvasFocused: true, canUndo: true });
      const handler = vi.fn();
      manager.onAction('undo', handler);
      manager.handleKeyDown(makeKey({ key: 'z', ctrlKey: true }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+Z does not fire undo when canUndo is false', () => {
      manager.updateContext({ isCanvasFocused: true, canUndo: false });
      const handler = vi.fn();
      manager.onAction('undo', handler);
      manager.handleKeyDown(makeKey({ key: 'z', ctrlKey: true }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('fires Ctrl+Y redo when canRedo is true', () => {
      manager.updateContext({ isCanvasFocused: true, canRedo: true });
      const handler = vi.fn();
      manager.onAction('redo', handler);
      manager.handleKeyDown(makeKey({ key: 'y', ctrlKey: true }));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires Escape to clear_selection', () => {
      manager.updateContext({ isCanvasFocused: true });
      const handler = vi.fn();
      manager.onAction('clear_selection', handler);
      manager.handleKeyDown(makeKey({ key: 'Escape' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('action listeners', () => {
    it('offAction removes a specific listener', () => {
      manager.updateContext({ isCanvasFocused: true });
      const handler = vi.fn();
      manager.onAction('clear_selection', handler);
      manager.offAction('clear_selection', handler);
      manager.handleKeyDown(makeKey({ key: 'Escape' }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('multiple listeners for same action all fire', () => {
      manager.updateContext({ isCanvasFocused: true });
      const h1 = vi.fn();
      const h2 = vi.fn();
      manager.onAction('clear_selection', h1);
      manager.onAction('clear_selection', h2);
      manager.handleKeyDown(makeKey({ key: 'Escape' }));
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });

  describe('getShortcuts', () => {
    it('returns at least the default shortcuts', () => {
      const shortcuts = manager.getShortcuts();
      expect(shortcuts.length).toBeGreaterThan(5);
      const actions = shortcuts.map(s => s.action);
      expect(actions).toContain('delete_selected');
      expect(actions).toContain('undo');
      expect(actions).toContain('select_all');
    });
  });

  describe('destroy', () => {
    it('clears all listeners so actions no longer fire', () => {
      manager.updateContext({ isCanvasFocused: true });
      const handler = vi.fn();
      manager.onAction('clear_selection', handler);
      manager.destroy();
      manager.handleKeyDown(makeKey({ key: 'Escape' }));
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
