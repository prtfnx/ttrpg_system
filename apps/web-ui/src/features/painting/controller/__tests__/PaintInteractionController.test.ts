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
      return vi.fn();
    }),
    submitCreate: vi.fn(() => crypto.randomUUID()),
    submitUpdate: vi.fn(() => crypto.randomUUID()),
    submitDelete: vi.fn(() => crypto.randomUUID()),
    queuePreview: vi.fn(),
    cancelLocalPreview: vi.fn(),
  };
  const engine = {
    screen_to_world: vi.fn((x: number, y: number) => new Float64Array([x / 2, y / 2])),
    paint_hit_test_object: vi.fn(() => committed[0]?.id),
  };
  const runtime = {
    getRenderEngine: vi.fn(() => engine),
    setPaintDraft: vi.fn(() => true),
    clearPaintDraft: vi.fn(() => true),
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
    const { controller, scene, runtime, updateState } = harness();
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
    expect(controller.getState().gestureActive).toBe(false);
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
