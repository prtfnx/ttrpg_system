import { useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '../store';
import type { Sprite } from '../types';
import type { WebSocketMessage } from '../types/websocket';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  
  const { 
    setConnection, 
    moveSprite, 
    addSprite, 
    removeSprite, 
    updateSprite,
    updateConnectionState 
  } = useGameStore();

  const createMessage = useCallback((type: string, data?: Record<string, unknown>): WebSocketMessage => ({
    type,
    data: data || {},
    timestamp: Date.now() / 1000,
    version: '0.1',
    priority: 5
  }), []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    console.log('[WebSocket] sendMessage called:', message);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Sending message over socket:', message);
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.log('[WebSocket] Socket not open, queueing message:', message);
      messageQueueRef.current.push(message);
    }
  }, []);

  const flushMessageQueue = useCallback(() => {
    while (messageQueueRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      const message = messageQueueRef.current.shift()!;
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      console.log('[WebSocket] handleMessage received:', message);
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
            addSprite({
              id: (data.id as string) || '',
              name: (data.name as string) || 'Sprite',
              x: (data.x as number) || 0,
              y: (data.y as number) || 0,
              width: (data.width as number) || 32,
              height: (data.height as number) || 32,
              imageUrl: data.imageUrl as string | undefined,
              isSelected: false,
              isVisible: true,
              layer: (data.layer as string) || 'tokens'
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
            const data = message.data as { sprites?: Partial<Sprite>[] };
            if (data.sprites && Array.isArray(data.sprites)) {
              data.sprites.forEach((sprite: Partial<Sprite>) => {
                addSprite({
                  id: sprite.id || '',
                  name: sprite.name || 'Sprite',
                  x: sprite.x || 0,
                  y: sprite.y || 0,
                  width: sprite.width || 32,
                  height: sprite.height || 32,
                  imageUrl: sprite.imageUrl,
                  isSelected: false,
                  isVisible: sprite.isVisible ?? true,
                  layer: sprite.layer || 'tokens',
                });
              });
            }
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
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    updateConnectionState('connecting');
    
    try {
      wsRef.current = new WebSocket(url);
      
      wsRef.current.onopen = () => {
        updateConnectionState('connected');
        setConnection(true);
        flushMessageQueue();
        
        // Send ping every 30 seconds
        const pingInterval = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            sendMessage(createMessage('ping'));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      };
      
      wsRef.current.onmessage = handleMessage;
      
      wsRef.current.onclose = (event) => {
        updateConnectionState('disconnected');
        setConnection(false);
        
        // Auto-reconnect unless it was intentional
        if (!event.wasClean) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
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
