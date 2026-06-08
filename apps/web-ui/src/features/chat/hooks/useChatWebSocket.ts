import { useOptionalProtocol } from '@lib/api';
import { createMessage } from '@lib/websocket';
import type { Message } from '@lib/websocket';
import { MessageType } from '@lib/websocket';
import React, { useEffect } from 'react';
import type { ChatMessage } from '../chatStore';
import { useChatStore } from '../chatStore';

const DEFAULT_HISTORY_COUNT = 30;

export function useChatWebSocket(url: string, user: string) {
  const protocol = useOptionalProtocol()?.protocol ?? null;

  const wsRef = React.useRef<WebSocket | null>(null);

  const sendHistoryRequest = React.useCallback((count: number | 'all' = DEFAULT_HISTORY_COUNT) => {
    const data = count === 'all' ? { all: true } : { count };
    const request = createMessage(MessageType.CHAT_REQUEST, data);
    if (protocol && protocol.isConnected()) {
      protocol.sendMessage(request);
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(request));
    }
  }, [protocol]);

  // Mirror in-game roll results to the chat log
  useEffect(() => {
    const onRoll = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      const name = d.character_name || d.characterName || 'Unknown';
      const type = (d.roll_type || 'roll').replace(/_/g, ' ');
      const skill = d.skill || d.ability || '';
      const total = d.total ?? d.result ?? '?';
      const what = skill ? `${type}: ${skill}` : type;
      const dieRoll = d.die_roll ?? d.d20;
      const modifier = d.modifier ?? 0;
      const sign = modifier >= 0 ? '+' : '';
      const breakdown = dieRoll != null
        ? ` (d20: ${dieRoll}${modifier !== 0 ? `${sign}${modifier}` : ''})`
        : '';
      const advStr = d.advantage ? ' [ADV]' : d.disadvantage ? ' [DIS]' : '';
      const tooltip = dieRoll != null
        ? `d20 = ${dieRoll}\nModifier: ${sign}${modifier}\nTotal: ${total}${advStr}${d.description ? '\n' + d.description : ''}`
        : undefined;
      useChatStore.getState().addMessage({
        id: Math.random().toString(36).slice(2),
        user: '🎲',
        text: `${name} — ${what} = ${total}${breakdown}${advStr}`,
        timestamp: Date.now(),
        tooltip,
      });
    };
    const onRollError = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      const msg = d.error || d.message || 'Roll failed — no response from server.';
      useChatStore.getState().addMessage({
        id: Math.random().toString(36).slice(2),
        user: '⚠',
        text: `Server error: ${msg}`,
        timestamp: Date.now(),
      });
    };

    window.addEventListener('character-roll-result', onRoll);
    window.addEventListener('protocol-error', onRollError);
    return () => {
      window.removeEventListener('character-roll-result', onRoll);
      window.removeEventListener('protocol-error', onRollError);
    };
  }, []);

  useEffect(() => {
    if (protocol) {
      // Register a handler for chat messages via protocol
      const handler = async (m: Message) => {
        if (m.type === MessageType.CHAT_MESSAGE && Array.isArray(m.data?.messages)) {
          useChatStore.getState().setMessages(m.data.messages as ChatMessage[]);
          return;
        }
        if (m.type === MessageType.CHAT_MESSAGE && m.data?.message) {
          useChatStore.getState().addMessage(m.data.message as ChatMessage);
        }
      };
      protocol.registerHandler(MessageType.CHAT_MESSAGE, handler);
      if (protocol.isConnected()) {
        sendHistoryRequest(DEFAULT_HISTORY_COUNT);
      }
      return () => {
        try { protocol.unregisterHandler(MessageType.CHAT_MESSAGE); } catch {}
      };
    }

    // Fallback to raw WebSocket
    wsRef.current = new WebSocket(url);
    wsRef.current.onopen = () => {
      sendHistoryRequest(DEFAULT_HISTORY_COUNT);
    };
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat' && data.data?.message) {
          useChatStore.getState().addMessage(data.data.message);
        } else if (data.type === 'chat' && data.message) {
          useChatStore.getState().addMessage(data.message);
        } else if (data.type === 'chat' && Array.isArray(data.data?.messages)) {
          useChatStore.getState().setMessages(data.data.messages);
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

  const loadAllMessages = () => {
    sendHistoryRequest('all');
  };

  const loadRecentMessages = (count: number = DEFAULT_HISTORY_COUNT) => {
    sendHistoryRequest(count);
  };

  return { sendMessage, loadAllMessages, loadRecentMessages };
}
