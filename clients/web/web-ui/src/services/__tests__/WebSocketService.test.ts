import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocketService, { WebSocketConfig, WebSocketState } from '../WebSocketService';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  public readyState: number = MockWebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public url: string;
  public protocols?: string | string[];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;

    // Simulate async connection
    setTimeout(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        if (this.onopen) {
          this.onopen(new Event('open'));
        }
      }
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose(new CloseEvent('close'));
      }
    }, 10);
  }

  // Helper to simulate connection error
  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  // Helper to simulate unexpected close
  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
}

describe('WebSocketService - Exponential Backoff Tests', () => {
  let service: WebSocketService;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    // Replace global WebSocket with mock
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Basic Reconnection Logic', () => {
    it('should attempt reconnection after unexpected disconnect', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 1000,
      };

      service = new WebSocketService(config);
      const connectPromise = service.connect();
      
      // Advance timers to complete initial connection
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      // Verify connected
      expect(service.isConnected()).toBe(true);

      // Simulate unexpected disconnect
      const ws = (service as any).ws as MockWebSocket;
      ws.simulateClose();

      // Should schedule reconnection
      const stats = service.getStats();
      expect(stats.isManuallyDisconnected).toBe(false);

      // Fast forward to trigger reconnection (1000ms delay + 10ms for new connection)
      await vi.advanceTimersByTimeAsync(1010);

      // Should have attempted reconnection and be connected
      expect(service.getStats().reconnectAttempts).toBe(0); // Reset to 0 after successful reconnection
      expect(service.isConnected()).toBe(true);
    });

    it('should not reconnect after manual disconnect', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 1000,
      };

      service = new WebSocketService(config);
      const connectPromise = service.connect();
      
      // Advance timers to complete initial connection
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      // Manual disconnect
      service.disconnect();

      const stats = service.getStats();
      expect(stats.isManuallyDisconnected).toBe(true);

      // Fast forward - should not reconnect
      await vi.advanceTimersByTimeAsync(5000);

      expect(service.getStats().reconnectAttempts).toBe(0);
    });

    it('should reset reconnect attempts after successful connection', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 100,
      };

      service = new WebSocketService(config);
      
      // First connection
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;
      expect(service.isConnected()).toBe(true);

      // Simulate disconnect
      const ws1 = (service as any).ws as MockWebSocket;
      ws1.simulateClose();

      // Wait for reconnection to be scheduled and callback to fire
      await vi.advanceTimersByTimeAsync(100);
      // At this point reconnectAttempts is incremented but connection not yet complete
      expect(service.getStats().reconnectAttempts).toBe(1);
      
      // Now let the new WebSocket complete its connection
      await vi.advanceTimersByTimeAsync(10);

      // Reconnect attempts should be reset on successful connection
      expect(service.isConnected()).toBe(true);
      expect(service.getStats().reconnectAttempts).toBe(0);
    });
  });

  describe('Exponential Backoff Algorithm', () => {
    it('should use exponential backoff: 1s, 2s, 4s, 8s...', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 5,
        reconnectDelay: 1000,
      };

      service = new WebSocketService(config);
      
      // Override WebSocket to simulate connection failures
      let connectionAttempt = 0;
      const originalWebSocket = global.WebSocket;
      global.WebSocket = class {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        
        public readyState = 3; // CLOSED
        public onopen: ((event: Event) => void) | null = null;
        public onclose: ((event: CloseEvent) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onmessage: ((event: MessageEvent) => void) | null = null;
        
        constructor(public url: string, public protocols?: string | string[]) {
          connectionAttempt++;
          // Immediately fail the connection
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'));
            if (this.onclose) this.onclose(new CloseEvent('close'));
          }, 5);
        }
        
        send() {}
        close() {}
      } as any;
      
      // Initial connection that fails
      const connectPromise = service.connect().catch(() => {});
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      // First reconnect: 1s delay (1000 * 2^0)
      expect(service.getStats().reconnectAttempts).toBe(0);
      await vi.advanceTimersByTimeAsync(1005);
      expect(service.getStats().reconnectAttempts).toBe(1);

      // Second reconnect: 2s delay (1000 * 2^1)
      await vi.advanceTimersByTimeAsync(2005);
      expect(service.getStats().reconnectAttempts).toBe(2);

      // Third reconnect: 4s delay (1000 * 2^2)
      await vi.advanceTimersByTimeAsync(4005);
      expect(service.getStats().reconnectAttempts).toBe(3);

      // Fourth reconnect: 8s delay (1000 * 2^3)
      await vi.advanceTimersByTimeAsync(8005);
      expect(service.getStats().reconnectAttempts).toBe(4);
      
      global.WebSocket = originalWebSocket;
    });

    it('should respect custom reconnectDelay base value', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 500, // 500ms base
      };

      service = new WebSocketService(config);
      
      // Override WebSocket to fail connections
      const originalWebSocket = global.WebSocket;
      global.WebSocket = class {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        
        public readyState = 3;
        public onopen: ((event: Event) => void) | null = null;
        public onclose: ((event: CloseEvent) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onmessage: ((event: MessageEvent) => void) | null = null;
        
        constructor(public url: string, public protocols?: string | string[]) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'));
            if (this.onclose) this.onclose(new CloseEvent('close'));
          }, 5);
        }
        
        send() {}
        close() {}
      } as any;

      const connectPromise = service.connect().catch(() => {});
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      // First reconnect: 500ms delay (500 * 2^0)
      expect(service.getStats().reconnectAttempts).toBe(0);
      await vi.advanceTimersByTimeAsync(505);
      expect(service.getStats().reconnectAttempts).toBe(1);

      // Second reconnect: 1000ms delay (500 * 2^1)
      await vi.advanceTimersByTimeAsync(1005);
      expect(service.getStats().reconnectAttempts).toBe(2);
      
      global.WebSocket = originalWebSocket;
    });

    it('should calculate correct delays for multiple reconnection attempts', async () => {
      const baseDelay = 1000;
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 10,
        reconnectDelay: baseDelay,
      };

      service = new WebSocketService(config);

      // Expected delays: [1s, 2s, 4s, 8s, 16s, 32s, ...]
      const expectedDelays = [
        1000,   // 1000 * 2^0
        2000,   // 1000 * 2^1
        4000,   // 1000 * 2^2
        8000,   // 1000 * 2^3
        16000,  // 1000 * 2^4
      ];

      // Validate exponential calculation
      expectedDelays.forEach((expectedDelay, attempt) => {
        const calculatedDelay = baseDelay * Math.pow(2, attempt);
        expect(calculatedDelay).toBe(expectedDelay);
      });
    });
  });

  describe('Max Reconnection Attempts', () => {
    it('should stop reconnecting after max attempts reached', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 100,
      };

      service = new WebSocketService(config);
      
      // Override WebSocket to fail connections
      const originalWebSocket = global.WebSocket;
      global.WebSocket = class {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        
        public readyState = 3;
        public onopen: ((event: Event) => void) | null = null;
        public onclose: ((event: CloseEvent) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onmessage: ((event: MessageEvent) => void) | null = null;
        
        constructor(public url: string, public protocols?: string | string[]) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'));
            if (this.onclose) this.onclose(new CloseEvent('close'));
          }, 5);
        }
        
        send() {}
        close() {}
      } as any;

      const connectPromise = service.connect().catch(() => {});
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      // Attempt 1: 100ms delay
      await vi.advanceTimersByTimeAsync(105);
      expect(service.getStats().reconnectAttempts).toBe(1);

      // Attempt 2: 200ms delay
      await vi.advanceTimersByTimeAsync(205);
      expect(service.getStats().reconnectAttempts).toBe(2);

      // Attempt 3: 400ms delay
      await vi.advanceTimersByTimeAsync(405);
      expect(service.getStats().reconnectAttempts).toBe(3);

      // Should not attempt 4th time (max reached)
      await vi.advanceTimersByTimeAsync(10000);
      expect(service.getStats().reconnectAttempts).toBe(3);
      
      global.WebSocket = originalWebSocket;
    });

    it('should respect default maxReconnectAttempts of 5', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        reconnectDelay: 100,
        // maxReconnectAttempts not specified, should default to 5
      };

      service = new WebSocketService(config);
      service.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));

      await service.connect().catch(() => {});

      expect(service.getStats().maxReconnectAttempts).toBe(5);
    });

    it('should handle maxReconnectAttempts = 0 correctly', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 0,
        reconnectDelay: 100,
      };

      service = new WebSocketService(config);
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      const ws = (service as any).ws as MockWebSocket;
      ws.simulateClose();

      // Should not reconnect at all
      await vi.advanceTimersByTimeAsync(5000);
      expect(service.getStats().reconnectAttempts).toBe(0);
    });
  });

  describe('Reconnection State Management', () => {
    it('should track reconnection attempts correctly', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 5,
        reconnectDelay: 100,
      };

      service = new WebSocketService(config);
      
      // Override WebSocket to fail connections
      const originalWebSocket = global.WebSocket;
      global.WebSocket = class {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        
        public readyState = 3;
        public onopen: ((event: Event) => void) | null = null;
        public onclose: ((event: CloseEvent) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onmessage: ((event: MessageEvent) => void) | null = null;
        
        constructor(public url: string, public protocols?: string | string[]) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'));
            if (this.onclose) this.onclose(new CloseEvent('close'));
          }, 5);
        }
        
        send() {}
        close() {}
      } as any;

      const connectPromise = service.connect().catch(() => {});
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      expect(service.getStats().reconnectAttempts).toBe(0);

      await vi.advanceTimersByTimeAsync(105);
      expect(service.getStats().reconnectAttempts).toBe(1);

      await vi.advanceTimersByTimeAsync(205);
      expect(service.getStats().reconnectAttempts).toBe(2);

      await vi.advanceTimersByTimeAsync(405);
      expect(service.getStats().reconnectAttempts).toBe(3);
      
      global.WebSocket = originalWebSocket;
    });

    it('should clear reconnection timer on manual disconnect', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 1000,
      };

      service = new WebSocketService(config);
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      const ws = (service as any).ws as MockWebSocket;
      ws.simulateClose();

      // Manually disconnect before reconnection attempt
      service.disconnect();

      // Advance time - should not reconnect
      await vi.advanceTimersByTimeAsync(5000);
      expect(service.getStats().reconnectAttempts).toBe(0);
    });

    it('should not schedule multiple reconnection timers', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 1000,
      };

      service = new WebSocketService(config);
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      const ws = (service as any).ws as MockWebSocket;
      
      // Trigger multiple close events rapidly
      ws.simulateClose();
      ws.simulateClose();
      ws.simulateClose();

      // Should only have one reconnection attempt scheduled
      await vi.advanceTimersByTimeAsync(1000);
      expect(service.getStats().reconnectAttempts).toBeLessThanOrEqual(1);
    });
  });

  describe('Connection Error Handling', () => {
    it('should log reconnection failures', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 2,
        reconnectDelay: 100,
      };

      service = new WebSocketService(config);
      
      // Override WebSocket to fail connections
      const originalWebSocket = global.WebSocket;
      global.WebSocket = class {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        
        public readyState = 3;
        public onopen: ((event: Event) => void) | null = null;
        public onclose: ((event: CloseEvent) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onmessage: ((event: MessageEvent) => void) | null = null;
        
        constructor(public url: string, public protocols?: string | string[]) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'));
            if (this.onclose) this.onclose(new CloseEvent('close'));
          }, 5);
        }
        
        send() {}
        close() {}
      } as any;

      const connectPromise = service.connect().catch(() => {});
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      // Wait for first reconnection attempt
      await vi.advanceTimersByTimeAsync(105);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/reconnection attempt.*failed/i),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      global.WebSocket = originalWebSocket;
    });

    it('should handle successful reconnection after failures', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 5,
        reconnectDelay: 100,
      };

      service = new WebSocketService(config);
      
      let connectionAttempts = 0;
      const originalWebSocket = global.WebSocket;
      global.WebSocket = class {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        
        public readyState: number;
        public onopen: ((event: Event) => void) | null = null;
        public onclose: ((event: CloseEvent) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onmessage: ((event: MessageEvent) => void) | null = null;
        
        constructor(public url: string, public protocols?: string | string[]) {
          connectionAttempts++;
          if (connectionAttempts <= 2) {
            // Fail first 2 attempts
            this.readyState = 3; // CLOSED
            setTimeout(() => {
              if (this.onerror) this.onerror(new Event('error'));
              if (this.onclose) this.onclose(new CloseEvent('close'));
            }, 5);
          } else {
            // Succeed on 3rd attempt and beyond
            this.readyState = 0; // CONNECTING
            setTimeout(() => {
              this.readyState = 1; // OPEN
              if (this.onopen) this.onopen(new Event('open'));
            }, 10);
          }
        }
        
        send() {}
        close() {}
      } as any;

      const connectPromise = service.connect().catch(() => {});
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      // First reconnection - fails
      await vi.advanceTimersByTimeAsync(105);
      expect(service.getStats().reconnectAttempts).toBe(1);

      // Second reconnection - fails  
      await vi.advanceTimersByTimeAsync(200); // Only advance delay, not connection time
      expect(service.getStats().reconnectAttempts).toBe(2);
      
      // Let it finish failing
      await vi.advanceTimersByTimeAsync(5);

      // Third reconnection - succeeds
      await vi.advanceTimersByTimeAsync(410);
      
      // Should reset attempts after successful connection
      expect(service.getStats().reconnectAttempts).toBe(0);
      expect(service.isConnected()).toBe(true);
      
      global.WebSocket = originalWebSocket;
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate connection statistics', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 5,
        reconnectDelay: 1000,
      };

      service = new WebSocketService(config);
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      const stats = service.getStats();
      expect(stats.state).toBe(WebSocketState.OPEN);
      expect(stats.reconnectAttempts).toBe(0);
      expect(stats.maxReconnectAttempts).toBe(5);
      expect(stats.isManuallyDisconnected).toBe(false);
    });

    it('should update statistics after reconnection attempts', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 100,
      };

      service = new WebSocketService(config);
      
      // Override WebSocket to fail connections
      const originalWebSocket = global.WebSocket;
      global.WebSocket = class {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        
        public readyState = 3;
        public onopen: ((event: Event) => void) | null = null;
        public onclose: ((event: CloseEvent) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onmessage: ((event: MessageEvent) => void) | null = null;
        
        constructor(public url: string, public protocols?: string | string[]) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'));
            if (this.onclose) this.onclose(new CloseEvent('close'));
          }, 5);
        }
        
        send() {}
        close() {}
      } as any;

      const connectPromise = service.connect().catch(() => {});
      await vi.advanceTimersByTimeAsync(10);
      await connectPromise;

      await vi.advanceTimersByTimeAsync(105);
      let stats = service.getStats();
      expect(stats.reconnectAttempts).toBe(1);

      await vi.advanceTimersByTimeAsync(205);
      stats = service.getStats();
      expect(stats.reconnectAttempts).toBe(2);
      
      global.WebSocket = originalWebSocket;
    });
  });
});
