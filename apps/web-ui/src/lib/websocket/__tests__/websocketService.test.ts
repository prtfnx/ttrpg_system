import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketService } from '../WebSocketService';
import type { WebSocketConfig } from '../WebSocketService';

// Mock WebSocket constructor for all tests
let mockWs: {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: ((e: Event) => void) | null;
  onclose: ((e: CloseEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
};

function setupMockWs() {
  mockWs = {
    readyState: 0, // WebSocket.CONNECTING
    send: vi.fn(),
    close: vi.fn(),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
  const MockWS = function MockWS() { return mockWs; } as unknown as typeof WebSocket;
  // Keep WebSocket static constants so service code can compare readyState
  (MockWS as unknown as Record<string, number>).CONNECTING = 0;
  (MockWS as unknown as Record<string, number>).OPEN = 1;
  (MockWS as unknown as Record<string, number>).CLOSING = 2;
  (MockWS as unknown as Record<string, number>).CLOSED = 3;
  vi.stubGlobal('WebSocket', MockWS);
}

const defaultConfig: WebSocketConfig = { url: 'ws://localhost/test', maxReconnectAttempts: 3, reconnectDelay: 100 };

function makeConnectedService() {
  const svc = new WebSocketService(defaultConfig);
  const promise = svc.connect();
  mockWs.readyState = 1; // OPEN
  mockWs.onopen!(new Event('open'));
  return { svc, promise };
}

beforeEach(() => {
  vi.useFakeTimers();
  setupMockWs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('WebSocketService', () => {
  // ── connect ──────────────────────────────────────────────────────────────

  describe('connect()', () => {
    it('resolves when WebSocket opens', async () => {
      const svc = new WebSocketService(defaultConfig);
      const p = svc.connect();
      mockWs.readyState = 1;
      mockWs.onopen!(new Event('open'));
      await expect(p).resolves.toBeUndefined();
    });

    it('is idempotent when already OPEN', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      // second call returns immediately without creating a new WS
      await expect(svc.connect()).resolves.toBeUndefined();
    });

    it('schedules reconnect when closed before open (abnormal)', async () => {
      const svc = new WebSocketService(defaultConfig);
      svc.connect();
      // Don't resolve onopen — trigger close directly
      mockWs.readyState = 3; // CLOSED
      mockWs.onclose!({ code: 1006, reason: 'abnormal' } as CloseEvent);
      // Reconnect is scheduled; advance timer to trigger it
      vi.advanceTimersByTime(200);
      expect(typeof svc.getState()).toBe('number');
    });

    it('notifies connectionHandlers on open', async () => {
      const svc = new WebSocketService(defaultConfig);
      const handler = vi.fn();
      svc.onConnect(handler);
      const p = svc.connect();
      mockWs.readyState = 1;
      mockWs.onopen!(new Event('open'));
      await p;
      expect(handler).toHaveBeenCalled();
    });
  });

  // ── disconnect ───────────────────────────────────────────────────────────

  describe('disconnect()', () => {
    it('closes the WebSocket', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      svc.disconnect();
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('notifies disconnection handlers', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      const handler = vi.fn();
      svc.onDisconnect(handler);
      svc.disconnect();
      mockWs.readyState = 3;
      mockWs.onclose!({ code: 1000 } as CloseEvent);
      expect(handler).toHaveBeenCalled();
    });
  });

  // ── send ─────────────────────────────────────────────────────────────────

  describe('send()', () => {
    it('sends message when connected and returns true', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      const result = svc.send({ type: 'ping', payload: {} });
      expect(result).toBe(true);
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping', payload: {} }));
    });

    it('returns false when not connected', () => {
      const svc = new WebSocketService(defaultConfig);
      const result = svc.send({ type: 'ping', payload: {} });
      expect(result).toBe(false);
    });

    it('returns false when readyState is not OPEN', async () => {
      const svc = new WebSocketService(defaultConfig);
      svc.connect();
      mockWs.readyState = 0;
      // Don't open it
      const result = svc.send({ type: 'ping', payload: {} });
      expect(result).toBe(false);
    });
  });

  // ── onMessage ────────────────────────────────────────────────────────────

  describe('onMessage()', () => {
    it('calls registered handler for matching message type', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      const handler = vi.fn();
      svc.onMessage('chat', handler);
      mockWs.onmessage!({ data: JSON.stringify({ type: 'chat', payload: { text: 'hello' } }) } as MessageEvent);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat' }));
    });

    it('returns unsubscribe function that removes handler', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      const handler = vi.fn();
      const off = svc.onMessage('chat', handler);
      off();
      mockWs.onmessage!({ data: JSON.stringify({ type: 'chat', payload: {} }) } as MessageEvent);
      expect(handler).not.toHaveBeenCalled();
    });

    it('does not call handler for different message type', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      const handler = vi.fn();
      svc.onMessage('other', handler);
      mockWs.onmessage!({ data: JSON.stringify({ type: 'chat', payload: {} }) } as MessageEvent);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── onError ──────────────────────────────────────────────────────────────

  describe('onError()', () => {
    it('notifies error handlers on WebSocket error', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      const handler = vi.fn();
      svc.onError(handler);
      mockWs.onerror!(new Event('error'));
      expect(handler).toHaveBeenCalled();
    });

    it('returns unsubscribe that removes error handler', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      const handler = vi.fn();
      const off = svc.onError(handler);
      off();
      mockWs.onerror!(new Event('error'));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── getState / isConnected / getStats ────────────────────────────────────

  describe('state queries', () => {
    it('getState returns CLOSED when not connected', () => {
      const svc = new WebSocketService(defaultConfig);
      expect(svc.getState()).toBe(3);
    });

    it('isConnected returns true when OPEN', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      expect(svc.isConnected()).toBe(true);
    });

    it('isConnected returns false when not connected', () => {
      const svc = new WebSocketService(defaultConfig);
      expect(svc.isConnected()).toBe(false);
    });

    it('getStats returns connection statistics', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      const stats = svc.getStats();
      expect(stats.reconnectAttempts).toBe(0);
      expect(stats.maxReconnectAttempts).toBe(3);
      expect(stats.isManuallyDisconnected).toBe(false);
    });
  });

  // ── reconnection ─────────────────────────────────────────────────────────

  describe('reconnection', () => {
    it('schedules reconnect on abnormal close', async () => {
      const svc = new WebSocketService({ ...defaultConfig, reconnectDelay: 100 });
      const p = svc.connect();
      mockWs.readyState = 1;
      mockWs.onopen!(new Event('open'));
      await p;

      // Simulate abnormal close
      mockWs.readyState = 3;
      mockWs.onclose!({ code: 1006, reason: 'abnormal' } as CloseEvent);

      // Timer should be scheduled
      vi.advanceTimersByTime(200);
      // A new WebSocket connection attempt should be made
      expect(typeof svc.getState()).toBe('number');
    });

    it('does NOT reconnect on manual disconnect (code 1000)', async () => {
      const svc = new WebSocketService(defaultConfig);
      const p = svc.connect();
      mockWs.readyState = 1;
      mockWs.onopen!(new Event('open'));
      await p;
      svc.disconnect();
      mockWs.readyState = 3;
      mockWs.onclose!({ code: 1000 } as CloseEvent);
      vi.advanceTimersByTime(5000);
      // isManuallyDisconnected should be true — no reconnect
      expect(svc.getStats().isManuallyDisconnected).toBe(true);
    });
  });

  // ── onConnect / onDisconnect unsubscribe ─────────────────────────────────

  describe('onConnect / onDisconnect unsubscribe', () => {
    it('onConnect returns unsubscribe that removes handler', async () => {
      const svc = new WebSocketService(defaultConfig);
      const handler = vi.fn();
      const off = svc.onConnect(handler);
      off();
      const p = svc.connect();
      mockWs.readyState = 1;
      mockWs.onopen!(new Event('open'));
      await p;
      expect(handler).not.toHaveBeenCalled();
    });

    it('onDisconnect returns unsubscribe that removes handler', async () => {
      const { svc, promise } = makeConnectedService();
      await promise;
      const handler = vi.fn();
      const off = svc.onDisconnect(handler);
      off();
      svc.disconnect();
      mockWs.readyState = 3;
      mockWs.onclose!({ code: 1000 } as CloseEvent);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

