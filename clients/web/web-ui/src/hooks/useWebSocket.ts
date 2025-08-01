import { useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '../store';
import type { Sprite } from '../types';

interface WebSocketMessage {
  type: string;
  data?: Record<string, any>; // TODO: Define specific message types
  client_id?: string;
  timestamp?: number;
  version?: string;
  priority?: number;
  sequence_id?: number;
}

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

  const createMessage = useCallback((type: string, data?: Record<string, any>): WebSocketMessage => ({ // TODO: Define specific data types
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
          if (message.data) {
            updateSprite(message.data.id, message.data);
          }
          break;
          
        case 'sprite_create':
          if (message.data) {
            console.log('[WebSocket] sprite_create received:', message.data);
            addSprite({
              id: message.data.id,
              name: message.data.name || 'Sprite',
              x: message.data.x || 0,
              y: message.data.y || 0,
              width: message.data.width || 32,
              height: message.data.height || 32,
              imageUrl: message.data.imageUrl,
              isSelected: false,
              isVisible: true,
              layer: message.data.layer || 0
            });
            // WASM integration: also add sprite to RenderManager if available
            // Ensure all required fields for WASM
            const spriteForWasm = {
              id: message.data.id,
              x: message.data.x || 0,
              y: message.data.y || 0,
              width: message.data.width || 32,
              height: message.data.height || 32,
              layer: message.data.layer || 'tokens',
              texture_path: message.data.texture_path || message.data.imageUrl || '',
              color: message.data.color || '#ffffff',
              scale_x: message.data.scale_x || 1.0,
              scale_y: message.data.scale_y || 1.0,
              rotation: message.data.rotation || 0.0,
              name: message.data.name || 'Sprite',
              isSelected: false,
              isVisible: true
            };
            console.log('[WASM] add_sprite payload:', spriteForWasm);
            if (window.rustRenderManager && typeof window.rustRenderManager.add_sprite === 'function') {
              try {
                console.log('[WASM] Calling add_sprite...');
                window.rustRenderManager.add_sprite(spriteForWasm);
                console.log('[WASM] add_sprite call completed');
              } catch (err) {
                console.error('[WASM] Failed to add sprite to RenderManager:', err);
              }
            } else {
              console.warn('[WASM] RenderManager not available or add_sprite not a function');
            }
          }
          break;
          
        case 'sprite_remove':
          if (message.data?.id) {
            removeSprite(message.data.id);
          }
          break;
          
        case 'sprite_move':
          if (message.data) {
            moveSprite(message.data.id, message.data.x, message.data.y);
          }
          break;
          
        case 'table_data':
          if (message.data?.sprites) {
            message.data.sprites.forEach((sprite: Partial<Sprite>) => {
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
                layer: sprite.layer || 0,
              });
            });
          }
          break;
          
        case 'welcome':
          setConnection(true, message.data?.session_id);
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
    sendMessage: (type: string, data?: Record<string, any>) => // TODO: Define specific data types 
      sendMessage(createMessage(type, data))
  };
}
