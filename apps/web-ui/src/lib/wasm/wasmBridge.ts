/**
 * WASM Bridge Service
 * Bridges completed WASM sprite operations to the network protocol.
 * Owns optimistic-update tracking: sends commit messages with action_ids,
 * reconciles server rejection and requests authoritative recovery on timeout.
 */

import { useGameStore } from '@/store';
import { authService } from '@features/auth';
import {
  nextMovementSequenceId,
  sendSpriteMovement,
} from '@features/combat/services/movementCommand.service';
import { canInteract, isDM } from '@features/session/types/roles';
import { useOptionalProtocol } from '@lib/api';
import { onProtocolEvent, type ProtocolEventMap } from '@lib/websocket/protocolEvents';
import { createMessage, MessageType } from '@lib/websocket';
import type { WebClientProtocol } from '@lib/websocket';
import { logger } from '@shared/utils/logger';
import React from 'react';
import { toast } from 'react-toastify';
import { emitWasmEvent, onWasmEvent, type WasmEventMap } from './wasmEvents';

const CONFIRM_TIMEOUT_MS = 5000;

type Operation = 'move' | 'resize' | 'rotate';

interface PendingAction {
  tableId: string;
  spriteId: string;
  operation: Operation;
  /** Optimistic new state — committed to tracking on server confirmation */
  newState: Record<string, number>;
  timerId: ReturnType<typeof setTimeout>;
  baselineGeneration: number;
  sequence: number;
  sentAt?: number;
}

class WasmBridgeService {
  private protocol: WebClientProtocol | null = null;
  private isInitialized = false;
  private eventCleanups: Array<() => void> = [];

  // Last server-confirmed state (source of truth for rollback)
  private committedPositions = new Map<string, { x: number; y: number }>();
  private committedSizes = new Map<string, { width: number; height: number }>();
  private committedRotations = new Map<string, number>();

  private pendingActions = new Map<string, PendingAction>();
  private baselineGenerations = new Map<string, number>();
  private trackingGeneration = 0;
  private sequence = 0;
  private latestSettled = new Map<string, number>();
  private resyncWatermarks = new Map<string, number>();
  init() {
    if (this.isInitialized) return;
    this.eventCleanups = [
      onWasmEvent('wasm-sprite-operation', this.onWasmOperation),
      onWasmEvent('wasm-light-moved', this.onLightMoved),
      onWasmEvent('wasm-wall-moved', this.onWallMoved),
      onProtocolEvent('sprite-created', this.onSpriteCreated),
      onProtocolEvent('sprite-action-confirmed', this.onActionConfirmed),
      onProtocolEvent('sprite-action-rejected', this.onActionRejected),
      onProtocolEvent('sprite-removed', this.onSpriteRemoved),
      onProtocolEvent('table-command-progress', ({ tableId }) => {
        for (const [id, pending] of this.pendingActions) {
          if (pending.tableId !== tableId || pending.sentAt === undefined) continue;
          clearTimeout(pending.timerId);
          pending.timerId = setTimeout(() => this.onTimeout(id),
            Math.max(0, Math.min(CONFIRM_TIMEOUT_MS, 60_000 - (Date.now() - pending.sentAt))));
        }
      }),
      onProtocolEvent('command-transmitted', ({ actionId }) => {
        const pending = this.pendingActions.get(actionId);
        if (!pending || pending.sentAt !== undefined) return;
        pending.sentAt = Date.now();
        clearTimeout(pending.timerId);
        pending.timerId = setTimeout(() => this.onTimeout(actionId), CONFIRM_TIMEOUT_MS);
      }),
      onProtocolEvent('table-resync-started', ({ tableId }) => this.resyncWatermarks.set(tableId, this.sequence)),
      onProtocolEvent('table-resync-completed', ({ tableId }) => {
        const watermark = this.resyncWatermarks.get(tableId);
        if (watermark === undefined) return;
        this.resyncWatermarks.delete(tableId);
        for (const [id, pending] of this.pendingActions) {
          if (pending.tableId === tableId && pending.sequence <= watermark) {
            clearTimeout(pending.timerId);
            this.pendingActions.delete(id);
          }
        }
      }),
      onProtocolEvent('table-sprites-loaded', ({ table_id }) => {
        for (const pending of this.pendingActions.values()) {
          if (pending.tableId === table_id) this.queueRevert(table_id, pending.spriteId, pending.operation, 'reconciled');
        }
      }),
    ];
    this.isInitialized = true;
  }

