import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import {
  assertPaintObjectInput,
  assertPaintTableBudget,
  PAINT_LIMITS,
  PaintValidationError,
  paintPointCount,
  type PaintObject,
  type PaintObjectInput,
} from '../model/paintObject';
import type {
  PaintObjectEvent,
  PaintOperationRejection,
  PaintPreview,
  PaintPreviewCancel,
  PaintSnapshotChunk,
} from '../model/paintProtocol';

const DEFAULT_RETRY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const SNAPSHOT_TIMEOUT_MS = 10_000;
const SNAPSHOT_BYTE_LIMIT = 32 * 1024 * 1024;
const PREVIEW_INTERVAL_MS = 50;
const PREVIEW_TTL_MS = 2_000;
const MAX_REMOTE_PREVIEWS = 256;
const MAX_PREVIEW_TOMBSTONES = 1_024;
const MAX_BUFFERED_EVENTS = 256;
const MAX_BUFFERED_EVENT_BYTES = 4 * 1024 * 1024;

export interface PaintTransport {
  createPaintObject(tableId: string, operationId: string, object: PaintObjectInput): boolean;
  updatePaintObject(
    tableId: string,
    operationId: string,
    objectId: string,
    expectedVersion: number,
    object: PaintObjectInput,
  ): boolean;
  deletePaintObject(
    tableId: string,
    operationId: string,
    objectId: string,
    expectedVersion: number,
  ): boolean;
  requestPaintSnapshot(tableId: string, requestId: string): boolean;
  sendPaintPreview(
    tableId: string,
    temporaryId: string,
    sequence: number,
    expiresAt: number,
    draft: PaintObjectInput,
  ): boolean;
  cancelPaintPreview(tableId: string, temporaryId: string, sequence: number): boolean;
}

export interface PaintSceneRuntime {
  getRenderEngine?(): unknown | null;
  replacePaintObjectSnapshot(tableId: string, revision: number, objects: readonly PaintObject[]): boolean;
  upsertPaintObject(tableId: string, revision: number, object: PaintObject): boolean;
  removePaintObject(tableId: string, revision: number, objectId: string, deletedVersion: number): boolean;
  setPaintDraft?(tableId: string, key: string, draft: PaintObjectInput): boolean;
  clearPaintDraft?(key: string): boolean;
  clearPaintDrafts?(): void;
}

type PaintCommand =
  | { kind: 'create'; tableId: string; object: PaintObjectInput }
  | {
    kind: 'update';
    tableId: string;
    objectId: string;
    expectedVersion: number;
    object: PaintObjectInput;
  }
  | { kind: 'delete'; tableId: string; objectId: string; expectedVersion: number };

interface PendingPaintOperation {
  operationId: string;
  createdAt: number;
  command: PaintCommand;
}

interface SnapshotAssembly {
  generation: number;
  tableId: string;
  revision: number;
  chunkCount: number;
  bytes: number;
  chunks: Map<number, PaintObject[]>;
}

export interface PaintControllerState {
  tableId: string | null;
  generation: number;
  revision: number;
  hydrating: boolean;
  committed: readonly PaintObject[];
  pending: readonly PendingPaintOperation[];
  remotePreviews: readonly PaintPreview[];
  lastError: string | null;
}

interface PaintControllerOptions {
  now?: () => number;
  operationId?: () => string;
  snapshotRequestId?: () => string;
  retryWindowMs?: number;
  onError?: (message: string) => void;
  setTimeout?: (callback: () => void, delay: number) => number;
  clearTimeout?: (timer: number) => void;
}

export class PaintController {
  private tableId: string | null = null;
  private generation = 0;
  private revision = 0;
  private hydrating = false;
  private snapshotRequestedAt: number | null = null;
  private activeSnapshotRequestId: string | null = null;
  private committed = new Map<string, PaintObject>();
  private pending = new Map<string, PendingPaintOperation>();
  private queuedEvents = new Map<number, { event: PaintObjectEvent; bytes: number }>();
  private queuedEventBytes = 0;
  private snapshots = new Map<string, SnapshotAssembly>();
  private remotePreviews = new Map<string, PaintPreview>();
  private previewTombstones = new Map<string, { sequence: number; expiresAt: number }>();
  private listeners = new Set<(state: PaintControllerState) => void>();
  private unbindEvents: (() => void) | null = null;
  private lastError: string | null = null;
  private previewSequence = 0;
  private previewTimer: number | null = null;
  private queuedPreview: { tableId: string; draft: PaintObjectInput } | null = null;
  private activePreview: { tableId: string; temporaryId: string } | null = null;
  private lastPreviewSentAt = Number.NEGATIVE_INFINITY;

