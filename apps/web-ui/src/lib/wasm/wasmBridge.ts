/**
 * WASM Bridge Service
 * Bridges completed WASM sprite operations to the network protocol.
 * Owns optimistic-update tracking: sends commit messages with action_ids,
 * reverts on server rejection or timeout, and notifies the user.
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
  /** Last confirmed (pre-operation) state — used for rollback */
  originalState: Record<string, number>;
  /** Optimistic new state — committed to tracking on server confirmation */
  newState: Record<string, number>;
  timerId: ReturnType<typeof setTimeout>;
  baselineGeneration: number;
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
    ];
    this.isInitialized = true;
  }

  setProtocol(protocol: WebClientProtocol | null) {
    if (this.protocol && this.protocol !== protocol) this.clearTracking();
    this.protocol = protocol;
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
    if (pending.baselineGeneration === this.baselineGeneration(pending.spriteId, pending.operation)) {
      this.applyToCommitted(pending.spriteId, pending.operation, pending.newState);
    }
    this.pendingActions.delete(actionId);
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
    for (const operation of ['move', 'resize', 'rotate'] as const) this.baselineGenerations.delete(`${id}:${operation}`);
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
    this.pendingActions.forEach(p => clearTimeout(p.timerId));
    this.pendingActions.clear();
    this.committedPositions.clear();
    this.committedSizes.clear();
    this.committedRotations.clear();
    this.baselineGenerations.clear();
  }

  private onLightMoved = ({ lightId, x, y }: WasmEventMap['wasm-light-moved']) => {
    if (!this.protocol || !lightId) return;
    // Lights are sprites on the server with texture_path '__LIGHT__'.
    // Send a sprite move so the server persists the new coordinates.
    this.protocol.moveSprite(lightId, x, y);
    // Also update the Zustand store so the UI stays consistent
    useGameStore.getState().updateSprite(lightId, { x, y });
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
    const inFlight = [...this.pendingActions.values()].find(p => p.spriteId === spriteId && p.operation === operation);
    if (inFlight) {
      emitWasmEvent('sprite-revert', { spriteId, operation, originalState: inFlight.newState, reason: 'operation_pending' });
      toast.error('Wait for the previous change to be confirmed.', { autoClose: 4000 });
      return;
    }

    // Permission check: only DM/co-DM can move ownerless sprites;
    // players may only move sprites that list them in controlled_by.
    const { canControlSprite, sessionRole } = useGameStore.getState();
    if (!canInteract(sessionRole) || !isDM(sessionRole)) {
      const userId = authService.getUserInfo()?.id;
      if (!canInteract(sessionRole) || !canControlSprite(spriteId, userId)) {
        logger.warn('[WasmBridge] Permission denied: cannot control sprite', spriteId);
        // Revert the optimistic WASM move back to last committed state
        const originalState = this.snapshotCommitted(spriteId, operation);
        if (Object.keys(originalState).length > 0) {
          emitWasmEvent('sprite-revert', { spriteId, operation, originalState, reason: 'permission_denied' });
        }
        return;
      }
    }

    const actionId = String(nextMovementSequenceId());
    const originalState = this.snapshotCommitted(spriteId, operation);
    const newState = this.dataToState(operation, data);
    const timerId = setTimeout(() => this.onTimeout(actionId), CONFIRM_TIMEOUT_MS);
    const pending = { tableId, spriteId, operation, originalState, newState, timerId,
      baselineGeneration: this.baselineGeneration(spriteId, operation) };
    this.pendingActions.set(actionId, pending);
    if (this.pendingActions.size > 100 || !Object.values(newState).every(Number.isFinite)
      || operation === 'resize' && (newState.width <= 0 || newState.height <= 0)) {
      clearTimeout(timerId); this.pendingActions.delete(actionId); this.emitRevert(pending, 'invalid_operation'); return;
    }
    try {
      this.sendCommit(operation, spriteId, data, actionId, tableId);
    } catch {
      clearTimeout(timerId); this.pendingActions.delete(actionId); this.emitRevert(pending, 'send_failed');
    }
  };

  private onTimeout(actionId: string) {
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;
    this.pendingActions.delete(actionId);
    this.emitRevert(pending, 'timeout');
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
        this.protocol?.sendMessage(createMessage(MessageType.SPRITE_SCALE, {
          sprite_id: spriteId, table_id: tableId, action_id: actionId,
          width: data.width, height: data.height,
        }, 2));
        break;
      case 'rotate':
        this.protocol?.sendMessage(createMessage(MessageType.SPRITE_ROTATE, {
          sprite_id: spriteId, table_id: tableId, action_id: actionId,
          rotation: data.rotation,
        }, 2));
        break;
    }
  }

  private emitRevert(pending: PendingAction, reason: string) {
    // Do not move a renderer in a different table or restore a stale baseline
    // over state already supplied by a later authoritative event.
    if (pending.tableId !== useGameStore.getState().activeTableId) return;
    const currentState = this.snapshotCommitted(pending.spriteId, pending.operation);
    // Only revert WASM state if we have a known baseline to go back to.
    // If originalState is empty (sprite never confirmed a position with this client),
    // touching WASM with undefined values would send the sprite to NaN coordinates.
    if (Object.keys(currentState).length > 0) {
      emitWasmEvent('sprite-revert', {
        spriteId: pending.spriteId,
        operation: pending.operation,
        originalState: currentState,
        reason,
      });
    }

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