  setProtocol(protocol: WebClientProtocol | null) {
    if (this.protocol && this.protocol !== protocol) this.clearTracking();
    this.protocol = protocol;
  }

  /** Route shared-selection moves through the same confirmation owner as WASM gestures. */
  commitSelectionMove(protocol: WebClientProtocol, tableId: string, spriteId: string, x: number, y: number): void {
    if (!this.isInitialized || this.protocol !== protocol || useGameStore.getState().activeTableId !== tableId) return;
    this.onWasmOperation({ operation: 'move', spriteId, data: { x, y } });
  }

  /**
   * Seed committed state for a sprite from authoritative server data.
   * Must be called whenever the server sends confirmed sprite state
   * (table load, confirmed move/scale/rotate) so that permission-denied
   * reverts always have a baseline position to snap the sprite back to.
   */
  seedSpriteState(spriteId: string, state: { x?: number; y?: number; width?: number; height?: number; rotation?: number }): void {
    if (!spriteId) return;
    if (state.x !== undefined && state.y !== undefined) {
      if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
        this.committedPositions.set(spriteId, { x: state.x, y: state.y });
        this.advanceBaseline(spriteId, 'move');
      }
    }
    if (state.width !== undefined && state.height !== undefined) {
      if (Number.isFinite(state.width) && Number.isFinite(state.height) && state.width > 0 && state.height > 0) {
        this.committedSizes.set(spriteId, { width: state.width, height: state.height });
        this.advanceBaseline(spriteId, 'resize');
      }
    }
    if (state.rotation !== undefined) {
      if (Number.isFinite(state.rotation)) {
        this.committedRotations.set(spriteId, state.rotation);
        this.advanceBaseline(spriteId, 'rotate');
      }
    }
    for (const pending of this.pendingActions.values()) {
      if (pending.spriteId === spriteId) this.queueRevert(pending.tableId, spriteId, pending.operation, 'reconciled');
    }
  }

  cleanup() {
    this.eventCleanups.forEach(cleanup => cleanup());
    this.eventCleanups = [];
    this.clearTracking();
    this.protocol = null;
    this.isInitialized = false;
  }

  private onActionConfirmed = (detail: ProtocolEventMap['sprite-action-confirmed']) => {
    if (typeof detail.actionId !== 'string') return;
    const actionId = detail.actionId;
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;
    clearTimeout(pending.timerId);
    const key = `${pending.spriteId}:${pending.operation}`;
    if (pending.sequence > (this.latestSettled.get(key) ?? 0)
      && (detail.state || pending.baselineGeneration === this.baselineGeneration(pending.spriteId, pending.operation))) {
      this.applyToCommitted(pending.spriteId, pending.operation, detail.state ?? pending.newState);
      this.latestSettled.set(key, pending.sequence);
    }
    this.pendingActions.delete(actionId);
    this.queueRevert(pending.tableId, pending.spriteId, pending.operation, 'reconciled');
  };

  private onActionRejected = (detail: ProtocolEventMap['sprite-action-rejected']) => {
    if (typeof detail.actionId !== 'string') return;
    const { actionId, reason } = detail;
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;
    clearTimeout(pending.timerId);
    this.pendingActions.delete(actionId);
    this.emitRevert(pending, reason);
  };

  private onSpriteCreated = (detail: ProtocolEventMap['sprite-created']) => {
    const { sprite_id, x, y } = detail ?? {};
    if (sprite_id != null && x != null && y != null) {
      this.seedSpriteState(String(sprite_id), { x: Number(x), y: Number(y) });
    }
  };

  private onSpriteRemoved = (detail: ProtocolEventMap['sprite-removed']) => {
    const id = detail?.sprite_id ?? detail?.id;
    if (typeof id !== 'string') return;
    this.committedPositions.delete(id);
    this.committedSizes.delete(id);
    this.committedRotations.delete(id);
    for (const operation of ['move', 'resize', 'rotate'] as const) {
      this.baselineGenerations.delete(`${id}:${operation}`);
      this.latestSettled.delete(`${id}:${operation}`);
    }
    for (const [actionId, pending] of this.pendingActions) {
      if (pending.spriteId === id) { clearTimeout(pending.timerId); this.pendingActions.delete(actionId); }
    }
  };

  private baselineGeneration(id: string, operation: Operation): number {
    return this.baselineGenerations.get(`${id}:${operation}`) ?? 0;
  }

  private advanceBaseline(id: string, operation: Operation): void {
    this.baselineGenerations.set(`${id}:${operation}`, this.baselineGeneration(id, operation) + 1);
  }

  private clearTracking(): void {
    this.trackingGeneration += 1;
    this.pendingActions.forEach(p => clearTimeout(p.timerId));
    this.pendingActions.clear();
    this.committedPositions.clear();
    this.committedSizes.clear();
    this.committedRotations.clear();
    this.baselineGenerations.clear();
    this.latestSettled.clear();
    this.resyncWatermarks.clear();
  }

  private onLightMoved = ({ lightId, x, y }: WasmEventMap['wasm-light-moved']) => {
    if (!this.protocol || !lightId) return;
    this.onWasmOperation({ operation: 'move', spriteId: lightId, data: { x, y } });
  };

  private onWallMoved = ({ wallId, x1, y1, x2, y2 }: WasmEventMap['wasm-wall-moved']) => {
    if (!this.protocol || !wallId) return;
    const updates = { x1, y1, x2, y2 };

    // Rust emits this synchronously while handle_mouse_up still owns a
    // mutable RenderEngine borrow. The store action forwards to update_wall,
    // so defer it until wasm-bindgen has released the original borrow.
    queueMicrotask(() => {
      useGameStore.getState().updateWall(wallId, updates);
      this.protocol?.updateWall(wallId, updates);
    });
  };

  private onWasmOperation = ({ operation, spriteId, data }: WasmEventMap['wasm-sprite-operation']) => {
    if (!this.protocol || !spriteId || !operation) return;
    if (!['move', 'resize', 'rotate'].includes(operation)) return;
    const tableId = useGameStore.getState().activeTableId;
    if (!tableId) return;
    // Permission check: only DM/co-DM can move ownerless sprites;
    // players may only move sprites that list them in controlled_by.
    const { canControlSprite, sessionRole } = useGameStore.getState();
    if (!canInteract(sessionRole) || !isDM(sessionRole)) {
      const userId = authService.getUserInfo()?.id;
      if (!canInteract(sessionRole) || !canControlSprite(spriteId, userId)) {
        logger.warn('[WasmBridge] Permission denied: cannot control sprite', spriteId);
        // Revert the optimistic WASM move back to last committed state
        this.queueRevert(tableId, spriteId, operation, 'permission_denied');
        return;
      }
    }

    const actionId = String(nextMovementSequenceId());
    const newState = this.dataToState(operation, data);
    const timerId = setTimeout(() => this.onTimeout(actionId), 30_000);
    const pending = { tableId, spriteId, operation, newState, timerId,
      baselineGeneration: this.baselineGeneration(spriteId, operation), sequence: ++this.sequence };
    this.pendingActions.set(actionId, pending);
    if (this.pendingActions.size > 100 || !Object.values(newState).every(Number.isFinite)
      || operation === 'resize' && (newState.width <= 0 || newState.height <= 0)) {
      clearTimeout(timerId); this.pendingActions.delete(actionId); this.emitRevert(pending, 'invalid_operation'); return;
    }
    try {
      this.sendCommit(operation, spriteId, data, actionId, tableId);
      this.queueRevert(tableId, spriteId, operation, 'optimistic');
    } catch {
      clearTimeout(timerId); this.pendingActions.delete(actionId); this.emitRevert(pending, 'send_failed');
    }
  };

  private onTimeout(actionId: string) {
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;
    // A timeout is an unknown outcome: the command may already be committed.
    // Keep newer local intent visible while a fenced snapshot resolves it.
    if (pending.tableId === useGameStore.getState().activeTableId) {
      this.protocol?.resynchronizeTable?.(pending.tableId);
    }
  }

  // ──────────────────────────────────────────────
  // Committed state helpers

  private snapshotCommitted(spriteId: string, op: Operation): Record<string, number> {
    switch (op) {
      case 'move': {
        const s = this.committedPositions.get(spriteId);
        return s ? { x: s.x, y: s.y } : {};
      }
      case 'resize': {
        const s = this.committedSizes.get(spriteId);
        return s ? { width: s.width, height: s.height } : {};
      }
      case 'rotate': {
        const r = this.committedRotations.get(spriteId);
        return r != null ? { rotation: r } : {};
      }
    }
  }

  private applyToCommitted(spriteId: string, op: Operation, state: Record<string, number>) {
    switch (op) {
      case 'move':
        this.committedPositions.set(spriteId, { x: state.x, y: state.y });
        break;
      case 'resize':
        this.committedSizes.set(spriteId, { width: state.width, height: state.height });
        break;
      case 'rotate':
        this.committedRotations.set(spriteId, state.rotation);
        break;
    }
  }

  private dataToState(op: Operation, data: Record<string, number>): Record<string, number> {
    switch (op) {
      case 'move':   return { x: data.x, y: data.y };
      case 'resize': return { width: data.width, height: data.height };
      case 'rotate': return { rotation: data.rotation };
    }
  }

  // ──────────────────────────────────────────────
  // Network send helpers

  private sendCommit(op: Operation, spriteId: string, data: Record<string, number>, actionId: string, tableId: string) {

    switch (op) {
      case 'move': {
        const prev = this.committedPositions.get(spriteId) ?? { x: data.x, y: data.y };
        if (this.protocol) {
          sendSpriteMovement(this.protocol, {
            spriteId,
            tableId,
            actionId,
            from: prev,
            to: { x: data.x, y: data.y },
          });
        }
        break;
      }
      case 'resize':
        if (this.protocol?.sendMessage(createMessage(MessageType.SPRITE_SCALE, {
          sprite_id: spriteId, table_id: tableId, action_id: actionId,
          width: data.width, height: data.height,
        }, 2)) === false) throw new Error('Disconnected');
        break;
      case 'rotate':
        if (this.protocol?.sendMessage(createMessage(MessageType.SPRITE_ROTATE, {
          sprite_id: spriteId, table_id: tableId, action_id: actionId,
          rotation: data.rotation,
        }, 2)) === false) throw new Error('Disconnected');
        break;
    }
  }

  private queueRevert(tableId: string, spriteId: string, operation: Operation, reason: string, preview?: PendingAction) {
    const generation = this.trackingGeneration;
    // Rust emits completion events while it still owns a mutable renderer
    // borrow. Re-enter only after that callback unwinds, using current state.
    queueMicrotask(() => {
      if (!this.isInitialized || generation !== this.trackingGeneration
        || tableId !== useGameStore.getState().activeTableId) return;
      const currentPreview = [...this.pendingActions.values()].filter(p => p.tableId === tableId
        && p.spriteId === spriteId && p.operation === operation).at(-1) ?? preview;
      const previewIsCurrent = currentPreview && [...this.pendingActions.values()].includes(currentPreview);
      const originalState = previewIsCurrent ? currentPreview.newState : this.snapshotCommitted(spriteId, operation);
      if (Object.keys(originalState).length > 0) {
        // Reconciliation is local state application, never another command.
        useGameStore.setState(state => ({ sprites: state.sprites.map(sprite =>
          sprite.id === spriteId ? { ...sprite, ...originalState } : sprite) }));
        emitWasmEvent('sprite-revert', { spriteId, operation, originalState, reason });
      } else if (reason !== 'optimistic') {
        this.protocol?.resynchronizeTable?.(tableId);
      }
    });
  }

  private emitRevert(pending: PendingAction, reason: string) {
    // Do not move a renderer in a different table or restore a stale baseline
    // over state already supplied by a later authoritative event.
    if (pending.tableId !== useGameStore.getState().activeTableId) return;
    this.queueRevert(pending.tableId, pending.spriteId, pending.operation, reason);

    const label: Record<Operation, string> = { move: 'Movement', resize: 'Resize', rotate: 'Rotation' };
    const msg = reason === 'timeout'
      ? `${label[pending.operation]} wasn't confirmed by the server. Reverting.`
      : `${label[pending.operation]} was rejected. Reverting.`;
    toast.error(msg, { autoClose: 4000 });
  }
}

export const wasmBridgeService = new WasmBridgeService();

export function useWasmBridge() {
  const protocol = useOptionalProtocol()?.protocol ?? null;

  React.useEffect(() => {
    wasmBridgeService.init();
    wasmBridgeService.setProtocol(protocol);
  }, [protocol]);

  return wasmBridgeService;
}
