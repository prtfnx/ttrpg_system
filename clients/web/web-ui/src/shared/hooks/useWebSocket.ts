import { useProtocol } from '@lib/api';
import { useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '../../store';
import type { Sprite } from '../../types';
import type { WebSocketMessage } from '../../types/websocket';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  let protocol: any = null;
  try { protocol = useProtocol().protocol; } catch (e) { protocol = null; }
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  
  const { 
    setConnection, 
    moveSprite, 
    addSprite, 
    removeSprite, 
    updateSprite,
    updateConnectionState,
    sprites
  } = useGameStore();

  const createMessage = useCallback((type: string, data?: Record<string, unknown>): WebSocketMessage => ({
    type,
    data: data || {},
    timestamp: Date.now() / 1000,
    version: '0.1',
    priority: 5
  }), []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (protocol && protocol.isConnected && protocol.isConnected()) {
      protocol.sendMessage(message);
    } else if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      messageQueueRef.current.push(message);
    }
  }, []);

  const flushMessageQueue = useCallback(() => {
    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift()!;
      if (protocol && protocol.isConnected && protocol.isConnected()) {
        protocol.sendMessage(message);
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      } else {
        // cannot send, re-queue and break
        messageQueueRef.current.unshift(message);
        break;
      }
    }
  }, []);

  const handleMessage = useCallback((payload: any) => {
    try {
      const message: WebSocketMessage = typeof payload === 'string' ? JSON.parse(payload) : payload;
      switch (message.type) {
        case 'sprite_update':
          if (message.data && typeof message.data === 'object') {
            const data = message.data as { id: string; [key: string]: unknown };
            updateSprite(data.id, data);
          }
          break;
          
        case 'sprite_create':
          if (message.data && typeof message.data === 'object') {
            const data = message.data as Record<string, unknown>;
            console.log('[WebSocket] sprite_create received:', data);
            
            // Convert legacy width/height to scale if provided
            const scaleX = data.width ? (data.width as number) / 32 : (data.scale_x as number) || 1;
            const scaleY = data.height ? (data.height as number) / 32 : (data.scale_y as number) || 1;
            
            addSprite({
              id: (data.id as string) || '',
              tableId: (data.table_id as string) || useGameStore.getState().activeTableId || '',
              characterId: data.character_id as string | undefined,
              controlledBy: data.controlled_by as string[] | undefined,
              x: (data.x as number) || 0,
              y: (data.y as number) || 0,
              layer: (data.layer as string) || 'tokens',
              texture: (data.texture || data.imageUrl || data.texture_path) as string || '',
              scale: { x: scaleX, y: scaleY },
              rotation: (data.rotation as number) || 0,
              name: (data.name as string) || 'Unnamed Sprite',
            });
            // WASM integration: also add sprite to RenderManager if available
            // Ensure all required fields for WASM
            const layer: string = (message.data.layer as string) || 'tokens';
            const spriteForWasm = {
              id: message.data.id,
              world_x: message.data.x || 0,
              world_y: message.data.y || 0,
              width: message.data.width || 32,
              height: message.data.height || 32,
              scale_x: message.data.scale_x || 1.0,
              scale_y: message.data.scale_y || 1.0,
              rotation: message.data.rotation || 0.0,
              layer: layer,
              texture_id: message.data.texture_path || message.data.imageUrl || '',
              tint_color: [1.0, 1.0, 1.0, 1.0]
            };
            console.log('[WASM] add_sprite_to_layer payload:', spriteForWasm);
            if (window.rustRenderManager && typeof window.rustRenderManager.add_sprite_to_layer === 'function') {
              try {
                console.log('[WASM] Calling add_sprite_to_layer...');
                window.rustRenderManager.add_sprite_to_layer(layer, spriteForWasm);
                console.log('[WASM] add_sprite_to_layer call completed');
              } catch (err) {
                console.error('[WASM] Failed to add sprite to RenderManager:', err);
              }
            } else {
              console.warn('[WASM] RenderManager not available or add_sprite not a function');
            }
          }
          break;
          
        case 'sprite_remove':
          if (message.data && typeof message.data === 'object') {
            const data = message.data as { id: string };
            removeSprite(data.id);
          }
          break;
          
        case 'sprite_move':
          if (message.data && typeof message.data === 'object') {
            const data = message.data as { id: string; x: number; y: number };
            moveSprite(data.id, data.x, data.y);
          }
          break;
          
        case 'table_data':
          if (message.data && typeof message.data === 'object') {
            console.log('Received table data:', message.data);
            const data = message.data as { 
              table_id?: string;
              width?: number;
              height?: number;
              sprites?: Partial<Sprite>[];
              background_image?: string;
            };
            
            // Clear existing sprites first
            sprites.forEach((sprite: any) => removeSprite(sprite.id));
            
            // Load sprites and handle asset downloads
            if (data.sprites && Array.isArray(data.sprites)) {
              data.sprites.forEach(async (sprite: Partial<Sprite>) => {
                // Convert legacy width/height to scale if provided
                const spriteData = sprite as any; // Type assertion for legacy fields
                const scaleX = spriteData.width ? spriteData.width / 32 : sprite.scale?.x || 1;
                const scaleY = spriteData.height ? spriteData.height / 32 : sprite.scale?.y || 1;
                
                const newSprite: Sprite = {
                  id: sprite.id || '',
                  tableId: sprite.tableId || (data.table_id as string) || useGameStore.getState().activeTableId || '',
                  characterId: sprite.characterId,
                  controlledBy: sprite.controlledBy,
                  x: sprite.x || 0,
                  y: sprite.y || 0,
                  layer: sprite.layer || 'tokens',
                  texture: sprite.texture || spriteData.imageUrl || '',
                  scale: { x: scaleX, y: scaleY },
                  rotation: sprite.rotation || 0,
                  name: typeof sprite.name === 'string' ? sprite.name : 'Unnamed Sprite',
                };
                
                // Add sprite to store
                addSprite(newSprite);
                
                // Download asset if needed and not in cache
                const textureUrl = newSprite.texture;
                if (textureUrl && textureUrl !== '') {
                  try {
                    // Check if asset is already cached (simple check)
                    const img = new Image();
                    img.onload = () => {
                      console.log('Asset already available:', textureUrl);
                    };
                    img.onerror = () => {
                      console.log('Asset needs download:', textureUrl);
                      // Request asset download from server
                      const downloadMessage = createMessage('asset_download_request', {
                        asset_id: textureUrl,
                        sprite_id: sprite.id
                      });
                      sendMessage(downloadMessage);
                    };
                    img.src = textureUrl;
                  } catch (error) {
                    console.error('Error checking asset:', error);
                  }
                }
                
                // Add sprite to WASM if available
                if (window.rustRenderManager && typeof window.rustRenderManager.add_sprite_to_layer === 'function') {
                  try {
                    const layerName = newSprite.layer;
                    const spriteData = {
                      id: newSprite.id,
                      world_x: newSprite.x,
                      world_y: newSprite.y,
                      width: newSprite.scale.x * 32,
                      height: newSprite.scale.y * 32,
                      rotation: newSprite.rotation,
                      layer: layerName,
                      texture_id: newSprite.texture,
                      tint_color: [1, 1, 1, 1]
                    };
                    
                    window.rustRenderManager.add_sprite_to_layer(layerName, spriteData);
                    console.log('Added sprite to WASM layer:', layerName, spriteData);
                  } catch (error) {
                    console.error('Failed to add sprite to WASM:', error);
                  }
                }
              });
            }
            
            // Table dimensions can be handled through the canvas resize mechanism
            if (data.width && data.height && window.rustRenderManager) {
              try {
                console.log('Table dimensions:', data.width, 'x', data.height);
                // The resize method will handle table size adjustments
                window.rustRenderManager.resize(data.width, data.height);
              } catch (error) {
                console.error('Failed to set table size in WASM:', error);
              }
            }
            
            console.log('Table data processed successfully');
          }
          break;
          
        case 'welcome':
          if (message.data && typeof message.data === 'object') {
            const data = message.data as { session_id?: string };
            setConnection(true, data.session_id);
          }
          break;
          
        case 'pong':
          // Keep-alive response
          break;
          
        default:
          console.log('Unhandled message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [moveSprite, addSprite, removeSprite, updateSprite, setConnection]);

  const connect = useCallback(async () => {
    if (protocol && protocol.isConnected && protocol.isConnected()) return;

    updateConnectionState('connecting');

    if (protocol) {
      try {
        await protocol.connect();
        // register handler to receive protocol messages
        const protoHandler = (m: any) => handleMessage(m.data ?? m);
        protocol.registerHandler('generic', protoHandler);
        flushMessageQueue();
        updateConnectionState('connected');
        setConnection(true);
      } catch (err) {
        console.error('Protocol connect failed:', err);
        updateConnectionState('error');
        setConnection(false);
      }
      return;
    }

    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        updateConnectionState('connected');
        setConnection(true);
        flushMessageQueue();
        // Note: Ping interval controlled by user via Tools Panel, not auto-started
      };

      wsRef.current.onmessage = (e) => handleMessage(e.data);

      wsRef.current.onclose = (event) => {
        updateConnectionState('disconnected');
        setConnection(false);

        if (!event.wasClean) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, 3000) as unknown as number;
        }
      };

      wsRef.current.onerror = () => {
        updateConnectionState('error');
        setConnection(false);
      };

    } catch (error) {
      updateConnectionState('error');
      console.error('WebSocket connection failed:', error);
    }
  }, [url, updateConnectionState, setConnection, handleMessage, flushMessageQueue, sendMessage, createMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnecting');
      wsRef.current = null;
    }
    
    updateConnectionState('disconnected');
    setConnection(false);
  }, [updateConnectionState, setConnection]);

  const sendSpriteMove = useCallback((spriteId: string, x: number, y: number) => {
    sendMessage(createMessage('sprite_move', { id: spriteId, x, y }));
  }, [sendMessage, createMessage]);

  const requestTableData = useCallback(() => {
    sendMessage(createMessage('table_request'));
  }, [sendMessage, createMessage]);

  const sendSpriteCreate = useCallback((sprite: { name: string; x: number; y: number; width?: number; height?: number; imageUrl?: string; layer?: number }) => {
    sendMessage(createMessage('sprite_create', sprite));
  }, [sendMessage, createMessage]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    sendSpriteMove,
    sendSpriteCreate,
    requestTableData,
    sendMessage: (type: string, data?: Record<string, unknown>) =>
      sendMessage(createMessage(type, data))
  };
}
