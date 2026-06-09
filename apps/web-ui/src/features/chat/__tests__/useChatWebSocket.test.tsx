import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '../chatStore';
import { useChatWebSocket } from '../hooks/useChatWebSocket';
import { MessageType } from '@lib/websocket';

// Minimal protocol mock — no real WebSocket needed
const makeProtocol = (connected = false) => ({
  registerHandler: vi.fn(),
  unregisterHandler: vi.fn(),
  onConnectionStateChange: vi.fn(),
  isConnected: vi.fn().mockReturnValue(connected),
  sendMessage: vi.fn(),
});

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn().mockReturnValue(null),
}));

// Prevent jsdom WebSocket from making real connections
class MockWebSocket {
  readyState = 1; // OPEN
  onmessage: ((e: MessageEvent) => void) | null = null;
  close = vi.fn();
  send = vi.fn();
  url: string;
  constructor(url: string) { this.url = url; }
}
vi.stubGlobal('WebSocket', MockWebSocket);

import { useOptionalProtocol } from '@lib/api';

describe('useChatWebSocket', () => {
  beforeEach(() => {
    useChatStore.getState().clearMessages();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendMessage validation', () => {
    it('does not add a message when text is empty', () => {
      const { result } = renderHook(() => useChatWebSocket('ws://test', 'Alice'));
      act(() => { result.current.sendMessage(''); });
      expect(useChatStore.getState().messages).toHaveLength(0);
    });

    it('does not add a message when text exceeds 500 chars', () => {
      const { result } = renderHook(() => useChatWebSocket('ws://test', 'Alice'));
      act(() => { result.current.sendMessage('x'.repeat(501)); });
      expect(useChatStore.getState().messages).toHaveLength(0);
    });

    it('adds message to store for valid text (no protocol, no open ws)', () => {
      const { result } = renderHook(() => useChatWebSocket('ws://test', 'Alice'));
      act(() => { result.current.sendMessage('Hello!'); });
      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('Hello!');
      expect(msgs[0].user).toBe('Alice');
    });

    it('sends via protocol when connected', () => {
      const protocol = makeProtocol(true);
      vi.mocked(useOptionalProtocol).mockReturnValue({ protocol } as unknown as ReturnType<typeof useOptionalProtocol>);
      const { result } = renderHook(() => useChatWebSocket('ws://test', 'Bob'));
      expect(protocol.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: MessageType.CHAT_REQUEST,
        data: { count: 30 },
      }));
      act(() => { result.current.sendMessage('Hey'); });
      expect(protocol.sendMessage).toHaveBeenCalledTimes(2);
      expect(protocol.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
        type: MessageType.CHAT_MESSAGE,
        data: expect.objectContaining({
          message: expect.objectContaining({ user: 'Bob', text: 'Hey' }),
        }),
      }));
      expect(useChatStore.getState().messages[0].text).toBe('Hey');
    });

    it('loads chat history from protocol messages', () => {
      const protocol = makeProtocol(true);
      vi.mocked(useOptionalProtocol).mockReturnValue({ protocol } as unknown as ReturnType<typeof useOptionalProtocol>);
      renderHook(() => useChatWebSocket('ws://test', 'Bob'));
      const handler = protocol.registerHandler.mock.calls[0][1];

      act(() => {
        handler({
          type: MessageType.CHAT_MESSAGE,
          data: {
            messages: [
              { id: '1', user: 'Alice', text: 'Old message', timestamp: 1 },
              { id: '2', user: 'Bob', text: 'Recent message', timestamp: 2 },
            ],
          },
          version: '0.1',
          priority: 5,
        });
      });

      expect(useChatStore.getState().messages.map((m) => m.text)).toEqual([
        'Old message',
        'Recent message',
      ]);
    });

    it('requests chat history when protocol connects after mount', () => {
      const unsubscribe = vi.fn();
      const protocol = makeProtocol(false);
      protocol.onConnectionStateChange.mockReturnValue(unsubscribe);
      vi.mocked(useOptionalProtocol).mockReturnValue({ protocol } as unknown as ReturnType<typeof useOptionalProtocol>);

      const { unmount } = renderHook(() => useChatWebSocket('ws://test', 'Bob'));

      expect(protocol.sendMessage).not.toHaveBeenCalled();
      protocol.isConnected.mockReturnValue(true);
      const listener = protocol.onConnectionStateChange.mock.calls[0][0];

      act(() => {
        listener('connected');
      });

      expect(protocol.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: MessageType.CHAT_REQUEST,
        data: { count: 30 },
      }));

      unmount();
      expect(unsubscribe).toHaveBeenCalled();
    });

    it('can request all chat messages', () => {
      const protocol = makeProtocol(true);
      vi.mocked(useOptionalProtocol).mockReturnValue({ protocol } as unknown as ReturnType<typeof useOptionalProtocol>);
      const { result } = renderHook(() => useChatWebSocket('ws://test', 'Bob'));
      protocol.sendMessage.mockClear();

      act(() => { result.current.loadAllMessages(); });

      expect(protocol.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: MessageType.CHAT_REQUEST,
        data: { all: true },
      }));
    });
  });

  describe('roll result events', () => {
    it('adds a chat message when character-roll-result fires', () => {
      renderHook(() => useChatWebSocket('ws://test', 'Alice'));
      act(() => {
        window.dispatchEvent(new CustomEvent('character-roll-result', {
          detail: {
            character_name: 'Thorin',
            roll_type: 'attack',
            total: 18,
          },
        }));
      });
      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toContain('Thorin');
      expect(msgs[0].text).toContain('18');
      expect(msgs[0].user).toBe('🎲');
    });

    it('includes skill name in roll message when provided', () => {
      renderHook(() => useChatWebSocket('ws://test', 'Alice'));
      act(() => {
        window.dispatchEvent(new CustomEvent('character-roll-result', {
          detail: { character_name: 'Aria', roll_type: 'skill', skill: 'Stealth', total: 22 },
        }));
      });
      const text = useChatStore.getState().messages[0].text;
      expect(text).toContain('Stealth');
    });

    it('removes the event listener on unmount', () => {
      const spy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useChatWebSocket('ws://test', 'Alice'));
      unmount();
      expect(spy).toHaveBeenCalledWith('character-roll-result', expect.any(Function));
    });
  });
});
