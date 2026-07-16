import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '../chatStore';
import { useChatWebSocket } from '../hooks/useChatWebSocket';
import { MessageType } from '@lib/websocket';

// Minimal protocol mock — no real WebSocket needed
const makeProtocol = (connected = false) => ({
  getSessionCode: vi.fn().mockReturnValue('session-a'),
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
    useChatStore.setState({ activeSessionId: null, messages: [], messagesBySession: {} });
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

    it('marks a message failed when no authenticated protocol is available', () => {
      const { result } = renderHook(() => useChatWebSocket('ws://test', 'Alice'));
      act(() => { result.current.sendMessage('Hello!'); });
      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('Hello!');
      expect(msgs[0].user).toBe('Alice');
      expect(msgs[0].deliveryStatus).toBe('failed');
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

    it('adds a persisted typed roll received through public chat', () => {
      const protocol = makeProtocol(true);
      vi.mocked(useOptionalProtocol).mockReturnValue({ protocol } as unknown as ReturnType<typeof useOptionalProtocol>);
      renderHook(() => useChatWebSocket('ws://test', 'Bob'));
      const handler = protocol.registerHandler.mock.calls[0][1];

      act(() => {
        handler({
          type: MessageType.CHAT_MESSAGE,
          data: {
            message: {
              id: 'roll-chat-1',
              user: 'System',
              text: 'Thorin — attack: 18',
              timestamp: 1,
              channel: 'public',
              kind: 'system',
              system_event: {
                schemaVersion: 1,
                type: 'character_roll',
                actor: { user_id: 7, username: 'Bob' },
                payload: {
                  character_id: 'char-1', character_name: 'Thorin', user_id: 7,
                  roll_type: 'attack', skill: 'melee', modifier: 5,
                  die_roll: 13, total: 18, advantage: false, disadvantage: false,
                  description: 'attack: 18',
                },
              },
            },
          },
          version: '0.1',
          priority: 5,
        });
      });

      expect(useChatStore.getState().messages).toEqual([
        expect.objectContaining({
          id: 'roll-chat-1',
          kind: 'system',
          deliveryStatus: 'sent',
        }),
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

    it('loads one bounded older history page', () => {
      const protocol = makeProtocol(true);
      vi.mocked(useOptionalProtocol).mockReturnValue({ protocol } as unknown as ReturnType<typeof useOptionalProtocol>);
      const { result } = renderHook(() => useChatWebSocket('ws://test', 'Bob'));
      protocol.sendMessage.mockClear();

      act(() => { result.current.loadAllMessages(); });

      expect(protocol.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: MessageType.CHAT_REQUEST,
        data: { count: 100 },
      }));
    });

    it('reconciles an optimistic message from server confirmation', () => {
      const protocol = makeProtocol(true);
      vi.mocked(useOptionalProtocol).mockReturnValue({ protocol } as unknown as ReturnType<typeof useOptionalProtocol>);
      const { result } = renderHook(() => useChatWebSocket('ws://test', 'Bob'));
      act(() => { result.current.sendMessage('Hello'); });
      const operationId = useChatStore.getState().messages[0].client_operation_id!;
      const confirmationHandler = protocol.registerHandler.mock.calls.find(
        ([type]) => type === MessageType.CHAT_CONFIRMATION
      )![1];

      act(() => {
        confirmationHandler({
          type: MessageType.CHAT_CONFIRMATION,
          data: {
            client_operation_id: operationId,
            chat_message: { id: 'server-1', client_operation_id: operationId, user: 'Bob', text: 'Hello', timestamp: 1 },
          },
          version: '0.1',
          priority: 5,
        });
      });

      expect(useChatStore.getState().messages).toEqual([
        expect.objectContaining({ id: 'server-1', deliveryStatus: 'sent' }),
      ]);
    });

    it('shares one transport binding between simultaneous chat surfaces', () => {
      const protocol = makeProtocol(true);
      vi.mocked(useOptionalProtocol).mockReturnValue({ protocol } as unknown as ReturnType<typeof useOptionalProtocol>);
      const first = renderHook(() => useChatWebSocket('ws://test', 'Bob'));
      const second = renderHook(() => useChatWebSocket('ws://test', 'Bob'));

      expect(protocol.registerHandler).toHaveBeenCalledTimes(2);
      expect(protocol.sendMessage).toHaveBeenCalledTimes(1);
      first.unmount();
      expect(protocol.unregisterHandler).not.toHaveBeenCalled();
      second.unmount();
      expect(protocol.unregisterHandler).toHaveBeenCalledTimes(2);
    });
  });

});
