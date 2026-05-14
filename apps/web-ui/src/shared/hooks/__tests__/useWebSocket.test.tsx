import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWebSocket } from '../useWebSocket';

// ── store mock ──────────────────────────────────────────────────────────────
const mockMoveSprite = vi.fn();
const mockAddSprite = vi.fn();
const mockRemoveSprite = vi.fn();
const mockUpdateSprite = vi.fn();
const mockSetConnection = vi.fn();
const mockUpdateConnectionState = vi.fn();
let mockSprites: { id: string }[] = [];

vi.mock('@/store', () => ({
  useGameStore: Object.assign(
    vi.fn(() => ({
      moveSprite: mockMoveSprite,
      addSprite: mockAddSprite,
      removeSprite: mockRemoveSprite,
      updateSprite: mockUpdateSprite,
      setConnection: mockSetConnection,
      updateConnectionState: mockUpdateConnectionState,
      sprites: mockSprites,
    })),
    { getState: vi.fn(() => ({ activeTableId: '' })) },
  ),
}));

vi.mock('@lib/api', () => ({
  useOptionalProtocol: vi.fn(() => null),
}));

// ── WebSocket mock ──────────────────────────────────────────────────────────
class MockWs {
  readyState = 0; // CONNECTING
  sent: string[] = [];
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  send(data: string) { this.sent.push(data); }
  close(_code?: number, _reason?: string) { this.readyState = 3; } // CLOSED

  triggerOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event('open'));
  }
  triggerMessage(payload: object) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }
  triggerClose(wasClean = true) {
    this.readyState = 3; // CLOSED
    this.onclose?.(new CloseEvent('close', { wasClean }));
  }
  triggerError() {
    this.onerror?.(new Event('error'));
  }
}

let mockWs: MockWs;

