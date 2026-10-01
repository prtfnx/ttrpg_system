import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import {
  assertPaintTableBudget,
  PAINT_LIMITS,
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
  requestPaintSnapshot(tableId: string): boolean;
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
  startedAt: number;
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
  private committed = new Map<string, PaintObject>();
  private pending = new Map<string, PendingPaintOperation>();
  private queuedEvents: PaintObjectEvent[] = [];
  private snapshots = new Map<string, SnapshotAssembly>();
  private remotePreviews = new Map<string, PaintPreview>();
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
      pending: [...this.pending.values()],
      remotePreviews: [...this.remotePreviews.values()],
      lastError: this.lastError,
    };
  }

  selectTable(tableId: string | null): void {
    if (this.tableId === tableId) return;
    this.cancelLocalPreview();
    this.runtime.clearPaintDrafts?.();
    this.tableId = tableId;
    this.generation += 1;
    this.revision = 0;
    this.hydrating = tableId !== null;
    this.committed.clear();
    this.queuedEvents = [];
    this.snapshots.clear();
    this.remotePreviews.clear();
    for (const [operationId, pending] of this.pending) {
      if (pending.command.tableId !== tableId) this.pending.delete(operationId);
    }
    this.lastError = null;
    if (tableId) this.transport.requestPaintSnapshot(tableId);
    this.emit();
  }

  requestSnapshot(): void {
    if (!this.tableId) return;
    this.hydrating = true;
    this.snapshots.clear();
    this.transport.requestPaintSnapshot(this.tableId);
    this.emit();
  }

  submitCreate(object: PaintObjectInput): string | null {
    if (!this.tableId) return null;
    return this.submit({ kind: 'create', tableId: this.tableId, object });
  }

  submitUpdate(objectId: string, expectedVersion: number, object: PaintObjectInput): string | null {
    if (!this.tableId) return null;
    return this.submit({
      kind: 'update', tableId: this.tableId, objectId, expectedVersion, object,
    });
  }

  submitDelete(objectId: string, expectedVersion: number): string | null {
    if (!this.tableId) return null;
    return this.submit({ kind: 'delete', tableId: this.tableId, objectId, expectedVersion });
  }

  acceptEvent(event: PaintObjectEvent): void {
    if (event.table_id !== this.tableId) return;
    this.pending.delete(event.operation_id);
    this.runtime.clearPaintDraft?.(this.pendingDraftKey(event.operation_id));
    this.removePreviewForCommittedEvent(event);
    if (this.hydrating) {
      this.queuedEvents.push(event);
      this.emit();
      return;
    }
    if (event.revision <= this.revision) {
      this.emit();
      return;
    }
    if (event.revision !== this.revision + 1) {
      this.queuedEvents.push(event);
      this.requestSnapshot();
      return;
    }
    if (!this.applyEvent(event)) this.requestSnapshot();
    this.emit();
  }

  acceptSnapshotChunk(chunk: PaintSnapshotChunk): void {
    if (chunk.table_id !== this.tableId || !this.tableId) return;
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
        startedAt: this.now(),
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
    assembly.bytes += new TextEncoder().encode(encoded).byteLength;
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
    } catch (error) {
      this.failAndResync(error instanceof Error ? error.message : 'Invalid paint snapshot');
      return;
    }
    if (!this.runtime.replacePaintObjectSnapshot(this.tableId, assembly.revision, objects)) {
      this.failAndResync('Renderer rejected the paint snapshot');
      return;
    }
    this.committed = new Map(objects.map(object => [object.id, object]));
    this.revision = assembly.revision;
    this.hydrating = false;
    this.snapshots.clear();
    this.replayQueuedEvents();
    this.emit();
  }

  rejectOperation(rejection: PaintOperationRejection): void {
    const pending = this.pending.get(rejection.operation_id);
    if (!pending) return;
    this.pending.delete(rejection.operation_id);
    this.runtime.clearPaintDraft?.(this.pendingDraftKey(rejection.operation_id));
    this.reportError(rejection.error);
    if (rejection.code === 'version_conflict' || rejection.code === 'retry_window_expired') {
      this.requestSnapshot();
    }
    this.emit();
  }

  reconnect(): void {
    if (!this.tableId) return;
    const now = this.now();
    for (const [operationId, pending] of this.pending) {
      if (now - pending.createdAt > this.retryWindowMs) {
        this.pending.delete(operationId);
        this.runtime.clearPaintDraft?.(this.pendingDraftKey(operationId));
        this.reportError('A pending paint change expired and was discarded');
        continue;
      }
      this.sendPending(pending);
    }
    this.requestSnapshot();
  }

  restoreRenderer(): boolean {
    if (!this.tableId || this.hydrating) return false;
    const restored = this.runtime.replacePaintObjectSnapshot(
      this.tableId,
      this.revision,
      this.orderedCommitted(),
    );
    if (!restored) {
      this.requestSnapshot();
      return false;
    }
    for (const pending of this.pending.values()) {
      if (pending.command.kind !== 'delete') {
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
    return restored;
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
    if (preview.table_id !== this.tableId || preview.expires_at <= this.now()) return;
    const key = `${preview.actor_id}:${preview.temporary_id}`;
    const current = this.remotePreviews.get(key);
    if (!current || preview.sequence > current.sequence) {
      this.remotePreviews.set(key, preview);
      this.runtime.setPaintDraft?.(preview.table_id, this.remoteDraftKey(key), preview.draft);
      this.emit();
    }
  }

  acceptPreviewCancel(cancel: PaintPreviewCancel): void {
    if (cancel.table_id !== this.tableId) return;
    const key = `${cancel.actor_id}:${cancel.temporary_id}`;
    const current = this.remotePreviews.get(key);
    if (current && cancel.sequence >= current.sequence) {
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
        this.runtime.clearPaintDraft?.(this.remoteDraftKey(key));
        changed = true;
      }
    }
    if ([...this.snapshots.values()].some(snapshot => now - snapshot.startedAt > SNAPSHOT_TIMEOUT_MS)) {
      this.failAndResync('Paint snapshot timed out');
      return;
    }
    if (changed) this.emit();
  }

  private submit(command: PaintCommand): string {
    const operationId = this.operationId();
    const pending = { operationId, createdAt: this.now(), command };
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
    const accepted = event.action === 'delete'
      ? this.runtime.removePaintObject(
        event.table_id,
        event.revision,
        event.deleted_id,
        event.deleted_version,
      )
      : this.runtime.upsertPaintObject(event.table_id, event.revision, event.object);
    if (!accepted) return false;
    if (event.action === 'delete') this.committed.delete(event.deleted_id);
    else this.committed.set(event.object.id, event.object);
    this.revision = event.revision;
    return true;
  }

  private replayQueuedEvents(): void {
    const queued = this.queuedEvents
      .filter(event => event.table_id === this.tableId && event.revision > this.revision)
      .sort((left, right) => left.revision - right.revision);
    this.queuedEvents = [];
    for (const event of queued) {
      if (event.revision !== this.revision + 1 || !this.applyEvent(event)) {
        this.queuedEvents.push(event);
        this.requestSnapshot();
        return;
      }
    }
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
        this.runtime.clearPaintDraft?.(this.remoteDraftKey(key));
      }
    }
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
