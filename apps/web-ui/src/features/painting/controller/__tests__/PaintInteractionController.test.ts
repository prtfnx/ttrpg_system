import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PaintInteractionController,
  type PaintInteractionScene,
} from '../PaintInteractionController';
import type { PaintControllerState } from '../PaintController';
import type { PaintObject } from '../../model/paintObject';
import { CanvasCommandController } from '../CanvasCommandController';

const TABLE = '9e8ed60d-f18c-4f47-a5ce-fc04db50506a';
const OBJECT_ID = 'dd830253-e2bf-4a92-9862-eabe85f79c99';

function object(createdBy = 7): PaintObject {
  return {
    id: OBJECT_ID,
    table_id: TABLE,
    kind: 'rectangle',
    geometry: { kind: 'rectangle', width: 20, height: 10 },
    transform: { x: 5, y: 6, scale_x: 1, scale_y: 1 },
    style: { stroke_rgba: [1, 0, 0, 1], width: 2, fill_rgba: null },
    created_by: createdBy,
    version: 3,
    z_order: 1,
    created_at: '2026-09-30T00:00:00Z',
    updated_at: '2026-09-30T00:00:00Z',
  };
}

function initialState(committed: PaintObject[] = []): PaintControllerState {
  return {
    tableId: TABLE,
    generation: 1,
    revision: committed.length,
    hydrating: false,
    committed,
    pending: [],
    remotePreviews: [],
    lastError: null,
  };
}

function pointer(
  pointerId: number,
  clientX: number,
  clientY: number,
  options: Partial<PointerEvent> = {},
): PointerEvent {
  return {
    pointerId,
    clientX,
    clientY,
    pressure: 0.5,
    button: 0,
    isPrimary: true,
    preventDefault: vi.fn(),
    getCoalescedEvents: () => [],
    ...options,
  } as unknown as PointerEvent;
}

function harness(committed: PaintObject[] = []) {
  let state = initialState(committed);
  let listener: ((value: PaintControllerState) => void) | null = null;
  const scene: PaintInteractionScene = {
    getState: vi.fn(() => state),
    subscribe: vi.fn(callback => {
      listener = callback;
      callback(state);
      return vi.fn(() => { listener = null; });
    }),
    submitCreate: vi.fn(() => crypto.randomUUID()),
    submitUpdate: vi.fn(() => crypto.randomUUID()),
    submitDelete: vi.fn(() => crypto.randomUUID()),
    queuePreview: vi.fn(),
    cancelLocalPreview: vi.fn(),
    reportLocalError: vi.fn(),
  };
  const engine = {
    screen_to_world: vi.fn((x: number, y: number) => new Float64Array([x / 2, y / 2])),
  };
  const runtime = {
    getRenderEngine: vi.fn((): typeof engine | null => engine),
    setPaintDraft: vi.fn(() => true),
    clearPaintDraft: vi.fn(() => true),
    hitTestPaintObject: vi.fn((): string | null => committed[0]?.id ?? null),
    hitTestPaintHandle: vi.fn((): string | null => null),
    selectPaintObject: vi.fn(() => true),
    clearPaintObjectSelection: vi.fn(),
    setSelectionFrame: vi.fn(() => true),
    clearSelectionFrame: vi.fn(),
    hitTestSelectionFrame: vi.fn((): string | null => null),
  };
  const captured = new Set<number>();
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 110,
    bottom: 70,
    width: 100,
    height: 50,
    toJSON: () => ({}),
  });
  canvas.setPointerCapture = vi.fn(id => captured.add(id));
  canvas.hasPointerCapture = vi.fn(id => captured.has(id));
  canvas.releasePointerCapture = vi.fn(id => captured.delete(id));
  const controller = new PaintInteractionController(scene, runtime);
  controller.connectScene();
  controller.bind(canvas);
  controller.setActor(7, false);
  controller.setEnabled(true);
  return {
    controller,
    scene,
    runtime,
    engine,
    canvas,
    updateState(next: PaintControllerState) {
      state = next;
      listener?.(next);
    },
  };
}

