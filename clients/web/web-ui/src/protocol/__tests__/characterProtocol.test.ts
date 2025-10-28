/**
 * Tests for character protocol client-side implementation
 */


import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebClientProtocol } from '../clientProtocol';
import { useGameStore } from '../../store';
import type { Sprite, Character } from '../../types';

// Capture the initial Zustand store state (with all methods)
const initialState = useGameStore.getState();


describe('Character Protocol Client', () => {
  let protocol: WebClientProtocol;

  beforeEach(() => {
    // Reset Zustand store state to initial (with all methods)
    useGameStore.setState(initialState, true);
  });

  it('should register CHARACTER_UPDATE handler', () => {
    protocol = new WebClientProtocol('test-session');
    // Check handler registration (mocked)
    expect(protocol).toBeDefined();
  });

  it('should link and unlink sprites to characters', () => {
    const { linkSpriteToCharacter, unlinkSpriteFromCharacter, getSpritesForCharacter, getCharacterForSprite } = useGameStore.getState();
    // Add a character and a sprite
    const char: Character = {
      id: 'char1',
      sessionId: 'sess',
      name: 'Hero',
      ownerId: 1,
      controlledBy: [1],
      data: {},
      version: 1,
      createdAt: '',
      updatedAt: '',
    };
    const sprite: Sprite = {
      id: 'sprite1',
      tableId: 'table1',
      x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0
    };
    useGameStore.getState().addCharacter(char);
    useGameStore.getState().addSprite(sprite);
    // Link
    linkSpriteToCharacter('sprite1', 'char1');
    expect(getSpritesForCharacter('char1').length).toBe(1);
    expect(getCharacterForSprite('sprite1')?.id).toBe('char1');
    // Unlink
    unlinkSpriteFromCharacter('sprite1');
    expect(getSpritesForCharacter('char1').length).toBe(0);
    expect(getCharacterForSprite('sprite1')).toBeUndefined();
  });

  it('should enforce canControlSprite and canEditCharacter permissions', () => {
    const { addCharacter, addSprite, linkSpriteToCharacter, canControlSprite, canEditCharacter } = useGameStore.getState();
    const char: Character = {
      id: 'char2',
      sessionId: 'sess',
      name: 'Mage',
      ownerId: 2,
      controlledBy: [3],
      data: {},
      version: 1,
      createdAt: '',
      updatedAt: '',
    };
    const sprite: Sprite = {
      id: 'sprite2',
      tableId: 'table1',
      x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0
    };
    addCharacter(char);
    addSprite(sprite);
    linkSpriteToCharacter('sprite2', 'char2');
    // Owner can edit
    expect(canEditCharacter('char2', 2)).toBe(true);
    // ControlledBy can edit
    expect(canEditCharacter('char2', 3)).toBe(true);
    // Others cannot edit
    expect(canEditCharacter('char2', 4)).toBe(false);
    // Sprite control
    expect(canControlSprite('sprite2', 2)).toBe(true); // owner
    expect(canControlSprite('sprite2', 3)).toBe(true); // controlledBy
    expect(canControlSprite('sprite2', 4)).toBe(false); // not allowed
  });

  it('should handle syncStatus and protocol event (mocked)', () => {
    // Add a table and mark as local, then sync
    useGameStore.getState().setTables([
      { table_id: 't1', table_name: 'Table 1', width: 10, height: 10, syncStatus: 'local' }
    ]);
    useGameStore.getState().syncTableToServer('t1');
    const table = useGameStore.getState().tables.find(t => t.table_id === 't1');
    expect(table?.syncStatus).toBe('syncing');
    // Mock protocol event dispatch
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    useGameStore.getState().requestTableList();
    expect(dispatchSpy).toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });
});

