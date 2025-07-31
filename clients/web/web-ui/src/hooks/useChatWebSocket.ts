import { useEffect } from 'react';
import { useChatStore } from '../store/chatStore';

export function useChatWebSocket(url: string, user: string) {
  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat' && data.message) {
          useChatStore.getState().addMessage(data.message);
        }
      } catch {}
    };
    return () => ws.close();
  }, [url, user]);

  const sendMessage = (text: string) => {
    const msg = {
      type: 'chat',
      message: {
        id: Math.random().toString(36).slice(2),
        user,
        text,
        timestamp: Date.now(),
      },
    };
    // Send to server
    const ws = new WebSocket(url);
    ws.onopen = () => ws.send(JSON.stringify(msg));
  };

  return { sendMessage };
}
