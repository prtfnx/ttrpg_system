/**
 * WASM Bridge Service
 * Connects WASM sprite operations to network protocol
 */

import React from 'react';
import { createMessage, MessageType } from '../protocol/message';
import { useProtocol } from '../services/ProtocolContext';
import { useGameStore } from '../store';

class WasmBridgeService {
  private protocol: any = null;
  private isInitialized = false;
  private spritePositions: Map<string, {x: number, y: number}> = new Map();

  init() {
    if (this.isInitialized) return;

    // Listen for WASM operation completion events
    window.addEventListener('wasm-sprite-operation', this.handleWasmOperation as EventListener);
    window.addEventListener('wasm-network-request', this.handleNetworkRequest as EventListener);
    window.addEventListener('wasm-error', this.handleWasmError as EventListener);
    
    // Listen for sprite creation to track initial positions
    window.addEventListener('sprite-created', this.handleSpriteCreated as EventListener);

    this.isInitialized = true;
    console.log('[WasmBridge] Service initialized');
  }

  setProtocol(protocol: any) {
    this.protocol = protocol;
    console.log('[WasmBridge] Protocol connected');
  }

  // Track sprite positions for proper from/to movement messages
  updateSpritePosition(spriteId: string, x: number, y: number) {
    this.spritePositions.set(spriteId, { x, y });
  }

  private handleSpriteCreated = (event: Event) => {
    const customEvent = event as CustomEvent;
    const { sprite_id, x, y } = customEvent.detail;
    if (sprite_id && x !== undefined && y !== undefined) {
      this.updateSpritePosition(sprite_id, x, y);
      console.log('[WasmBridge] Tracked initial position for sprite:', sprite_id, { x, y });
    }
  };

  private handleWasmOperation = (event: Event) => {
    const customEvent = event as CustomEvent;
    const { operation, spriteId, data } = customEvent.detail;
    console.log('[WasmBridge] WASM operation completed:', operation, spriteId, data);

    if (!this.protocol) {
      console.warn('[WasmBridge] No protocol available for network sync');
      return;
    }

    try {
      switch (operation) {
        case 'move':
          this.sendSpriteMove(spriteId, data.x, data.y);
          break;
        case 'scale':
          this.sendSpriteScale(spriteId, data.scale_x, data.scale_y);
          break;
        case 'rotate':
          this.sendSpriteRotate(spriteId, data.rotation);
          break;
        default:
          console.warn('[WasmBridge] Unknown operation:', operation);
      }
    } catch (error) {
      console.error('[WasmBridge] Error sending network update:', error);
    }
  };

  private handleNetworkRequest = (event: Event) => {
    const customEvent = event as CustomEvent;
    const { updateType, data } = customEvent.detail;
    console.log('[WasmBridge] WASM requesting network update:', updateType, data);
    // Handle direct network requests from WASM if needed
  };

  private handleWasmError = (event: Event) => {
    const customEvent = event as CustomEvent;
    const { operation, error } = customEvent.detail;
    console.error('[WasmBridge] WASM error:', operation, error);
  };

  private sendSpriteMove(spriteId: string, x: number, y: number) {
    // Get the previous position (or use current position as fallback)
    const previousPosition = this.spritePositions.get(spriteId) || { x, y };
    const newPosition = { x, y };
    
    // Update our position tracking
    this.spritePositions.set(spriteId, newPosition);

    // Get the actual table ID from the game store
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[WasmBridge] No active table ID available for sprite move');
      return;
    }

    const updateData = {
      sprite_id: spriteId,
      from: previousPosition,
      to: newPosition,
      table_id: activeTableId
    };

    const message = createMessage(MessageType.SPRITE_MOVE, updateData, 2);
    this.protocol.sendMessage(message);
    console.log('[WasmBridge] Sent sprite move:', spriteId, previousPosition, '->', newPosition);
  }

  private sendSpriteScale(spriteId: string, scaleX: number, scaleY: number) {
    console.log('[WasmBridge] Sending sprite scale via protocol client:', { spriteId, scaleX, scaleY });
    this.protocol.scaleSprite(spriteId, scaleX, scaleY);
  }

  private sendSpriteRotate(spriteId: string, rotation: number) {
    // Get the actual table ID from the game store
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[WasmBridge] No active table ID available for sprite rotate');
      return;
    }

    const updateData = {
      sprite_id: spriteId,
      rotation: rotation,
      table_id: activeTableId
    };

    const message = createMessage(MessageType.SPRITE_ROTATE, updateData, 2);
    this.protocol.sendMessage(message);
    console.log('[WasmBridge] Sent sprite rotate:', spriteId, rotation);
  }

  cleanup() {
    if (!this.isInitialized) return;

    window.removeEventListener('wasm-sprite-operation', this.handleWasmOperation as EventListener);
    window.removeEventListener('wasm-network-request', this.handleNetworkRequest as EventListener);
    window.removeEventListener('wasm-error', this.handleWasmError as EventListener);

    this.isInitialized = false;
    console.log('[WasmBridge] Service cleaned up');
  }
}

// Create singleton instance
export const wasmBridgeService = new WasmBridgeService();

// React hook for easy integration
export function useWasmBridge() {
  // Defensive call - in tests useProtocol may throw if Provider isn't present
  const _protocolCtx = (() => {
    try { return useProtocol(); } catch (e) { return undefined; }
  })();
  const protocol = _protocolCtx?.protocol ?? null;

  React.useEffect(() => {
    wasmBridgeService.init();
    if (protocol) {
      wasmBridgeService.setProtocol(protocol);
    }

    return () => {
      // Don't cleanup on unmount since this is a global service
    };
  }, [protocol]);

  return wasmBridgeService;
}