beforeEach(() => {
  vi.clearAllMocks();
  mockSprites = [];
  mockWs = new MockWs();
  const mockWsConstructor = vi.fn(function () { return mockWs; }) as unknown as typeof WebSocket;
  // Preserve static constants so readyState comparisons work
  Object.assign(mockWsConstructor, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  vi.stubGlobal('WebSocket', mockWsConstructor);
  delete (window as unknown as Record<string, unknown>).rustRenderManager;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── helpers ─────────────────────────────────────────────────────────────────
async function connected() {
  const hook = renderHook(() => useWebSocket('ws://test'));
  await act(async () => { hook.result.current.connect(); });
  act(() => { mockWs.triggerOpen(); });
  return hook;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('useWebSocket — connect / disconnect', () => {
  it('sets connection state to connecting then connected on open', async () => {
    const { result } = renderHook(() => useWebSocket('ws://test'));
    await act(async () => { result.current.connect(); });
    expect(mockUpdateConnectionState).toHaveBeenCalledWith('connecting');
    act(() => { mockWs.triggerOpen(); });
    expect(mockUpdateConnectionState).toHaveBeenCalledWith('connected');
    expect(mockSetConnection).toHaveBeenCalledWith(true);
  });

  it('sets error state on socket error', async () => {
    const { result } = renderHook(() => useWebSocket('ws://test'));
    await act(async () => { result.current.connect(); });
    act(() => { mockWs.triggerError(); });
    expect(mockUpdateConnectionState).toHaveBeenCalledWith('error');
    expect(mockSetConnection).toHaveBeenCalledWith(false);
  });

  it('sets disconnected state on clean close', async () => {
    const hook = await connected();
    act(() => { mockWs.triggerClose(true); });
    expect(mockUpdateConnectionState).toHaveBeenCalledWith('disconnected');
    expect(mockSetConnection).toHaveBeenCalledWith(false);
    hook.unmount();
  });

  it('schedules reconnect on unclean close', async () => {
    vi.useFakeTimers();
    const hook = await connected();
    act(() => { mockWs.triggerClose(false); });
    // reconnect timer should have been set (WebSocket constructor called again after 3s)
    const callsBefore = (vi.mocked(globalThis.WebSocket) as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(3100); });
    const callsAfter = (vi.mocked(globalThis.WebSocket) as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
    hook.unmount();
  });

  it('disconnect closes socket and marks disconnected', async () => {
    const hook = await connected();
    act(() => { hook.result.current.disconnect(); });
    expect(mockUpdateConnectionState).toHaveBeenCalledWith('disconnected');
    expect(mockSetConnection).toHaveBeenCalledWith(false);
    hook.unmount();
  });
});

describe('useWebSocket — handleMessage routing', () => {
  it('sprite_update calls updateSprite', async () => {
    const hook = await connected();
    act(() => {
      mockWs.triggerMessage({ type: 'sprite_update', data: { id: 's1', x: 10 } });
    });
    expect(mockUpdateSprite).toHaveBeenCalledWith('s1', { id: 's1', x: 10 });
    hook.unmount();
  });

  it('sprite_remove calls removeSprite', async () => {
    const hook = await connected();
    act(() => {
      mockWs.triggerMessage({ type: 'sprite_remove', data: { id: 's1' } });
    });
    expect(mockRemoveSprite).toHaveBeenCalledWith('s1');
    hook.unmount();
  });

  it('sprite_move calls moveSprite', async () => {
    const hook = await connected();
    act(() => {
      mockWs.triggerMessage({ type: 'sprite_move', data: { id: 's1', x: 5, y: 7 } });
    });
    expect(mockMoveSprite).toHaveBeenCalledWith('s1', 5, 7);
    hook.unmount();
  });

  it('sprite_create calls addSprite with converted scale', async () => {
    const hook = await connected();
    act(() => {
      mockWs.triggerMessage({
        type: 'sprite_create',
        data: { id: 'c1', width: 64, height: 32, x: 1, y: 2, name: 'Hero' },
      });
    });
    expect(mockAddSprite).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Hero', scale: { x: 2, y: 1 } }),
    );
    hook.unmount();
  });

  it('welcome calls setConnection with sessionId', async () => {
    const hook = await connected();
    act(() => {
      mockWs.triggerMessage({ type: 'welcome', data: { session_id: 'sess-42' } });
    });
    expect(mockSetConnection).toHaveBeenCalledWith(true, 'sess-42');
    hook.unmount();
  });

  it('table_data clears existing sprites then adds new ones', async () => {
    mockSprites = [{ id: 'old1' }, { id: 'old2' }];
    const hook = await connected();
    act(() => {
      mockWs.triggerMessage({
        type: 'table_data',
        data: {
          table_id: 't1',
          sprites: [{ id: 'new1', x: 0, y: 0, layer: 'tokens', texture: '' }],
        },
      });
    });
    expect(mockRemoveSprite).toHaveBeenCalledWith('old1');
    expect(mockRemoveSprite).toHaveBeenCalledWith('old2');
    expect(mockAddSprite).toHaveBeenCalledWith(expect.objectContaining({ id: 'new1' }));
    hook.unmount();
  });

  it('pong message is handled silently (no crash)', async () => {
    const hook = await connected();
    act(() => { mockWs.triggerMessage({ type: 'pong', data: {} }); });
    // nothing should be called
    expect(mockUpdateSprite).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('invalid JSON message is handled gracefully', async () => {
    const hook = await connected();
    act(() => {
      mockWs.onmessage?.(new MessageEvent('message', { data: '{{invalid json' }));
    });
    // parse error is swallowed; no store mutations happen
    expect(mockUpdateSprite).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('string-encoded message is parsed correctly', async () => {
    const hook = await connected();
    act(() => {
      hook.result.current.sendMessage('sprite_move', { id: 's2', x: 1, y: 1 });
    });
    // sendMessage queues if not open — we're connected so it sends directly
    expect(mockWs.sent).toHaveLength(1);
    const parsed = JSON.parse(mockWs.sent[0]);
    expect(parsed.type).toBe('sprite_move');
    hook.unmount();
  });
});

describe('useWebSocket — send helpers', () => {
  it('sendSpriteMove sends sprite_move message', async () => {
    const hook = await connected();
    act(() => { hook.result.current.sendSpriteMove('s1', 10, 20); });
    expect(mockWs.sent).toHaveLength(1);
    const msg = JSON.parse(mockWs.sent[0]);
    expect(msg.type).toBe('sprite_move');
    expect(msg.data.id).toBe('s1');
    hook.unmount();
  });

  it('requestTableData sends table_request message', async () => {
    const hook = await connected();
    act(() => { hook.result.current.requestTableData(); });
    const msg = JSON.parse(mockWs.sent[0]);
    expect(msg.type).toBe('table_request');
    hook.unmount();
  });

  it('sendSpriteCreate sends sprite_create message', async () => {
    const hook = await connected();
    act(() => { hook.result.current.sendSpriteCreate({ name: 'Goblin', x: 3, y: 4 }); });
    const msg = JSON.parse(mockWs.sent[0]);
    expect(msg.type).toBe('sprite_create');
    expect(msg.data.name).toBe('Goblin');
    hook.unmount();
  });

  it('sendMessage queues when not connected', () => {
    const { result, unmount } = renderHook(() => useWebSocket('ws://test'));
    // wsRef.current is null — message goes to internal queue, not the socket
    act(() => { result.current.sendMessage('ping'); });
    expect(mockWs.sent).toHaveLength(0);
    unmount();
  });
});
