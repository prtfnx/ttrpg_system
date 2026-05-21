import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@features/auth';
import { SessionManager } from '../SessionManager';

// Class-based WS mock (arrow functions can't be constructors)
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  send = vi.fn();
  close = vi.fn();
  onopen: (() => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    lastWS = this;
    setTimeout(() => this.onopen?.(), 0);
  }
}

let lastWS: MockWebSocket;

const hostUser: UserInfo = { id: 1, username: 'Host', role: 'dm', permissions: [] };
const player: UserInfo = { id: 2, username: 'Player', role: 'player', permissions: [] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openSession(manager: SessionManager) {
  const p = manager.createSession({ name: 'Test', isPublic: true }, hostUser);
  // Only advance 10ms — enough to fire the 0ms onopen timer, NOT the 30s heartbeat interval
  await vi.advanceTimersByTimeAsync(10);
  return p;
}

function simMsg(type: string, data: unknown) {
  lastWS.onmessage?.({ data: JSON.stringify({ type, data }) } as MessageEvent);
}

// ── constructor / initial state ───────────────────────────────────────────────

describe('initial state', () => {
  it('isConnected returns false before any websocket', () => {
    const m = new SessionManager('ws://test');
    expect(m.isConnected()).toBe(false);
  });

  it('getParticipants returns empty array initially', () => {
    expect(new SessionManager('ws://test').getParticipants()).toEqual([]);
  });

  it('isHost returns false with no session', () => {
    expect(new SessionManager('ws://test').isHost('any')).toBe(false);
  });

  it('getCurrentSession is null initially', () => {
    expect(new SessionManager('ws://test').getCurrentSession()).toBeNull();
  });
});

// ── createSession ─────────────────────────────────────────────────────────────

describe('createSession', () => {
  it('returns SessionInfo with correct fields', async () => {
    const m = new SessionManager('ws://test');
    const s = await openSession(m);
    expect(s.name).toBe('Test');
    expect(s.hostUserId).toBe('1');
    expect(s.isActive).toBe(true);
    expect(s.participants).toContain(hostUser);
    expect(s.code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('sets currentSession after creation', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    expect(m.getCurrentSession()).not.toBeNull();
  });

  it('emits sessionCreated event', async () => {
    const m = new SessionManager('ws://test');
    const cb = vi.fn();
    m.on('sessionCreated', cb);
    await openSession(m);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('opens a WebSocket connection', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    expect(lastWS).toBeDefined();
    expect(lastWS.readyState).toBe(MockWebSocket.OPEN);
  });
});

// ── joinSession ───────────────────────────────────────────────────────────────

describe('joinSession', () => {
  it('rejects for invalid code format (bad chars)', async () => {
    const m = new SessionManager('ws://test');
    await expect(m.joinSession({ code: 'bad!', userInfo: player })).rejects.toThrow('Invalid session code format');
  });

  it('rejects for lowercase code', async () => {
    const m = new SessionManager('ws://test');
    await expect(m.joinSession({ code: 'abc123', userInfo: player })).rejects.toThrow('Invalid session code format');
  });

  it('resolves when session_joined message is received', async () => {
    const m = new SessionManager('ws://test');
    const joinPromise = m.joinSession({ code: 'ABC123', userInfo: player });
    await vi.advanceTimersByTimeAsync(10);
    const sessionData = { id: 'sid', code: 'ABC123', name: 'Game', hostUserId: '1', isActive: true, participants: [player], createdAt: new Date(), lastActivity: new Date() };
    simMsg('session_joined', { session: sessionData });
    await Promise.resolve();
    const session = await joinPromise;
    expect(session.code).toBe('ABC123');
  });

  it('rejects when session_join_error fires', async () => {
    const m = new SessionManager('ws://test');
    const joinPromise = m.joinSession({ code: 'ABC123', userInfo: player });
    await vi.advanceTimersByTimeAsync(10);
    simMsg('session_join_error', { error: 'Room full' });
    await Promise.resolve();
    await expect(joinPromise).rejects.toThrow('Room full');
  });

  it('sends join_session message after connecting', async () => {
    const m = new SessionManager('ws://test');
    const joinPromise = m.joinSession({ code: 'ABC123', userInfo: player });
    await vi.advanceTimersByTimeAsync(10);
    expect(lastWS.send).toHaveBeenCalledWith(expect.stringContaining('join_session'));
    simMsg('session_join_error', { error: 'cleanup' });
    await joinPromise.catch(() => {});
  });
});

// ── leaveSession ──────────────────────────────────────────────────────────────

describe('leaveSession', () => {
  it('clears currentSession', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    await m.leaveSession();
    expect(m.getCurrentSession()).toBeNull();
  });

  it('emits sessionLeft event', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    const cb = vi.fn();
    m.on('sessionLeft', cb);
    await m.leaveSession();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not throw when no session active', async () => {
    const m = new SessionManager('ws://test');
    await expect(m.leaveSession()).resolves.toBeUndefined();
  });

  it('closes websocket', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    await m.leaveSession();
    expect(lastWS.close).toHaveBeenCalled();
  });
});

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('sends JSON when WS is open', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    m.sendMessage('my_event', { x: 1 });
    expect(lastWS.send).toHaveBeenCalledWith(expect.stringContaining('my_event'));
  });

  it('warns when WS is not connected', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = new SessionManager('ws://test');
    m.sendMessage('nope', {});
    expect(spy).toHaveBeenCalled();
  });
});

