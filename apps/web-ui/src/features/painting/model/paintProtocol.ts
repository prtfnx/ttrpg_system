import {
  assertPaintObject,
  assertPaintObjectInput,
  type PaintObject,
  type PaintObjectInput,
} from './paintObject';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PaintObjectEvent =
  | {
    operation_id: string;
    table_id: string;
    revision: number;
    action: 'create' | 'update';
    object: PaintObject;
  }
  | {
    operation_id: string;
    table_id: string;
    revision: number;
    action: 'delete';
    deleted_id: string;
    deleted_version: number;
  };

export interface PaintSnapshotChunk {
  request_id?: string;
  snapshot_id: string;
  table_id: string;
  revision: number;
  chunk_index: number;
  chunk_count: number;
  complete: boolean;
  objects: PaintObject[];
}

export interface PaintPreview {
  table_id: string;
  temporary_id: string;
  sequence: number;
  expires_at: number;
  draft: PaintObjectInput;
  actor_id: number;
}

export interface PaintPreviewCancel {
  table_id: string;
  temporary_id: string;
  sequence: number;
  actor_id: number;
}

export interface PaintOperationRejection {
  operation_id: string;
  code: string;
  error: string;
  current_object?: PaintObject;
  current_version?: number;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a UUID`);
  }
  return value;
}

function integer(value: unknown, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${name} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

export function parsePaintObjectEvent(value: unknown): PaintObjectEvent {
  const data = record(value, 'paint object event');
  const operation_id = uuid(data.operation_id, 'operation_id');
  const table_id = uuid(data.table_id, 'table_id');
  const revision = integer(data.revision, 'revision', 1);
  if (data.action === 'create' || data.action === 'update') {
    assertPaintObject(data.object);
    if (data.object.table_id !== table_id) throw new TypeError('paint object table mismatch');
    return { operation_id, table_id, revision, action: data.action, object: data.object };
  }
  if (data.action === 'delete') {
    return {
      operation_id,
      table_id,
      revision,
      action: 'delete',
      deleted_id: uuid(data.deleted_id, 'deleted_id'),
      deleted_version: integer(data.deleted_version, 'deleted_version', 1),
    };
  }
  throw new TypeError('paint object event action is invalid');
}

export function parsePaintSnapshotChunk(value: unknown, requestId?: string): PaintSnapshotChunk {
  const data = record(value, 'paint snapshot chunk');
  const snapshot_id = uuid(data.snapshot_id, 'snapshot_id');
  const table_id = uuid(data.table_id, 'table_id');
  const revision = integer(data.revision, 'revision');
  const chunk_index = integer(data.chunk_index, 'chunk_index');
  const chunk_count = integer(data.chunk_count, 'chunk_count', 1);
  if (chunk_index >= chunk_count) throw new TypeError('chunk_index exceeds chunk_count');
  if (typeof data.complete !== 'boolean' || data.complete !== (chunk_index === chunk_count - 1)) {
    throw new TypeError('snapshot completion marker is invalid');
  }
  if (!Array.isArray(data.objects)) throw new TypeError('snapshot objects must be an array');
  for (const object of data.objects) {
    assertPaintObject(object);
    if (object.table_id !== table_id) throw new TypeError('snapshot object table mismatch');
  }
  return {
    request_id: requestId,
    snapshot_id,
    table_id,
    revision,
    chunk_index,
    chunk_count,
    complete: data.complete,
    objects: data.objects,
  };
}

export function parsePaintPreview(value: unknown): PaintPreview {
  const data = record(value, 'paint preview');
  const table_id = uuid(data.table_id, 'table_id');
  const temporary_id = uuid(data.temporary_id, 'temporary_id');
  const sequence = integer(data.sequence, 'sequence');
  if (typeof data.expires_at !== 'number' || !Number.isFinite(data.expires_at) || data.expires_at <= 0) {
    throw new TypeError('expires_at must be a positive finite number');
  }
  assertPaintObjectInput(data.draft);
  if (data.draft.id !== temporary_id) throw new TypeError('preview draft ID mismatch');
  return {
    table_id,
    temporary_id,
    sequence,
    expires_at: data.expires_at,
    draft: data.draft,
    actor_id: integer(data.actor_id, 'actor_id', 1),
  };
}

export function parsePaintPreviewCancel(value: unknown): PaintPreviewCancel {
  const data = record(value, 'paint preview cancel');
  return {
    table_id: uuid(data.table_id, 'table_id'),
    temporary_id: uuid(data.temporary_id, 'temporary_id'),
    sequence: integer(data.sequence, 'sequence'),
    actor_id: integer(data.actor_id, 'actor_id', 1),
  };
}
