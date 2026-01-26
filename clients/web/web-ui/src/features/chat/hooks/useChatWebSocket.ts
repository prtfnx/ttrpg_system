import { useProtocol } from '@lib/api';
import React, { useEffect } from 'react';
import { useChatStore } from '../chatStore';

export function useChatWebSocket(url: string, user: string) {
  // Try to use centralized protocol if available
  let protocol = null;
  try {
    protocol = useProtocol().protocol;
  } catch (e) {
    // Not inside ProtocolProvider, fall back to local websocket
  }

  const wsRef = React.useRef<WebSocket | null>(null);

  useEffect(() => {
    if (protocol) {
      // Register a handler for chat messages via protocol
      const handler = async (m: any) => {
        if (m.type === 'chat' && m.data?.message) {
          useChatStore.getState().addMessage(m.data.message);
        }
      };
      protocol.registerHandler('chat', handler);
      return () => {
        try { protocol.unregisterHandler('chat'); } catch {}
      };
    }

    // Fallback to raw WebSocket
    wsRef.current = new WebSocket(url);
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat' && data.message) {
          useChatStore.getState().addMessage(data.message);
        }
      } catch {
        // Ignore
      }
    };
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url, user, protocol]);

  const validateMessage = (text: string): string | null => {
    if (!text || typeof text !== 'string' || text.length < 1) return 'Message cannot be empty.';
    if (text.length > 500) return 'Message too long.';
    return null;
  };

  const sendMessage = (text: string) => {
    const validationError = validateMessage(text);
    if (validationError) return;
    const msg = {
      type: 'chat',
      data: { message: { id: Math.random().toString(36).slice(2), user, text, timestamp: Date.now() } }
    };
    useChatStore.getState().addMessage(msg.data.message);
    if (protocol && protocol.isConnected()) {
      protocol.sendMessage(msg as any);
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      // queue or drop
    }
  };

  return { sendMessage };
}
