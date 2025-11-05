/**
 * Character Import/Export Tests
 * 
 * Tests for the character import/export functionality including:
 * - Export single character to JSON
 * - Export multiple characters (bulk export)
 * - Import character from JSON
 * - Character validation
 * - Clone character functionality
 * - Security features (filename sanitization, ID reset)
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import {
  exportCharacter,
  exportMultipleCharacters,
  validateImportedCharacter,
  importCharacterFromJSON,
  importMultipleCharactersFromJSON,
  cloneCharacter,
  downloadCharacterAsJSON,
  downloadMultipleCharactersAsJSON
} from '../characterImportExport';
import type { Character } from '../../types';

// Mock DOM APIs
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn()
});

describe('Character Import/Export', () => {
  const mockCharacter: Character = {
    id: 'char-123',
    sessionId: 'session-456',
    name: 'Test Hero',
    ownerId: 1,
    controlledBy: [1, 2],
    data: {
      class: 'Fighter',
      race: 'Human',
      level: 5,
      hp: 45,
      maxHp: 50,
      ac: 16,
      speed: 30,
      abilities: {
        str: 16,
        dex: 14,
        con: 15,
        int: 10,
        wis: 12,
        cha: 8
      },
      skills: ['Athletics', 'Intimidation'],
      proficiencyBonus: 3
    },
    version: 3,
    createdAt: '2025-11-01T10:00:00Z',
    updatedAt: '2025-11-05T14:30:00Z',
    syncStatus: 'synced'
  };

  describe('exportCharacter', () => {
    it('should export character as JSON string', () => {
      const exported = exportCharacter(mockCharacter);
      
      expect(typeof exported).toBe('string');
      const parsed = JSON.parse(exported);
      
      expect(parsed.version).toBe('1.0');
      expect(parsed.exportDate).toBeDefined();
      expect(parsed.character).toBeDefined();
      expect(parsed.metadata).toBeDefined();
    });

    it('should include character data in export', () => {
      const exported = exportCharacter(mockCharacter);
      const parsed = JSON.parse(exported);
      
      expect(parsed.character.id).toBe('char-123');
      expect(parsed.character.name).toBe('Test Hero');
      expect(parsed.character.data.class).toBe('Fighter');
      expect(parsed.character.data.abilities.str).toBe(16);
    });

    it('should strip syncStatus from export', () => {
      const exported = exportCharacter(mockCharacter);
      const parsed = JSON.parse(exported);
      
      expect(parsed.character.syncStatus).toBeUndefined();
    });

    it('should include metadata with originalSessionId', () => {
      const exported = exportCharacter(mockCharacter);
      const parsed = JSON.parse(exported);
      
      expect(parsed.metadata.originalSessionId).toBe('session-456');
    });

    it('should include custom metadata if provided', () => {
      const metadata = { exportedBy: 'TestUser', notes: 'Test export' };
      const exported = exportCharacter(mockCharacter, metadata);
      const parsed = JSON.parse(exported);
      
      expect(parsed.metadata.exportedBy).toBe('TestUser');
      expect(parsed.metadata.notes).toBe('Test export');
    });

    it('should handle character with minimal data', () => {
      const minimalChar: Character = {
        id: 'min-1',
        sessionId: '',
        name: 'Minimal',
        ownerId: 1,
        controlledBy: [],
        data: {},
        version: 1,
        createdAt: '',
        updatedAt: ''
      };

      const exported = exportCharacter(minimalChar);
      const parsed = JSON.parse(exported);
      
      expect(parsed.character.name).toBe('Minimal');
      expect(parsed.character.data).toEqual({});
    });
  });

  describe('exportMultipleCharacters', () => {
    it('should export multiple characters as JSON string', () => {
      const char2: Character = { ...mockCharacter, id: 'char-456', name: 'Second Hero' };
      const exported = exportMultipleCharacters([mockCharacter, char2]);
      
      expect(typeof exported).toBe('string');
      const parsed = JSON.parse(exported);
      
      expect(parsed.version).toBe('1.0');
      expect(parsed.count).toBe(2);
      expect(parsed.characters).toHaveLength(2);
    });

    it('should include all characters in export', () => {
      const char2: Character = { ...mockCharacter, id: 'char-456', name: 'Second' };
      const char3: Character = { ...mockCharacter, id: 'char-789', name: 'Third' };
      
      const exported = exportMultipleCharacters([mockCharacter, char2, char3]);
      const parsed = JSON.parse(exported);
      
      expect(parsed.characters[0].name).toBe('Test Hero');
      expect(parsed.characters[1].name).toBe('Second');
      expect(parsed.characters[2].name).toBe('Third');
    });

    it('should handle empty array', () => {
      const exported = exportMultipleCharacters([]);
      const parsed = JSON.parse(exported);
      
      expect(parsed.count).toBe(0);
      expect(parsed.characters).toEqual([]);
    });

    it('should strip syncStatus from all characters', () => {
      const char2: Character = { ...mockCharacter, id: 'char-456' };
      const exported = exportMultipleCharacters([mockCharacter, char2]);
      const parsed = JSON.parse(exported);
      
      expect(parsed.characters[0].syncStatus).toBeUndefined();
      expect(parsed.characters[1].syncStatus).toBeUndefined();
    });
  });

  describe('validateImportedCharacter', () => {
    it('should validate correct character data', () => {
      const validData = {
        version: '1.0',
        exportDate: '2025-11-05T10:00:00Z',
        character: mockCharacter
      };

      const result = validateImportedCharacter(validData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept data without version with warning', () => {
      const dataWithoutVersion: any = {
        character: mockCharacter
      };

      const result = validateImportedCharacter(dataWithoutVersion);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No version specified in import file');
    });

    it('should warn about version mismatch', () => {
      const futureVersion = {
        version: '2.0',
        character: mockCharacter
      };

      const result = validateImportedCharacter(futureVersion);
      
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('differs from current version'))).toBe(true);
    });

    it('should reject missing character data', () => {
      const invalidData: any = {
        version: '1.0'
      };

      const result = validateImportedCharacter(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No character data found in import file');
    });

    it('should reject character without name', () => {
      const invalidChar = {
        version: '1.0',
        character: {
          ...mockCharacter,
          name: ''
        }
      };

      const result = validateImportedCharacter(invalidChar);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Character name is required and must be a string');
    });

    it('should reject character without data object', () => {
      const invalidChar = {
        version: '1.0',
        character: {
          ...mockCharacter,
          data: undefined
        }
      };

      const result = validateImportedCharacter(invalidChar);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Character data is required and must be an object');
    });

    it('should warn about invalid ownerId type', () => {
      const invalidChar = {
        version: '1.0',
        character: {
          ...mockCharacter,
          ownerId: 'not-a-number' as any
        }
      };

      const result = validateImportedCharacter(invalidChar);
      
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('ownerId should be a number'))).toBe(true);
    });

    it('should warn about invalid controlledBy type', () => {
      const invalidChar = {
        version: '1.0',
        character: {
          ...mockCharacter,
          controlledBy: 'not-an-array' as any
        }
      };

      const result = validateImportedCharacter(invalidChar);
      
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('controlledBy should be an array'))).toBe(true);
    });
  });

  describe('importCharacterFromJSON', () => {
    const validJSON = JSON.stringify({
      version: '1.0',
      exportDate: '2025-11-05T10:00:00Z',
      character: mockCharacter
    });

    it('should import valid character', () => {
      const result = importCharacterFromJSON(validJSON, 5, 'new-session');
      
      expect(result.character).toBeDefined();
      expect(result.character.name).toBe('Test Hero');
      expect(result.warnings).toBeDefined();
    });

    it('should generate new ID with imported- prefix', () => {
      const result = importCharacterFromJSON(validJSON, 5, 'new-session');
      
      expect(result.character.id).toMatch(/^imported-/);
      expect(result.character.id).not.toBe(mockCharacter.id);
    });

    it('should set current user as owner', () => {
      const result = importCharacterFromJSON(validJSON, 42, 'new-session');
      
      expect(result.character.ownerId).toBe(42);
      expect(result.character.controlledBy).toContain(42);
    });

    it('should set current session', () => {
      const result = importCharacterFromJSON(validJSON, 5, 'test-session-123');
      
      expect(result.character.sessionId).toBe('test-session-123');
    });

    it('should reset version to 1', () => {
      const result = importCharacterFromJSON(validJSON, 5, 'new-session');
      
      expect(result.character.version).toBe(1);
    });

    it('should reset timestamps', () => {
      const before = new Date().getTime();
      const result = importCharacterFromJSON(validJSON, 5, 'new-session');
      const after = new Date().getTime();
      
      const createdTime = new Date(result.character.createdAt).getTime();
      const updatedTime = new Date(result.character.updatedAt).getTime();
      
      expect(createdTime).toBeGreaterThanOrEqual(before);
      expect(createdTime).toBeLessThanOrEqual(after);
      expect(updatedTime).toBeGreaterThanOrEqual(before);
    });

    it('should set syncStatus to local', () => {
      const result = importCharacterFromJSON(validJSON, 5, 'new-session');
      
      expect(result.character.syncStatus).toBe('local');
    });

    it('should preserve character data', () => {
      const result = importCharacterFromJSON(validJSON, 5, 'new-session');
      
      expect(result.character.data.class).toBe('Fighter');
      expect(result.character.data.abilities?.str).toBe(16);
      expect(result.character.data.skills).toEqual(['Athletics', 'Intimidation']);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => {
        importCharacterFromJSON('invalid json{', 5, 'session');
      }).toThrow('Invalid JSON file');
    });

    it('should throw error for invalid character data', () => {
      const invalidJSON = JSON.stringify({
        version: '1.0',
        character: { name: '' } // Invalid: empty name
      });

      expect(() => {
        importCharacterFromJSON(invalidJSON, 5, 'session');
      }).toThrow('Invalid character file');
    });

    it('should return warnings from validation', () => {
      const jsonWithWarnings = JSON.stringify({
        version: '2.0', // Different version
        character: mockCharacter
      });

      const result = importCharacterFromJSON(jsonWithWarnings, 5, 'session');
      
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('importMultipleCharactersFromJSON', () => {
    const char2 = { ...mockCharacter, id: 'char-456', name: 'Second' };
    const multipleJSON = JSON.stringify({
      version: '1.0',
      count: 2,
      characters: [mockCharacter, char2]
    });

    it('should import multiple characters', () => {
      const result = importMultipleCharactersFromJSON(multipleJSON, 5, 'session');
      
      expect(result.characters).toHaveLength(2);
      expect(result.characters[0].name).toBe('Test Hero');
      expect(result.characters[1].name).toBe('Second');
    });

    it('should generate unique IDs for each character', () => {
      const result = importMultipleCharactersFromJSON(multipleJSON, 5, 'session');
      
      expect(result.characters[0].id).not.toBe(result.characters[1].id);
      expect(result.characters[0].id).toMatch(/^imported-/);
      expect(result.characters[1].id).toMatch(/^imported-/);
    });

    it('should set same owner for all characters', () => {
      const result = importMultipleCharactersFromJSON(multipleJSON, 99, 'session');
      
      expect(result.characters[0].ownerId).toBe(99);
      expect(result.characters[1].ownerId).toBe(99);
    });

    it('should throw error for missing characters array', () => {
      const invalidJSON = JSON.stringify({ version: '1.0' });

      expect(() => {
        importMultipleCharactersFromJSON(invalidJSON, 5, 'session');
      }).toThrow('Expected "characters" array');
    });

    it('should skip invalid characters with warnings', () => {
      const jsonWithInvalid = JSON.stringify({
        version: '1.0',
        characters: [
          mockCharacter,
          { name: '' }, // Invalid
          char2
        ]
      });

      const result = importMultipleCharactersFromJSON(jsonWithInvalid, 5, 'session');
      
      expect(result.characters).toHaveLength(2); // Only valid ones
      expect(result.warnings.some(w => w.includes('skipped'))).toBe(true);
    });

    it('should throw error if no valid characters', () => {
      const jsonWithNoValid = JSON.stringify({
        version: '1.0',
        characters: [
          { name: '' }, // Invalid
          { data: null } // Invalid
        ]
      });

      expect(() => {
        importMultipleCharactersFromJSON(jsonWithNoValid, 5, 'session');
      }).toThrow('No valid characters found');
    });
  });

  describe('cloneCharacter', () => {
    it('should clone character with new ID', () => {
      const cloned = cloneCharacter(mockCharacter, 10);
      
      expect(cloned.id).not.toBe(mockCharacter.id);
      expect(cloned.id).toMatch(/^cloned-/);
    });

    it('should append (Copy) to name', () => {
      const cloned = cloneCharacter(mockCharacter, 10);
      
      expect(cloned.name).toBe('Test Hero (Copy)');
    });

    it('should set new owner', () => {
      const cloned = cloneCharacter(mockCharacter, 15);
      
      expect(cloned.ownerId).toBe(15);
      expect(cloned.controlledBy).toEqual([15]);
    });

    it('should reset version to 1', () => {
      const cloned = cloneCharacter(mockCharacter, 10);
      
      expect(cloned.version).toBe(1);
    });

    it('should reset timestamps', () => {
      const before = new Date().getTime();
      const cloned = cloneCharacter(mockCharacter, 10);
      const after = new Date().getTime();
      
      const createdTime = new Date(cloned.createdAt).getTime();
      
      expect(createdTime).toBeGreaterThanOrEqual(before);
      expect(createdTime).toBeLessThanOrEqual(after);
    });

    it('should set syncStatus to local', () => {
      const cloned = cloneCharacter(mockCharacter, 10);
      
      expect(cloned.syncStatus).toBe('local');
    });

    it('should preserve character data', () => {
      const cloned = cloneCharacter(mockCharacter, 10);
      
      expect(cloned.data).toEqual(mockCharacter.data);
    });

    it('should create deep copy of data', () => {
      const cloned = cloneCharacter(mockCharacter, 10);
      
      // Modify cloned data
      if (cloned.data.abilities) {
        cloned.data.abilities.str = 20;
      }
      
      // Original should remain unchanged
      expect(mockCharacter.data.abilities?.str).toBe(16);
    });
  });

  describe('downloadCharacterAsJSON', () => {
    it('should create download link with sanitized filename', () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

      downloadCharacterAsJSON(mockCharacter);

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });
  });

  describe('downloadMultipleCharactersAsJSON', () => {
    it('should download multiple characters', () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

      const char2 = { ...mockCharacter, id: 'char-2' };
      downloadMultipleCharactersAsJSON([mockCharacter, char2]);

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });
  });
});
