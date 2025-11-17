/**import { describe, it } from 'vitest';

 * Character Management Features Tests

 * describe.skip('Legacy tests', () => { it.skip('skip', () => {}); });

 * Integration tests for character management store operations
 * 
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store';
import type { Character } from '../types';
import {
    cloneCharacter,
    exportCharacter,
    exportMultipleCharacters,
    importCharacterFromJSON,
    importMultipleCharactersFromJSON
} from '../utils/characterImportExport';

describe('Character Management - Store Integration', () => {
  beforeEach(() => {
    // Reset store completely to avoid test pollution
    const initialState = useGameStore.getState();
    useGameStore.setState({
      ...initialState,
      characters: [],
      sprites: [],
      selectedSprites: [],
      sessionId: 'test-session'
    });
  });

  describe('Character CRUD Operations', () => {
    it('should add character to store', () => {
      const { result } = renderHook(() => useGameStore());
      
      const character: Character = {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Test Hero',
        ownerId: 1,
        controlledBy: [1],
        data: { class: 'Fighter' },
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      act(() => {
        result.current.addCharacter(character);
      });

      expect(result.current.characters).toHaveLength(1);
      expect(result.current.characters[0].name).toBe('Test Hero');
    });

    it('should update character in store', () => {
      const { result } = renderHook(() => useGameStore());
      
      const character: Character = {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Test Hero',
        ownerId: 1,
        controlledBy: [1],
        data: { class: 'Fighter', level: 1 },
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      act(() => {
        result.current.addCharacter(character);
      });

      act(() => {
        result.current.updateCharacter('char-1', {
          data: { class: 'Fighter', level: 2 },
        });
      });

      expect(result.current.characters[0].data.level).toBe(2);
    });

    it('should remove character from store', () => {
      const { result } = renderHook(() => useGameStore());
      
      const character: Character = {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Test Hero',
        ownerId: 1,
        controlledBy: [1],
        data: {},
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      act(() => {
        result.current.addCharacter(character);
      });

      expect(result.current.characters).toHaveLength(1);

      act(() => {
        result.current.removeCharacter('char-1');
      });

      expect(result.current.characters).toHaveLength(0);
    });
  });

  describe('Permission Checks', () => {
    it('should allow editing owned character', () => {
      const { result } = renderHook(() => useGameStore());
      
      const ownerCharacter: Character = {
        id: 'char-owned',
        sessionId: 'session-1',
        name: 'My Hero',
        ownerId: 1,
        controlledBy: [1],
        data: {},
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      act(() => {
        result.current.addCharacter(ownerCharacter);
      });

      const canEdit = result.current.canEditCharacter(ownerCharacter.id, 1);
      expect(canEdit).toBe(true);
    });

    it('should not allow editing non-owned character', () => {
      const { result } = renderHook(() => useGameStore());
      
      const otherCharacter: Character = {
        id: 'char-other',
        sessionId: 'session-1',
        name: 'Other Hero',
        ownerId: 2,
        controlledBy: [2],
        data: {},
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      act(() => {
        result.current.addCharacter(otherCharacter);
      });

      const canEdit = result.current.canEditCharacter(otherCharacter.id, 1);
      expect(canEdit).toBe(false);
    });

    it('should allow controlling sprite for controlled character', () => {
      const { result } = renderHook(() => useGameStore());
      
      const character: Character = {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Test Hero',
        ownerId: 1,
        controlledBy: [1, 2],
        data: {},
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const sprite = {
        id: 'sprite-1',
        name: 'Hero Token',
        tableId: 'table-1',
        characterId: 'char-1',
        controlledBy: ['1', '2'],
        x: 0,
        y: 0,
        layer: 'tokens' as const,
        texture: 'hero.png',
        scale: { x: 1, y: 1 },
        rotation: 0,
        syncStatus: 'local' as const,
      };

      act(() => {
        result.current.addCharacter(character);
        result.current.addSprite(sprite);
      });

      const canControl = result.current.canControlSprite(sprite.id, 2);
      expect(canControl).toBe(true);
    });
  });

  describe('Character Cloning Integration', () => {
    it('should clone and add to store', () => {
      const { result } = renderHook(() => useGameStore());
      
      const mockCharacter: Character = {
        id: 'original-1',
        sessionId: 'session-1',
        name: 'Original Hero',
        ownerId: 1,
        controlledBy: [1],
        data: { class: 'Wizard', level: 5 },
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      act(() => {
        result.current.addCharacter(mockCharacter);
      });

      const cloned = cloneCharacter(mockCharacter, 1);

      act(() => {
        result.current.addCharacter(cloned);
      });

      expect(result.current.characters).toHaveLength(2);
      expect(result.current.characters[1].name).toBe('Original Hero (Copy)');
      expect(result.current.characters[1].data).toEqual(mockCharacter.data);
    });

    it('should maintain separate instances after clone', () => {
      const { result } = renderHook(() => useGameStore());
      
      const mockCharacter: Character = {
        id: 'original-1',
        sessionId: 'session-1',
        name: 'Original Hero',
        ownerId: 1,
        controlledBy: [1],
        data: { class: 'Wizard', level: 5, hp: 50 },
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const cloned = cloneCharacter(mockCharacter, 1);
      
      // Modify cloned data
      cloned.data.hp = 30;

      act(() => {
        result.current.addCharacter(mockCharacter);
        result.current.addCharacter(cloned);
      });

      // Original should be unchanged
      const originalInStore = result.current.characters.find(c => c.id === mockCharacter.id);
      expect(originalInStore?.data.hp).toBe(50);

      // Cloned should be modified
      const clonedInStore = result.current.characters.find(c => c.id === cloned.id);
      expect(clonedInStore?.data.hp).toBe(30);
    });
  });

  describe('Import/Export Workflow Integration', () => {
    it('should export then import character successfully', () => {
      const { result } = renderHook(() => useGameStore());
      
      const character: Character = {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Export Test',
        ownerId: 1,
        controlledBy: [1],
        data: { class: 'Paladin', level: 3 },
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Export
      const exported = exportCharacter(character);

      // Import back
      const importResult = importCharacterFromJSON(exported, 1, 'test-session');

      act(() => {
        result.current.addCharacter(importResult.character);
      });

      expect(result.current.characters).toHaveLength(1);
      expect(result.current.characters[0].name).toBe('Export Test');
      expect(result.current.characters[0].data.class).toBe('Paladin');
    });

    it('should handle bulk export and import', () => {
      const { result } = renderHook(() => useGameStore());
      
      const characters: Character[] = [
        {
          id: 'char-1',
          sessionId: 'session-1',
          name: 'Hero 1',
          ownerId: 1,
          controlledBy: [1],
          data: { class: 'Fighter' },
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'char-2',
          sessionId: 'session-1',
          name: 'Hero 2',
          ownerId: 1,
          controlledBy: [1],
          data: { class: 'Rogue' },
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'char-3',
          sessionId: 'session-1',
          name: 'Hero 3',
          ownerId: 1,
          controlledBy: [1],
          data: { class: 'Cleric' },
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      // Export all
      const exported = exportMultipleCharacters(characters);

      // Import back
      const importResult = importMultipleCharactersFromJSON(exported, 1, 'test-session');

      act(() => {
        importResult.characters.forEach(char => result.current.addCharacter(char));
      });

      expect(result.current.characters).toHaveLength(3);
      expect(result.current.characters.map(c => c.data.class)).toEqual(['Fighter', 'Rogue', 'Cleric']);
    });
  });

  describe('Bulk Operations', () => {
    it('should bulk delete multiple characters', () => {
      const { result } = renderHook(() => useGameStore());
      
      const characters: Character[] = [
        {
          id: 'char-1',
          sessionId: 'session-1',
          name: 'Hero 1',
          ownerId: 1,
          controlledBy: [1],
          data: {},
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'char-2',
          sessionId: 'session-1',
          name: 'Hero 2',
          ownerId: 1,
          controlledBy: [1],
          data: {},
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'char-3',
          sessionId: 'session-1',
          name: 'Hero 3',
          ownerId: 1,
          controlledBy: [1],
          data: {},
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      act(() => {
        characters.forEach(char => result.current.addCharacter(char));
      });

      expect(result.current.characters).toHaveLength(3);

      act(() => {
        ['char-1', 'char-2'].forEach(id => result.current.removeCharacter(id));
      });

      expect(result.current.characters).toHaveLength(1);
      expect(result.current.characters[0].id).toBe('char-3');
    });
  });

  describe('Character Version Management', () => {
    it('should preserve version on clone', () => {
      const mockCharacter: Character = {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Test Hero',
        ownerId: 1,
        controlledBy: [1],
        data: {},
        version: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const cloned = cloneCharacter(mockCharacter, 1);

      // Clone should reset version to 1
      expect(cloned.version).toBe(1);
    });

    it('should reset version to 1 on import', () => {
      const character: Character = {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Test Hero',
        ownerId: 1,
        controlledBy: [1],
        data: {},
        version: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const exported = exportCharacter(character);
      const importResult = importCharacterFromJSON(exported, 1, 'test-session');

      // Import should reset version to 1
      expect(importResult.character.version).toBe(1);
    });
  });
});
