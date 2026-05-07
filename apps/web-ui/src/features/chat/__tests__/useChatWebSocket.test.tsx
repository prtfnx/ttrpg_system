import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatWebSocket } from '../hooks/useChatWebSocket';
import { useChatStore } from '../chatStore';

// Minimal protocol mock — no real WebSocket needed
const makeProtocol = (connected = false) => ({
  registerHandler: vi.fn(),
  unregisterHandler: vi.fn(),
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
      act(() => { result.current.sendMessage('Hey'); });
      expect(protocol.sendMessage).toHaveBeenCalledOnce();
      expect(useChatStore.getState().messages[0].text).toBe('Hey');
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
