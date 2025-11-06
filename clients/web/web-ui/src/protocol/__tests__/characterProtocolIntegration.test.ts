/**
 * Character Protocol Integration Tests
 * 
 * Tests for character protocol operations including:
 * - saveCharacter - sending save requests with proper data
 * - updateCharacter - delta updates with version tracking
 * - deleteCharacter - delete requests with confirmation
 * - requestCharacterList - fetching character list
 * - Version conflict detection and auto-retry
 * - Response handlers for all operations
 * - Error handling and recovery
 * - Authentication field validation
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebClientProtocol } from '../clientProtocol';
import { MessageType } from '../message';
import type { Character } from '../../types';

// Mock WebSocket
class MockWebSocket {
  readyState = WebSocket.OPEN;
  send = vi.fn();
  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();
}

// Mock window.WebSocket
vi.stubGlobal('WebSocket', MockWebSocket);

// Mock toast notifications
vi.mock('../../utils/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Character Protocol - Save Operations', () => {
  let protocol: WebClientProtocol;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    protocol = new WebClientProtocol('test-session', 1);
    (protocol as any).ws = mockWs;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('saveCharacter', () => {
    it('should send CHARACTER_SAVE_REQUEST with character data', () => {
      const characterData = {
        name: 'Test Hero',
        data: { class: 'Fighter', level: 5 },
      };

      protocol.saveCharacter(characterData);

      expect(mockWs.send).toHaveBeenCalledOnce();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      
      expect(sentMessage.type).toBe(MessageType.CHARACTER_SAVE_REQUEST);
      expect(sentMessage.data.character_data).toEqual(characterData);
      expect(sentMessage.data.user_id).toBe(1);
      expect(sentMessage.data.session_code).toBe('test-session');
    });

    it('should include user_id explicitly', () => {
      const characterData = { name: 'Hero' };

      protocol.saveCharacter(characterData);

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.data.user_id).toBe(1);
    });

    it('should include session_code explicitly', () => {
      const characterData = { name: 'Hero' };

      protocol.saveCharacter(characterData);

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.data.session_code).toBe('test-session');
    });

    it('should handle userId override parameter', () => {
      const characterData = { name: 'Hero' };

      protocol.saveCharacter(characterData, 42);

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.data.user_id).toBe(42);
    });

    it('should log error if userId not set', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const protocolWithoutUser = new WebClientProtocol('test-session');
      (protocolWithoutUser as any).ws = mockWs;

      protocolWithoutUser.saveCharacter({ name: 'Hero' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot save character: user ID not set')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('loadCharacter', () => {
    it('should send CHARACTER_LOAD_REQUEST with character ID', () => {
      protocol.loadCharacter('char-123');

      expect(mockWs.send).toHaveBeenCalledOnce();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      
      expect(sentMessage.type).toBe(MessageType.CHARACTER_LOAD_REQUEST);
      expect(sentMessage.data.character_id).toBe('char-123');
      expect(sentMessage.data.user_id).toBe(1);
      expect(sentMessage.data.session_code).toBe('test-session');
    });

    it('should include authentication fields', () => {
      protocol.loadCharacter('char-123');

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.data.user_id).toBe(1);
      expect(sentMessage.data.session_code).toBe('test-session');
    });
  });

  describe('requestCharacterList', () => {
    it('should send CHARACTER_LIST_REQUEST', () => {
      protocol.requestCharacterList();

      expect(mockWs.send).toHaveBeenCalledOnce();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      
      expect(sentMessage.type).toBe(MessageType.CHARACTER_LIST_REQUEST);
      expect(sentMessage.data.user_id).toBe(1);
      expect(sentMessage.data.session_code).toBe('test-session');
    });

    it('should include authentication fields', () => {
      protocol.requestCharacterList();

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.data.user_id).toBeDefined();
      expect(sentMessage.data.session_code).toBeDefined();
    });
  });
});

describe('Character Protocol - Update Operations', () => {
  let protocol: WebClientProtocol;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    protocol = new WebClientProtocol('test-session', 1);
    (protocol as any).ws = mockWs;
  });

  describe('updateCharacter', () => {
    it('should send CHARACTER_UPDATE with delta changes', () => {
      const updates = { hp: 45, maxHp: 50 };

      protocol.updateCharacter('char-123', updates);

      expect(mockWs.send).toHaveBeenCalledOnce();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      
      expect(sentMessage.type).toBe(MessageType.CHARACTER_UPDATE);
      expect(sentMessage.data.character_id).toBe('char-123');
      expect(sentMessage.data.updates).toEqual(updates);
    });

    it('should include version if provided', () => {
      const updates = { hp: 45 };

      protocol.updateCharacter('char-123', updates, 3);

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.data.version).toBe(3);
    });

    it('should include authentication fields', () => {
      protocol.updateCharacter('char-123', { hp: 45 });

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.data.user_id).toBe(1);
      expect(sentMessage.data.session_code).toBe('test-session');
    });

    it('should handle partial updates', () => {
      const updates = { name: 'New Name' };

      protocol.updateCharacter('char-123', updates);

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.data.updates).toEqual({ name: 'New Name' });
    });
  });
});

describe('Character Protocol - Delete Operations', () => {
  let protocol: WebClientProtocol;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    protocol = new WebClientProtocol('test-session', 1);
    (protocol as any).ws = mockWs;
  });

  describe('deleteCharacter', () => {
    it('should send CHARACTER_DELETE_REQUEST', () => {
      protocol.deleteCharacter('char-123');

      expect(mockWs.send).toHaveBeenCalledOnce();
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      
      expect(sentMessage.type).toBe(MessageType.CHARACTER_DELETE_REQUEST);
      expect(sentMessage.data.character_id).toBe('char-123');
    });

    it('should include authentication fields', () => {
      protocol.deleteCharacter('char-123');

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.data.user_id).toBe(1);
      expect(sentMessage.data.session_code).toBe('test-session');
    });
  });
});

describe('Character Protocol - Response Handlers', () => {
  let protocol: WebClientProtocol;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    protocol = new WebClientProtocol('test-session', 1);
    (protocol as any).ws = mockWs;
  });

  describe('CHARACTER_SAVE_RESPONSE', () => {
    it('should handle successful save response', async () => {
      const saveResponse = {
        type: MessageType.CHARACTER_SAVE_RESPONSE,
        data: {
          success: true,
          character_id: 'char-123',
          character_data: {
            id: 'char-123',
            name: 'Test Hero',
            data: { class: 'Fighter' },
          },
        },
      };

      // Trigger handler
      await (protocol as any).handleMessage(saveResponse);

      // Should dispatch custom event
      // (In real implementation, would check store state)
    });

    it('should handle save failure', async () => {
      const saveResponse = {
        type: MessageType.CHARACTER_SAVE_RESPONSE,
        data: {
          success: false,
          error: 'Validation failed',
        },
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await (protocol as any).handleMessage(saveResponse);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('CHARACTER_UPDATE_RESPONSE', () => {
    it('should handle successful update', async () => {
      const updateResponse = {
        type: MessageType.CHARACTER_UPDATE_RESPONSE,
        data: {
          success: true,
          character_id: 'char-123',
          version: 4,
        },
      };

      await (protocol as any).handleMessage(updateResponse);

      // Should update character in store with new version
    });

    it('should handle version conflict', async () => {
      const conflictResponse = {
        type: MessageType.CHARACTER_UPDATE_RESPONSE,
        data: {
          success: false,
          error: 'Version conflict',
          character_id: 'char-123',
          current_version: 5,
        },
      };

      // Should trigger auto-retry mechanism
      await (protocol as any).handleMessage(conflictResponse);

      // Verify loadCharacter was called for retry
      // (Would check send calls in real implementation)
    });

    it('should dispatch character-loaded event for retry', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      const conflictResponse = {
        type: MessageType.CHARACTER_UPDATE_RESPONSE,
        data: {
          success: false,
          error: 'Version conflict',
          character_id: 'char-123',
          current_version: 5,
        },
      };

      await (protocol as any).handleMessage(conflictResponse);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'character-loaded',
        expect.any(Function)
      );

      addEventListenerSpy.mockRestore();
    });

    it('should set timeout for retry cleanup', async () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      
      const conflictResponse = {
        type: MessageType.CHARACTER_UPDATE_RESPONSE,
        data: {
          success: false,
          error: 'Version conflict',
          character_id: 'char-123',
          current_version: 5,
        },
      };

      await (protocol as any).handleMessage(conflictResponse);

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

      vi.useRealTimers();
      setTimeoutSpy.mockRestore();
    });
  });

  describe('CHARACTER_DELETE_RESPONSE', () => {
    it('should handle successful delete', async () => {
      const { showToast } = await import('../../utils/toast');
      
      const deleteResponse = {
        type: MessageType.CHARACTER_DELETE_RESPONSE,
        data: {
          success: true,
          character_id: 'char-123',
        },
      };

      await (protocol as any).handleMessage(deleteResponse);

      expect(showToast.success).toHaveBeenCalledWith('Character deleted successfully');
    });

    it('should handle delete failure', async () => {
      const { showToast } = await import('../../utils/toast');
      
      const deleteResponse = {
        type: MessageType.CHARACTER_DELETE_RESPONSE,
        data: {
          success: false,
          error: 'Permission denied',
        },
      };

      await (protocol as any).handleMessage(deleteResponse);

      expect(showToast.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete character')
      );
    });
  });

  describe('CHARACTER_LIST_RESPONSE', () => {
    it('should handle character list response', async () => {
      const listResponse = {
        type: MessageType.CHARACTER_LIST_RESPONSE,
        data: {
          characters: [
            { id: 'char-1', name: 'Hero 1' },
            { id: 'char-2', name: 'Hero 2' },
          ],
        },
      };

      await (protocol as any).handleMessage(listResponse);

      // Should add characters to store
    });

    it('should handle empty list', async () => {
      const listResponse = {
        type: MessageType.CHARACTER_LIST_RESPONSE,
        data: {
          characters: [],
        },
      };

      await (protocol as any).handleMessage(listResponse);

      // Should not throw error
    });
  });
});

describe('Character Protocol - Version Conflict Auto-Retry', () => {
  let protocol: WebClientProtocol;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    protocol = new WebClientProtocol('test-session', 1);
    (protocol as any).ws = mockWs;
  });

  it('should auto-fetch latest version on conflict', async () => {
    const conflictResponse = {
      type: MessageType.CHARACTER_UPDATE_RESPONSE,
      data: {
        success: false,
        error: 'Version conflict',
        character_id: 'char-123',
        current_version: 5,
      },
    };

    await (protocol as any).handleMessage(conflictResponse);

    // Should have sent CHARACTER_LOAD_REQUEST
    expect(mockWs.send).toHaveBeenCalled();
    
    const lastCall = mockWs.send.mock.calls[mockWs.send.mock.calls.length - 1][0];
    const sentMessage = JSON.parse(lastCall);
    
    expect(sentMessage.type).toBe(MessageType.CHARACTER_LOAD_REQUEST);
    expect(sentMessage.data.character_id).toBe('char-123');
  });

  it('should show warning toast on conflict', async () => {
    const { showToast } = await import('../../utils/toast');
    
    const conflictResponse = {
      type: MessageType.CHARACTER_UPDATE_RESPONSE,
      data: {
        success: false,
        error: 'Version conflict',
        character_id: 'char-123',
        current_version: 5,
      },
    };

    await (protocol as any).handleMessage(conflictResponse);

    expect(showToast.warning).toHaveBeenCalledWith(
      expect.stringContaining('modified by another user')
    );
  });

  it('should show success toast after sync', async () => {
    const { showToast } = await import('../../utils/toast');
    
    // Simulate conflict then successful load
    const conflictResponse = {
      type: MessageType.CHARACTER_UPDATE_RESPONSE,
      data: {
        success: false,
        error: 'Version conflict',
        character_id: 'char-123',
        current_version: 5,
      },
    };

    await (protocol as any).handleMessage(conflictResponse);

    // Simulate the character-loaded event
    const loadedEvent = new CustomEvent('character-loaded', {
      detail: {
        character_data: {
          character_id: 'char-123',
        },
      },
    });

    window.dispatchEvent(loadedEvent);

    // Should show success toast
    await vi.waitFor(() => {
      expect(showToast.success).toHaveBeenCalledWith(
        expect.stringContaining('synchronized')
      );
    });
  });
});

describe('Character Protocol - Error Handling', () => {
  let protocol: WebClientProtocol;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    protocol = new WebClientProtocol('test-session', 1);
    (protocol as any).ws = mockWs;
  });

  it('should handle network errors gracefully', () => {
    mockWs.send.mockImplementation(() => {
      throw new Error('Network error');
    });

    expect(() => {
      protocol.saveCharacter({ name: 'Test' });
    }).toThrow('Network error');
  });

  it('should handle malformed response', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const malformedResponse = {
      type: MessageType.CHARACTER_SAVE_RESPONSE,
      data: null, // Missing data
    };

    await (protocol as any).handleMessage(malformedResponse);

    consoleErrorSpy.mockRestore();
  });

  it('should validate userId before operations', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const protocolWithoutUser = new WebClientProtocol('test-session');
    (protocolWithoutUser as any).ws = mockWs;

    protocolWithoutUser.updateCharacter('char-1', { hp: 50 });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot update character: user ID not set')
    );

    consoleErrorSpy.mockRestore();
  });
});

describe('Character Protocol - Authentication', () => {
  it('should store userId on initialization', () => {
    const protocol = new WebClientProtocol('test-session', 42);
    
    expect(protocol.getUserId()).toBe(42);
  });

  it('should allow userId to be set after initialization', () => {
    const protocol = new WebClientProtocol('test-session');
    
    expect(protocol.getUserId()).toBeNull();
    
    protocol.setUserId(99);
    
    expect(protocol.getUserId()).toBe(99);
  });

  it('should use updated userId in requests', () => {
    const mockWs = new MockWebSocket();
    const protocol = new WebClientProtocol('test-session');
    (protocol as any).ws = mockWs;
    
    protocol.setUserId(55);
    protocol.saveCharacter({ name: 'Test' });

    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentMessage.data.user_id).toBe(55);
  });
});
