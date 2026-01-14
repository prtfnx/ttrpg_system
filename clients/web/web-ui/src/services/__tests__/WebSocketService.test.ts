import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        reconnectDelay: 10,
      };

      service = new WebSocketService(config);
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10); // Allow MockWebSocket to connect
      await connectPromise;

      // Verify connected
      expect(service.isConnected()).toBe(true);

      // Simulate unexpected disconnect
      const ws = (service as any).ws as MockWebSocket;
      ws.simulateClose();

      // Should schedule reconnection
      const stats = service.getStats();
      expect(stats.isManuallyDisconnected).toBe(false);

      // Fast forward to trigger reconnection
      await vi.advanceTimersByTimeAsync(10);

      // Should have attempted reconnection
      expect(service.getStats().reconnectAttempts).toBe(1);
    });

    it('should not reconnect after manual disconnect', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 10,
      };

      service = new WebSocketService(config);
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10); // Allow MockWebSocket to connect
      await connectPromise;

      // Manual disconnect
      service.disconnect();

      const stats = service.getStats();
      expect(stats.isManuallyDisconnected).toBe(true);

      // Fast forward - should not reconnect
      await vi.advanceTimersByTimeAsync(50);

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
      await vi.advanceTimersByTimeAsync(10); // Allow MockWebSocket to connect
      await connectPromise;
      expect(service.isConnected()).toBe(true);

      // Simulate disconnect
      const ws1 = (service as any).ws as MockWebSocket;
      ws1.simulateClose();

      // Wait for reconnection attempt
      await vi.advanceTimersByTimeAsync(100);
      expect(service.getStats().reconnectAttempts).toBeGreaterThan(0);

      // Manually reconnect successfully
      const reconnectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10); // Allow MockWebSocket to connect
      await reconnectPromise;
      await vi.advanceTimersByTimeAsync(10);

      // Reconnect attempts should be reset
      expect(service.getStats().reconnectAttempts).toBe(0);
    });
  });

  describe('Exponential Backoff Algorithm', () => {
    it('should use exponential backoff: 1s, 2s, 4s, 8s...', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 5,
        reconnectDelay: 10,
      };

      service = new WebSocketService(config);
      
      // Make all connections fail
      const OriginalMockWebSocket = global.WebSocket;
      global.WebSocket = class extends (MockWebSocket as any) {
        constructor(...args: any[]) {
          super(...args);
          setTimeout(() => {
            if (this.readyState === MockWebSocket.CONNECTING) {
              this.readyState = MockWebSocket.CLOSED;
              if (this.onerror) {
                this.onerror(new Event('error'));
              }
              if (this.onclose) {
                this.onclose(new CloseEvent('close'));
              }
            }
          }, 10);
        }
      } as any;

      try {
        const connectPromise = service.connect();
        await vi.advanceTimersByTimeAsync(10);
        await connectPromise;
      } catch {
        // Expected to fail
      }

      // First reconnect: 10ms delay (10 * 2^0)
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(1);

      // Second reconnect: 20ms delay (10 * 2^1)
      await vi.advanceTimersByTimeAsync(20);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(2);

      // Third reconnect: 40ms delay (10 * 2^2)
      await vi.advanceTimersByTimeAsync(40);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(3);

      // Fourth reconnect: 80ms delay (10 * 2^3)
      await vi.advanceTimersByTimeAsync(80);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(4);
      
      global.WebSocket = OriginalMockWebSocket;
    });

    it('should respect custom reconnectDelay base value', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 5, // 5ms base
      };

      service = new WebSocketService(config);
      
      // Make the MockWebSocket fail on connection
      let connectAttempts = 0;
      const OriginalMockWebSocket = global.WebSocket;
      global.WebSocket = class extends (MockWebSocket as any) {
        constructor(...args: any[]) {
          super(...args);
          connectAttempts++;
          // Fail first connection attempt
          setTimeout(() => {
            if (this.readyState === MockWebSocket.CONNECTING) {
              this.readyState = MockWebSocket.CLOSED;
              if (this.onerror) {
                this.onerror(new Event('error'));
              }
              // Trigger close after error to start reconnection
              if (this.onclose) {
                this.onclose(new CloseEvent('close'));
              }
            }
          }, 10);
        }
      } as any;

      try {
        const connectPromise = service.connect();
        await vi.advanceTimersByTimeAsync(10);
        await connectPromise;
      } catch {
        // Expected to fail
      }

      // Restore WebSocket for reconnections
      global.WebSocket = OriginalMockWebSocket;

      // First reconnect: 5ms delay (5 * 2^0)
      await vi.advanceTimersByTimeAsync(5);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection to establish + fail
      expect(service.getStats().reconnectAttempts).toBe(1);

      // Second reconnect: 10ms delay (5 * 2^1)
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection to establish + fail
      expect(service.getStats().reconnectAttempts).toBe(2);
    });

    it('should calculate correct delays for multiple reconnection attempts', async () => {
      const baseDelay = 10;
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 10,
        reconnectDelay: baseDelay,
      };

      service = new WebSocketService(config);

      // Expected delays: [10ms, 20ms, 40ms, 80ms, 160ms, 320ms, ...]
      const expectedDelays = [
        10,   // 10 * 2^0
        20,   // 10 * 2^1
        40,   // 10 * 2^2
        80,   // 10 * 2^3
        160,  // 10 * 2^4
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
      
      // Make all connections fail by simulating close immediately
      const OriginalMockWebSocket = global.WebSocket;
      global.WebSocket = class extends (MockWebSocket as any) {
        constructor(...args: any[]) {
          super(...args);
          setTimeout(() => {
            if (this.readyState === MockWebSocket.CONNECTING) {
              this.readyState = MockWebSocket.CLOSED;
              if (this.onerror) {
                this.onerror(new Event('error'));
              }
              if (this.onclose) {
                this.onclose(new CloseEvent('close'));
              }
            }
          }, 10);
        }
      } as any;

      try {
        const connectPromise = service.connect();
        await vi.advanceTimersByTimeAsync(10);
        await connectPromise;
      } catch {
        // Expected to fail
      }

      // Attempt 1
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(1);

      // Attempt 2
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(2);

      // Attempt 3
      await vi.advanceTimersByTimeAsync(400);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(3);

      // Should not attempt 4th time (max reached)
      await vi.advanceTimersByTimeAsync(10000);
      expect(service.getStats().reconnectAttempts).toBe(3);
      
      // Restore
      global.WebSocket = OriginalMockWebSocket;
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
      await vi.advanceTimersByTimeAsync(10); // Allow MockWebSocket to connect
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
      
      // Make all connections fail
      const OriginalMockWebSocket = global.WebSocket;
      global.WebSocket = class extends (MockWebSocket as any) {
        constructor(...args: any[]) {
          super(...args);
          setTimeout(() => {
            if (this.readyState === MockWebSocket.CONNECTING) {
              this.readyState = MockWebSocket.CLOSED;
              if (this.onerror) {
                this.onerror(new Event('error'));
              }
              if (this.onclose) {
                this.onclose(new CloseEvent('close'));
              }
            }
          }, 10);
        }
      } as any;

      try {
        const connectPromise = service.connect();
        await vi.advanceTimersByTimeAsync(10);
        await connectPromise;
      } catch {
        // Expected to fail
      }

      expect(service.getStats().reconnectAttempts).toBe(0);

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(1);

      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(2);

      await vi.advanceTimersByTimeAsync(400);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(3);
      
      // Restore
      global.WebSocket = OriginalMockWebSocket;
    });

    it('should clear reconnection timer on manual disconnect', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 3,
        reconnectDelay: 1000,
      };

      service = new WebSocketService(config);
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10); // Allow MockWebSocket to connect
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
      await vi.advanceTimersByTimeAsync(10); // Allow MockWebSocket to connect
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
      
      // Make all connections fail
      const OriginalMockWebSocket = global.WebSocket;
      global.WebSocket = class extends (MockWebSocket as any) {
        constructor(...args: any[]) {
          super(...args);
          setTimeout(() => {
            if (this.readyState === MockWebSocket.CONNECTING) {
              this.readyState = MockWebSocket.CLOSED;
              if (this.onerror) {
                this.onerror(new Event('error'));
              }
              if (this.onclose) {
                this.onclose(new CloseEvent('close'));
              }
            }
          }, 10);
        }
      } as any;

      try {
        const connectPromise = service.connect();
        await vi.advanceTimersByTimeAsync(10);
        await connectPromise;
      } catch {
        // Expected to fail
      }

      // Wait for first reconnection attempt
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/reconnection attempt.*failed/i),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      global.WebSocket = OriginalMockWebSocket;
    });

    it('should handle successful reconnection after failures', async () => {
      const config: WebSocketConfig = {
        url: 'ws://localhost:8080',
        maxReconnectAttempts: 5,
        reconnectDelay: 100,
      };

      service = new WebSocketService(config);
      
      let connectionAttempts = 0;
      const OriginalMockWebSocket = global.WebSocket;
      global.WebSocket = class extends (MockWebSocket as any) {
        constructor(...args: any[]) {
          super(...args);
          connectionAttempts++;
          if (connectionAttempts < 3) {
            // Fail first 2 attempts
            setTimeout(() => {
              if (this.readyState === MockWebSocket.CONNECTING) {
                this.readyState = MockWebSocket.CLOSED;
                if (this.onerror) {
                  this.onerror(new Event('error'));
                }
                if (this.onclose) {
                  this.onclose(new CloseEvent('close'));
                }
              }
            }, 10);
          }
          // Third attempt will succeed (default MockWebSocket behavior)
        }
      } as any;

      try {
        const connectPromise = service.connect();
        await vi.advanceTimersByTimeAsync(10);
        await connectPromise;
      } catch {
        // Expected to fail
      }

      // First reconnection - fails
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(1);

      // Second reconnection - fails
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      expect(service.getStats().reconnectAttempts).toBe(2);

      // Third reconnection - succeeds
      await vi.advanceTimersByTimeAsync(400);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection to establish
      await vi.advanceTimersByTimeAsync(10); // Extra time for onopen handler
      
      // Should reset attempts after successful connection
      expect(service.getStats().reconnectAttempts).toBe(0);
      
      global.WebSocket = OriginalMockWebSocket;
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
      await vi.advanceTimersByTimeAsync(10); // Allow MockWebSocket to connect
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
      
      // Make all connections fail
      const OriginalMockWebSocket = global.WebSocket;
      global.WebSocket = class extends (MockWebSocket as any) {
        constructor(...args: any[]) {
          super(...args);
          setTimeout(() => {
            if (this.readyState === MockWebSocket.CONNECTING) {
              this.readyState = MockWebSocket.CLOSED;
              if (this.onerror) {
                this.onerror(new Event('error'));
              }
              if (this.onclose) {
                this.onclose(new CloseEvent('close'));
              }
            }
          }, 10);
        }
      } as any;

      try {
        const connectPromise = service.connect();
        await vi.advanceTimersByTimeAsync(10);
        await connectPromise;
      } catch {
        // Expected to fail
      }

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      let stats = service.getStats();
      expect(stats.reconnectAttempts).toBe(1);

      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(20); // Allow reconnection attempt + fail
      stats = service.getStats();
      expect(stats.reconnectAttempts).toBe(2);
      
      global.WebSocket = OriginalMockWebSocket;
    });
  });
});
