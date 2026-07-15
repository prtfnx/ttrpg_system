import { useOptionalProtocol } from '@lib/api';
import type { Message, MessageHandler, WebClientProtocol } from '@lib/websocket';
import { createMessage, MessageType } from '@lib/websocket';
import { useCallback, useEffect } from 'react';
import type { ChatMessage } from '../chatStore';
import { useChatStore } from '../chatStore';

const DEFAULT_HISTORY_COUNT = 30;
const MAX_HISTORY_PAGE = 100;

interface ChatBinding {
  references: number;
  messageHandler: MessageHandler;
  confirmationHandler: MessageHandler;
  unsubscribeConnection?: () => void;
}

const protocolBindings = new WeakMap<WebClientProtocol, ChatBinding>();
let rollSubscribers = 0;

function mergeMessages(messages: ChatMessage[]) {
  const current = useChatStore.getState().messages;
  const byId = new Map<string, ChatMessage>();

  for (const message of [...current, ...messages]) {
    byId.set(message.id, { ...message, deliveryStatus: message.deliveryStatus ?? 'sent' });
  }

  useChatStore.getState().setMessages(
    Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp)
  );
}

function requestHistory(protocol: WebClientProtocol, count = DEFAULT_HISTORY_COUNT, beforeId?: number) {
  protocol.sendMessage(createMessage(MessageType.CHAT_REQUEST, {
    count: Math.max(1, Math.min(count, MAX_HISTORY_PAGE)),
    ...(beforeId != null ? { before_id: beforeId } : {}),
  }));
}

function attachProtocol(protocol: WebClientProtocol): () => void {
  const existing = protocolBindings.get(protocol);
  if (existing) {
    existing.references += 1;
    return () => detachProtocol(protocol);
  }

  const messageHandler: MessageHandler = async (message: Message) => {
    if (Array.isArray(message.data?.messages)) {
      mergeMessages(message.data.messages as ChatMessage[]);
    } else if (message.data?.message) {
      useChatStore.getState().addMessage({
        ...(message.data.message as ChatMessage),
        deliveryStatus: 'sent',
      });
    }
  };
  const confirmationHandler: MessageHandler = async (message: Message) => {
    const operationId = message.data?.client_operation_id;
    const persisted = message.data?.chat_message;
    if (typeof operationId === 'string' && persisted) {
      useChatStore.getState().confirmMessage(operationId, persisted as ChatMessage);
    }
  };

  protocol.registerHandler(MessageType.CHAT_MESSAGE, messageHandler);
  protocol.registerHandler(MessageType.CHAT_CONFIRMATION, confirmationHandler);
  if (protocol.isConnected()) requestHistory(protocol);
  const unsubscribeConnection = protocol.onConnectionStateChange?.((state) => {
    if (state === 'connected') requestHistory(protocol);
  });
  protocolBindings.set(protocol, {
    references: 1,
    messageHandler,
    confirmationHandler,
    unsubscribeConnection,
  });
  return () => detachProtocol(protocol);
}

function detachProtocol(protocol: WebClientProtocol) {
  const binding = protocolBindings.get(protocol);
  if (!binding) return;
  binding.references -= 1;
  if (binding.references > 0) return;
  binding.unsubscribeConnection?.();
  protocol.unregisterHandler(MessageType.CHAT_MESSAGE, binding.messageHandler);
  protocol.unregisterHandler(MessageType.CHAT_CONFIRMATION, binding.confirmationHandler);
  protocolBindings.delete(protocol);
}

