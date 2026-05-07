import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore';
import type { ChatMessage } from '../chatStore';

const makeMsg = (overrides?: Partial<ChatMessage>): ChatMessage => ({
  id: '1',
  user: 'Alice',
  text: 'Hello',
  timestamp: 1000,
  ...overrides,
});

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.getState().clearMessages();
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
});
