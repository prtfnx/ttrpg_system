import React, { useEffect } from 'react';
import { useChatStore } from '../store/chatStore';

export function useChatWebSocket(url: string, user: string) {
  const wsRef = React.useRef<WebSocket | null>(null);

  useEffect(() => {
    wsRef.current = new WebSocket(url);
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat' && data.message) {
          useChatStore.getState().addMessage(data.message);
        }
      } catch {
        // Ignore JSON parsing errors
      }
    };
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url, user]);

  // Input validation for chat messages
  const validateMessage = (text: string): string | null => {
    if (!text || typeof text !== 'string' || text.length < 1) return 'Message cannot be empty.';
    if (text.length > 500) return 'Message too long.';
    return null;
  };

  // Optimistic UI: add message locally before server confirmation
  const sendMessage = (text: string) => {
    const validationError = validateMessage(text);
    if (validationError) {
      // Optionally show error in UI
      return;
    }
    const msg = {
      type: 'chat',
      message: {
        id: Math.random().toString(36).slice(2),
        user,
        text,
        timestamp: Date.now(),
      },
    };
    useChatStore.getState().addMessage(msg.message); // Optimistic add
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      // Optionally queue message for later send
    }
  };

  return { sendMessage };
}
