import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import type { SelectionRef } from './SelectionManager';
import type { PaintStyle } from '../model/paintObject';

export interface CanvasTransform {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  pivot_x: number;
  pivot_y: number;
}

export const IDENTITY_TRANSFORM: CanvasTransform = Object.freeze({
  dx: 0, dy: 0, scale: 1, rotation: 0, pivot_x: 0, pivot_y: 0,
});

export interface SpriteExpectedTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
}

export type CanvasMember =
  | { kind: 'paint'; id: string; version: number }
  | { kind: 'sprite'; id: string; expected: SpriteExpectedTransform };

export interface SpriteEdit {
  width?: number;
  height?: number;
  rotation?: number;
  layer?: string;
}

export type CanvasIntent =
  | { mode: 'transform'; members: readonly CanvasMember[]; transform: CanvasTransform }
  | { mode: 'sprite_edit'; members: readonly Extract<CanvasMember, { kind: 'sprite' }>[]; edit: SpriteEdit }
  | { mode: 'restyle'; members: readonly Extract<CanvasMember, { kind: 'paint' }>[]; style: PaintStyle }
  | { mode: 'delete' | 'copy' | 'cut'; members: readonly CanvasMember[] }
  | { mode: 'paste'; clipboard_id: string; ids: Array<SelectionRef & { source_id: string }>; transform: CanvasTransform }
  | { mode: 'undo' | 'redo' };

export interface CanvasCommandTransport {
  sendCanvasCommand(command: Record<string, unknown>): boolean;
  requestCanvasHistory(tableId: string): boolean;
}

export interface CanvasCommandState {
  tableId: string | null;
  pending: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
  lastError: string | null;
}

interface Options {
  now?: () => number;
  operationId?: () => string;
  onError?: (error: string) => void;
  onResync: (tableId: string) => void;
  onSelection: (selection: readonly SelectionRef[]) => void;
  onOptimistic?: (operationId: string, intent: CanvasIntent) => void;
  onSettled?: (operationId: string, accepted: boolean) => void;
  beforeSend?: (intent: CanvasIntent) => CanvasIntent;
  readyToSend?: (intent: CanvasIntent) => boolean;
  onReset?: () => void;
  onSnapshot?: (operationIds: readonly string[]) => void;
}

const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACK_TIMEOUT_MS = 10_000;

type PendingCommand = { command: CanvasIntent & { operation_id: string; table_id: string; issued_at: number };
  sentAt: number; duplicate: boolean };

/** Preview every intent; only genuinely dependent commands wait for a receipt. */
export class CanvasCommandController {
  private tableId: string | null = null;
  private actorId: number | null = null;
  private pending = new Map<string, PendingCommand>();
  private flushing = false;
  private resyncWatermark: string[] = [];
  private recovering = false;
  private clipboard: { id: string; members: readonly SelectionRef[]; copiedAt: number } | null = null;
  private history = { canUndo: false, canRedo: false };
  private lastError: string | null = null;
  private historyDirty = false;
  private readonly listeners = new Set<(state: CanvasCommandState) => void>();
  private readonly now: () => number;
  private readonly operationId: () => string;
  private disconnect: (() => void) | null = null;
  private readonly transport: CanvasCommandTransport;
  private readonly options: Options;

  constructor(transport: CanvasCommandTransport, options: Options) {
    this.transport = transport;
    this.options = options;
    this.now = options.now ?? Date.now;
    this.operationId = options.operationId ?? (() => crypto.randomUUID());
  }

