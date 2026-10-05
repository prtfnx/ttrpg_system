import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PaintInteractionController,
  type PaintInteractionScene,
} from '../PaintInteractionController';
import type { PaintControllerState } from '../PaintController';
import type { PaintObject } from '../../model/paintObject';

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
    hitTestPaintObject: vi.fn(() => committed[0]?.id ?? null),
    hitTestPaintHandle: vi.fn((): string | null => null),
    selectPaintObject: vi.fn(() => true),
    clearPaintObjectSelection: vi.fn(),
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
