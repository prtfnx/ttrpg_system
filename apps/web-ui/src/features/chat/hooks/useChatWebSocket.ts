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
  errorHandler: MessageHandler;
  moderationHandler: MessageHandler;
  unsubscribeConnection?: () => void;
}

const protocolBindings = new WeakMap<WebClientProtocol, ChatBinding>();

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

  const messageHandler: MessageHandler = (message: Message) => {
    if (Array.isArray(message.data?.messages)) {
      mergeMessages(message.data.messages as ChatMessage[]);
    } else if (message.data?.message) {
      useChatStore.getState().addMessage({
        ...(message.data.message as ChatMessage),
        deliveryStatus: 'sent',
      });
    }
  };
  const confirmationHandler: MessageHandler = (message: Message) => {
    const operationId = message.data?.client_operation_id;
    const persisted = message.data?.chat_message;
    if (typeof operationId === 'string' && persisted) {
      useChatStore.getState().confirmMessage(operationId, persisted as ChatMessage);
    }
  };
  const moderationHandler: MessageHandler = (message: Message) => {
    const moderated = message.data?.message;
    if (moderated) {
      useChatStore.getState().addMessage({
        ...(moderated as ChatMessage),
        deliveryStatus: 'sent',
      });
    }
  };
  const errorHandler: MessageHandler = (message: Message) => {
    const operationId = message.correlation_id;
    if (!operationId) return;
    const pending = useChatStore.getState().messages.some(candidate => (
      candidate.client_operation_id === operationId && candidate.deliveryStatus === 'pending'
    ));
    if (pending) useChatStore.getState().failMessage(operationId);
  };

  protocol.registerHandler(MessageType.CHAT, messageHandler);
  protocol.registerHandler(MessageType.CHAT_CONFIRMATION, confirmationHandler);
  protocol.registerHandler(MessageType.CHAT_MODERATION, moderationHandler);
  protocol.registerHandler(MessageType.ERROR, errorHandler);
  if (protocol.isConnected()) requestHistory(protocol);
  const unsubscribeConnection = protocol.onConnectionStateChange?.((state) => {
    if (state === 'connected') requestHistory(protocol);
  });
  protocolBindings.set(protocol, {
    references: 1,
    messageHandler,
    confirmationHandler,
    errorHandler,
    moderationHandler,
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
  protocol.unregisterHandler(MessageType.CHAT, binding.messageHandler);
  protocol.unregisterHandler(MessageType.CHAT_CONFIRMATION, binding.confirmationHandler);
  protocol.unregisterHandler(MessageType.CHAT_MODERATION, binding.moderationHandler);
  protocol.unregisterHandler(MessageType.ERROR, binding.errorHandler);
  protocolBindings.delete(protocol);
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

  useEffect(() => protocol ? attachProtocol(protocol) : undefined, [protocol]);

  const sendOperation = useCallback((text: string, operationId: string, optimistic = true) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 500) return false;
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
      const message = createMessage(
        MessageType.CHAT,
        {
          message: {
            id: operationId,
            client_operation_id: operationId,
            user,
            text: trimmed,
            timestamp: Date.now(),
          },
        },
      );
      message.message_id = operationId;
      protocol.sendMessage(message);
    } else {
      useChatStore.getState().failMessage(operationId);
    }
    return true;
  }, [protocol, user]);

  const sendMessage = useCallback((text: string) => {
    const operationId = newOperationId();
    return sendOperation(text, operationId) ? operationId : null;
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

  const moderateMessage = useCallback((
    messageId: string,
    action: 'redact' | 'delete',
    reason?: string,
  ) => {
    if (!protocol?.isConnected()) return;
    protocol.sendMessage(createMessage(MessageType.CHAT_MODERATE, {
      message_id: messageId,
      action,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    }));
  }, [protocol]);

  return {
    sendMessage,
    retryMessage,
    moderateMessage,
    loadOlderMessages,
    loadAllMessages: loadOlderMessages,
    loadRecentMessages: (count = DEFAULT_HISTORY_COUNT) => {
      if (protocol?.isConnected()) requestHistory(protocol, count);
    },
  };
}
