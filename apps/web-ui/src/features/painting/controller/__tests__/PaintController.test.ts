import { describe, expect, it, vi } from 'vitest';
import { PaintController, type PaintSceneRuntime, type PaintTransport } from '../PaintController';
import type { PaintObject, PaintObjectInput } from '../../model/paintObject';

const TABLE = '9e8ed60d-f18c-4f47-a5ce-fc04db50506a';
const OTHER_TABLE = 'd57d06dc-85d1-42a7-a928-2d1fa10848f9';
const OPERATION = '856e7eca-6461-4a42-a273-25c1171b5cc3';

function input(id = 'dd830253-e2bf-4a92-9862-eabe85f79c99'): PaintObjectInput {
  return {
    id,
    kind: 'line',
    geometry: {
      kind: 'line',
      start: { x: 0, y: 0, pressure: 1 },
      end: { x: 10, y: 10, pressure: 1 },
    },
    transform: { x: 0, y: 0, scale_x: 1, scale_y: 1 },
    style: { stroke_rgba: [1, 0, 0, 1], width: 2, fill_rgba: null },
  };
}

function object(version = 1, zOrder = 1): PaintObject {
  return {
    ...input(),
    table_id: TABLE,
    created_by: 1,
    version,
    z_order: zOrder,
    created_at: '2026-09-29T00:00:00Z',
    updated_at: '2026-09-29T00:00:00Z',
  };
}

function harness(now = 1_000) {
  let currentNow = now;
  const transport: PaintTransport = {
    createPaintObject: vi.fn(() => true),
    updatePaintObject: vi.fn(() => true),
    deletePaintObject: vi.fn(() => true),
    requestPaintSnapshot: vi.fn(() => true),
    sendPaintPreview: vi.fn(() => true),
    cancelPaintPreview: vi.fn(() => true),
  };
  const runtime: PaintSceneRuntime = {
    replacePaintObjectSnapshot: vi.fn(() => true),
    upsertPaintObject: vi.fn(() => true),
    removePaintObject: vi.fn(() => true),
    setPaintDraft: vi.fn(() => true),
    clearPaintDraft: vi.fn(() => true),
    clearPaintDrafts: vi.fn(),
  };
  const errors: string[] = [];
  const controller = new PaintController(transport, runtime, {
    now: () => currentNow,
    operationId: () => OPERATION,
    onError: error => errors.push(error),
  });
  return {
    controller,
    transport,
    runtime,
    errors,
    advance: (milliseconds: number) => { currentNow += milliseconds; },
  };
}

function chunk(index: number, count: number, objects: PaintObject[], revision = 4) {
  return {
    snapshot_id: 'a8f761db-c98d-46d6-b690-88ed74135fd1',
    table_id: TABLE,
    revision,
    chunk_index: index,
    chunk_count: count,
    complete: index === count - 1,
    objects,
  };
}