function addRollMessage(event: Event) {
  const data = (event as CustomEvent).detail ?? {};
  const name = data.character_name || data.characterName || 'Unknown';
  const type = (data.roll_type || 'roll').replace(/_/g, ' ');
  const skill = data.skill || data.ability || '';
  const total = data.total ?? data.result ?? '?';
  const what = skill ? `${type}: ${skill}` : type;
  const dieRoll = data.die_roll ?? data.d20;
  const modifier = data.modifier ?? 0;
  const sign = modifier >= 0 ? '+' : '';
  const breakdown = dieRoll != null
    ? ` (d20: ${dieRoll}${modifier !== 0 ? `${sign}${modifier}` : ''})`
    : '';
  const advantage = data.advantage ? ' [ADV]' : data.disadvantage ? ' [DIS]' : '';
  useChatStore.getState().addMessage({
    id: crypto.randomUUID(),
    user: '🎲',
    text: `${name} — ${what} = ${total}${breakdown}${advantage}`,
    timestamp: Date.now(),
    deliveryStatus: 'sent',
  });
}

function addRollError(event: Event) {
  const data = (event as CustomEvent).detail ?? {};
  useChatStore.getState().addMessage({
    id: crypto.randomUUID(),
    user: '⚠',
    text: `Server error: ${data.error || data.message || 'Roll failed — no response from server.'}`,
    timestamp: Date.now(),
    deliveryStatus: 'sent',
  });
}

function attachRollEvents(): () => void {
  rollSubscribers += 1;
  if (rollSubscribers === 1) {
    window.addEventListener('character-roll-result', addRollMessage);
    window.addEventListener('protocol-error', addRollError);
  }
  return () => {
    rollSubscribers -= 1;
    if (rollSubscribers === 0) {
      window.removeEventListener('character-roll-result', addRollMessage);
      window.removeEventListener('protocol-error', addRollError);
    }
  };
}

function newOperationId(): string {
  return crypto.randomUUID();
}

export function useChatWebSocket(_url: string, user: string) {
  const protocol = useOptionalProtocol()?.protocol ?? null;
  const sessionId = protocol?.getSessionCode() ?? `detached:${_url}`;

  useEffect(() => {
    useChatStore.getState().setActiveSession(sessionId);
  }, [sessionId]);

  useEffect(() => attachRollEvents(), []);
  useEffect(() => protocol ? attachProtocol(protocol) : undefined, [protocol]);

  const sendOperation = useCallback((text: string, operationId: string, optimistic = true) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 500) return;
    if (optimistic) {
      useChatStore.getState().addMessage({
        id: operationId,
        client_operation_id: operationId,
        user,
        text: trimmed,
        timestamp: Date.now(),
        deliveryStatus: 'pending',
      });
    }

    if (protocol?.isConnected()) {
      protocol.sendMessage(createMessage(
        MessageType.CHAT_MESSAGE,
        {
          message: {
            id: operationId,
            client_operation_id: operationId,
            user,
            text: trimmed,
            timestamp: Date.now(),
          },
        },
      ));
    } else {
      useChatStore.getState().failMessage(operationId);
    }
  }, [protocol, user]);

  const sendMessage = useCallback((text: string) => {
    sendOperation(text, newOperationId());
  }, [sendOperation]);

  const retryMessage = useCallback((clientOperationId: string) => {
    const message = useChatStore.getState().messages.find(
      (candidate) => candidate.client_operation_id === clientOperationId
    );
    if (!message || message.deliveryStatus !== 'failed') return;
    useChatStore.getState().retryMessage(clientOperationId);
    sendOperation(message.text, clientOperationId, false);
  }, [sendOperation]);

  const loadOlderMessages = useCallback(() => {
    if (!protocol?.isConnected()) return;
    const cursors = useChatStore.getState().messages
      .map((message) => message.server_cursor)
      .filter((cursor): cursor is number => typeof cursor === 'number');
    requestHistory(protocol, MAX_HISTORY_PAGE, cursors.length ? Math.min(...cursors) : undefined);
  }, [protocol]);

  return {
    sendMessage,
    retryMessage,
    loadOlderMessages,
    loadAllMessages: loadOlderMessages,
    loadRecentMessages: (count = DEFAULT_HISTORY_COUNT) => {
      if (protocol?.isConnected()) requestHistory(protocol, count);
    },
  };
}