  connectEvents(): () => void {
    this.disconnect?.();
    const removers = [
      onProtocolEvent('canvas-command-result', data => this.acceptResult(data)),
      onProtocolEvent('table-resync-started', ({ tableId }) => {
        if (tableId !== this.tableId) return;
        this.recovering = true;
        this.resyncWatermark = [...this.pending]
          .filter(([, item]) => Number.isFinite(item.sentAt)).map(([id]) => id);
      }),
      onProtocolEvent('table-resync-completed', ({ tableId }) => {
        if (tableId !== this.tableId) return;
        for (const id of this.resyncWatermark) this.pending.delete(id);
        this.options.onSnapshot?.(this.resyncWatermark);
        this.resyncWatermark = [];
        this.recovering = false;
        this.flushQueued();
        this.refreshHistory();
        this.emit();
      }),
      onProtocolEvent('canvas-history-state', data => {
        if (data?.table_id !== this.tableId || this.pending.size) return;
        this.history = { canUndo: data.can_undo === true, canRedo: data.can_redo === true };
        this.emit();
      }),
      onProtocolEvent('paint-object-event', () => { this.historyDirty = true; }),
      ...(['sprite-response', 'protocol-success'] as const).map(type => onProtocolEvent(type, data => {
        if (data?.table_id === this.tableId && data.success === true && typeof data.can_undo === 'boolean') {
          this.historyDirty = true;
        }
      })),
      onProtocolEvent('protocol-connected', () => {
        if (this.recovering && this.tableId) { this.options.onResync(this.tableId); return; }
        this.retry();
        this.refreshHistory();
      }),
    ];
    const disconnect = () => removers.forEach(remove => remove());
    this.disconnect = disconnect;
    return () => { disconnect(); if (this.disconnect === disconnect) this.disconnect = null; };
  }

  dispose(): void {
    this.disconnect?.();
    this.disconnect = null;
    this.pending.clear();
    this.resyncWatermark = [];
    this.recovering = false;
    this.options.onReset?.();
    this.clipboard = null;
    this.historyDirty = false;
    this.listeners.clear();
  }

  selectScope(tableId: string | null, actorId: number | null): void {
    if (tableId === this.tableId && actorId === this.actorId) return;
    this.tableId = tableId;
    this.actorId = actorId;
    this.pending.clear();
    this.resyncWatermark = [];
    this.recovering = false;
    this.options.onReset?.();
    this.clipboard = null;
    this.history = { canUndo: false, canRedo: false };
    this.lastError = null;
    this.historyDirty = false;
    this.refreshHistory();
    this.emit();
  }

  getState(): CanvasCommandState {
    return { tableId: this.tableId, pending: this.pending.size > 0,
      canUndo: this.history.canUndo || [...this.pending.values()].some(item => !['copy', 'undo', 'redo'].includes(item.command.mode)),
      canRedo: this.history.canRedo,
      canPaste: this.clipboard !== null && this.now() - this.clipboard.copiedAt <= RETRY_WINDOW_MS,
      lastError: this.lastError };
  }

