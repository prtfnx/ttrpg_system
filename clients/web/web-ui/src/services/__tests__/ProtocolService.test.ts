/**
 * ProtocolService Tests
 * Tests singleton WebSocket protocol manager
 * 
 * Features tested:
 * 1. Singleton pattern behavior
 * 2. Protocol initialization lifecycle
 * 3. Error handling for uninitialized protocol
 * 4. Protocol replacement
 * 5. Protocol clearing
 * 
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtocolService } from '../ProtocolService';

// Create a minimal mock WebClientProtocol to avoid dependency chain
interface MockWebClientProtocol {
  id?: string;
  name?: string;
  version?: number;
  isReady?: boolean;
}

describe('ProtocolService - Singleton Pattern', () => {
  beforeEach(() => {
    // Clear protocol before each test
    ProtocolService.clearProtocol();
  });

  describe('Initialization', () => {
    it('should start with no protocol instance', () => {
      expect(ProtocolService.hasProtocol()).toBe(false);
    });

    it('should throw error when getting uninitialized protocol', () => {
      expect(() => ProtocolService.getProtocol()).toThrow('Protocol not initialized');
    });

    it('should set protocol successfully', () => {
      const mockProtocol = {} as any;
      
      ProtocolService.setProtocol(mockProtocol);
      
      expect(ProtocolService.hasProtocol()).toBe(true);
      expect(ProtocolService.getProtocol()).toBe(mockProtocol);
    });
  });

  describe('Protocol Lifecycle', () => {
    it('should return same instance on multiple getProtocol calls', () => {
      const mockProtocol = {} as any;
      ProtocolService.setProtocol(mockProtocol);
      
      const instance1 = ProtocolService.getProtocol();
      const instance2 = ProtocolService.getProtocol();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBe(mockProtocol);
    });

    it('should replace protocol when setProtocol called again', () => {
      const mockProtocol1 = { id: 'protocol-1' } as any;
      const mockProtocol2 = { id: 'protocol-2' } as any;
      
      ProtocolService.setProtocol(mockProtocol1);
      expect(ProtocolService.getProtocol()).toBe(mockProtocol1);
      
      ProtocolService.setProtocol(mockProtocol2);
      expect(ProtocolService.getProtocol()).toBe(mockProtocol2);
      expect(ProtocolService.getProtocol()).not.toBe(mockProtocol1);
    });

    it('should clear protocol successfully', () => {
      const mockProtocol = {} as any;
      ProtocolService.setProtocol(mockProtocol);
      
      expect(ProtocolService.hasProtocol()).toBe(true);
      
      ProtocolService.clearProtocol();
      
      expect(ProtocolService.hasProtocol()).toBe(false);
      expect(() => ProtocolService.getProtocol()).toThrow('Protocol not initialized');
    });

    it('should be safe to clear protocol multiple times', () => {
      const mockProtocol = {} as any;
      ProtocolService.setProtocol(mockProtocol);
      
      ProtocolService.clearProtocol();
      ProtocolService.clearProtocol();
      ProtocolService.clearProtocol();
      
      expect(ProtocolService.hasProtocol()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw descriptive error for uninitialized protocol', () => {
      expect(() => ProtocolService.getProtocol()).toThrow('Protocol not initialized');
    });

    it('should throw error after clearing protocol', () => {
      const mockProtocol = {} as WebClientProtocol;
      ProtocolService.setProtocol(mockProtocol);
      ProtocolService.clearProtocol();
      
      expect(() => ProtocolService.getProtocol()).toThrow('Protocol not initialized');
    });
  });

  describe('hasProtocol Check', () => {
    it('should return false initially', () => {
      expect(ProtocolService.hasProtocol()).toBe(false);
    });

    it('should return true after setting protocol', () => {
      const mockProtocol = {} as WebClientProtocol;
      ProtocolService.setProtocol(mockProtocol);
      
      expect(ProtocolService.hasProtocol()).toBe(true);
    });

    it('should return false after clearing protocol', () => {
      const mockProtocol = {} as WebClientProtocol;
      ProtocolService.setProtocol(mockProtocol);
      ProtocolService.clearProtocol();
      
      expect(ProtocolService.hasProtocol()).toBe(false);
    });

    it('should return true after protocol replacement', () => {
      const mockProtocol1 = {} as any;
      const mockProtocol2 = {} as any;
      
      ProtocolService.setProtocol(mockProtocol1);
      ProtocolService.setProtocol(mockProtocol2);
      
      expect(ProtocolService.hasProtocol()).toBe(true);
    });
  });

  describe('Singleton Behavior', () => {
    it('should maintain single instance across operations', () => {
      const mockProtocol = { name: 'TestProtocol' } as any;
      
      ProtocolService.setProtocol(mockProtocol);
      
      const retrieved1 = ProtocolService.getProtocol();
      const retrieved2 = ProtocolService.getProtocol();
      const retrieved3 = ProtocolService.getProtocol();
      
      expect(retrieved1).toBe(mockProtocol);
      expect(retrieved2).toBe(mockProtocol);
      expect(retrieved3).toBe(mockProtocol);
      expect(retrieved1).toBe(retrieved2);
      expect(retrieved2).toBe(retrieved3);
    });

    it('should allow protocol initialization -> use -> clear -> re-initialize cycle', () => {
      const mockProtocol1 = { version: 1 } as any;
      const mockProtocol2 = { version: 2 } as any;
      
      // First cycle
      ProtocolService.setProtocol(mockProtocol1);
      expect(ProtocolService.getProtocol()).toBe(mockProtocol1);
      ProtocolService.clearProtocol();
      expect(ProtocolService.hasProtocol()).toBe(false);
      
      // Second cycle
      ProtocolService.setProtocol(mockProtocol2);
      expect(ProtocolService.getProtocol()).toBe(mockProtocol2);
      expect(ProtocolService.hasProtocol()).toBe(true);
    });
  });

  describe('Real-World Usage Patterns', () => {
    it('should support checking hasProtocol before getProtocol (defensive pattern)', () => {
      // Defensive pattern used in components
      if (ProtocolService.hasProtocol()) {
        const protocol = ProtocolService.getProtocol();
        expect(protocol).toBeDefined();
      } else {
        expect(ProtocolService.hasProtocol()).toBe(false);
      }
      
      // Should not throw
      expect(() => {
        if (ProtocolService.hasProtocol()) {
          ProtocolService.getProtocol();
        }
      }).not.toThrow();
    });

    it('should support protocol initialization in setup phase', () => {
      // Simulate application startup
      expect(ProtocolService.hasProtocol()).toBe(false);
      
      const protocol = { isReady: true } as any;
      ProtocolService.setProtocol(protocol);
      
      // Now components can use it
      expect(ProtocolService.hasProtocol()).toBe(true);
      expect(ProtocolService.getProtocol()).toBe(protocol);
    });

    it('should support protocol cleanup on disconnect', () => {
      const protocol = {} as any;
      ProtocolService.setProtocol(protocol);
      
      // Simulate disconnect
      ProtocolService.clearProtocol();
      
      // Protocol should be cleared
      expect(ProtocolService.hasProtocol()).toBe(false);
      expect(() => ProtocolService.getProtocol()).toThrow();
    });
  });
});
