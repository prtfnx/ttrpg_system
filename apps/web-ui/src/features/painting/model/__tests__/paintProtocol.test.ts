import { describe, expect, it } from 'vitest';
import { PAINT_LIMITS, type PaintObject, type PaintObjectInput } from '../paintObject';
import {
  parsePaintObjectEvent,
  parsePaintPreview,
  parsePaintPreviewCancel,
  parsePaintSnapshotChunk,
} from '../paintProtocol';

const ID = '4e34ddf1-b61d-43ee-92ea-834c30a4c8d4';
const OTHER_TABLE = '8327d683-a215-4e0c-a75c-c4f777c544bf';
const draft = (): PaintObjectInput => ({
  id: ID,
  kind: 'freehand',
  geometry: { kind: 'freehand', points: [{ x: 0, y: 0, pressure: 0.5 }] },
  transform: { x: 10, y: 20, scale_x: 1, scale_y: 1 },
  style: { stroke_rgba: [0.1, 0.2, 0.3, 1], width: 3, fill_rgba: null },
});
const object = (): PaintObject => ({
  ...draft(), table_id: empty.table_id, created_by: 42, version: 1, z_order: 7,
  created_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-05T10:00:00Z',
});

const empty = {
  snapshot_id: 'a8f761db-c98d-46d6-b690-88ed74135fd1',
  table_id: '9e8ed60d-f18c-4f47-a5ce-fc04db50506a',
  revision: 0, chunk_index: 0, chunk_count: 1, complete: true, objects: [],
};

describe('paint snapshot transport bounds', () => {
  it('preserves response correlation on an empty snapshot', () => {
    expect(parsePaintSnapshotChunk(empty, 'request-1')).toEqual({ ...empty, request_id: 'request-1' });
  });

  it('rejects unbounded chunk counts before allocating or validating objects', () => {
    expect(() => parsePaintSnapshotChunk({
      ...empty, chunk_count: PAINT_LIMITS.maxObjectsPerTable + 1, complete: false,
    })).toThrow('snapshot chunk limit exceeded');
  });

  it('bounds chunk object counts before per-object validation', () => {
    expect(() => parsePaintSnapshotChunk({
      ...empty, objects: Array.from({ length: PAINT_LIMITS.maxObjectsPerTable + 1 }, () => null),
    })).toThrow('snapshot object limit exceeded');
  });

  it('validates and preserves objects in a complete correlated snapshot', () => {
    const snapshot = { ...empty, revision: 2, objects: [object()] };
    expect(parsePaintSnapshotChunk(snapshot, 'request-2')).toEqual({ ...snapshot, request_id: 'request-2' });
  });

  it.each([
    [{ chunk_index: 1 }, 'chunk_index exceeds chunk_count'],
    [{ complete: false }, 'completion marker'],
    [{ complete: 'true' }, 'completion marker'],
    [{ objects: {} }, 'objects must be an array'],
    [{ objects: [{ ...object(), table_id: OTHER_TABLE }] }, 'object table mismatch'],
    [{ revision: -1 }, 'revision'],
    [{ chunk_count: 0 }, 'chunk_count'],
  ])('rejects inconsistent snapshot metadata %j', (override, error) => {
    expect(() => parsePaintSnapshotChunk({ ...empty, ...override })).toThrow(error as string);
  });
});

describe('paint event transport validation', () => {
  const event = () => ({ operation_id: ID, table_id: empty.table_id, revision: 1, action: 'create', object: object() });

  it.each(['create', 'update'])('accepts a canonical %s event', action => {
    const value = { ...event(), action };
    expect(parsePaintObjectEvent(value)).toEqual(value);
  });

  it('accepts a versioned delete without an object payload', () => {
    const value = {
      operation_id: ID, table_id: empty.table_id, revision: 2,
      action: 'delete', deleted_id: ID, deleted_version: 1,
    };
    expect(parsePaintObjectEvent(value)).toEqual(value);
    expect(() => parsePaintObjectEvent({ ...value, deleted_id: 'invalid' })).toThrow('deleted_id');
    expect(() => parsePaintObjectEvent({ ...value, deleted_version: 0 })).toThrow('deleted_version');
  });

  it.each([null, [], 'event'])('rejects a non-record event %j', value => {
    expect(() => parsePaintObjectEvent(value)).toThrow('must be an object');
  });

  it.each([
    [{ table_id: undefined }, 'table_id'],
    [{ operation_id: 'invalid' }, 'operation_id'],
    [{ revision: 0 }, 'revision'],
    [{ revision: 1.5 }, 'revision'],
    [{ revision: Number.MAX_SAFE_INTEGER + 1 }, 'revision'],
    [{ revision: '1' }, 'revision'],
    [{ action: 'clear' }, 'action is invalid'],
    [{ object: { ...object(), table_id: OTHER_TABLE } }, 'object table mismatch'],
    [{ object: null }, 'object'],
  ])('rejects invalid event authority or ordering %j', (override, error) => {
    expect(() => parsePaintObjectEvent({ ...event(), ...override })).toThrow(error as string);
  });
});

describe('paint preview transport validation', () => {
  const identity = () => ({ table_id: empty.table_id, temporary_id: ID, sequence: 0, actor_id: 42 });
  const preview = () => ({ ...identity(), expires_at: 2_000, draft: draft() });

  it('accepts a validated draft with the same temporary identity', () => {
    expect(parsePaintPreview(preview())).toEqual(preview());
    expect(parsePaintPreviewCancel(identity())).toEqual(identity());
  });

  it.each([0, -1, NaN, Infinity, '2000'])('rejects invalid preview expiry %s', expires_at => {
    expect(() => parsePaintPreview({ ...preview(), expires_at })).toThrow('expires_at');
  });

  it('rejects a draft belonging to a different temporary object', () => {
    expect(() => parsePaintPreview({ ...preview(), draft: { ...draft(), id: OTHER_TABLE } }))
      .toThrow('draft ID mismatch');
  });

  it.each([
    [{ table_id: null }, 'table_id'],
    [{ temporary_id: 'invalid' }, 'temporary_id'],
    [{ sequence: -1 }, 'sequence'],
    [{ sequence: 0.5 }, 'sequence'],
    [{ actor_id: 0 }, 'actor_id'],
    [{ actor_id: '42' }, 'actor_id'],
  ])('applies identity bounds to both preview and cancellation %j', (override, error) => {
    expect(() => parsePaintPreview({ ...preview(), ...override })).toThrow(error as string);
    expect(() => parsePaintPreviewCancel({ ...identity(), ...override })).toThrow(error as string);
  });
});
