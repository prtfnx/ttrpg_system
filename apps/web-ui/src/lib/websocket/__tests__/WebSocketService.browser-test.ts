import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketService } from '../WebSocketService';

// Real browser environment — we can construct real Event/MessageEvent objects
// and verify the service routes them correctly without jsdom quirks.

class MockWs {
  readyState: number = WebSocket.OPEN;
  sent: string[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  send(data: string) { this.sent.push(data); }
  close() { this.readyState = WebSocket.CLOSED; }

  simulateOpen() { this.onopen?.(new Event('open')); }
  simulateMessage(payload: object) {
    const e = new MessageEvent('message', { data: JSON.stringify(payload) });
    this.onmessage?.(e);
  }
  simulateClose() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { wasClean: true }));
  }
}

let mockWs: MockWs;

beforeEach(() => {
  mockWs = new MockWs();
  // Regular function (not arrow) so it can be called with `new`
  vi.stubGlobal('WebSocket', vi.fn(function() { return mockWs; }));
});

describe('WebSocketService — message routing', () => {
  it('calls registered handler for matching message type', async () => {
    const svc = new WebSocketService({ url: 'ws://test' });
    const handler = vi.fn();
    svc.onMessage('chat', handler);

    const connectPromise = svc.connect();
    mockWs.simulateOpen();
    await connectPromise;

    mockWs.simulateMessage({ type: 'chat', payload: { text: 'hello' } });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].payload.text).toBe('hello');
  });

  it('does not call handler for different message type', async () => {
    const svc = new WebSocketService({ url: 'ws://test' });
    const handler = vi.fn();
    svc.onMessage('presence', handler);

    const connectPromise = svc.connect();
    mockWs.simulateOpen();
    await connectPromise;

    mockWs.simulateMessage({ type: 'chat', payload: {} });
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribe removes handler', async () => {
    const svc = new WebSocketService({ url: 'ws://test' });
    const handler = vi.fn();
    const unsub = svc.onMessage('chat', handler);

    const connectPromise = svc.connect();
    mockWs.simulateOpen();
    await connectPromise;

    unsub();
    mockWs.simulateMessage({ type: 'chat', payload: {} });
    expect(handler).not.toHaveBeenCalled();
  });

  it('send returns false when not connected', () => {
    const svc = new WebSocketService({ url: 'ws://test' });
    // No connect() called — no WebSocket instance
    const ok = svc.send({ type: 'ping', payload: {} });
    expect(ok).toBe(false);
  });

  it('send serialises message and forwards to socket', async () => {
    const svc = new WebSocketService({ url: 'ws://test' });
    const connectPromise = svc.connect();
    mockWs.simulateOpen();
    await connectPromise;

    svc.send({ type: 'chat', payload: { text: 'hi' } });
    expect(mockWs.sent).toHaveLength(1);
    const parsed = JSON.parse(mockWs.sent[0]);
    expect(parsed.type).toBe('chat');
    expect(parsed.payload.text).toBe('hi');
  });

  it('disconnect prevents reconnect and clears socket', async () => {
    const svc = new WebSocketService({ url: 'ws://test' });
    const connectPromise = svc.connect();
    mockWs.simulateOpen();
    await connectPromise;

    svc.disconnect();
    expect(mockWs.readyState).toBe(WebSocket.CLOSED);
    // After manual disconnect, send should return false
    expect(svc.send({ type: 'x', payload: {} })).toBe(false);
  });
});