describe('PaintInteractionController', () => {
  function sharedSelection() {
    const h = harness([object()]);
    const transport = { sendCanvasCommand: vi.fn((_command: Record<string, unknown>) => true), requestCanvasHistory: vi.fn(() => true) };
    const owner = new CanvasCommandController(transport, { onResync: vi.fn(), onSelection: refs => h.controller.replaceSelection(refs) });
    owner.selectScope(TABLE, 7);
    h.controller.setCanvasCommandPort(owner);
    const sprites = { items: () => [{ id: 'sprite', x: 35, y: 5, bounds: [35, 5, 50, 15] as const,
      canEdit: true, canDelete: true,
      expected: { x: 35, y: 5, width: 15, height: 10, scale_x: 1, scale_y: 1, rotation: 0 } }],
    hitTest: () => null, select: vi.fn(), preview: vi.fn(), previewTransform: vi.fn(), restore: vi.fn(), move: vi.fn(), remove: vi.fn() };
    h.controller.setSpriteSelectionPort(sprites);
    h.controller.setSelectionMode('combined'); h.controller.setSelectOnly(true);
    h.controller.replaceSelection([{ kind: 'paint', id: OBJECT_ID }, { kind: 'sprite', id: 'sprite' }]);
    return { ...h, owner, transport, sprites };
  }

  it('resizes a mixed group from a shared corner with one durable command and full local previews', () => {
    const h = sharedSelection();
    h.runtime.hitTestSelectionFrame.mockReturnValue('se');
    h.controller.handlePointerDown(pointer(2, 60, 37)); // World corner (50,17), opposite (4,5).
    h.controller.handlePointerMove(pointer(2, 106, 49)); // Scale two around the fixed opposite corner.
    expect(h.sprites.previewTransform).toHaveBeenLastCalledWith('sprite', expect.objectContaining({ scale_x: 2, scale_y: 2 }));
    expect(h.transport.sendCanvasCommand).not.toHaveBeenCalled();
    h.controller.handlePointerUp(pointer(2, 106, 49));
    expect(h.transport.sendCanvasCommand).toHaveBeenCalledOnce();
    expect(h.transport.sendCanvasCommand.mock.lastCall![0]).toMatchObject({ mode: 'transform',
      transform: { pivot_x: 4, pivot_y: 5, scale: 2, rotation: 0 }, members: [{ kind: 'paint' }, { kind: 'sprite' }] });
    expect(h.scene.submitUpdate).not.toHaveBeenCalled();
    expect(h.sprites.restore).toHaveBeenCalledWith(TABLE, 'sprite');
    expect(h.runtime.clearPaintDraft).toHaveBeenCalledWith(`selection:${OBJECT_ID}`);
  });

  it.each(['copy', 'cut', 'delete', 'duplicate'] as const)('routes explicit default-mode %s through the durable owner', mode => {
    const h = sharedSelection();
    h.controller.setEnabled(false);
    expect(h.controller.spriteSelectionCommand(['sprite'], mode)).toBe(true);
    expect(h.transport.sendCanvasCommand.mock.lastCall![0]).toMatchObject({ mode: mode === 'duplicate' ? 'copy' : mode,
      members: [{ kind: 'sprite', id: 'sprite', expected: h.sprites.items()[0].expected }] });
    expect(h.sprites.move).not.toHaveBeenCalled();
    expect(h.sprites.remove).not.toHaveBeenCalled();
  });

  it('routes default-mode edits and transforms without optimistic renderer writes', () => {
    const h = sharedSelection();
    h.controller.setEnabled(false);
    expect(h.controller.editSprites(['sprite'], { width: 64, height: 32, rotation: 90, layer: 'map' })).toBe(true);
    const command = h.transport.sendCanvasCommand.mock.lastCall![0];
    expect(command).toMatchObject({ mode: 'sprite_edit', edit: { width: 64, height: 32, rotation: 90, layer: 'map' } });
    h.owner.acceptResult({ operation_id: command.operation_id, table_id: TABLE, success: true, selection: [], can_undo: true });
    expect(h.controller.transformSprites(['sprite'], { scale: 1.1, dx: 1 })).toBe(true);
    expect(h.transport.sendCanvasCommand.mock.lastCall![0]).toMatchObject({ mode: 'transform',
      transform: { pivot_x: 42.5, pivot_y: 10, scale: 1.1, dx: 1 } });
    expect(h.sprites.previewTransform).not.toHaveBeenCalled();
    expect(h.sprites.move).not.toHaveBeenCalled();
  });

  it('publishes accepted paste/delete selection to default sprite input without enabling mixed pointers', () => {
    const h = sharedSelection();
    h.controller.setSelectionMode('separate'); h.controller.setEnabled(false);
    h.sprites.select.mockClear();
    h.controller.replaceSelection([{ kind: 'sprite', id: 'pasted' }]);
    expect(h.sprites.select).toHaveBeenLastCalledWith(['pasted']);
    expect(h.controller.getState().enabled).toBe(false);
    h.controller.replaceSelection([]);
    expect(h.sprites.select).toHaveBeenLastCalledWith([]);
  });

  it('never edits a partial explicit selection or detached renderer', () => {
    const h = sharedSelection();
    expect(h.controller.spriteSelectionCommand(['sprite', 'missing'], 'copy')).toBe(false);
    vi.spyOn(h.sprites, 'items').mockReturnValue(h.sprites.items().map(sprite => ({ ...sprite, canEdit: false })));
    expect(h.controller.editSprites(['sprite'], { rotation: 90 })).toBe(false);
    h.runtime.getRenderEngine.mockReturnValue(null);
    expect(h.controller.pasteSelection()).toBe(false);
    expect(h.transport.sendCanvasCommand).not.toHaveBeenCalled();
  });

  it.each([{ width: 10 }, { width: 0, height: 10 }, { rotation: Infinity }, { layer: 'unknown' }])('rejects invalid absolute sprite edits %j', edit => {
    const h = sharedSelection();
    expect(h.controller.editSprites(['sprite'], edit)).toBe(false);
    expect(h.transport.sendCanvasCommand).not.toHaveBeenCalled();
    expect(h.scene.reportLocalError).toHaveBeenCalled();
  });

  it('rotates a mixed group around its shared center with one command', () => {
    const h = sharedSelection();
    h.runtime.hitTestSelectionFrame.mockReturnValue('rotate');
    h.controller.handlePointerDown(pointer(2, 37, -3)); // (27,-23), above center (27,11).
    h.controller.handlePointerUp(pointer(2, 71, 31)); // (61,11), quarter turn.
    expect(h.transport.sendCanvasCommand.mock.lastCall![0]).toMatchObject({ mode: 'transform',
      transform: { pivot_x: 27, pivot_y: 11, scale: 1, rotation: Math.PI / 2 } });
    expect(h.sprites.previewTransform).toHaveBeenLastCalledWith('sprite', expect.objectContaining({ rotation: 90 }));
  });

  it.each(['cancel', 'capture-loss'] as const)('restores mixed previews without writes after handle %s', reason => {
    const h = sharedSelection();
    h.runtime.hitTestSelectionFrame.mockReturnValue('se');
    h.controller.handlePointerDown(pointer(2, 60, 37));
    h.controller.handlePointerMove(pointer(2, 104, 49));
    if (reason === 'cancel') h.controller.handlePointerCancel(pointer(2, 104, 49));
    else h.controller.handleLostPointerCapture(pointer(2, 104, 49));
    expect(h.transport.sendCanvasCommand).not.toHaveBeenCalled();
    expect(h.controller.getState().gestureActive).toBe(false);
    expect(h.sprites.restore).toHaveBeenCalledWith(TABLE, 'sprite');
    expect(h.runtime.setSelectionFrame).toHaveBeenLastCalledWith(TABLE, [4, 5, 50, 5, 50, 17, 4, 17]);
  });

  it('cancels a group handle when authoritative sprite dimensions change without movement', () => {
    const h = sharedSelection();
    h.runtime.hitTestSelectionFrame.mockReturnValue('se');
    h.controller.handlePointerDown(pointer(2, 60, 37));
    const changed = h.sprites.items().map(sprite => ({ ...sprite, expected: { ...sprite.expected, width: 25 } }));
    vi.spyOn(h.sprites, 'items').mockReturnValue(changed);
    h.controller.reconcileSelection();
    expect(h.controller.getState().gestureActive).toBe(false);
    expect(h.transport.sendCanvasCommand).not.toHaveBeenCalled();
  });
  it('cancels a group handle when authoritative world geometry changes without a transform change', () => {
    const h = sharedSelection();
    h.runtime.hitTestSelectionFrame.mockReturnValue('se');
    h.controller.handlePointerDown(pointer(2, 60, 37));
    const changed = h.sprites.items().map(sprite => ({ ...sprite, geometryKey: 'new-vertices' }));
    vi.spyOn(h.sprites, 'items').mockReturnValue(changed);
    h.controller.reconcileSelection();
    expect(h.controller.getState().gestureActive).toBe(false);
    expect(h.transport.sendCanvasCommand).not.toHaveBeenCalled();
  });

  it('submits mixed group movement as one expected-state command, without per-member writes', () => {
    const { controller, scene, transport } = sharedSelection();
    controller.handlePointerDown(pointer(2, 20, 28));
    controller.handlePointerUp(pointer(2, 25, 35));
    expect(transport.sendCanvasCommand).toHaveBeenCalledOnce();
    expect(transport.sendCanvasCommand).toHaveBeenCalledWith(expect.objectContaining({ mode: 'transform',
      transform: expect.objectContaining({ dx: 5, dy: 7 }), members: [
        { kind: 'paint', id: OBJECT_ID, version: 3 },
        { kind: 'sprite', id: 'sprite', expected: { x: 35, y: 5, width: 15, height: 10, scale_x: 1, scale_y: 1, rotation: 0 } },
      ] }));
    expect(scene.submitUpdate).not.toHaveBeenCalled();
    expect(controller.getState().commandPending).toBe(true);
  });

  it('deletes editable mixed members in one command and waits for the accepted selection', () => {
    const { controller, transport, scene } = sharedSelection();
    expect(controller.deleteSelected()).toBe(true);
    expect(controller.getState().selectionCount).toBe(2);
    expect(transport.sendCanvasCommand.mock.lastCall![0].mode).toBe('delete');
    expect(scene.submitDelete).not.toHaveBeenCalled();
  });

  it('uses a shared selection pivot for uniform resize and rotation', () => {
    const { controller, transport } = sharedSelection();
    expect(controller.transformSelection({ scale: 2, rotation: Math.PI / 2 })).toBe(true);
    expect(transport.sendCanvasCommand.mock.lastCall![0]).toMatchObject({
      mode: 'transform', transform: { scale: 2, rotation: Math.PI / 2, pivot_x: 27, pivot_y: 11 },
    });
  });

  it('restyles selected editable paint atomically without changing retained sprite or locked selection', () => {
    const h = sharedSelection();
    const second = { ...object(), id: crypto.randomUUID() };
    const locked = { ...object(8), id: crypto.randomUUID() };
    h.updateState(initialState([object(), second, locked]));
    h.controller.replaceSelection([{ kind: 'paint', id: OBJECT_ID }, { kind: 'paint', id: second.id },
      { kind: 'paint', id: locked.id }, { kind: 'sprite', id: 'sprite' }]);
    const style = { stroke_rgba: [0, 1, 0, 1] as [number, number, number, number], width: 6, fill_rgba: null };
    expect(h.controller.restyleSelected(style)).toBe(true);
    const command = h.transport.sendCanvasCommand.mock.lastCall![0];
    expect(command).toMatchObject({ mode: 'restyle', style, members: [
      { kind: 'paint', id: OBJECT_ID, version: 3 }, { kind: 'paint', id: second.id, version: 3 },
    ] });
    expect(h.scene.submitUpdate).not.toHaveBeenCalled();
    expect(h.controller.restyleSelected(style)).toBe(true);
    h.owner.acceptResult({ operation_id: command.operation_id, table_id: TABLE, success: true,
      selection: [{ kind: 'paint', id: OBJECT_ID }, { kind: 'paint', id: second.id }], can_undo: true });
    expect(h.controller.getState()).toMatchObject({ selectionCount: 4, selectedSpriteIds: ['sprite'], canUndo: true });
  });

  it.each([['c', 'copy'], ['x', 'cut'], ['d', 'copy'], ['z', 'undo'], ['y', 'redo']])('routes Ctrl+%s to an authoritative %s command', (key, mode) => {
    const { controller, transport } = sharedSelection();
    const event = new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true });
    controller.handleKeyDown(event);
    expect(event.defaultPrevented).toBe(true);
    expect(transport.sendCanvasCommand.mock.lastCall![0].mode).toBe(mode);
  });

  it.each([['z', false, 'undo'], ['z', true, 'redo'], ['y', false, 'redo']])('shares history in separate mode for %s', (key, shiftKey, mode) => {
    const { controller, transport } = sharedSelection();
    controller.setEnabled(false);
    controller.setHistoryShortcutsEnabled(true);
    const event = new KeyboardEvent('keydown', { key: String(key), shiftKey: Boolean(shiftKey), ctrlKey: true, cancelable: true });
    const stop = vi.spyOn(event, 'stopImmediatePropagation');
    controller.handleKeyDown(event);
    expect(event.defaultPrevented).toBe(true);
    expect(stop).toHaveBeenCalledOnce();
    expect(transport.sendCanvasCommand.mock.lastCall![0].mode).toBe(mode);
    expect(controller.getState().enabled).toBe(false);
  });

  it('does not take text-field undo or shortcuts outside an enabled history scope', () => {
    const { controller, transport } = sharedSelection();
    controller.setEnabled(false);
    controller.handleKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    controller.setHistoryShortcutsEnabled(true);
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    Object.defineProperty(event, 'target', { value: document.createElement('textarea') });
    controller.handleKeyDown(event);
    expect(transport.sendCanvasCommand).not.toHaveBeenCalled();
  });

  it('nudges by ten with Shift and permits independent authoring before confirmation', () => {
    const { controller, transport, scene } = sharedSelection();
    controller.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    expect(transport.sendCanvasCommand.mock.lastCall![0]).toMatchObject({ transform: { dx: 10, dy: 0 } });
    controller.setSelectOnly(false); controller.setTool('draw');
    controller.handlePointerDown(pointer(3, 50, 50)); controller.handlePointerUp(pointer(3, 60, 60));
    expect(scene.submitCreate).toHaveBeenCalledOnce();
    expect(transport.sendCanvasCommand).toHaveBeenCalledOnce();
  });

  it('accepts shared intent while paint confirmations are outstanding', () => {
    const { controller, updateState, transport, scene } = sharedSelection();
    updateState({ ...initialState([object()]), pending: [{ operationId: crypto.randomUUID(), createdAt: 1,
      command: { kind: 'delete', tableId: TABLE, objectId: OBJECT_ID, expectedVersion: 3 } }] });
    expect(controller.selectionCommand('copy')).toBe(true);
    expect(transport.sendCanvasCommand).toHaveBeenCalledOnce();
    expect(scene.reportLocalError).not.toHaveBeenCalled();
  });
  it('selects all visible paint/sprites and adopts entity-list selections in combined mode', () => {
    const { controller } = harness([object()]);
    const sprites = { items: () => [{ id: 'sprite', x: 35, y: 5, bounds: [35, 5, 50, 15] as const, canEdit: true }],
      hitTest: () => null, select: vi.fn(), preview: vi.fn(), restore: vi.fn(), move: vi.fn(), remove: vi.fn() };
    controller.setSpriteSelectionPort(sprites); controller.setSelectionMode('combined'); controller.setSelectOnly(true);
    controller.handleKeyDown(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    expect(controller.getState().selectionCount).toBe(2);
    controller.adoptSpriteSelection(['hidden']);
    expect(controller.getState().selectedSpriteIds).toEqual([]);
    expect(controller.getState().selectedIds).toEqual([OBJECT_ID]);
    controller.adoptSpriteSelection(['sprite']); expect(controller.getState().selectionCount).toBe(2);
  });
  it('does not delete a controllable sprite when its separate delete permission is absent', () => {
    const { controller, runtime, scene } = harness([object()]);
    const sprites = { items: () => [{ id: 'player-text', x: 35, y: 5, bounds: [35, 5, 50, 15] as const, canEdit: true, canDelete: false }],
      hitTest: () => null, select: vi.fn(), preview: vi.fn(), restore: vi.fn(), move: vi.fn(), remove: vi.fn() };
    controller.setSpriteSelectionPort(sprites); controller.setSelectionMode('combined'); controller.setSelectOnly(true);
    runtime.hitTestPaintObject.mockReturnValue(null);
    controller.handlePointerDown(pointer(1, 10, 20)); controller.handlePointerUp(pointer(1, 70, 40));
    controller.deleteSelected();
    expect(scene.submitDelete).toHaveBeenCalledOnce(); expect(sprites.remove).not.toHaveBeenCalled();
  });
  it('marquee-selects paint in either direction and moves every selected editable object', () => {
    const first = object();
    const second = { ...object(), id: crypto.randomUUID(), transform: { x: 40, y: 6, scale_x: 1, scale_y: 1 } };
    const { controller, runtime, scene } = harness([first, second]);
    controller.setTool('select');
    runtime.hitTestPaintObject.mockReturnValue(null);
    controller.handlePointerDown(pointer(1, 80, 40));
    controller.handlePointerUp(pointer(1, 10, 20));
    expect(controller.getState().selectedIds).toEqual([first.id, second.id]);
    runtime.hitTestPaintObject.mockReturnValue(first.id);
    controller.handlePointerDown(pointer(2, 20, 28));
    controller.handlePointerUp(pointer(2, 25, 35));
    expect(scene.submitUpdate).toHaveBeenCalledTimes(2);
    expect(scene.submitUpdate).toHaveBeenCalledWith(first.id, 3, expect.objectContaining({ transform: { x: 10, y: 13, scale_x: 1, scale_y: 1 } }));
  });

  it('selects and moves sprites and paint together, restoring previews after cancel', () => {
    const { controller, runtime, scene } = harness([object()]);
    const sprites = { items: vi.fn(() => [{ id: 'sprite', x: 35, y: 5, bounds: [35, 5, 50, 15] as const, canEdit: true }]),
      hitTest: vi.fn((): string | null => null), select: vi.fn(), preview: vi.fn(), restore: vi.fn(), move: vi.fn(), remove: vi.fn() };
    controller.setSpriteSelectionPort(sprites);
    controller.setSelectionMode('combined');
    controller.setSelectOnly(true);
    runtime.hitTestPaintObject.mockReturnValue(null);
    controller.handlePointerDown(pointer(1, 10, 20));
    controller.handlePointerUp(pointer(1, 70, 40));
    expect(controller.getState().selectionCount).toBe(2);
    runtime.hitTestPaintObject.mockReturnValue(OBJECT_ID);
    controller.handlePointerDown(pointer(2, 20, 28));
    controller.handlePointerMove(pointer(2, 30, 38));
    controller.handlePointerCancel(pointer(2, 30, 38));
    expect(sprites.restore).toHaveBeenLastCalledWith(TABLE, 'sprite');
    expect(sprites.move).not.toHaveBeenCalled();
    expect(scene.submitUpdate).not.toHaveBeenCalled();
    controller.handlePointerDown(pointer(3, 20, 28));
    controller.handlePointerUp(pointer(3, 30, 38));
    expect(sprites.move).toHaveBeenCalledWith(TABLE, 'sprite', 45, 15);
    expect(scene.submitUpdate).toHaveBeenCalledOnce();
  });

  it('restores through the authoritative adapter when remote movement cancels a group gesture', () => {
    const { controller, runtime, scene } = harness([object()]);
    let current = { id: 'sprite', x: 35, y: 5, bounds: [35, 5, 50, 15] as const, canEdit: true };
    const sprites = { items: () => [current], hitTest: () => 'sprite', select: vi.fn(),
      preview: vi.fn(), restore: vi.fn(), move: vi.fn(), remove: vi.fn() };
    controller.setSpriteSelectionPort(sprites);
    controller.setSelectionMode('combined');
    controller.setSelectOnly(true);
    runtime.hitTestPaintObject.mockReturnValue(null);
    controller.handlePointerDown(pointer(1, 45, 25));
    controller.handlePointerMove(pointer(1, 55, 35));
    expect(sprites.preview).toHaveBeenLastCalledWith('sprite', 45, 15);
    current = { ...current, x: 80, y: 90 };
    controller.reconcileSelection();
    expect(controller.getState().gestureActive).toBe(false);
    expect(sprites.restore).toHaveBeenCalledWith(TABLE, 'sprite');
    expect(sprites.preview).not.toHaveBeenCalledWith('sprite', 35, 5);
    controller.handlePointerUp(pointer(1, 55, 35));
    expect(sprites.move).not.toHaveBeenCalled();
    expect(scene.submitUpdate).not.toHaveBeenCalled();
  });

  it('cancels through the old sprite adapter before replacing or detaching it', () => {
    const { controller, runtime } = harness();
    const sprites = { items: () => [{ id: 'sprite', x: 35, y: 5, bounds: [35, 5, 50, 15] as const, canEdit: true }],
      hitTest: () => 'sprite', select: vi.fn(), preview: vi.fn(), restore: vi.fn(), move: vi.fn(), remove: vi.fn() };
    controller.setSpriteSelectionPort(sprites);
    controller.setSelectionMode('combined');
    controller.setSelectOnly(true);
    runtime.hitTestPaintObject.mockReturnValue(null);
    controller.handlePointerDown(pointer(1, 45, 25));
    controller.handlePointerMove(pointer(1, 55, 35));
    controller.setSpriteSelectionPort(null);
    expect(sprites.restore).toHaveBeenCalledWith(TABLE, 'sprite');
    expect(controller.getState()).toMatchObject({ gestureActive: false, selectedSpriteIds: [] });
  });

  it.each(['delete', 'restyle'] as const)('cancels an active paint drag before %s and ignores its late pointer-up', command => {
    const { controller, scene, runtime, canvas } = harness([object()]);
    controller.setTool('select');
    controller.handlePointerDown(pointer(1, 20, 28));
    controller.handlePointerMove(pointer(1, 30, 38));
    expect(controller.getState().gestureActive).toBe(true);

    if (command === 'delete') controller.deleteSelected();
    else controller.restyleSelected({ stroke_rgba: [0, 0, 1, 1], width: 6, fill_rgba: null });

    expect(controller.getState().gestureActive).toBe(false);
    expect(canvas.hasPointerCapture(1)).toBe(false);
    expect(runtime.clearPaintDraft).toHaveBeenCalledWith('local');
    expect(scene.cancelLocalPreview).toHaveBeenCalledOnce();
    controller.handlePointerUp(pointer(1, 40, 48));
    if (command === 'delete') {
      expect(scene.submitDelete).toHaveBeenCalledExactlyOnceWith(OBJECT_ID, 3);
      expect(scene.submitUpdate).not.toHaveBeenCalled();
    } else {
      expect(scene.submitDelete).not.toHaveBeenCalled();
      expect(scene.submitUpdate).toHaveBeenCalledExactlyOnceWith(OBJECT_ID, 3,
        expect.objectContaining({ transform: object().transform,
          style: { stroke_rgba: [0, 0, 1, 1], width: 6, fill_rgba: null } }));
    }
  });

  it('restores a mixed drag before group deletion and never commits its abandoned move', () => {
    const { controller, scene, runtime, canvas } = harness([object()]);
    const sprites = { items: () => [{ id: 'sprite', x: 35, y: 5, bounds: [35, 5, 50, 15] as const,
      canEdit: true, canDelete: true }], hitTest: () => null, select: vi.fn(),
      preview: vi.fn(), restore: vi.fn(), move: vi.fn(), remove: vi.fn() };
    controller.setSpriteSelectionPort(sprites);
    controller.setSelectionMode('combined');
    controller.setSelectOnly(true);
    controller.handleKeyDown(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    controller.handlePointerDown(pointer(1, 20, 28));
    controller.handlePointerMove(pointer(1, 30, 38));

    controller.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(sprites.restore).toHaveBeenCalledExactlyOnceWith(TABLE, 'sprite');
    expect(sprites.remove).toHaveBeenCalledExactlyOnceWith(TABLE, 'sprite');
    expect(sprites.restore.mock.invocationCallOrder[0]).toBeLessThan(sprites.remove.mock.invocationCallOrder[0]);
    expect(runtime.clearPaintDraft).toHaveBeenCalledWith(`selection:${OBJECT_ID}`);
    expect(canvas.hasPointerCapture(1)).toBe(false);
    expect(controller.getState()).toMatchObject({ gestureActive: false, selectionCount: 0 });
    controller.handlePointerUp(pointer(1, 40, 48));
    expect(scene.submitDelete).toHaveBeenCalledExactlyOnceWith(OBJECT_ID, 3);
    expect(scene.submitUpdate).not.toHaveBeenCalled();
    expect(sprites.move).not.toHaveBeenCalled();
  });

  it('rotates from the handle using the visual center', () => {
    const { controller, runtime, scene } = harness([object()]);
    controller.setTool('select');
    controller.handlePointerDown(pointer(1, 20, 28));
    controller.handlePointerUp(pointer(1, 20, 28));
    runtime.hitTestPaintHandle.mockReturnValue('rotate');
    controller.handlePointerDown(pointer(2, 25, 0));
    controller.handlePointerUp(pointer(2, 46, 31));
    expect(scene.submitUpdate).toHaveBeenCalledWith(OBJECT_ID, 3,
      expect.objectContaining({ transform: expect.objectContaining({ rotation: Math.PI / 2 }) }));
  });
  beforeEach(() => vi.restoreAllMocks());

  it('has no constructor subscription and reconnects after effect-style disposal', () => {
    const { controller, scene, runtime, updateState } = harness();
    controller.dispose();
    vi.mocked(scene.subscribe).mockClear();
    const resumed = new PaintInteractionController(scene, runtime);
    resumed.setEnabled(true);
    expect(scene.subscribe).not.toHaveBeenCalled();

    resumed.connectScene();
    updateState({ ...initialState(), hydrating: true });
    expect(resumed.getState().ready).toBe(false);
    const unsubscribe = vi.mocked(scene.subscribe).mock.results.at(-1)!.value;
    resumed.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();

    updateState(initialState());
    const disconnect = resumed.connectScene();
    expect(resumed.getState().ready).toBe(true);
    updateState({ ...initialState(), hydrating: true });
    expect(resumed.getState().ready).toBe(false);
    disconnect();
    resumed.dispose();
    expect(vi.mocked(scene.subscribe).mock.results.at(-1)!.value).toHaveBeenCalledOnce();
  });

  it('captures DPR-scaled coalesced samples and creates exactly once', () => {
    const { controller, scene, runtime, engine, canvas } = harness();
    controller.handlePointerDown(pointer(1, 20, 30));
    const move = pointer(1, 30, 40, {
      getCoalescedEvents: () => [
        pointer(1, 25, 35, { pressure: 0.25 }),
        pointer(1, 30, 40, { pressure: 0.75 }),
      ],
    });
    controller.handlePointerMove(move);
    controller.handlePointerUp(pointer(1, 35, 45));

    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
    expect(engine.screen_to_world).toHaveBeenCalledWith(20, 20);
    expect(scene.submitCreate).toHaveBeenCalledOnce();
    expect(scene.submitCreate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'freehand',
      transform: { x: 10, y: 10, scale_x: 1, scale_y: 1 },
    }));
    expect(runtime.clearPaintDraft).toHaveBeenCalledWith('local');
    expect(scene.cancelLocalPreview).toHaveBeenCalled();
  });

  it('cancels on pointer cancellation, lost capture, tool change, and table change', () => {
    const { controller, scene, runtime, canvas, updateState } = harness();
    controller.handlePointerDown(pointer(1, 20, 30));
    controller.handlePointerCancel(pointer(1, 20, 30));
    controller.handlePointerDown(pointer(2, 20, 30));
    controller.handleLostPointerCapture(pointer(2, 20, 30));
    controller.handlePointerDown(pointer(3, 20, 30));
    controller.setTool('line');
    controller.handlePointerDown(pointer(4, 20, 30));
    updateState({ ...initialState(), tableId: crypto.randomUUID(), generation: 2 });

    expect(scene.submitCreate).not.toHaveBeenCalled();
    expect(runtime.clearPaintDraft).toHaveBeenCalledTimes(4);
    expect(canvas.releasePointerCapture).toHaveBeenCalledTimes(4);
    for (const id of [1, 2, 3, 4]) expect(canvas.hasPointerCapture(id)).toBe(false);
    expect(controller.getState().gestureActive).toBe(false);
  });

  it.each([
    ['move', 'detached'], ['up', 'detached'], ['move', 'invalid-camera'], ['up', 'invalid-camera'],
  ] as const)('cancels on pointer %s when coordinate conversion is %s', (phase, reason) => {
    const { controller, scene, runtime, engine, canvas } = harness();
    controller.handlePointerDown(pointer(1, 20, 30));
    if (reason === 'detached') runtime.getRenderEngine.mockReturnValue(null);
    else engine.screen_to_world.mockReturnValue(new Float64Array([NaN, Infinity]));

    if (phase === 'move') controller.handlePointerMove(pointer(1, 30, 40));
    else controller.handlePointerUp(pointer(1, 30, 40));
    controller.handlePointerUp(pointer(1, 30, 40));

    expect(scene.submitCreate).not.toHaveBeenCalled();
    expect(scene.submitUpdate).not.toHaveBeenCalled();
    expect(controller.getState().gestureActive).toBe(false);
    expect(canvas.hasPointerCapture(1)).toBe(false);
    expect(runtime.clearPaintDraft).toHaveBeenCalledWith('local');
    expect(scene.cancelLocalPreview).toHaveBeenCalled();
    controller.dispose();
  });

  it.each(['escape', 'disable', 'unbind', 'hydrate'] as const)(
    'releases pointer capture and discards the draft on %s',
    reason => {
      const { controller, canvas, scene, runtime, updateState } = harness();
      controller.handlePointerDown(pointer(1, 20, 30));
      expect(canvas.hasPointerCapture(1)).toBe(true);

      if (reason === 'escape') {
        controller.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
      } else if (reason === 'disable') {
        controller.setEnabled(false);
      } else if (reason === 'unbind') {
        controller.unbind();
      } else {
        updateState({ ...initialState(), hydrating: true });
      }
      controller.handlePointerUp(pointer(1, 30, 40));

      expect(canvas.hasPointerCapture(1)).toBe(false);
      expect(canvas.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(runtime.clearPaintDraft).toHaveBeenCalledWith('local');
      expect(scene.cancelLocalPreview).toHaveBeenCalledOnce();
      expect(scene.submitCreate).not.toHaveBeenCalled();
      expect(controller.getState().gestureActive).toBe(false);
    },
  );

  it('cleans up capture even when submitting the gesture throws', () => {
    const { controller, canvas, scene, runtime } = harness();
    vi.mocked(scene.submitCreate).mockImplementation(() => { throw new Error('Invalid paint'); });
    controller.handlePointerDown(pointer(1, 20, 30));
    expect(() => controller.handlePointerUp(pointer(1, 30, 40))).toThrow('Invalid paint');
    expect(canvas.hasPointerCapture(1)).toBe(false);
    expect(runtime.clearPaintDraft).toHaveBeenCalledWith('local');
    expect(scene.cancelLocalPreview).toHaveBeenCalledOnce();
    expect(controller.getState().gestureActive).toBe(false);
  });

  it('does not interrupt cancellation when capture was already lost', () => {
    const { controller, canvas, scene } = harness();
    controller.handlePointerDown(pointer(1, 20, 30));
    vi.mocked(canvas.releasePointerCapture).mockImplementation(() => {
      throw new DOMException('Pointer no longer active', 'NotFoundError');
    });
    expect(() => controller.handleLostPointerCapture(pointer(1, 20, 30))).not.toThrow();
    expect(controller.getState().gestureActive).toBe(false);
    expect(scene.submitCreate).not.toHaveBeenCalled();
  });

  it('ignores secondary pointers and recovers from failed capture', () => {
    const { controller, canvas, scene } = harness();
    controller.handlePointerDown(pointer(2, 20, 30, { isPrimary: false }));
    expect(controller.getState().gestureActive).toBe(false);

    vi.mocked(canvas.hasPointerCapture).mockReturnValue(false);
    controller.handlePointerDown(pointer(1, 20, 30));
    controller.handlePointerUp(pointer(1, 30, 40));
    expect(scene.submitCreate).not.toHaveBeenCalled();
    expect(controller.getState().gestureActive).toBe(false);
  });

  it('simplifies long coalesced input before publishing or committing a valid draft', () => {
    const { controller, scene } = harness();
    controller.handlePointerDown(pointer(1, 20, 30));
    controller.handlePointerMove(pointer(1, 10_020, 30, {
      getCoalescedEvents: () => Array.from({ length: 10_000 }, (_, index) =>
        pointer(1, index + 21, 30)),
    }));
    controller.handlePointerUp(pointer(1, 10_020, 30));
    expect(scene.submitCreate).toHaveBeenCalledOnce();
    const draft = vi.mocked(scene.submitCreate).mock.calls[0][0];
    expect(draft.geometry).toEqual({
      kind: 'freehand',
      points: [{ x: 0, y: 0, pressure: 0.5 }, { x: 10_000, y: 0, pressure: 0.5 }],
    });
    expect(scene.reportLocalError).not.toHaveBeenCalled();
  });

  it.each(['point', 'sample', 'bytes'] as const)('rejects excessive %s detail without committing a truncated path', limit => {
    const { controller, scene, canvas } = harness();
    controller.handlePointerDown(pointer(1, 20, 30));
    const count = limit === 'point' ? 8_192 : limit === 'sample' ? 32_768 : 3_000;
    expect(() => controller.handlePointerMove(pointer(1, count + 20, 30, {
      getCoalescedEvents: () => Array.from({ length: count }, (_, index) =>
        pointer(1, index + 21, 30, { pressure: limit === 'sample' ? 0.5 : index % 2 })),
    }))).not.toThrow();
    controller.handlePointerUp(pointer(1, count + 20, 30));
    expect(scene.submitCreate).not.toHaveBeenCalled();
    expect(scene.reportLocalError).toHaveBeenCalledOnce();
    expect(canvas.hasPointerCapture(1)).toBe(false);
    expect(controller.getState().gestureActive).toBe(false);
  });

  it('does not start or submit gestures while the scene is hydrating', () => {
    const { controller, scene, runtime, updateState } = harness();
    updateState({ ...initialState(), hydrating: true });

    controller.handlePointerDown(pointer(1, 20, 30));
    controller.handlePointerUp(pointer(1, 30, 40));

    expect(controller.getState()).toMatchObject({ ready: false, gestureActive: false });
    expect(runtime.setPaintDraft).not.toHaveBeenCalled();
    expect(scene.queuePreview).not.toHaveBeenCalled();
    expect(scene.submitCreate).not.toHaveBeenCalled();
  });

  it('moves only an authorized selected object with one versioned update', () => {
    const selected = object();
    const { controller, scene } = harness([selected]);
    controller.setTool('select');
    controller.handlePointerDown(pointer(1, 20, 30));
    controller.handlePointerMove(pointer(1, 30, 40));
    controller.handlePointerUp(pointer(1, 30, 40));

    expect(scene.submitUpdate).toHaveBeenCalledOnce();
    expect(scene.submitUpdate).toHaveBeenCalledWith(
      OBJECT_ID,
      3,
      expect.objectContaining({ transform: { x: 15, y: 16, scale_x: 1, scale_y: 1 } }),
    );
  });

  it('edits a selected line endpoint through a renderer handle', () => {
    const line = {
      ...object(),
      kind: 'line' as const,
      geometry: {
        kind: 'line' as const,
        start: { x: 0, y: 0, pressure: 1 },
        end: { x: 10, y: 0, pressure: 1 },
      },
    };
    const { controller, scene, runtime } = harness([line]);
    controller.setTool('select');
    controller.handlePointerDown(pointer(1, 20, 30));
    controller.handlePointerUp(pointer(1, 20, 30));
    vi.mocked(runtime.hitTestPaintHandle).mockReturnValue('line-end');

    controller.handlePointerDown(pointer(2, 30, 30));
    controller.handlePointerMove(pointer(2, 50, 50));
    controller.handlePointerUp(pointer(2, 50, 50));

    expect(scene.submitUpdate).toHaveBeenCalledOnce();
    expect(scene.submitUpdate).toHaveBeenCalledWith(
      OBJECT_ID,
      3,
      expect.objectContaining({
        geometry: expect.objectContaining({
          end: { x: 35, y: 24, pressure: 0.5 },
        }),
      }),
    );
  });

  it('restores and clears renderer selection with interaction lifecycle', () => {
    const { controller, runtime } = harness([object()]);
    controller.setTool('select');
    controller.handlePointerDown(pointer(1, 20, 30));
    controller.handlePointerUp(pointer(1, 20, 30));
    expect(runtime.selectPaintObject).toHaveBeenCalledWith(OBJECT_ID);
    controller.restoreRenderer();
    expect(runtime.selectPaintObject).toHaveBeenCalledTimes(2);
    controller.setEnabled(false);
    expect(runtime.clearPaintObjectSelection).toHaveBeenCalled();
  });

  it('allows selection but denies foreign-object mutation to a non-DM', () => {
    const { controller, scene } = harness([object(99)]);
    controller.setActor(7, false);
    controller.setTool('select');
    controller.handlePointerDown(pointer(1, 20, 30));
    controller.handlePointerMove(pointer(1, 30, 40));
    controller.handlePointerUp(pointer(1, 30, 40));

    expect(controller.getState()).toMatchObject({
      selected: { id: OBJECT_ID, created_by: 99 },
      canEditSelected: false,
      gestureActive: false,
    });
    expect(scene.submitUpdate).not.toHaveBeenCalled();
    expect(controller.deleteSelected()).toBe(false);
    expect(scene.submitDelete).not.toHaveBeenCalled();
  });

  it('supports DM delete, ignores delete in text fields, and submits restyles', () => {
    const selected = object(99);
    const { controller, scene } = harness([selected]);
    controller.setActor(7, true);
    controller.setTool('select');
    controller.handlePointerDown(pointer(1, 20, 30));
    controller.handlePointerUp(pointer(1, 20, 30));

    const input = document.createElement('input');
    controller.handleKeyDown({
      key: 'Delete',
      target: input,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);
    expect(scene.submitDelete).not.toHaveBeenCalled();
    controller.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete' }) as KeyboardEvent);
    expect(scene.submitDelete).toHaveBeenCalledOnce();

    const second = harness([selected]);
    second.controller.setActor(7, true);
    second.controller.setTool('select');
    second.controller.handlePointerDown(pointer(2, 20, 30));
    second.controller.handlePointerUp(pointer(2, 20, 30));
    expect(second.controller.restyleSelected({
      stroke_rgba: [0, 0, 1, 1],
      width: 6,
      fill_rgba: [0, 0, 1, 0.2],
    })).toBe(true);
    expect(second.scene.submitUpdate).toHaveBeenCalledWith(
      OBJECT_ID,
      3,
      expect.objectContaining({ style: expect.objectContaining({ width: 6 }) }),
    );
  });
});