  private readonly now: () => number;
  private readonly operationId: () => string;
  private readonly snapshotRequestId: () => string;
  private readonly retryWindowMs: number;
  private readonly onError: (message: string) => void;
  private readonly schedule: (callback: () => void, delay: number) => number;
  private readonly cancelScheduled: (timer: number) => void;
  private readonly transport: PaintTransport;
  private readonly runtime: PaintSceneRuntime;

  constructor(
    transport: PaintTransport,
    runtime: PaintSceneRuntime,
    options: PaintControllerOptions = {},
  ) {
    this.transport = transport;
    this.runtime = runtime;
    this.now = options.now ?? Date.now;
    this.operationId = options.operationId ?? (() => crypto.randomUUID());
    this.snapshotRequestId = options.snapshotRequestId ?? (() => crypto.randomUUID());
    this.retryWindowMs = options.retryWindowMs ?? DEFAULT_RETRY_WINDOW_MS;
    this.onError = options.onError ?? (() => undefined);
    this.schedule = options.setTimeout ?? ((callback, delay) => window.setTimeout(callback, delay));
    this.cancelScheduled = options.clearTimeout ?? (timer => window.clearTimeout(timer));
  }

  connectEvents(): () => void {
    this.unbindEvents?.();
    const cleanups = [
      onProtocolEvent('paint-object-event', event => this.acceptEvent(event)),
      onProtocolEvent('paint-snapshot-chunk', chunk => this.acceptSnapshotChunk(chunk)),
      onProtocolEvent('paint-operation-rejected', rejection => this.rejectOperation(rejection)),
      onProtocolEvent('paint-preview', preview => this.acceptPreview(preview)),
      onProtocolEvent('paint-preview-cancel', cancel => this.acceptPreviewCancel(cancel)),
      onProtocolEvent('protocol-connected', () => this.reconnect()),
    ];
    this.unbindEvents = () => {
      for (const cleanup of cleanups) cleanup();
      this.unbindEvents = null;
    };
    return this.unbindEvents;
  }

  dispose(): void {
    this.cancelLocalPreview();
    this.runtime.clearPaintDrafts?.();
    this.unbindEvents?.();
    this.listeners.clear();
  }

