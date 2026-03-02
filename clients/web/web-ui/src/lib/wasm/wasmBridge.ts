/**
 * WASM Bridge Service
 * Bridges completed WASM sprite operations to the network protocol.
 * Owns optimistic-update tracking: sends commit messages with action_ids,
 * reverts on server rejection or timeout, and notifies the user.
 */

import { useGameStore } from '@/store';
import { useProtocol } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import React from 'react';
import { toast } from 'react-toastify';

const CONFIRM_TIMEOUT_MS = 5000;

type Operation = 'move' | 'scale' | 'rotate';

interface PendingAction {
  spriteId: string;
  operation: Operation;
  /** Last confirmed (pre-operation) state — used for rollback */
  originalState: Record<string, number>;
  /** Optimistic new state — committed to tracking on server confirmation */
  newState: Record<string, number>;
  timerId: ReturnType<typeof setTimeout>;
}

class WasmBridgeService {
  private protocol: any = null;
  private isInitialized = false;

  // Last server-confirmed state (source of truth for rollback)
  private committedPositions = new Map<string, { x: number; y: number }>();
  private committedScales = new Map<string, { scaleX: number; scaleY: number }>();
  private committedRotations = new Map<string, number>();

  private pendingActions = new Map<string, PendingAction>();
  private nextActionId = 0;

  init() {
    if (this.isInitialized) return;
    window.addEventListener('wasm-sprite-operation', this.onWasmOperation as EventListener);
    window.addEventListener('sprite-created', this.onSpriteCreated as EventListener);
    window.addEventListener('sprite-action-confirmed', this.onActionConfirmed as EventListener);
    window.addEventListener('sprite-action-rejected', this.onActionRejected as EventListener);
    this.isInitialized = true;
  }

  setProtocol(protocol: any) {
    this.protocol = protocol;
  }

  cleanup() {
    window.removeEventListener('wasm-sprite-operation', this.onWasmOperation as EventListener);
    window.removeEventListener('sprite-created', this.onSpriteCreated as EventListener);
    window.removeEventListener('sprite-action-confirmed', this.onActionConfirmed as EventListener);
    window.removeEventListener('sprite-action-rejected', this.onActionRejected as EventListener);
    this.pendingActions.forEach(p => clearTimeout(p.timerId));
    this.pendingActions.clear();
    this.isInitialized = false;
  }

  private onActionConfirmed = (e: Event) => {
    const { actionId } = (e as CustomEvent<{ actionId: string }>).detail;
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;
    clearTimeout(pending.timerId);
    this.applyToCommitted(pending.spriteId, pending.operation, pending.newState);
    this.pendingActions.delete(actionId);
  };

  private onActionRejected = (e: Event) => {
    const { actionId, reason } = (e as CustomEvent<{ actionId: string; reason: string }>).detail;
    const pending = this.pendingActions.get(actionId);
    if (!pending) return;
    clearTimeout(pending.timerId);
    this.pendingActions.delete(actionId);
    this.emitRevert(pending, reason);
  };

  private onSpriteCreated = (e: Event) => {
    const { sprite_id, x, y } = (e as CustomEvent).detail ?? {};
    if (sprite_id != null && x != null && y != null) {
      this.committedPositions.set(sprite_id, { x, y });
    }
  };

  private onWasmOperation = (e: Event) => {
    const { operation, spriteId, data } = (e as CustomEvent).detail;
    if (!this.protocol || !spriteId || !operation) return;

    const actionId = `a${++this.nextActionId}`;
    const originalState = this.snapshotCommitted(spriteId, operation as Operation);
    const newState = this.dataToState(operation as Operation, data);

    this.sendCommit(operation as Operation, spriteId, data, actionId);

    const timerId = setTimeout(() => this.onTimeout(actionId), CONFIRM_TIMEOUT_MS);
    this.pendingActions.set(actionId, { spriteId, operation: operation as Operation, originalState, newState, timerId });
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
      case 'scale': {
        const s = this.committedScales.get(spriteId);
        return s ? { scaleX: s.scaleX, scaleY: s.scaleY } : {};
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
      case 'scale':
        this.committedScales.set(spriteId, { scaleX: state.scaleX, scaleY: state.scaleY });
        break;
      case 'rotate':
        this.committedRotations.set(spriteId, state.rotation);
        break;
    }
  }

  private dataToState(op: Operation, data: Record<string, number>): Record<string, number> {
    switch (op) {
      case 'move':   return { x: data.x, y: data.y };
      case 'scale':  return { scaleX: data.scale_x, scaleY: data.scale_y };
      case 'rotate': return { rotation: data.rotation };
    }
  }

  // ──────────────────────────────────────────────
  // Network send helpers

  private sendCommit(op: Operation, spriteId: string, data: Record<string, number>, actionId: string) {
    const tableId = useGameStore.getState().activeTableId;
    if (!tableId) {
      console.error('[WasmBridge] No active table for commit');
      return;
    }

    switch (op) {
      case 'move': {
        const prev = this.committedPositions.get(spriteId) ?? { x: data.x, y: data.y };
        this.protocol.sendMessage(createMessage(MessageType.SPRITE_MOVE, {
          sprite_id: spriteId, table_id: tableId, action_id: actionId,
          from: prev, to: { x: data.x, y: data.y },
        }, 2));
        break;
      }
      case 'scale':
        this.protocol.sendMessage(createMessage(MessageType.SPRITE_SCALE, {
          sprite_id: spriteId, table_id: tableId, action_id: actionId,
          scale_x: data.scale_x, scale_y: data.scale_y,
        }, 2));
        break;
      case 'rotate':
        this.protocol.sendMessage(createMessage(MessageType.SPRITE_ROTATE, {
          sprite_id: spriteId, table_id: tableId, action_id: actionId,
          rotation: data.rotation,
        }, 2));
        break;
    }
  }

  private emitRevert(pending: PendingAction, reason: string) {
    window.dispatchEvent(new CustomEvent('sprite-revert', {
      detail: {
        spriteId: pending.spriteId,
        operation: pending.operation,
        originalState: pending.originalState,
        reason,
      }
    }));

    const label: Record<Operation, string> = { move: 'Movement', scale: 'Resize', rotate: 'Rotation' };
    const msg = reason === 'timeout'
      ? `${label[pending.operation]} wasn't confirmed by the server. Reverting.`
      : `${label[pending.operation]} was rejected. Reverting.`;
    toast.error(msg, { autoClose: 4000 });
  }
}

export const wasmBridgeService = new WasmBridgeService();

export function useWasmBridge() {
  const _ctx = (() => { try { return useProtocol(); } catch { return undefined; } })();
  const protocol = _ctx?.protocol ?? null;

  React.useEffect(() => {
    wasmBridgeService.init();
    if (protocol) wasmBridgeService.setProtocol(protocol);
  }, [protocol]);

  return wasmBridgeService;
}
