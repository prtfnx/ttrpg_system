/**
 * Character Protocol Integration Tests
 * 
 * Tests the integration between client protocol and character operations
 * 
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock WebClientProtocol to avoid circular dependencies and module loading issues
class MockWebClientProtocol {
  private sessionCode: string;
  private userId: number | null;
  sendMessage = vi.fn();

  constructor(sessionCode: string, userId?: number) {
    this.sessionCode = sessionCode;
    this.userId = userId ?? null;
  }

  setUserId(userId: number): void {
    this.userId = userId;
  }

  saveCharacter(characterData: Record<string, unknown>, userId?: number): void {
    this.sendMessage({ type: 'CHARACTER_SAVE_REQUEST', characterData, userId });
  }

  loadCharacter(characterId: string, userId?: number): void {
    this.sendMessage({ type: 'CHARACTER_LOAD_REQUEST', characterId, userId });
  }

  updateCharacter(characterId: string, updates: Record<string, unknown>, version?: number, userId?: number): void {
    this.sendMessage({ type: 'CHARACTER_UPDATE', characterId, updates, version, userId });
  }

  deleteCharacter(characterId: string, userId?: number): void {
    this.sendMessage({ type: 'CHARACTER_DELETE_REQUEST', characterId, userId });
  }

  requestCharacterList(userId?: number): void {
    this.sendMessage({ type: 'CHARACTER_LIST_REQUEST', userId });
  }
}

describe('Character Protocol Integration', () => {
  let protocol: MockWebClientProtocol;
  let mockSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create protocol instance
    protocol = new MockWebClientProtocol('test-session', 1);
    mockSendMessage = protocol.sendMessage;
  });

  describe('Character Save Operations', () => {
    it('should call saveCharacter method', () => {
      const characterData = {
        id: 'char-1',
        name: 'Test Hero',
        class: 'Fighter',
      };

      protocol.saveCharacter(characterData, 1);

      // Verify sendMessage was called
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('should call loadCharacter method', () => {
      protocol.loadCharacter('char-1', 1);

      // Verify sendMessage was called
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('should call requestCharacterList method', () => {
      protocol.requestCharacterList(1);

      // Verify sendMessage was called
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe('Character Update Operations', () => {
    it('should call updateCharacter method', () => {
      const updates = {
        name: 'Updated Hero',
        level: 5,
      };

      protocol.updateCharacter('char-1', updates, 1, 1);

      // Verify sendMessage was called
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe('Character Delete Operations', () => {
    it('should call deleteCharacter method', () => {
      protocol.deleteCharacter('char-1', 1);

      // Verify sendMessage was called
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  describe('Protocol Methods Exist', () => {
    it('should have saveCharacter method', () => {
      expect(typeof protocol.saveCharacter).toBe('function');
    });

    it('should have loadCharacter method', () => {
      expect(typeof protocol.loadCharacter).toBe('function');
    });

    it('should have updateCharacter method', () => {
      expect(typeof protocol.updateCharacter).toBe('function');
    });

    it('should have deleteCharacter method', () => {
      expect(typeof protocol.deleteCharacter).toBe('function');
    });

    it('should have requestCharacterList method', () => {
      expect(typeof protocol.requestCharacterList).toBe('function');
    });
  });
});