  subscribe(listener: (state: PaintControllerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): PaintControllerState {
    return {
      tableId: this.tableId,
      generation: this.generation,
      revision: this.revision,
      hydrating: this.hydrating,
      committed: this.orderedCommitted(),
      pending: [...this.pending.values()].filter(pending => pending.command.tableId === this.tableId),
      remotePreviews: [...this.remotePreviews.values()],
      lastError: this.lastError,
    };
  }

  selectTable(tableId: string | null): void {
    if (this.tableId === tableId) return;
    const previousTableId = this.tableId;
    this.cancelLocalPreview();
    this.runtime.clearPaintDrafts?.();
    this.tableId = tableId;
    this.generation += 1;
    this.revision = 0;
    this.hydrating = tableId !== null;
    this.snapshotRequestedAt = tableId !== null ? this.now() : null;
    this.activeSnapshotRequestId = tableId !== null ? this.snapshotRequestId() : null;
    this.committed.clear();
    this.clearQueuedEvents();
    this.snapshots.clear();
    this.remotePreviews.clear();
    this.previewTombstones.clear();
    this.lastError = null;
    if (tableId) {
      // Establish the new renderer generation immediately so objects from the
      // previous table cannot remain visible while the snapshot is in flight.
      this.runtime.replacePaintObjectSnapshot(tableId, 0, []);
      this.transport.requestPaintSnapshot(tableId, this.activeSnapshotRequestId!);
      this.retryPending();
    } else if (previousTableId) {
      this.runtime.replacePaintObjectSnapshot(previousTableId, 0, []);
    }
    this.emit();
  }

  requestSnapshot(): void {
    if (!this.tableId) return;
    this.hydrating = true;
    this.snapshotRequestedAt = this.now();
    this.activeSnapshotRequestId = this.snapshotRequestId();
    this.snapshots.clear();
    this.transport.requestPaintSnapshot(this.tableId, this.activeSnapshotRequestId);
    this.emit();
  }

  submitCreate(object: PaintObjectInput): string | null {
    if (!this.tableId || this.hydrating) return null;
    return this.submit({ kind: 'create', tableId: this.tableId, object });
  }

  submitUpdate(objectId: string, expectedVersion: number, object: PaintObjectInput): string | null {
    if (!this.tableId || this.hydrating) return null;
    return this.submit({
      kind: 'update', tableId: this.tableId, objectId, expectedVersion, object,
    });
  }

  submitDelete(objectId: string, expectedVersion: number): string | null {
    if (!this.tableId || this.hydrating) return null;
    return this.submit({ kind: 'delete', tableId: this.tableId, objectId, expectedVersion });
  }

  reportLocalError(message: string): void {
    this.reportError(message);
    this.emit();
  }

  acceptEvent(event: PaintObjectEvent): void {
    if (event.table_id !== this.tableId) {
      if (this.pending.get(event.operation_id)?.command.tableId === event.table_id) {
        this.pending.delete(event.operation_id);
      }
      return;
    }
    this.pending.delete(event.operation_id);
    this.runtime.clearPaintDraft?.(this.pendingDraftKey(event.operation_id));
    this.removePreviewForCommittedEvent(event);
    if (this.hydrating) {
      this.bufferEvent(event);
      this.emit();
      return;
    }
    if (event.revision <= this.revision) {
      this.emit();
      return;
    }
    if (event.revision !== this.revision + 1) {
      this.bufferEvent(event);
      this.requestSnapshot();
      return;
    }
    if (!this.applyEvent(event)) this.requestSnapshot();
    this.emit();
  }

  acceptSnapshotChunk(chunk: PaintSnapshotChunk): void {
    if (
      chunk.table_id !== this.tableId
      || !this.tableId
      || !this.hydrating
      || chunk.request_id !== this.activeSnapshotRequestId
      || chunk.revision < this.revision
    ) return;
    if (chunk.chunk_count > PAINT_LIMITS.maxObjectsPerTable) {
      this.failAndResync('Paint snapshot exceeded the chunk limit');
      return;
    }
    let assembly = this.snapshots.get(chunk.snapshot_id);
    if (!assembly) {
      if (this.snapshots.size >= 2) {
        this.failAndResync('Too many concurrent paint snapshots');
        return;
      }
      assembly = {
        generation: this.generation,
        tableId: chunk.table_id,
        revision: chunk.revision,
        chunkCount: chunk.chunk_count,
        bytes: 0,
        chunks: new Map(),
      };
      this.snapshots.set(chunk.snapshot_id, assembly);
    }
    if (
      assembly.generation !== this.generation
      || assembly.tableId !== chunk.table_id
      || assembly.revision !== chunk.revision
      || assembly.chunkCount !== chunk.chunk_count
    ) {
      this.failAndResync('Inconsistent paint snapshot metadata');
      return;
    }
    const encoded = JSON.stringify(chunk.objects);
    const existing = assembly.chunks.get(chunk.chunk_index);
    if (existing) {
      if (JSON.stringify(existing) !== encoded) this.failAndResync('Conflicting paint snapshot chunk');
      return;
    }
    assembly.bytes += new TextEncoder().encode(JSON.stringify(chunk)).byteLength;
    if (assembly.bytes > SNAPSHOT_BYTE_LIMIT) {
      this.failAndResync('Paint snapshot exceeded the browser byte limit');
      return;
    }
    assembly.chunks.set(chunk.chunk_index, chunk.objects);
    if (assembly.chunks.size !== assembly.chunkCount) return;
    const objects = Array.from(
      { length: assembly.chunkCount },
      (_, index) => assembly.chunks.get(index) ?? [],
    ).flat();
    if (objects.length > PAINT_LIMITS.maxObjectsPerTable) {
      this.failAndResync('Paint snapshot exceeded the object limit');
      return;
    }
    try {
      assertPaintTableBudget(objects);
      const ids = new Set<string>();
      const orders = new Set<number>();
      for (const object of objects) {
        if (object.table_id !== this.tableId || ids.has(object.id) || orders.has(object.z_order)) {
          throw new PaintValidationError('Paint snapshot contains inconsistent object identity or ordering');
        }
        ids.add(object.id);
        orders.add(object.z_order);
      }
    } catch (error) {
      this.failAndResync(error instanceof Error ? error.message : 'Invalid paint snapshot');
      return;
    }
    if (
      this.rendererAvailable()
      && !this.runtime.replacePaintObjectSnapshot(this.tableId, assembly.revision, objects)
    ) {
      this.failAndResync('Renderer rejected the paint snapshot');
      return;
    }
    this.committed = new Map(objects.map(object => [object.id, object]));
    this.revision = assembly.revision;
    this.hydrating = false;
    this.snapshotRequestedAt = null;
    this.activeSnapshotRequestId = null;
    this.snapshots.clear();
    this.replayQueuedEvents();
    if (this.rendererAvailable()) this.restoreTransientDrafts();
    this.emit();
  }

  rejectOperation(rejection: PaintOperationRejection): void {
    const pending = this.pending.get(rejection.operation_id);
    if (!pending) return;
    this.pending.delete(rejection.operation_id);
    this.runtime.clearPaintDraft?.(this.pendingDraftKey(rejection.operation_id));
    this.reportError(rejection.error);
    if (
      pending.command.tableId === this.tableId
      && (rejection.code === 'version_conflict' || rejection.code === 'retry_window_expired')
    ) {
      this.requestSnapshot();
    }
    this.emit();
  }

  reconnect(): void {
    if (!this.tableId) return;
    this.retryPending();
    this.requestSnapshot();
  }

  private retryPending(): void {
    const now = this.now();
    for (const [operationId, pending] of this.pending) {
      if (pending.command.tableId !== this.tableId) continue;
      if (now - pending.createdAt > this.retryWindowMs) {
        this.pending.delete(operationId);
        this.runtime.clearPaintDraft?.(this.pendingDraftKey(operationId));
        this.reportError('A pending paint change expired and was discarded');
        continue;
      }
      this.sendPending(pending);
    }
  }

  restoreRenderer(): boolean {
    if (!this.tableId || this.hydrating || !this.rendererAvailable()) return false;
    const restored = this.runtime.replacePaintObjectSnapshot(
      this.tableId,
      this.revision,
      this.orderedCommitted(),
    );
    if (!restored) {
      this.requestSnapshot();
      return false;
    }
    this.restoreTransientDrafts();
    return restored;
  }

  private rendererAvailable(): boolean {
    return this.runtime.getRenderEngine?.() !== null;
  }

  private restoreTransientDrafts(): void {
    for (const pending of this.pending.values()) {
      if (pending.command.tableId === this.tableId && pending.command.kind !== 'delete') {
        this.runtime.setPaintDraft?.(
          pending.command.tableId,
          this.pendingDraftKey(pending.operationId),
          pending.command.object,
        );
      }
    }
    for (const [key, preview] of this.remotePreviews) {
      this.runtime.setPaintDraft?.(preview.table_id, this.remoteDraftKey(key), preview.draft);
    }
  }

  queuePreview(draft: PaintObjectInput): void {
    if (!this.tableId) return;
    const tableId = this.tableId;
    this.queuedPreview = { tableId, draft };
    this.activePreview = { tableId, temporaryId: draft.id };
    const remaining = PREVIEW_INTERVAL_MS - (this.now() - this.lastPreviewSentAt);
    if (remaining <= 0) {
      this.flushPreview();
      return;
    }
    if (this.previewTimer === null) {
      this.previewTimer = this.schedule(() => {
        this.previewTimer = null;
        this.flushPreview();
      }, remaining);
    }
  }

  cancelLocalPreview(): void {
    if (this.previewTimer !== null) {
      this.cancelScheduled(this.previewTimer);
      this.previewTimer = null;
    }
    this.queuedPreview = null;
    if (this.activePreview) {
      this.previewSequence += 1;
      this.transport.cancelPaintPreview(
        this.activePreview.tableId,
        this.activePreview.temporaryId,
        this.previewSequence,
      );
      this.activePreview = null;
    }
  }

  acceptPreview(preview: PaintPreview): void {
    const now = this.now();
    if (preview.table_id !== this.tableId || preview.expires_at <= now) return;
    const key = `${preview.actor_id}:${preview.temporary_id}`;
    const cancelled = this.previewTombstones.get(key);
    if (cancelled && cancelled.expiresAt > now && preview.sequence <= cancelled.sequence) return;
    const current = this.remotePreviews.get(key);
    if (!current && this.remotePreviews.size >= MAX_REMOTE_PREVIEWS) return;
    if (!current || preview.sequence > current.sequence) {
      this.remotePreviews.set(key, {
        ...preview,
        expires_at: Math.min(preview.expires_at, now + PREVIEW_TTL_MS),
      });
      this.runtime.setPaintDraft?.(preview.table_id, this.remoteDraftKey(key), preview.draft);
      this.emit();
    }
  }

  acceptPreviewCancel(cancel: PaintPreviewCancel): void {
    if (cancel.table_id !== this.tableId) return;
    const key = `${cancel.actor_id}:${cancel.temporary_id}`;
    const current = this.remotePreviews.get(key);
    const cancelled = this.previewTombstones.get(key);
    if (
      (current && cancel.sequence < current.sequence)
      || (cancelled && cancelled.expiresAt > this.now() && cancel.sequence < cancelled.sequence)
    ) return;
    this.rememberPreviewSequence(key, cancel.sequence);
    if (current) {
      this.remotePreviews.delete(key);
      this.runtime.clearPaintDraft?.(this.remoteDraftKey(key));
      this.emit();
    }
  }

  tick(): void {
    const now = this.now();
    let changed = false;
    for (const [key, preview] of this.remotePreviews) {
      if (preview.expires_at <= now) {
        this.remotePreviews.delete(key);
        this.rememberPreviewSequence(key, preview.sequence);
        this.runtime.clearPaintDraft?.(this.remoteDraftKey(key));
        changed = true;
      }
    }
    for (const [key, tombstone] of this.previewTombstones) {
      if (tombstone.expiresAt <= now) this.previewTombstones.delete(key);
    }
    if (
      this.hydrating
      && this.snapshotRequestedAt !== null
      && now - this.snapshotRequestedAt >= SNAPSHOT_TIMEOUT_MS
    ) {
      this.failAndResync('Paint snapshot timed out');
      return;
    }
    if (changed) this.emit();
  }

  private submit(command: PaintCommand): string | null {
    if (command.kind !== 'delete') {
      try {
        assertPaintObjectInput(command.object);
      } catch (error) {
        if (!(error instanceof PaintValidationError)) throw error;
        this.reportLocalError(error.message);
        return null;
      }
    }
    const operationId = this.operationId();
    const pending = { operationId, createdAt: this.now(), command: structuredClone(command) };
    this.pending.set(operationId, pending);
    if (command.kind !== 'delete') {
      this.runtime.setPaintDraft?.(
        command.tableId,
        this.pendingDraftKey(operationId),
        command.object,
      );
    }
    this.sendPending(pending);
    this.emit();
    return operationId;
  }

  private sendPending(pending: PendingPaintOperation): boolean {
    const { command, operationId } = pending;
    if (command.tableId !== this.tableId) return false;
    if (command.kind === 'create') {
      return this.transport.createPaintObject(command.tableId, operationId, command.object);
    }
    if (command.kind === 'update') {
      return this.transport.updatePaintObject(
        command.tableId,
        operationId,
        command.objectId,
        command.expectedVersion,
        command.object,
      );
    }
    return this.transport.deletePaintObject(
      command.tableId,
      operationId,
      command.objectId,
      command.expectedVersion,
    );
  }

  private applyEvent(event: PaintObjectEvent): boolean {
    const objectId = event.action === 'delete' ? event.deleted_id : event.object.id;
    const current = this.committed.get(objectId);
    if (event.action === 'delete') {
      if (!current || current.version !== event.deleted_version) return false;
    } else {
      if (event.action === 'create') {
        if (current || event.object.version !== 1) return false;
      } else if (
        !current
        || event.object.version !== current.version + 1
        || event.object.created_by !== current.created_by
        || event.object.z_order !== current.z_order
        || event.object.created_at !== current.created_at
      ) return false;
      const remaining = [...this.committed.values()].filter(object => object.id !== objectId);
      if (
        remaining.length + 1 > PAINT_LIMITS.maxObjectsPerTable
        || remaining.some(object => object.z_order === event.object.z_order)
        || remaining.reduce((total, object) => total + paintPointCount(object), 0)
          + paintPointCount(event.object) > PAINT_LIMITS.maxPointsPerTable
      ) return false;
    }
    const accepted = !this.rendererAvailable() || (event.action === 'delete'
      ? this.runtime.removePaintObject(
        event.table_id,
        event.revision,
        event.deleted_id,
        event.deleted_version,
      )
      : this.runtime.upsertPaintObject(event.table_id, event.revision, event.object));
    if (!accepted) return false;
    if (event.action === 'delete') this.committed.delete(event.deleted_id);
    else this.committed.set(event.object.id, event.object);
    this.revision = event.revision;
    return true;
  }

  private replayQueuedEvents(): void {
    const queued = [...this.queuedEvents.values()].map(entry => entry.event)
      .filter(event => event.table_id === this.tableId && event.revision > this.revision)
      .sort((left, right) => left.revision - right.revision);
    this.clearQueuedEvents();
    for (const [index, event] of queued.entries()) {
      if (event.revision <= this.revision) continue;
      if (event.revision !== this.revision + 1 || !this.applyEvent(event)) {
        for (const remaining of queued.slice(index)) this.bufferEvent(remaining);
        this.requestSnapshot();
        return;
      }
    }
  }

  private clearQueuedEvents(): void {
    this.queuedEvents.clear();
    this.queuedEventBytes = 0;
  }

  private bufferEvent(event: PaintObjectEvent): void {
    if (event.revision <= this.revision || this.queuedEvents.has(event.revision)) return;
    const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
    if (
      this.queuedEvents.size >= MAX_BUFFERED_EVENTS
      || this.queuedEventBytes + bytes > MAX_BUFFERED_EVENT_BYTES
    ) {
      this.clearQueuedEvents();
      this.failAndResync('Paint event backlog exceeded the browser limit');
      return;
    }
    this.queuedEvents.set(event.revision, { event, bytes });
    this.queuedEventBytes += bytes;
  }

  private flushPreview(): void {
    const queued = this.queuedPreview;
    this.queuedPreview = null;
    if (!queued || queued.tableId !== this.tableId) return;
    this.previewSequence += 1;
    this.transport.sendPaintPreview(
      queued.tableId,
      queued.draft.id,
      this.previewSequence,
      this.now() + PREVIEW_TTL_MS,
      queued.draft,
    );
    this.lastPreviewSentAt = this.now();
  }

  private removePreviewForCommittedEvent(event: PaintObjectEvent): void {
    const objectId = event.action === 'delete' ? event.deleted_id : event.object.id;
    for (const [key, preview] of this.remotePreviews) {
      if (preview.temporary_id === objectId) {
        this.remotePreviews.delete(key);
        this.rememberPreviewSequence(key, preview.sequence);
        this.runtime.clearPaintDraft?.(this.remoteDraftKey(key));
      }
    }
  }

  private rememberPreviewSequence(key: string, sequence: number): void {
    this.previewTombstones.delete(key);
    if (this.previewTombstones.size >= MAX_PREVIEW_TOMBSTONES) {
      this.previewTombstones.delete(this.previewTombstones.keys().next().value!);
    }
    this.previewTombstones.set(key, { sequence, expiresAt: this.now() + PREVIEW_TTL_MS });
  }

  private pendingDraftKey(operationId: string): string {
    return `pending:${operationId}`;
  }

  private remoteDraftKey(previewKey: string): string {
    return `remote:${previewKey}`;
  }

  private orderedCommitted(): PaintObject[] {
    return [...this.committed.values()].sort((left, right) => (
      left.z_order - right.z_order || left.id.localeCompare(right.id)
    ));
  }

  private failAndResync(message: string): void {
    this.reportError(message);
    this.requestSnapshot();
  }

  private reportError(message: string): void {
    this.lastError = message;
    this.onError(message);
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}
