import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import type { SelectionRef } from './SelectionManager';

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

export type CanvasIntent =
  | { mode: 'transform'; members: readonly CanvasMember[]; transform: CanvasTransform }
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
}

const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACK_TIMEOUT_MS = 10_000;

/** One active editor intent; no optimistic domain writes or local undo stacks. */
export class CanvasCommandController {
  private tableId: string | null = null;
  private actorId: number | null = null;
  private pending: { command: CanvasIntent & { operation_id: string; table_id: string; issued_at: number }; sentAt: number; duplicate: boolean } | null = null;
  private clipboard: { id: string; members: readonly SelectionRef[]; copiedAt: number } | null = null;
  private history = { canUndo: false, canRedo: false };
  private lastError: string | null = null;
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
      onProtocolEvent('canvas-history-state', data => {
        if (data?.table_id !== this.tableId || this.pending) return;
        this.history = { canUndo: data.can_undo === true, canRedo: data.can_redo === true };
        this.emit();
      }),
      onProtocolEvent('protocol-connected', () => {
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
    this.pending = null;
    this.clipboard = null;
    this.listeners.clear();
  }

  selectScope(tableId: string | null, actorId: number | null): void {
    if (tableId === this.tableId && actorId === this.actorId) return;
    this.tableId = tableId;
    this.actorId = actorId;
    this.pending = null;
    this.clipboard = null;
    this.history = { canUndo: false, canRedo: false };
    this.lastError = null;
    this.refreshHistory();
    this.emit();
  }

  getState(): CanvasCommandState {
    return { tableId: this.tableId, pending: this.pending !== null,
      canUndo: this.history.canUndo, canRedo: this.history.canRedo,
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
    if (this.pending) return this.fail('Wait for the current canvas command to finish.');
    if ('members' in intent && (intent.members.length < 1 || intent.members.length > 100)) {
      return this.fail('Select between 1 and 100 editable objects.');
    }
    const command = structuredClone({ ...intent, operation_id: this.operationId(), table_id: this.tableId, issued_at: this.now() });
    if (new TextEncoder().encode(JSON.stringify(command)).length > 60 * 1024) {
      return this.fail('Canvas command exceeds the 60 KiB limit.');
    }
    // Register before send: tests and adapters may confirm synchronously.
    const pending = { command, sentAt: this.now(), duplicate };
    this.pending = pending;
    this.lastError = null;
    try {
      if (!this.transport.sendCanvasCommand(command)) {
        if (this.pending === pending) this.pending = null;
        return this.fail('Canvas is disconnected; reconnect before editing.');
      }
    } catch {
      if (this.pending === pending) this.pending = null;
      return this.fail('Canvas command could not be sent.');
    }
    this.emit();
    return true;
  }

  paste(transform: CanvasTransform = { ...IDENTITY_TRANSFORM, dx: 10, dy: 10 }): boolean {
    if (!this.clipboard || !this.getState().canPaste) return this.fail('Copy a selection before pasting.');
    return this.submit({ mode: 'paste', clipboard_id: this.clipboard.id, transform,
      ids: this.clipboard.members.map(ref => ({ kind: ref.kind, source_id: ref.id, id: this.operationId() })) });
  }

  refreshHistory(): void {
    if (this.tableId && this.actorId !== null) {
      try { this.transport.requestCanvasHistory(this.tableId); } catch { /* reconnect refreshes availability */ }
    }
  }

  tick(): void {
    if (this.pending && this.now() - this.pending.command.issued_at > RETRY_WINDOW_MS) {
      const tableId = this.pending.command.table_id;
      this.pending = null;
      this.fail('Canvas acknowledgement expired; the table has been reloaded.');
      this.options.onResync(tableId);
    } else if (this.pending && this.now() - this.pending.sentAt >= ACK_TIMEOUT_MS) {
      this.retry();
    }
  }

  private retry(): void {
    if (!this.pending || this.pending.command.table_id !== this.tableId) return;
    if (this.now() - this.pending.command.issued_at > RETRY_WINDOW_MS) { this.tick(); return; }
    this.pending.sentAt = this.now();
    try { this.transport.sendCanvasCommand(this.pending.command); } catch { /* retain exact intent for reconnect */ }
  }

  acceptResult(data: Record<string, unknown> | undefined): void {
    const pending = this.pending;
    if (!pending || data?.operation_id !== pending.command.operation_id || data.table_id !== this.tableId) return;
    this.pending = null;
    if (data.success !== true) {
      this.fail(typeof data.error === 'string' ? data.error : 'Canvas command was rejected.');
      this.options.onResync(pending.command.table_id);
      this.refreshHistory();
      return;
    }
    this.history = { canUndo: data.can_undo === true, canRedo: data.can_redo === true };
    this.lastError = null;
    if ((pending.command.mode === 'copy' || pending.command.mode === 'cut') && typeof data.clipboard_id === 'string') {
      this.clipboard = { id: data.clipboard_id, copiedAt: this.now(),
        members: pending.command.members.map(ref => ({ kind: ref.kind, id: ref.id })) };
    }
    if (data.resync_required === true) this.options.onResync(pending.command.table_id);
    if (pending.command.mode !== 'copy' && Array.isArray(data.selection)) {
      this.options.onSelection(data.selection.filter((ref): ref is SelectionRef =>
        ref !== null && typeof ref === 'object' && (ref.kind === 'paint' || ref.kind === 'sprite') && typeof ref.id === 'string'));
    }
    this.emit();
    if (pending.duplicate && pending.command.mode === 'copy') this.paste();
  }

  private fail(message: string): false {
    this.lastError = message;
    this.options.onError?.(message);
    this.emit();
    return false;
  }

  private emit(): void { const state = this.getState(); this.listeners.forEach(listener => listener(state)); }
}
