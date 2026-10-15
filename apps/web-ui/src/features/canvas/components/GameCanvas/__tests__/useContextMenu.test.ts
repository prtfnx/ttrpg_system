import type { RenderEngine } from '@lib/wasm/runtime';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useContextMenu, useLightPlacement } from '../useContextMenu';

function harness(withEditor = true) {
  const engine = {
    get_selected_sprites: vi.fn(() => ['sprite', 'second']),
    remove_sprite: vi.fn(), copy_sprite: vi.fn(), paste_sprite: vi.fn(),
    resize_sprite: vi.fn(), rotate_sprite: vi.fn(), move_sprite_to_layer: vi.fn(),
  };
  const editor = {
    getState: vi.fn(() => ({ selectedSpriteIds: [] as string[] })),
    subscribe: vi.fn((listener: (state: { canPaste: boolean; commandPending: boolean }) => void) => {
      listener({ canPaste: false, commandPending: false });
      return vi.fn();
    }),
    selectionCommand: vi.fn(() => true), spriteSelectionCommand: vi.fn(() => true),
    pasteSelection: vi.fn(() => true), editSprites: vi.fn(() => true),
  };
  const result = renderHook(() => useContextMenu({
    canvasRef: { current: document.createElement('canvas') },
    rustRenderManagerRef: { current: engine as unknown as RenderEngine },
    protocol: null,
    editor: withEditor ? editor as unknown as NonNullable<Parameters<typeof useContextMenu>[0]['editor']> : null,
  }));
  const open = (spriteId = 'sprite') => act(() => result.result.current.setContextMenu({ visible: true, x: 10, y: 20, spriteId }));
  return { ...result, engine, editor, open };
}

afterEach(() => vi.restoreAllMocks());

describe('authoritative sprite context menu', () => {
  it('starts closed and closes on outside click', () => {
    const h = harness();
    expect(h.result.current.contextMenu.visible).toBe(false);
    h.open();
    act(() => document.dispatchEvent(new MouseEvent('click')));
    expect(h.result.current.contextMenu.visible).toBe(false);
  });

  it.each(['copy', 'delete'] as const)('routes default group %s to the owner', action => {
    const h = harness();
    h.open();
    act(() => h.result.current.handleContextMenuAction(action));
    expect(h.editor.spriteSelectionCommand).toHaveBeenCalledWith(['sprite', 'second'], action);
    expect(h.engine.copy_sprite).not.toHaveBeenCalled();
    expect(h.engine.remove_sprite).not.toHaveBeenCalled();
    expect(h.result.current.contextMenu.visible).toBe(false);
  });

  it('includes paint members when the clicked sprite belongs to a mixed selection', () => {
    const h = harness();
    h.editor.getState.mockReturnValue({ selectedSpriteIds: ['sprite'] });
    h.open();
    act(() => h.result.current.handleContextMenuAction('copy'));
    expect(h.editor.selectionCommand).toHaveBeenCalledWith('copy');
    expect(h.editor.spriteSelectionCommand).not.toHaveBeenCalled();
  });

  it('targets an unselected clicked sprite without copying the unrelated group', () => {
    const h = harness();
    h.open('other');
    act(() => h.result.current.handleContextMenuAction('copy'));
    expect(h.editor.spriteSelectionCommand).toHaveBeenCalledWith(['other'], 'copy');
  });

  it('shows paste only for a confirmed idle clipboard and routes it to the owner', () => {
    const h = harness();
    expect(h.result.current.canPaste).toBe(false);
    const listener = h.editor.subscribe.mock.calls[0][0];
    act(() => listener({ canPaste: true, commandPending: false }));
    expect(h.result.current.canPaste).toBe(true);
    act(() => h.result.current.handleContextMenuAction('paste'));
    expect(h.editor.pasteSelection).toHaveBeenCalledOnce();
    expect(h.engine.paste_sprite).not.toHaveBeenCalled();
    act(() => listener({ canPaste: true, commandPending: true }));
    expect(h.result.current.canPaste).toBe(false);
  });

  it('submits absolute dimensions, normalized rotation and layer without local writes', () => {
    const h = harness();
    vi.spyOn(window, 'prompt').mockReturnValueOnce('64,32').mockReturnValueOnce('450');
    h.open();
    act(() => h.result.current.handleContextMenuAction('resize'));
    expect(h.editor.editSprites).toHaveBeenLastCalledWith(['sprite'], { width: 64, height: 32 });
    h.open();
    act(() => h.result.current.handleContextMenuAction('rotate'));
    expect(h.editor.editSprites).toHaveBeenLastCalledWith(['sprite'], { rotation: 90 });
    h.open();
    act(() => h.result.current.handleMoveToLayer('map'));
    expect(h.editor.editSprites).toHaveBeenLastCalledWith(['sprite'], { layer: 'map' });
    expect(h.engine.resize_sprite).not.toHaveBeenCalled();
    expect(h.engine.rotate_sprite).not.toHaveBeenCalled();
    expect(h.engine.move_sprite_to_layer).not.toHaveBeenCalled();
  });

  it.each(['12px,30', '12,30,40'])('passes malformed numeric input to owner validation: %s', input => {
    const h = harness();
    vi.spyOn(window, 'prompt').mockReturnValue(input);
    h.open();
    act(() => h.result.current.handleContextMenuAction('resize'));
    expect(h.editor.editSprites).toHaveBeenCalledWith(['sprite'], expect.objectContaining({ width: NaN }));
    expect(h.engine.resize_sprite).not.toHaveBeenCalled();
  });

  it('canceled prompts do not submit', () => {
    const h = harness();
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    h.open();
    act(() => h.result.current.handleContextMenuAction('resize'));
    h.open();
    act(() => h.result.current.handleContextMenuAction('rotate'));
    expect(h.editor.editSprites).not.toHaveBeenCalled();
  });

  it.each(['copy', 'paste', 'delete', 'resize', 'rotate'])('fails closed without an owner: %s', action => {
    const h = harness(false);
    h.open();
    act(() => h.result.current.handleContextMenuAction(action));
    expect(h.engine.copy_sprite).not.toHaveBeenCalled();
    expect(h.engine.paste_sprite).not.toHaveBeenCalled();
    expect(h.engine.remove_sprite).not.toHaveBeenCalled();
    expect(h.engine.resize_sprite).not.toHaveBeenCalled();
    expect(h.engine.rotate_sprite).not.toHaveBeenCalled();
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
