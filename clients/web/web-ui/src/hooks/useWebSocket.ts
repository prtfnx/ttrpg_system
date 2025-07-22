import { useRef, useCallback, useEffect } from 'react';
import { useGameStore } from '../store';

interface WebSocketMessage {
  type: string;
  data?: Record<string, any>;
  client_id?: string;
  timestamp?: number;
  version?: string;
  priority?: number;
  sequence_id?: number;
}

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  
  const { 
    setConnection, 
    moveSprite, 
    addSprite, 
    removeSprite, 
    updateSprite,
    updateConnectionState 
  } = useGameStore();

  const createMessage = useCallback((type: string, data?: Record<string, any>): WebSocketMessage => ({
    type,
    data: data || {},
    timestamp: Date.now() / 1000,
    version: '0.1',
    priority: 5
  }), []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
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
      
      switch (message.type) {
        case 'sprite_update':
          if (message.data) {
            updateSprite(message.data.id, message.data);
          }
          break;
          
        case 'sprite_create':
          if (message.data) {
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
            message.data.sprites.forEach((sprite: any) => {
              addSprite({
                id: sprite.id,
                name: sprite.name || 'Sprite',
                x: sprite.x || 0,
                y: sprite.y || 0,
                width: sprite.width || 32,
                height: sprite.height || 32,
                imageUrl: sprite.imageUrl,
                isSelected: false,
                isVisible: true,
                layer: sprite.layer || 0
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
    sendMessage: (type: string, data?: Record<string, any>) => 
      sendMessage(createMessage(type, data))
  };
}
