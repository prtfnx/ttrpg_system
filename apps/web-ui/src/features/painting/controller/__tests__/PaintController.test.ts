import { describe, expect, it, vi } from 'vitest';
import { PaintController, type PaintSceneRuntime, type PaintTransport } from '../PaintController';
import type { PaintObject, PaintObjectInput } from '../../model/paintObject';

const TABLE = '9e8ed60d-f18c-4f47-a5ce-fc04db50506a';
const OTHER_TABLE = 'd57d06dc-85d1-42a7-a928-2d1fa10848f9';
const OPERATION = '856e7eca-6461-4a42-a273-25c1171b5cc3';
const REQUEST = '1c063923-a906-4507-886e-2bd0ebc48a02';

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

function harness(now = 1_000, operationId = () => OPERATION) {
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
  const snapshotRequestId = vi.fn(() => REQUEST);
  const controller = new PaintController(transport, runtime, {
    now: () => currentNow,
    operationId,
    snapshotRequestId,
    onError: error => errors.push(error),
  });
  return {
    controller,
    transport,
    runtime,
    errors,
    snapshotRequestId,
    advance: (milliseconds: number) => { currentNow += milliseconds; },
  };
}

function chunk(index: number, count: number, objects: PaintObject[], revision = 4) {
  return {
    request_id: REQUEST,
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
  it('retains snapshots and contiguous events while the renderer is detached', () => {
    const { controller, runtime, transport } = harness();
    runtime.getRenderEngine = vi.fn(() => null);
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [object()], 4));
    controller.acceptEvent({
      operation_id: OPERATION, table_id: TABLE, revision: 5,
      action: 'update', object: object(2),
    });
    expect(controller.getState()).toMatchObject({ hydrating: false, revision: 5 });
    expect(controller.getState().committed).toEqual([object(2)]);
    expect(runtime.upsertPaintObject).not.toHaveBeenCalled();
    expect(controller.restoreRenderer()).toBe(false);
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(1);

    runtime.getRenderEngine = vi.fn(() => ({}));
    expect(controller.restoreRenderer()).toBe(true);
    expect(runtime.replacePaintObjectSnapshot).toHaveBeenLastCalledWith(TABLE, 5, [object(2)]);
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(1);
  });

  it('rejects inconsistent events even without renderer-side validation', () => {
    const { controller, runtime, transport } = harness();
    runtime.getRenderEngine = vi.fn(() => null);
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [object()], 4));
    controller.acceptEvent({
      operation_id: OPERATION, table_id: TABLE, revision: 5,
      action: 'update', object: object(3),
    });
    expect(controller.getState()).toMatchObject({ hydrating: true, revision: 4 });
    expect(controller.getState().committed).toEqual([object()]);
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate snapshot identity before installing a detached scene', () => {
    const { controller, runtime, errors } = harness();
    runtime.getRenderEngine = vi.fn(() => null);
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [object(), object()]));
    expect(controller.getState()).toMatchObject({ hydrating: true, revision: 0, committed: [] });
    expect(errors).toEqual(['Paint snapshot contains inconsistent object identity or ordering']);
  });

  it('reapplies pending and remote drafts after an authoritative snapshot', () => {
    const { controller, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.submitCreate(input());
    const preview = {
      table_id: TABLE, temporary_id: input().id, sequence: 1,
      expires_at: 2_000, draft: input(), actor_id: 7,
    };
    controller.acceptPreview(preview);
    vi.mocked(runtime.setPaintDraft!).mockClear();
    controller.requestSnapshot();
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    expect(runtime.setPaintDraft).toHaveBeenCalledWith(TABLE, `pending:${OPERATION}`, input());
    expect(runtime.setPaintDraft).toHaveBeenCalledWith(TABLE, `remote:7:${input().id}`, input());
  });

  it('deduplicates buffered events and recovers when their count limit is exceeded', () => {
    const { controller, transport, errors } = harness();
    controller.selectTable(TABLE);
    const event = (revision: number) => ({
      operation_id: OPERATION, table_id: TABLE, revision,
      action: 'update' as const, object: object(revision),
    });
    for (let index = 0; index < 500; index += 1) controller.acceptEvent(event(1));
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(1);
    for (let revision = 2; revision <= 257; revision += 1) controller.acceptEvent(event(revision));
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    expect(errors).toEqual(['Paint event backlog exceeded the browser limit']);
    controller.acceptSnapshotChunk(chunk(0, 1, [object(257)], 257));
    expect(controller.getState()).toMatchObject({ hydrating: false, revision: 257 });
    expect(controller.getState().committed).toEqual([object(257)]);
  });

  it('bounds buffered event bytes independently of their count', () => {
    const { controller, transport, errors } = harness();
    controller.selectTable(TABLE);
    const largeObject = {
      ...object(), kind: 'freehand' as const,
      geometry: {
        kind: 'freehand' as const,
        points: Array.from({ length: 1_000 }, (_, index) => ({ x: index, y: index, pressure: 0.5 })),
      },
    };
    for (let revision = 1; revision <= 150; revision += 1) {
      controller.acceptEvent({
        operation_id: OPERATION, table_id: TABLE, revision,
        action: 'update', object: { ...largeObject, version: revision },
      });
    }
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    expect(errors).toEqual(['Paint event backlog exceeded the browser limit']);
    controller.acceptSnapshotChunk(chunk(0, 1, [{ ...largeObject, version: 150 }], 150));
    expect(controller.getState()).toMatchObject({ hydrating: false, revision: 150 });
  });

  it('resyncs an excessive snapshot chunk count without allocating an assembly', () => {
    const { controller, transport, errors, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 2_001, []));
    expect(errors).toEqual(['Paint snapshot exceeded the chunk limit']);
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    expect(runtime.replacePaintObjectSnapshot).toHaveBeenCalledTimes(1);
  });

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
    const { controller, transport, runtime, advance } = harness();
    controller.selectTable(TABLE);
    controller.selectTable(null);
    advance(10_000);
    controller.tick();
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(1);
    expect(runtime.replacePaintObjectSnapshot).toHaveBeenLastCalledWith(TABLE, 0, []);
    expect(controller.getState()).toMatchObject({ tableId: null, committed: [], hydrating: false });
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

  it('bounds pending command count without sending or retaining rejected new intent', () => {
    const { controller, transport, runtime, errors } = harness(1_000, () => crypto.randomUUID());
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    vi.mocked(transport.createPaintObject).mockReturnValue(false);
    for (let index = 0; index < 128; index += 1) {
      expect(controller.submitCreate(input(crypto.randomUUID()))).not.toBeNull();
    }
    const retained = controller.getState().pending;
    expect(controller.submitCreate(input(crypto.randomUUID()))).toBeNull();
    expect(controller.getState().pending).toEqual(retained);
    expect(transport.createPaintObject).toHaveBeenCalledTimes(128);
    expect(runtime.setPaintDraft).toHaveBeenCalledTimes(128);
    expect(errors.at(-1)).toContain('Too many pending paint changes');
    controller.rejectOperation({ operation_id: retained[0].operationId, code: 'forbidden', error: 'Denied' });
    expect(controller.submitCreate(input(crypto.randomUUID()))).not.toBeNull();
    expect(controller.getState().pending).toHaveLength(128);
  });

  it('bounds serialized pending bytes before the command count ceiling', () => {
    const { controller, transport } = harness(1_000, () => crypto.randomUUID());
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    const path: PaintObjectInput = {
      ...input(), kind: 'freehand', geometry: { kind: 'freehand', points: Array.from({ length: 900 }, (_, index) => ({
        x: index, y: index + 0.1234, pressure: 0.8765,
      })) },
    };
    let rejected = false;
    for (let index = 0; index < 128; index += 1) {
      if (controller.submitCreate({ ...path, id: crypto.randomUUID() }) === null) {
        rejected = true;
        break;
      }
    }
    expect(rejected).toBe(true);
    const retained = controller.getState().pending;
    expect(retained.length).toBeGreaterThan(1);
    expect(retained.length).toBeLessThan(128);
    const bytes = retained.reduce((total, { operationId, createdAt, command }) => total
      + new TextEncoder().encode(JSON.stringify({ operationId, createdAt, command })).byteLength, 0);
    expect(bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(transport.createPaintObject).toHaveBeenCalledTimes(retained.length);
    controller.rejectOperation({ operation_id: retained[0].operationId, code: 'forbidden', error: 'Denied' });
    expect(controller.submitCreate({ ...path, id: crypto.randomUUID() })).not.toBeNull();
  });

  it('expires active intent without reconnect and requires a fresh snapshot before more edits', () => {
    const { controller, transport, runtime, advance, errors } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.submitCreate(input());
    advance(24 * 60 * 60 * 1_000 + 1);
    controller.tick();
    expect(controller.getState()).toMatchObject({ pending: [], hydrating: true });
    expect(transport.createPaintObject).toHaveBeenCalledTimes(1);
    expect(runtime.clearPaintDraft).toHaveBeenCalledWith(`pending:${OPERATION}`);
    expect(errors).toEqual(['A pending paint change expired and was discarded']);
    expect(controller.submitCreate(input())).toBeNull();
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    controller.acceptSnapshotChunk(chunk(0, 1, [object()], 1));
    expect(controller.getState()).toMatchObject({ hydrating: false, committed: [object()] });
  });

  it('expires inactive intent on tick without resyncing the visible table', () => {
    const { controller, transport, advance } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.submitCreate(input());
    controller.selectTable(OTHER_TABLE);
    controller.acceptSnapshotChunk({ ...chunk(0, 1, [], 0), table_id: OTHER_TABLE });
    advance(24 * 60 * 60 * 1_000 + 1);
    controller.tick();
    expect(controller.getState()).toMatchObject({ tableId: OTHER_TABLE, hydrating: false });
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    controller.selectTable(TABLE);
    expect(controller.getState().pending).toEqual([]);
    expect(transport.createPaintObject).toHaveBeenCalledTimes(1);
  });

  it('retains pending intent across table switches and retries only its captured table', () => {
    const { controller, transport, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.submitCreate(input());
    controller.selectTable(OTHER_TABLE);
    expect(controller.getState().pending).toEqual([]);
    controller.reconnect();
    expect(transport.createPaintObject).toHaveBeenCalledTimes(1);
    controller.acceptSnapshotChunk({ ...chunk(0, 1, [], 0), table_id: OTHER_TABLE });
    vi.mocked(runtime.setPaintDraft!).mockClear();
    controller.restoreRenderer();
    expect(runtime.setPaintDraft).not.toHaveBeenCalled();

    controller.selectTable(TABLE);
    expect(controller.getState().pending).toHaveLength(1);
    expect(transport.createPaintObject).toHaveBeenCalledTimes(2);
    expect(transport.createPaintObject).toHaveBeenLastCalledWith(TABLE, OPERATION, input());
  });

  it('resolves an inactive-table acknowledgement without mutating the active scene', () => {
    const { controller, transport, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.submitCreate(input());
    controller.selectTable(OTHER_TABLE);
    controller.acceptEvent({
      operation_id: OPERATION, table_id: TABLE, revision: 1,
      action: 'create', object: object(),
    });
    expect(runtime.upsertPaintObject).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ tableId: OTHER_TABLE, revision: 0, committed: [] });
    controller.selectTable(TABLE);
    expect(controller.getState().pending).toEqual([]);
    expect(transport.createPaintObject).toHaveBeenCalledTimes(1);
  });

  it('expires retained inactive-table intent before retrying it on return', () => {
    const { controller, transport, advance, errors } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.submitCreate(input());
    controller.selectTable(OTHER_TABLE);
    advance(24 * 60 * 60 * 1_000 + 1);
    controller.selectTable(TABLE);
    expect(transport.createPaintObject).toHaveBeenCalledTimes(1);
    expect(controller.getState().pending).toEqual([]);
    expect(errors).toEqual(['A pending paint change expired and was discarded']);
  });

  it('does not resync the active table for an inactive-table rejection', () => {
    const { controller, transport } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.submitCreate(input());
    controller.selectTable(OTHER_TABLE);
    controller.rejectOperation({ operation_id: OPERATION, code: 'version_conflict', error: 'Conflict' });
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    controller.selectTable(TABLE);
    expect(controller.getState().pending).toEqual([]);
    expect(transport.createPaintObject).toHaveBeenCalledTimes(1);
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

  it('reports invalid local input before retaining or rendering a pending operation', () => {
    const { controller, transport, runtime, errors } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    const invalid = { ...input(), style: { ...input().style, width: 0 } };
    expect(controller.submitCreate(invalid)).toBeNull();
    expect(controller.submitUpdate(invalid.id, 1, invalid)).toBeNull();
    expect(controller.getState().pending).toEqual([]);
    expect(transport.createPaintObject).not.toHaveBeenCalled();
    expect(transport.updatePaintObject).not.toHaveBeenCalled();
    expect(runtime.setPaintDraft).not.toHaveBeenCalled();
    expect(errors).toHaveLength(2);
    expect(controller.getState().lastError).toContain('style.width');
  });

  it('retains an independent command body for exact retries', () => {
    const { controller, transport } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    const draft = input();
    controller.submitCreate(draft);
    draft.transform.x = 100;
    draft.style.width = 20;
    controller.reconnect();
    expect(transport.createPaintObject).toHaveBeenLastCalledWith(TABLE, OPERATION, input());
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
    controller.acceptPreview(preview);
    expect(controller.getState().remotePreviews).toEqual([]);
  });

  it('remembers cancellations received before previews and ignores reordered packets', () => {
    const { controller, runtime } = harness();
    controller.selectTable(TABLE);
    const preview = {
      table_id: TABLE, temporary_id: input().id, sequence: 2,
      expires_at: 2_000, draft: input(), actor_id: 7,
    };
    const cancel = { table_id: TABLE, temporary_id: input().id, sequence: 3, actor_id: 7 };
    controller.acceptPreviewCancel(cancel);
    controller.acceptPreviewCancel({ ...cancel, sequence: 1 });
    controller.acceptPreview(preview);
    expect(runtime.setPaintDraft).not.toHaveBeenCalled();

    controller.acceptPreview({ ...preview, sequence: 4 });
    expect(controller.getState().remotePreviews).toHaveLength(1);
    controller.acceptPreviewCancel({ ...cancel, sequence: 5 });
    controller.acceptPreview({ ...preview, sequence: 4 });
    expect(controller.getState().remotePreviews).toEqual([]);
    expect(runtime.clearPaintDraft).toHaveBeenCalledWith(`remote:7:${input().id}`);
  });

  it('bounds concurrent preview drafts and clamps untrusted expiry to two seconds', () => {
    const { controller, runtime, advance } = harness();
    controller.selectTable(TABLE);
    for (let index = 0; index < 300; index += 1) {
      const draft = input(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
      controller.acceptPreview({
        table_id: TABLE, temporary_id: draft.id, sequence: 1,
        expires_at: 1_000_000, draft, actor_id: 7,
      });
    }
    expect(controller.getState().remotePreviews).toHaveLength(256);
    expect(runtime.setPaintDraft).toHaveBeenCalledTimes(256);
    expect(controller.getState().remotePreviews.every(preview => preview.expires_at === 3_000)).toBe(true);
    advance(2_000);
    controller.tick();
    expect(controller.getState().remotePreviews).toEqual([]);
    expect(runtime.clearPaintDraft).toHaveBeenCalledTimes(256);
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
    expect(transport.requestPaintSnapshot).toHaveBeenLastCalledWith(OTHER_TABLE, REQUEST);
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

  it('ignores old or uncorrelated snapshots after returning to the same table', () => {
    const { controller, transport, runtime, snapshotRequestId } = harness();
    const nextRequest = 'f3b0227a-eb30-48ae-a80f-c0e7dc449b8e';
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 2, [object()]));
    controller.selectTable(OTHER_TABLE);
    snapshotRequestId.mockReturnValue(nextRequest);
    controller.selectTable(TABLE);
    expect(transport.requestPaintSnapshot).toHaveBeenLastCalledWith(TABLE, nextRequest);

    controller.acceptSnapshotChunk(chunk(1, 2, []));
    controller.acceptSnapshotChunk(chunk(0, 1, [object()]));
    controller.acceptSnapshotChunk({ ...chunk(0, 1, [object()]), request_id: undefined });
    expect(controller.getState()).toMatchObject({ hydrating: true, committed: [] });
    expect(runtime.replacePaintObjectSnapshot).toHaveBeenCalledTimes(3);

    controller.acceptSnapshotChunk({ ...chunk(0, 1, [object()]), request_id: nextRequest });
    expect(controller.getState()).toMatchObject({ hydrating: false, revision: 4 });
  });

  it('does not roll back confirmed state with late or older snapshots', () => {
    const { controller, runtime } = harness();
    controller.selectTable(TABLE);
    controller.acceptSnapshotChunk(chunk(0, 1, [object()], 4));
    controller.acceptSnapshotChunk(chunk(0, 1, [], 0));
    controller.requestSnapshot();
    controller.acceptSnapshotChunk(chunk(0, 1, [], 3));
    expect(runtime.replacePaintObjectSnapshot).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({ hydrating: true, revision: 4 });
    expect(controller.getState().committed).toEqual([object()]);
  });

  it('replays duplicate buffered revisions once and retains later events across a gap', () => {
    const { controller, transport, runtime } = harness();
    controller.selectTable(TABLE);
    const update = (revision: number) => ({
      operation_id: OPERATION, table_id: TABLE, revision,
      action: 'update' as const, object: object(revision - 3),
    });
    for (const revision of [5, 5, 7, 8]) controller.acceptEvent(update(revision));
    controller.acceptSnapshotChunk(chunk(0, 1, [object()], 4));
    expect(controller.getState()).toMatchObject({ revision: 5, hydrating: true });
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
    controller.acceptSnapshotChunk(chunk(0, 1, [object(3)], 6));
    expect(controller.getState()).toMatchObject({ revision: 8, hydrating: false });
    expect(runtime.upsertPaintObject).toHaveBeenCalledTimes(3);
    expect(transport.requestPaintSnapshot).toHaveBeenCalledTimes(2);
  });
});