// ── broadcast helpers ─────────────────────────────────────────────────────────

describe('broadcast helpers', () => {
  it('broadcastTokenMovement sends token_movement', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    m.broadcastTokenMovement('t1', { x: 5, y: 10 });
    expect(lastWS.send).toHaveBeenCalledWith(expect.stringContaining('token_movement'));
  });

  it('broadcastDiceRoll sends dice_roll', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    m.broadcastDiceRoll({ result: 18 });
    expect(lastWS.send).toHaveBeenCalledWith(expect.stringContaining('dice_roll'));
  });

  it('sendChatMessage sends chat_message with text', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    m.sendChatMessage('Hello!');
    const call = lastWS.send.mock.calls.find((args) => (args[0] as string).includes('chat_message'));
    expect(call![0]).toContain('Hello!');
  });
});

// ── event system ──────────────────────────────────────────────────────────────

describe('event system', () => {
  it('on registers listener', () => {
    const m = new SessionManager('ws://test');
    const cb = vi.fn();
    m.on('x', cb);
    (m as unknown as { emit: (e: string, ...a: unknown[]) => void }).emit('x', 42);
    expect(cb).toHaveBeenCalledWith(42);
  });

  it('once fires only once', () => {
    const m = new SessionManager('ws://test');
    const cb = vi.fn();
    m.once('x', cb);
    const emit = (m as unknown as { emit: (e: string, ...a: unknown[]) => void }).emit.bind(m);
    emit('x'); emit('x');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('off removes listener', () => {
    const m = new SessionManager('ws://test');
    const cb = vi.fn();
    m.on('x', cb);
    m.off('x', cb);
    (m as unknown as { emit: (e: string) => void }).emit('x');
    expect(cb).not.toHaveBeenCalled();
  });

  it('off is no-op for unknown events', () => {
    const m = new SessionManager('ws://test');
    expect(() => m.off('missing', vi.fn())).not.toThrow();
  });
});

// ── WebSocket message types ───────────────────────────────────────────────────

describe('WebSocket message handling', () => {
  async function connected() {
    const m = new SessionManager('ws://test');
    await openSession(m);
    return m;
  }

  it('participant_joined emits participantJoined', async () => {
    const m = await connected();
    const cb = vi.fn();
    m.on('participantJoined', cb);
    simMsg('participant_joined', { participant: player });
    expect(cb).toHaveBeenCalledWith(player);
  });

  it('participant_left emits participantLeft', async () => {
    const m = await connected();
    const cb = vi.fn();
    m.on('participantLeft', cb);
    simMsg('participant_left', { participant: player });
    expect(cb).toHaveBeenCalledWith(player);
  });

  it('token_movement emits tokenMoved', async () => {
    const m = await connected();
    const cb = vi.fn();
    m.on('tokenMoved', cb);
    simMsg('token_movement', { tokenId: 't1' });
    expect(cb).toHaveBeenCalled();
  });

  it('dice_roll emits diceRolled', async () => {
    const m = await connected();
    const cb = vi.fn();
    m.on('diceRolled', cb);
    simMsg('dice_roll', { result: 20 });
    expect(cb).toHaveBeenCalled();
  });

  it('chat_message emits chatMessage', async () => {
    const m = await connected();
    const cb = vi.fn();
    m.on('chatMessage', cb);
    simMsg('chat_message', { message: 'hi' });
    expect(cb).toHaveBeenCalled();
  });

  it('session_updated merges and emits sessionUpdated', async () => {
    const m = await connected();
    const cb = vi.fn();
    m.on('sessionUpdated', cb);
    simMsg('session_updated', { session: { name: 'NewName' } });
    expect(cb).toHaveBeenCalled();
    expect(m.getCurrentSession()?.name).toBe('NewName');
  });

  it('heartbeat_response does not throw', async () => {
    await connected();
    expect(() => simMsg('heartbeat_response', {})).not.toThrow();
  });

  it('unknown type emits unknownMessage', async () => {
    const m = await connected();
    const cb = vi.fn();
    m.on('unknownMessage', cb);
    simMsg('mystery', {});
    expect(cb).toHaveBeenCalled();
  });

  it('malformed JSON is handled gracefully', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await connected();
    expect(() =>
      lastWS.onmessage?.({ data: 'not-json' } as MessageEvent)
    ).not.toThrow();
  });
});

// ── WebSocket connection lifecycle ────────────────────────────────────────────

describe('WebSocket lifecycle', () => {
  it('onclose emits connectionClosed', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    const cb = vi.fn();
    m.on('connectionClosed', cb);
    lastWS.onclose?.({ wasClean: true, code: 1000, reason: '' });
    expect(cb).toHaveBeenCalled();
  });

  it('onerror emits connectionError and rejects createSession', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Override to fire error instead of open
    class ErrorWS extends MockWebSocket {
      constructor() {
        super();
        // Clear the auto-open, fire error instead
        this.onopen = null;
        setTimeout(() => this.onerror?.({} as Event), 0);
      }
    }
    vi.unstubAllGlobals();
    vi.stubGlobal('WebSocket', ErrorWS);
    const m = new SessionManager('ws://test');
    const cb = vi.fn();
    m.on('connectionError', cb);
    const p = m.createSession({ name: 'Err' }, hostUser);
    await vi.advanceTimersByTimeAsync(10);
    await p.catch(() => {});
    expect(cb).toHaveBeenCalled();
  });

  it('unclean close triggers reconnect attempt', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const m = new SessionManager('ws://test');
    await openSession(m);
    const wsBefore = lastWS;
    wsBefore.onclose?.({ wasClean: false, code: 1006, reason: '' });
    await vi.advanceTimersByTimeAsync(2000);
    // A new WebSocket should be created for reconnect
    expect(lastWS).not.toBe(wsBefore);
  });
});

// ── getters ───────────────────────────────────────────────────────────────────

describe('getters', () => {
  it('isConnected is true after creating session', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    expect(m.isConnected()).toBe(true);
  });

  it('getParticipants returns session participants', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    expect(m.getParticipants()).toContain(hostUser);
  });

  it('isHost(userId) returns true for host', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    expect(m.isHost('1')).toBe(true);
    expect(m.isHost('99')).toBe(false);
  });
});

// ── heartbeat ─────────────────────────────────────────────────────────────────

describe('heartbeat', () => {
  it('sends heartbeat message every 30 seconds', async () => {
    const m = new SessionManager('ws://test');
    await openSession(m);
    lastWS.send.mockClear();
    await vi.advanceTimersByTimeAsync(30000);
    expect(lastWS.send).toHaveBeenCalledWith(expect.stringContaining('heartbeat'));
  });
});
