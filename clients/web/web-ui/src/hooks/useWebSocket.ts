import { useEffect, useCallback } from 'react';
import { useGameStore } from '../store';
import { getWebSocketService, MessageType, type Message } from '../services/websocket';

export const useWebSocket = (url: string) => {
  const { 
    updateConnectionState, 
    addSprite, 
    removeSprite, 
    updateSprite, 
    moveSprite 
  } = useGameStore();

  const wsService = getWebSocketService(url);

  const connect = useCallback(async () => {
    try {
      updateConnectionState('connecting');
      await wsService.connect();
      updateConnectionState('connected');
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      updateConnectionState('error');
    }
  }, [wsService, updateConnectionState]);

  const disconnect = useCallback(() => {
    wsService.disconnect();
    updateConnectionState('disconnected');
  }, [wsService, updateConnectionState]);

  // Message handlers
  useEffect(() => {
    const handleWelcome = (message: Message) => {
      if (message.data?.connected) {
        updateConnectionState('connected');
      }
    };

    const handlePlayerLeft = (message: Message) => {
      if (message.data?.disconnected) {
        updateConnectionState('disconnected');
      }
    };

    const handleSpriteCreate = (message: Message) => {
      if (message.data?.sprite) {
        const spriteData = message.data.sprite;
        addSprite({
          id: spriteData.id,
          name: spriteData.name || 'Unnamed',
          x: spriteData.x,
          y: spriteData.y,
          width: spriteData.width,
          height: spriteData.height,
          imageUrl: spriteData.texture_path,
          isSelected: false,
          isVisible: true,
          layer: spriteData.layer || 0
        });
      }
    };

    const handleSpriteUpdate = (message: Message) => {
      if (message.data?.sprite) {
        const spriteData = message.data.sprite;
        updateSprite(spriteData.id, {
          x: spriteData.x,
          y: spriteData.y,
          width: spriteData.width,
          height: spriteData.height,
          imageUrl: spriteData.texture_path
        });
      }
    };

    const handleSpriteMove = (message: Message) => {
      if (message.data?.sprite_id && message.data?.x !== undefined && message.data?.y !== undefined) {
        moveSprite(message.data.sprite_id, message.data.x, message.data.y);
      }
    };

    const handleSpriteRemove = (message: Message) => {
      if (message.data?.sprite_id) {
        removeSprite(message.data.sprite_id);
      }
    };

    const handleError = (message: Message) => {
      console.error('WebSocket error:', message.data);
      updateConnectionState('error');
    };

    // Register handlers
    wsService.on(MessageType.WELCOME, handleWelcome);
    wsService.on(MessageType.PLAYER_LEFT, handlePlayerLeft);
    wsService.on(MessageType.SPRITE_CREATE, handleSpriteCreate);
    wsService.on(MessageType.SPRITE_UPDATE, handleSpriteUpdate);
    wsService.on(MessageType.SPRITE_MOVE, handleSpriteMove);
    wsService.on(MessageType.SPRITE_REMOVE, handleSpriteRemove);
    wsService.on(MessageType.ERROR, handleError);

    return () => {
      // Cleanup handlers
      wsService.off(MessageType.WELCOME, handleWelcome);
      wsService.off(MessageType.PLAYER_LEFT, handlePlayerLeft);
      wsService.off(MessageType.SPRITE_CREATE, handleSpriteCreate);
      wsService.off(MessageType.SPRITE_UPDATE, handleSpriteUpdate);
      wsService.off(MessageType.SPRITE_MOVE, handleSpriteMove);
      wsService.off(MessageType.SPRITE_REMOVE, handleSpriteRemove);
      wsService.off(MessageType.ERROR, handleError);
    };
  }, [wsService, updateConnectionState, addSprite, removeSprite, updateSprite, moveSprite]);

  // WebSocket API functions
  const sendSpriteMove = useCallback((spriteId: string, x: number, y: number) => {
    wsService.send(MessageType.SPRITE_MOVE, {
      sprite_id: spriteId,
      x,
      y
    });
  }, [wsService]);

  const sendSpriteCreate = useCallback((sprite: any) => {
    wsService.send(MessageType.SPRITE_CREATE, {
      sprite: {
        id: sprite.id,
        name: sprite.name,
        x: sprite.x,
        y: sprite.y,
        width: sprite.width,
        height: sprite.height,
        texture_path: sprite.imageUrl,
        layer: sprite.layer
      }
    });
  }, [wsService]);

  const sendSpriteRemove = useCallback((spriteId: string) => {
    wsService.send(MessageType.SPRITE_REMOVE, {
      sprite_id: spriteId
    });
  }, [wsService]);

  const requestTableData = useCallback((tableId?: string) => {
    wsService.send(MessageType.TABLE_REQUEST, {
      table_id: tableId || 'default'
    });
  }, [wsService]);

  return {
    connect,
    disconnect,
    isConnected: wsService.isConnected,
    sendSpriteMove,
    sendSpriteCreate,
    sendSpriteRemove,
    requestTableData
  };
};
