/**
 * Sprite Creation Service
 * Handles the sprite creation flow after asset upload
 */

import { createMessage, MessageType } from '../protocol/message';
import type { WebClientProtocol } from '../protocol/clientProtocol';
import { useGameStore } from '../store';

export interface SpriteCreationRequest {
  assetId: string;
  fileName: string;
  worldX: number;
  worldY: number;
  sessionId: string;
}

export interface SpriteData {
  sprite_id: string;
  asset_id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  layer: string;
  color: string;
  visible: boolean;
}

class SpriteCreationService {
  private protocol: WebClientProtocol | null = null;

  setProtocol(protocol: WebClientProtocol): void {
    this.protocol = protocol;
  }

  /**
   * Create a sprite on the server after successful asset upload
   */
  async createSprite(request: SpriteCreationRequest): Promise<void> {
    if (!this.protocol) {
      throw new Error('Protocol not initialized');
    }

    console.log('🎭 SpriteCreation: Creating sprite for asset:', request.assetId);

    // Generate a unique sprite ID
    const spriteId = crypto.randomUUID();
    
    // Extract name from filename (remove extension)
    const name = request.fileName.split('.')[0];

    const spriteData: SpriteData = {
      sprite_id: spriteId,
      asset_id: request.assetId,
      name: name,
      x: request.worldX,
      y: request.worldY,
      width: 64,
      height: 64,
      scale_x: 1.0,
      scale_y: 1.0,
      rotation: 0,
      layer: 'tokens',
      color: '#FFFFFF',
      visible: true
    };
    
    console.log('📡 SpriteCreation: Requesting server to create sprite:', spriteData);
    
    // Get the actual table ID from the game store
    const activeTableId = useGameStore.getState().activeTableId;
    if (!activeTableId) {
      console.error('[SpriteCreation] No active table ID available for sprite creation');
      return;
    }

    this.protocol.sendMessage(createMessage(MessageType.SPRITE_CREATE, { 
      sprite_data: spriteData, 
      table_id: activeTableId 
    }, 2));
  }
}

// Export singleton instance
export const spriteCreationService = new SpriteCreationService();
