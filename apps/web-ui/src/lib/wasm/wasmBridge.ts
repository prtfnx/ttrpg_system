/**
 * WASM Bridge Service
 * Bridges completed WASM sprite operations to the network protocol.
 * Owns optimistic-update tracking: sends commit messages with action_ids,
 * reverts on server rejection or timeout, and notifies the user.
 */

import { useGameStore } from '@/store';
import { authService } from '@features/auth';
import { isDM } from '@features/session/types/roles';
import { useOptionalProtocol } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import type { WebClientProtocol } from '@lib/websocket';
import React from 'react';
import { toast } from 'react-toastify';

const CONFIRM_TIMEOUT_MS = 5000;

type Operation = 'move' | 'resize' | 'rotate';

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
  private protocol: WebClientProtocol | null = null;
  private isInitialized = false;

  // Last server-confirmed state (source of truth for rollback)
  private committedPositions = new Map<string, { x: number; y: number }>();
  private committedSizes = new Map<string, { width: number; height: number }>();
  private committedRotations = new Map<string, number>();

  private pendingActions = new Map<string, PendingAction>();
  private nextActionId = 0;

  init() {
    if (this.isInitialized) return;
    window.addEventListener('wasm-sprite-operation', this.onWasmOperation as EventListener);
    window.addEventListener('wasm-light-moved', this.onLightMoved as EventListener);
    window.addEventListener('wasm-wall-moved', this.onWallMoved as EventListener);
    window.addEventListener('sprite-created', this.onSpriteCreated as EventListener);
    window.addEventListener('sprite-action-confirmed', this.onActionConfirmed as EventListener);
    window.addEventListener('sprite-action-rejected', this.onActionRejected as EventListener);
    this.isInitialized = true;
  }

  setProtocol(protocol: WebClientProtocol | null) {
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
      this.committedPositions.set(spriteId, { x: state.x, y: state.y });
    }
    if (state.width !== undefined && state.height !== undefined) {
      this.committedSizes.set(spriteId, { width: state.width, height: state.height });
    }
    if (state.rotation !== undefined) {
      this.committedRotations.set(spriteId, state.rotation);
    }
  }

  cleanup() {
    window.removeEventListener('wasm-sprite-operation', this.onWasmOperation as EventListener);
    window.removeEventListener('wasm-light-moved', this.onLightMoved as EventListener);
    window.removeEventListener('wasm-wall-moved', this.onWallMoved as EventListener);
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

  private onLightMoved = (e: Event) => {
    const { lightId, x, y } = (e as CustomEvent).detail ?? {};
    if (!this.protocol || !lightId) return;
    // Lights are sprites on the server with texture_path '__LIGHT__'.
    // Send a sprite move so the server persists the new coordinates.
    this.protocol.moveSprite(lightId, x, y);
    // Also update the Zustand store so the UI stays consistent
    useGameStore.getState().updateSprite(lightId, { x, y });
  };

  private onWallMoved = (e: Event) => {
    const { wallId, x1, y1, x2, y2 } = (e as CustomEvent).detail ?? {};
    if (!this.protocol || !wallId) return;
    // Update store (which also forwards to WASM)
    useGameStore.getState().updateWall(wallId, { x1, y1, x2, y2 });
    // Send to server
    this.protocol.updateWall(wallId, { x1, y1, x2, y2 });
  };

  private onWasmOperation = (e: Event) => {
    const { operation, spriteId, data } = (e as CustomEvent).detail;
    if (!this.protocol || !spriteId || !operation) return;

    // Permission check: only DM/co-DM can move ownerless sprites;
    // players may only move sprites that list them in controlled_by.
    const { canControlSprite, sessionRole } = useGameStore.getState();
    if (!isDM(sessionRole)) {
      const userId = authService.getUserInfo()?.id;
      if (!canControlSprite(spriteId, userId)) {
        console.warn('[WasmBridge] Permission denied: cannot control sprite', spriteId);
        // Revert the optimistic WASM move back to last committed state
        const originalState = this.snapshotCommitted(spriteId, operation as Operation);
        if (Object.keys(originalState).length > 0) {
          window.dispatchEvent(new CustomEvent('sprite-revert', {
            detail: { spriteId, operation, originalState, reason: 'permission_denied' }
          }));
        }
        return;
      }
    }

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
      case 'resize':
        this.protocol.sendMessage(createMessage(MessageType.SPRITE_SCALE, {
          sprite_id: spriteId, table_id: tableId, action_id: actionId,
          width: data.width, height: data.height,
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
    // Only revert WASM state if we have a known baseline to go back to.
    // If originalState is empty (sprite never confirmed a position with this client),
    // touching WASM with undefined values would send the sprite to NaN coordinates.
    if (Object.keys(pending.originalState).length > 0) {
      window.dispatchEvent(new CustomEvent('sprite-revert', {
        detail: {
          spriteId: pending.spriteId,
          operation: pending.operation,
          originalState: pending.originalState,
          reason,
        }
      }));
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
    if (protocol) wasmBridgeService.setProtocol(protocol);
  }, [protocol]);

  return wasmBridgeService;
}
