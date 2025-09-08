/**
 * WASM Bridge Service
 * Connects WASM sprite operations to network protocol
 */

import React from 'react';
import { useProtocol } from '../services/ProtocolContext';
import { createMessage, MessageType } from '../protocol/message';

class WasmBridgeService {
  private protocol: any = null;
  private isInitialized = false;

  init() {
    if (this.isInitialized) return;

    // Listen for WASM operation completion events
    window.addEventListener('wasm-sprite-operation', this.handleWasmOperation as EventListener);
    window.addEventListener('wasm-network-request', this.handleNetworkRequest as EventListener);
    window.addEventListener('wasm-error', this.handleWasmError as EventListener);

    this.isInitialized = true;
    console.log('[WasmBridge] Service initialized');
  }

  setProtocol(protocol: any) {
    this.protocol = protocol;
    console.log('[WasmBridge] Protocol connected');
  }

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
    const updateData = {
      sprite_id: spriteId,
      x: x,
      y: y
    };

    const message = createMessage(MessageType.SPRITE_MOVE, updateData, 2);
    this.protocol.sendMessage(message);
    console.log('[WasmBridge] Sent sprite move:', spriteId, x, y);
  }

  private sendSpriteScale(spriteId: string, scaleX: number, scaleY: number) {
    const updateData = {
      sprite_id: spriteId,
      scale_x: scaleX,
      scale_y: scaleY
    };

    const message = createMessage(MessageType.SPRITE_SCALE, updateData, 2);
    this.protocol.sendMessage(message);
    console.log('[WasmBridge] Sent sprite scale:', spriteId, scaleX, scaleY);
  }

  private sendSpriteRotate(spriteId: string, rotation: number) {
    const updateData = {
      sprite_id: spriteId,
      rotation: rotation
    };

    const message = createMessage(MessageType.SPRITE_ROTATE, updateData, 2);
    this.protocol.sendMessage(message);
    console.log('[WasmBridge] Sent sprite rotate:', spriteId, rotation);
  }

  cleanup() {
    if (!this.isInitialized) return;

    window.removeEventListener('wasm-sprite-operation', this.handleWasmOperation);
    window.removeEventListener('wasm-network-request', this.handleNetworkRequest);
    window.removeEventListener('wasm-error', this.handleWasmError);

    this.isInitialized = false;
    console.log('[WasmBridge] Service cleaned up');
  }
}

// Create singleton instance
export const wasmBridgeService = new WasmBridgeService();

// React hook for easy integration
export function useWasmBridge() {
  const { protocol } = useProtocol();

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
