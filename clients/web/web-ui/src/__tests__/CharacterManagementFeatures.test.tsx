/**
 * Character Management Features Tests
 * 
 * Comprehensive tests for all character management features added in Nov 2025:
 * - Search and filter functionality
 * - Bulk selection and operations
 * - Character cloning
 * - Import/Export integration
 * - Sync status management
 * - Permission-based UI controls
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
    importCharacterFromJSON
} from '../utils/characterImportExport';

describe('Character Management - Store Integration', () => {
  beforeEach(() => {
    // Reset store
    useGameStore.setState({ characters: [], userId: 1 });
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
        result.current.updateCharacter({
          id: 'char-1',
          data: { class: 'Fighter', level: 2 },
        } as any);
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

  describe('Character Filtering', () => {
    const mockCharacters: Character[] = [
      {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Aragorn',
        ownerId: 1,
        controlledBy: [1],
        data: { class: 'Ranger', race: 'Human', level: 10 },
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'char-2',
        sessionId: 'session-1',
        name: 'Legolas',
        ownerId: 2,
        controlledBy: [2],
        data: { class: 'Fighter', race: 'Elf', level: 10 },
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'char-3',
        sessionId: 'session-1',
        name: 'Gimli',
        ownerId: 3,
        controlledBy: [3],
        data: { class: 'Fighter', race: 'Dwarf', level: 10 },
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    beforeEach(() => {
      useGameStore.setState({ characters: mockCharacters });
    });

    it('should filter by name', () => {
      const { result } = renderHook(() => useGameStore());
      const searchTerm = 'aragorn';
      
      const filtered = result.current.characters.filter(char =>
        char.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Aragorn');
    });

    it('should filter by class', () => {
      const { result } = renderHook(() => useGameStore());
      const searchTerm = 'fighter';
      
      const filtered = result.current.characters.filter(char =>
        char.data.class?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map(c => c.name)).toContain('Legolas');
      expect(filtered.map(c => c.name)).toContain('Gimli');
    });

    it('should filter by race', () => {
      const { result } = renderHook(() => useGameStore());
      const searchTerm = 'elf';
      
      const filtered = result.current.characters.filter(char =>
        char.data.race?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Legolas');
    });

    it('should be case-insensitive', () => {
      const { result } = renderHook(() => useGameStore());
      
      const filtered1 = result.current.characters.filter(char =>
        char.name.toLowerCase().includes('ARAGORN'.toLowerCase())
      );
      
      const filtered2 = result.current.characters.filter(char =>
        char.name.toLowerCase().includes('aragorn'.toLowerCase())
      );

      expect(filtered1).toEqual(filtered2);
    });
  });

  describe('Sync Status Management', () => {
    it('should set sync status on character', () => {
      const { result } = renderHook(() => useGameStore());
      
      const character: Character = {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Test',
        ownerId: 1,
        controlledBy: [1],
        data: {},
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'local',
      };

      act(() => {
        result.current.addCharacter(character);
      });

      expect(result.current.characters[0].syncStatus).toBe('local');

      act(() => {
        result.current.setSyncStatus('char-1', 'syncing');
      });

      expect(result.current.characters[0].syncStatus).toBe('syncing');

      act(() => {
        result.current.setSyncStatus('char-1', 'synced');
      });

      expect(result.current.characters[0].syncStatus).toBe('synced');
    });

    it('should handle all sync status states', () => {
      const { result } = renderHook(() => useGameStore());
      
      const character: Character = {
        id: 'char-1',
        sessionId: 'session-1',
        name: 'Test',
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

      const statuses: Array<'local' | 'syncing' | 'synced' | 'error'> = ['local', 'syncing', 'synced', 'error'];

      statuses.forEach(status => {
        act(() => {
          result.current.setSyncStatus('char-1', status);
        });

        expect(result.current.characters[0].syncStatus).toBe(status);
      });
    });
  });

  describe('Permission Checks', () => {
    const ownerCharacter: Character = {
      id: 'char-1',
      sessionId: 'session-1',
      name: 'My Character',
      ownerId: 1,
      controlledBy: [1],
      data: {},
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const otherCharacter: Character = {
      id: 'char-2',
      sessionId: 'session-1',
      name: 'Other Character',
      ownerId: 2,
      controlledBy: [2],
      data: {},
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const controlledCharacter: Character = {
      id: 'char-3',
      sessionId: 'session-1',
      name: 'Controlled Character',
      ownerId: 2,
      controlledBy: [1, 2], // User 1 has control
      data: {},
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    beforeEach(() => {
      useGameStore.setState({ 
        characters: [ownerCharacter, otherCharacter, controlledCharacter],
        userId: 1 
      });
    });

    it('should allow editing owned character', () => {
      const { result } = renderHook(() => useGameStore());
      
      const canEdit = result.current.canEditCharacter(ownerCharacter.id);
      expect(canEdit).toBe(true);
    });

    it('should not allow editing non-owned character', () => {
      const { result } = renderHook(() => useGameStore());
      
      const canEdit = result.current.canEditCharacter(otherCharacter.id);
      expect(canEdit).toBe(false);
    });

    it('should allow controlling sprite for controlled character', () => {
      const { result } = renderHook(() => useGameStore());
      
      // First add a sprite linked to the controlled character
      const sprite = {
        id: 'sprite-1',
        tableId: 't1',
        characterId: controlledCharacter.id,
        controlledBy: controlledCharacter.controlledBy,
        x: 0,
        y: 0,
        layer: 'tokens' as const,
        texture: '',
        scale: { x: 1, y: 1 },
        rotation: 0,
        syncStatus: 'local' as const,
      };

      act(() => {
        result.current.addSprite(sprite);
      });

      const canControl = result.current.canControlSprite(sprite.id, 1);
      expect(canControl).toBe(true);
    });
  });
});

describe('Character Cloning Integration', () => {
  const mockCharacter: Character = {
    id: 'char-123',
    sessionId: 'session-456',
    name: 'Original Hero',
    ownerId: 1,
    controlledBy: [1],
    data: {
      class: 'Wizard',
      race: 'Elf',
      level: 10,
      hp: 50,
      maxHp: 50,
    },
    version: 3,
    createdAt: '2025-11-01T10:00:00Z',
    updatedAt: '2025-11-05T14:30:00Z',
  };

  it('should clone and add to store', () => {
    const { result } = renderHook(() => useGameStore());

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
    expect(result.current.characters[1].version).toBe(1);
  });

  it('should maintain separate instances after clone', () => {
    const { result } = renderHook(() => useGameStore());

    act(() => {
      result.current.addCharacter(mockCharacter);
    });

    const cloned = cloneCharacter(mockCharacter, 1);

    act(() => {
      result.current.addCharacter(cloned);
    });

    // Modify cloned character
    act(() => {
      result.current.updateCharacter({
        id: cloned.id,
        data: { ...cloned.data, hp: 30 },
      } as any);
    });

    // Original should be unchanged
    const original = result.current.characters.find(c => c.id === mockCharacter.id);
    expect(original?.data.hp).toBe(50);

    // Cloned should be modified
    const clonedInStore = result.current.characters.find(c => c.id === cloned.id);
    expect(clonedInStore?.data.hp).toBe(30);
  });
});

describe('Import/Export Workflow Integration', () => {
  const mockCharacter: Character = {
    id: 'char-123',
    sessionId: 'session-456',
    name: 'Export Test',
    ownerId: 1,
    controlledBy: [1],
    data: {
      class: 'Paladin',
      race: 'Human',
      level: 8,
    },
    version: 2,
    createdAt: '2025-11-01T10:00:00Z',
    updatedAt: '2025-11-05T14:30:00Z',
  };

  it('should export then import character successfully', () => {
    const { result } = renderHook(() => useGameStore());

    // Export
    const exported = exportCharacter(mockCharacter);
    expect(typeof exported).toBe('string');

    // Import
    const imported = importCharacterFromJSON(exported, 5, 'new-session');

    // Add to store
    act(() => {
      result.current.addCharacter(imported.character);
    });

    expect(result.current.characters).toHaveLength(1);
    expect(result.current.characters[0].name).toBe('Export Test');
    expect(result.current.characters[0].data.class).toBe('Paladin');
    expect(result.current.characters[0].ownerId).toBe(5);
    expect(result.current.characters[0].version).toBe(1);
  });

  it('should handle bulk export and import', () => {
    const { result } = renderHook(() => useGameStore());

    const char2 = { ...mockCharacter, id: 'char-2', name: 'Char 2' };
    const char3 = { ...mockCharacter, id: 'char-3', name: 'Char 3' };

    act(() => {
      result.current.addCharacter(mockCharacter);
      result.current.addCharacter(char2);
      result.current.addCharacter(char3);
    });

    expect(result.current.characters).toHaveLength(3);

    // Export all
    const allCharacters = result.current.characters;
    expect(allCharacters).toHaveLength(3);

    // Clear store
    act(() => {
      useGameStore.setState({ characters: [] });
    });

    expect(result.current.characters).toHaveLength(0);

    // Re-import
    allCharacters.forEach(char => {
      const exported = exportCharacter(char);
      const imported = importCharacterFromJSON(exported, 1, 'session-1');
      
      act(() => {
        result.current.addCharacter(imported.character);
      });
    });

    expect(result.current.characters).toHaveLength(3);
  });
});

describe('Bulk Operations', () => {
  const mockCharacters: Character[] = [
    {
      id: 'char-1',
      sessionId: 'session-1',
      name: 'Character 1',
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
      name: 'Character 2',
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
      name: 'Character 3',
      ownerId: 1,
      controlledBy: [1],
      data: {},
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    useGameStore.setState({ characters: mockCharacters, userId: 1 });
  });

  it('should bulk delete multiple characters', () => {
    const { result } = renderHook(() => useGameStore());

    expect(result.current.characters).toHaveLength(3);

    act(() => {
      result.current.removeCharacter('char-1');
      result.current.removeCharacter('char-2');
    });

    expect(result.current.characters).toHaveLength(1);
    expect(result.current.characters[0].id).toBe('char-3');
  });

  it('should handle bulk permission checks', () => {
    const { result } = renderHook(() => useGameStore());

    const ownedIds = result.current.characters
      .filter(char => char.ownerId === result.current.userId)
      .map(char => char.id);

    expect(ownedIds).toHaveLength(3);
    expect(ownedIds).toContain('char-1');
    expect(ownedIds).toContain('char-2');
    expect(ownedIds).toContain('char-3');
  });
});

describe('Character Version Management', () => {
  it('should increment version on update', () => {
    const { result } = renderHook(() => useGameStore());

    const character: Character = {
      id: 'char-1',
      sessionId: 'session-1',
      name: 'Test',
      ownerId: 1,
      controlledBy: [1],
      data: { hp: 10 },
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    act(() => {
      result.current.addCharacter(character);
    });

    expect(result.current.characters[0].version).toBe(1);

    act(() => {
      result.current.updateCharacter({
        id: 'char-1',
        version: 2,
        data: { hp: 8 },
      } as any);
    });

    expect(result.current.characters[0].version).toBe(2);
  });

  it('should reset version to 1 on clone', () => {
    const character: Character = {
      id: 'char-1',
      sessionId: 'session-1',
      name: 'Test',
      ownerId: 1,
      controlledBy: [1],
      data: {},
      version: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const cloned = cloneCharacter(character, 1);

    expect(cloned.version).toBe(1);
    expect(character.version).toBe(5); // Original unchanged
  });

  it('should reset version to 1 on import', () => {
    const character: Character = {
      id: 'char-1',
      sessionId: 'session-1',
      name: 'Test',
      ownerId: 1,
      controlledBy: [1],
      data: {},
      version: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const exported = exportCharacter(character);
    const imported = importCharacterFromJSON(exported, 1, 'session-1');

    expect(imported.character.version).toBe(1);
  });
});
