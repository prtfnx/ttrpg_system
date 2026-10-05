import { describe, expect, it } from 'vitest';
import { PAINT_LIMITS } from '../paintObject';
import { parsePaintSnapshotChunk } from '../paintProtocol';

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
});
