import { useOptionalProtocol } from '@lib/api';
import type { Message } from '@lib/websocket';
import { MessageType } from '@lib/websocket';
import React, { useEffect } from 'react';
import type { ChatMessage } from '../chatStore';
import { useChatStore } from '../chatStore';

export function useChatWebSocket(url: string, user: string) {
  const protocol = useOptionalProtocol()?.protocol ?? null;

  const wsRef = React.useRef<WebSocket | null>(null);

  // Mirror in-game roll results to the chat log
  useEffect(() => {
    const onRoll = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      const name = d.character_name || d.characterName || 'Unknown';
      const type = (d.roll_type || 'roll').replace(/_/g, ' ');
      const skill = d.skill || d.ability || '';
      const total = d.total ?? d.result ?? '?';
      const what = skill ? `${type}: ${skill}` : type;
      const breakdown = d.d20 != null
        ? ` (d20: ${d.d20}${d.modifier != null && d.modifier !== 0 ? (d.modifier > 0 ? '+' : '') + d.modifier : ''})`
        : '';
      useChatStore.getState().addMessage({
        id: Math.random().toString(36).slice(2),
        user: '🎲',
        text: `${name} — ${what} = ${total}${breakdown}`,
        timestamp: Date.now(),
      });
    };
    window.addEventListener('character-roll-result', onRoll);
    return () => window.removeEventListener('character-roll-result', onRoll);
  }, []);

  useEffect(() => {
    if (protocol) {
      // Register a handler for chat messages via protocol
      const handler = async (m: Message) => {
        if (m.type === MessageType.CHAT_MESSAGE && m.data?.message) {
          useChatStore.getState().addMessage(m.data.message as ChatMessage);
        }
      };
      protocol.registerHandler(MessageType.CHAT_MESSAGE, handler);
      return () => {
        try { protocol.unregisterHandler(MessageType.CHAT_MESSAGE); } catch {}
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
      protocol.sendMessage(msg as unknown as Message);
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      // queue or drop
    }
  };

  return { sendMessage };
}