  subscribe(listener: (state: CanvasCommandState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  submit(intent: CanvasIntent, duplicate = false): boolean {
    if (!this.tableId || this.actorId === null) return false;
    if (this.pending.size >= 100) return this.fail('Too many outstanding editor changes; reconnect to synchronize.');
    if ('members' in intent && (intent.members.length < 1 || intent.members.length > 100)) {
      return this.fail('Select between 1 and 100 editable objects.');
    }
    const command = structuredClone({ ...intent, operation_id: this.operationId(), table_id: this.tableId, issued_at: this.now() });
    if (new TextEncoder().encode(JSON.stringify(command)).length > 60 * 1024) {
      return this.fail('Canvas command exceeds the 60 KiB limit.');
    }
    // Register before send: tests and adapters may confirm synchronously.
    const pending = { command, sentAt: Number.NEGATIVE_INFINITY, duplicate };
    this.pending.set(command.operation_id, pending);
    this.lastError = null;
    try {
      this.options.onOptimistic?.(command.operation_id, intent);
      this.flushQueued();
    } catch {
      this.pending.delete(command.operation_id);
      this.options.onSettled?.(command.operation_id, false);
      return this.fail('Canvas command could not be sent.');
    }
    this.emit();
    return !this.lastError;
  }

  paste(transform: CanvasTransform = { ...IDENTITY_TRANSFORM, dx: 10, dy: 10 }): boolean {
    if (!this.clipboard || !this.getState().canPaste) return this.fail('Copy a selection before pasting.');
    return this.submit({ mode: 'paste', clipboard_id: this.clipboard.id, transform,
      ids: this.clipboard.members.map(ref => ({ kind: ref.kind, source_id: ref.id, id: this.operationId() })) });
  }

  refreshHistory(): void {
    if (this.tableId && this.actorId !== null && !this.recovering) {
      try { this.transport.requestCanvasHistory(this.tableId); } catch { /* reconnect refreshes availability */ }
    }
  }

  tick(): void {
    if (this.clipboard && this.now() - this.clipboard.copiedAt > RETRY_WINDOW_MS) {
      this.clipboard = null;
      this.emit();
    }
    for (const [id, pending] of this.pending) {
      if (this.now() - pending.command.issued_at > RETRY_WINDOW_MS) {
        this.pending.delete(id);
        this.options.onSettled?.(id, false);
        this.fail('Canvas acknowledgement expired; the table has been reloaded.');
        this.options.onResync(pending.command.table_id);
      }
    }
    this.retry(false);
    this.flushQueued();
    if (this.historyDirty && !this.pending.size) {
      this.historyDirty = false;
      this.refreshHistory();
    }
  }

  private retry(force = true): void {
    if (this.recovering) return;
    for (const pending of this.pending.values()) {
      if (!Number.isFinite(pending.sentAt) || pending.command.table_id !== this.tableId
        || this.now() - pending.command.issued_at > RETRY_WINDOW_MS
        || (!force && this.now() - pending.sentAt < ACK_TIMEOUT_MS)) continue;
      pending.sentAt = this.now();
      try { this.transport.sendCanvasCommand(pending.command); } catch { /* retain exact identity */ }
    }
  }

  private flushQueued(): void {
    if (this.flushing || this.recovering) return;
    this.flushing = true;
    try {
      const previous: PendingCommand[] = [];
      for (const pending of this.pending.values()) {
        const members = 'members' in pending.command ? pending.command.members : null;
        const blocked = previous.some(earlier => !members || !('members' in earlier.command)
          || members.some(member => 'members' in earlier.command
            && earlier.command.members.some(item => item.kind === member.kind && item.id === member.id)));
        if (!Number.isFinite(pending.sentAt) && !blocked && this.options.readyToSend?.(pending.command) !== false) {
          pending.command = { ...pending.command, ...this.options.beforeSend?.(pending.command) };
          pending.sentAt = this.now();
          try {
            if (!this.transport.sendCanvasCommand(pending.command)) throw new Error('Disconnected');
          } catch {
            this.pending.delete(pending.command.operation_id);
            this.options.onSettled?.(pending.command.operation_id, false);
            this.fail('Canvas command could not be sent.');
          }
        }
        if (this.pending.has(pending.command.operation_id)) previous.push(pending);
      }
    } finally { this.flushing = false; }
  }

  acceptResult(data: Record<string, unknown> | undefined): void {
    if (typeof data?.operation_id !== 'string' || data.table_id !== this.tableId) return;
    const pending = this.pending.get(data.operation_id);
    if (!pending) return;
    this.pending.delete(data.operation_id);
    this.options.onSettled?.(data.operation_id, data.success === true);
    if (data.success !== true) {
      this.fail(typeof data.error === 'string' ? data.error : 'Canvas command was rejected.');
      if (data.resync_required === true || ['conflict', 'history_conflict', 'retry_window_expired'].includes(String(data.code))) {
        this.recovering = true;
        this.options.onResync(pending.command.table_id);
      }
      this.flushQueued();
      this.refreshHistory();
      return;
    }
    this.history = { canUndo: data.can_undo === true, canRedo: data.can_redo === true };
    this.lastError = null;
    if ((pending.command.mode === 'copy' || pending.command.mode === 'cut') && typeof data.clipboard_id === 'string') {
      this.clipboard = { id: data.clipboard_id, copiedAt: this.now(),
        members: pending.command.members.map(ref => ({ kind: ref.kind, id: ref.id })) };
    }
    if (data.resync_required === true) {
      this.recovering = true;
      this.options.onResync(pending.command.table_id);
    }
    if (!this.pending.size && pending.command.mode !== 'copy' && pending.command.mode !== 'restyle' && Array.isArray(data.selection)) {
      this.options.onSelection(data.selection.filter((ref): ref is SelectionRef =>
        ref !== null && typeof ref === 'object' && (ref.kind === 'paint' || ref.kind === 'sprite') && typeof ref.id === 'string'));
    }
    this.emit();
    if (pending.duplicate && pending.command.mode === 'copy') this.paste();
    this.flushQueued();
  }

  private fail(message: string): false {
    this.lastError = message;
    this.options.onError?.(message);
    this.emit();
    return false;
  }

  private emit(): void { const state = this.getState(); this.listeners.forEach(listener => listener(state)); }
}
