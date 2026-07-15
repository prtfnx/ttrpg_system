import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '../chatStore';
import { useChatStore } from '../chatStore';

const makeMsg = (overrides?: Partial<ChatMessage>): ChatMessage => ({
  id: '1',
  user: 'Alice',
  text: 'Hello',
  timestamp: 1000,
  ...overrides,
});

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.setState({ activeSessionId: null, messages: [], messagesBySession: {} });
    useChatStore.getState().setActiveSession('session-a');
  });

  it('starts with no messages', () => {
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it('addMessage appends to the list', () => {
    useChatStore.getState().addMessage(makeMsg({ id: '1', text: 'Hi' }));
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0].text).toBe('Hi');
  });

  it('addMessage preserves existing messages', () => {
    useChatStore.getState().addMessage(makeMsg({ id: '1' }));
    useChatStore.getState().addMessage(makeMsg({ id: '2', text: 'Second' }));
    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it('setMessages replaces all messages', () => {
    useChatStore.getState().addMessage(makeMsg({ id: '1' }));
    useChatStore.getState().setMessages([makeMsg({ id: '99', text: 'Only' })]);
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('99');
  });

  it('clearMessages empties the list', () => {
    useChatStore.getState().addMessage(makeMsg());
    useChatStore.getState().clearMessages();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it('setMessages with empty array clears messages', () => {
    useChatStore.getState().addMessage(makeMsg());
    useChatStore.getState().setMessages([]);
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it('keeps messages isolated when the active session changes', () => {
    useChatStore.getState().addMessage(makeMsg({ id: 'a', text: 'Session A' }));
    useChatStore.getState().setActiveSession('session-b');
    expect(useChatStore.getState().messages).toEqual([]);

    useChatStore.getState().addMessage(makeMsg({ id: 'b', text: 'Session B' }));
    useChatStore.getState().setActiveSession('session-a');
    expect(useChatStore.getState().messages.map((message) => message.id)).toEqual(['a']);
  });

  it('replaces an optimistic message with the persisted confirmation', () => {
    useChatStore.getState().addMessage(makeMsg({
      id: 'operation-1',
      client_operation_id: 'operation-1',
      deliveryStatus: 'pending',
    }));

    useChatStore.getState().confirmMessage('operation-1', makeMsg({
      id: 'server-1',
      client_operation_id: 'operation-1',
    }));

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ id: 'server-1', deliveryStatus: 'sent' }),
    ]);
  });
});