describe('PaintController', () => {
  it('retries snapshots even when the first chunk never arrives', () => {
    const { controller, transport, advance, errors } = harness(0);
    vi.mocked(transport.requestPaintSnapshot).mockReturnValue(false);
    controller.selectTable(TABLE);

    advance(9_999);
    controller.tick();
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(1);
    advance(1);
    controller.tick();
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    expect(errors).toEqual(['Paint snapshot timed out']);
    expect(controller.getState().hydrating).toBe(true);

    controller.tick();
    advance(9_999);
    controller.tick();
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    advance(1);
    controller.tick();
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(3);
  });

  it('measures the snapshot deadline from the request, not the first chunk', () => {
    const { controller, transport, advance } = harness();
    controller.selectTable(TABLE);
    advance(9_999);
    controller.acceptSnapshotChunk(chunk(0, 2, [object()]));
    advance(1);
    controller.tick();
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    expect(controller.getState().committed).toEqual([]);

    controller.acceptSnapshotChunk(chunk(0, 1, [object()]));
    advance(20_000);
    controller.tick();
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    expect(controller.getState().hydrating).toBe(false);
  });

  it('cancels the snapshot deadline when leaving the active table', () => {
    const { controller, transport, advance } = harness();
    controller.selectTable(TABLE);
    controller.selectTable(null);
    advance(10_000);
    controller.tick();
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(1);
  });

  it('assembles out-of-order chunks atomically and replays queued revisions', () => {
    const { controller, transport, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptEvent({
      operation_id: OPERATION,
      table_id: TABLE,
      revision: 5,
      action: 'update',
      object: object(2),
    });
    controller.acceptSnapshotChunk(chunk(1, 2, []));
    expect(runtime.replacePaintObjectSnapshot).toHaveBeenLastCalledWith(TABLE, 0, []);
    controller.acceptSnapshotChunk(chunk(0, 2, [object()]));

    expect(runtime.replacePaintObjectSnapshot).toHaveBeenCalledWith(TABLE, 4, [object()]);
    expect(runtime.upsertPaintObject).toHaveBeenCalledWith(TABLE, 5, object(2));
    expect(controller.getState()).toMatchObject({ revision: 5, hydrating: false });
    expect(controller.getState().committed[0].version).toBe(2);
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(1);
  });

  it('detects a revision gap and ignores stale-table traffic', () => {
    const { controller, transport, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [object()], 1));
    controller.acceptEvent({
      operation_id: OPERATION,
      table_id: TABLE,
      revision: 3,
      action: 'delete',
      deleted_id: object().id,
      deleted_version: 1,
    });
    controller.acceptEvent({
      operation_id: OPERATION,
      table_id: OTHER_TABLE,
      revision: 2,
      action: 'delete',
      deleted_id: object().id,
      deleted_version: 1,
    });

    expect(controller.getState().hydrating).toBe(true);
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    expect(runtime.removePaintObject).not.toHaveBeenCalled();
  });

  it('keeps exact pending commands for reconnect and expires stale intent', () => {
    const { controller, transport, advance, errors } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    expect(controller.submitCreate(input())).toBe(OPERATION);
    expect(transport.createPaintObject).toHaveBeenCalledTimes(1);

    controller.reconnect();
    expect(transport.createPaintObject).toHaveBeenCalledTimes(2);
    expect(transport.createPaintObject).toHaveBeenLastCalledWith(TABLE, OPERATION, input());

    advance(24 * 60 * 60 * 1_000 + 1);
    controller.reconnect();
    expect(controller.getState().pending).toHaveLength(0);
    expect(errors).toContain('A pending paint change expired and was discarded');
  });

  it('does not accept durable commands before the table snapshot is ready', () => {
    const { controller, transport } = harness();
    controller.selectTable(TABLE);

    expect(controller.submitCreate(input())).toBeNull();
    expect(controller.submitUpdate(input().id, 1, input())).toBeNull();
    expect(controller.submitDelete(input().id, 1)).toBeNull();
    expect(transport.createPaintObject).not.toHaveBeenCalled();
    expect(transport.updatePaintObject).not.toHaveBeenCalled();
    expect(transport.deletePaintObject).not.toHaveBeenCalled();

    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    expect(controller.submitCreate(input())).toBe(OPERATION);
  });

  it('resolves acknowledgements once and resyncs conflicts', () => {
    const { controller, transport, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.submitCreate(input());
    const accepted = {
      operation_id: OPERATION,
      table_id: TABLE,
      revision: 1,
      action: 'create' as const,
      object: object(),
    };
    controller.acceptEvent(accepted);
    controller.acceptEvent(accepted);
    expect(controller.getState().pending).toHaveLength(0);
    expect(runtime.upsertPaintObject).toHaveBeenCalledTimes(1);

    controller.submitUpdate(object().id, 1, input());
    controller.rejectOperation({
      operation_id: OPERATION,
      code: 'version_conflict',
      error: 'Paint object version changed',
    });
    expect(controller.getState().pending).toHaveLength(0);
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
  });

  it('drops stale previews, honors cancellation sequence, and expires entries', () => {
    const { controller, advance } = harness();
    controller.selectTable(TABLE);
    const preview = {
      table_id: TABLE,
      temporary_id: input().id,
      sequence: 2,
      expires_at: 2_000,
      draft: input(),
      actor_id: 7,
    };
    controller.acceptPreview(preview);
    controller.acceptPreview({ ...preview, sequence: 1 });
    expect(controller.getState().remotePreviews).toEqual([preview]);
    controller.acceptPreviewCancel({
      table_id: TABLE,
      temporary_id: preview.temporary_id,
      sequence: 1,
      actor_id: 7,
    });
    expect(controller.getState().remotePreviews).toHaveLength(1);
    advance(1_001);
    controller.tick();
    expect(controller.getState().remotePreviews).toHaveLength(0);
  });

  it('renders pending and remote drafts until authoritative resolution', () => {
    const { controller, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.submitCreate(input());
    expect(runtime.setPaintDraft).toHaveBeenCalledWith(
      TABLE,
      `pending:${OPERATION}`,
      input(),
    );

    const preview = {
      table_id: TABLE,
      temporary_id: input().id,
      sequence: 1,
      expires_at: 2_000,
      draft: input(),
      actor_id: 44,
    };
    controller.acceptPreview(preview);
    expect(runtime.setPaintDraft).toHaveBeenCalledWith(
      TABLE,
      `remote:44:${preview.temporary_id}`,
      preview.draft,
    );

    controller.acceptEvent({
      operation_id: OPERATION,
      table_id: TABLE,
      revision: 1,
      action: 'create',
      object: object(),
    });
    expect(runtime.clearPaintDraft).toHaveBeenCalledWith(`pending:${OPERATION}`);
    expect(runtime.clearPaintDraft).toHaveBeenCalledWith(
      `remote:44:${preview.temporary_id}`,
    );
  });

  it('replaces a restored renderer from retained authoritative state', () => {
    const { controller, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [object()], 4));

    expect(controller.restoreRenderer()).toBe(true);
    expect(runtime.replacePaintObjectSnapshot).toHaveBeenLastCalledWith(TABLE, 4, [object()]);
  });

  it('ignores snapshot chunks from a table generation that was switched away', () => {
    const { controller, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 2, [object()]));
    controller.selectTable(OTHER_TABLE);
    controller.acceptSnapshotChunk(chunk(1, 2, []));

    expect(runtime.replacePaintObjectSnapshot).toHaveBeenCalledTimes(2);
    expect(runtime.replacePaintObjectSnapshot).toHaveBeenLastCalledWith(OTHER_TABLE, 0, []);
    expect(controller.getState()).toMatchObject({
      tableId: OTHER_TABLE,
      revision: 0,
      hydrating: true,
    });
  });

  it('clears the previous renderer scene before requesting the next table', () => {
    const { controller, transport, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [object()], 4));

    controller.selectTable(OTHER_TABLE);

    expect(runtime.replacePaintObjectSnapshot).toHaveBeenLastCalledWith(OTHER_TABLE, 0, []);
    expect(transport.requestPaintSnapshot).toHaveBeenLastCalledWith(OTHER_TABLE);
    const clearOrder = vi.mocked(runtime.replacePaintObjectSnapshot).mock.invocationCallOrder.at(-1);
    const requestOrder = vi.mocked(transport.requestPaintSnapshot).mock.invocationCallOrder.at(-1);
    expect(clearOrder).toBeLessThan(requestOrder as number);
    expect(controller.getState()).toMatchObject({
      tableId: OTHER_TABLE,
      revision: 0,
      hydrating: true,
      committed: [],
    });
  });

  it('coalesces local previews to the latest state at 20 Hz', () => {
    vi.useFakeTimers();
    const { controller, transport, advance } = harness();
    controller.selectTable(TABLE);
    const first = input();
    const latest = { ...input(), transform: { ...input().transform, x: 20 } };

    controller.queuePreview(first);
    controller.queuePreview(latest);
    expect(transport.sendPaintPreview).toHaveBeenCalledTimes(1);
    advance(50);
    vi.advanceTimersByTime(50);

    expect(transport.sendPaintPreview).toHaveBeenCalledTimes(2);
    expect(transport.sendPaintPreview).toHaveBeenLastCalledWith(
      TABLE,
      latest.id,
      2,
      3_050,
      latest,
    );
    controller.dispose();
    vi.useRealTimers();
  });
});
