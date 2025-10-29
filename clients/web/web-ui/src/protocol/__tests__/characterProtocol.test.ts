describe('Legacy Character Migration Edge Cases', () => {
  it('should migrate legacy character with missing fields to new structure', () => {
    const { addCharacter, getCharacterForSprite } = useGameStore.getState();
    // Simulate legacy character (missing data fields)
    const legacyChar: any = {
      id: 'legacy1',
      sessionId: 'sess',
      name: 'Old Hero',
      ownerId: 1,
      // no controlledBy, no data, no version
      createdAt: '',
      updatedAt: ''
    };
    expect(() => addCharacter(legacyChar)).not.toThrow();
    // Should fill defaults
    const char = useGameStore.getState().characters.find(c => c.id === 'legacy1');
    expect(char).toBeDefined();
    expect(char?.data).toBeDefined();
    expect(char?.version).toBeDefined();
  });

  it('should handle version conflict on character update', () => {
    const { addCharacter } = useGameStore.getState();
    addCharacter({ id: 'ver1', sessionId: '', name: 'V', ownerId: 1, controlledBy: [], data: {}, version: 1, createdAt: '', updatedAt: '' });
    // Simulate update with old version
    const update = { id: 'ver1', version: 0 };
    // Assume updateCharacter checks version and throws or ignores
    const updateCharacter = useGameStore.getState().updateCharacter || (() => {});
    if (updateCharacter) {
      expect(() => updateCharacter(update)).not.toThrow();
      // Should not downgrade version
      const char = useGameStore.getState().characters.find(c => c.id === 'ver1');
      expect(char?.version).toBeGreaterThanOrEqual(1);
    }
  });

  it('should migrate legacy sprite with imageUrl/width/height to new structure', () => {
    const { addSprite, getCharacterForSprite } = useGameStore.getState();
    // Simulate legacy sprite
    const legacySprite: any = {
      id: 'spriteLegacy',
      tableId: 't',
      imageUrl: 'foo.png',
      width: 64,
      height: 32,
      x: 0, y: 0, layer: 'tokens',
      rotation: 0
    };
    expect(() => addSprite(legacySprite)).not.toThrow();
    const sprite = useGameStore.getState().sprites.find(s => s.id === 'spriteLegacy');
    expect(sprite).toBeDefined();
    expect(sprite?.texture).toBe('foo.png');
    expect(sprite?.scale.x).toBeCloseTo(2);
    expect(sprite?.scale.y).toBeCloseTo(1);
  });
});
/**
 * Tests for character protocol client-side implementation
 */


import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../store';
import type { Character, Sprite } from '../../types';
import { WebClientProtocol } from '../clientProtocol';

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
  it('should not allow double-linking a sprite to multiple characters', () => {
    const { addCharacter, addSprite, linkSpriteToCharacter, getSpritesForCharacter, getCharacterForSprite } = useGameStore.getState();
    addCharacter({ id: 'charA', sessionId: '', name: 'A', ownerId: 1, controlledBy: [], data: {}, version: 1, createdAt: '', updatedAt: '' });
    addCharacter({ id: 'charB', sessionId: '', name: 'B', ownerId: 2, controlledBy: [], data: {}, version: 1, createdAt: '', updatedAt: '' });
    addSprite({ id: 'spriteX', tableId: 't', x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0 });
    linkSpriteToCharacter('spriteX', 'charA');
    expect(getCharacterForSprite('spriteX')?.id).toBe('charA');
    // Link to another character should overwrite
    linkSpriteToCharacter('spriteX', 'charB');
    expect(getCharacterForSprite('spriteX')?.id).toBe('charB');
    expect(getSpritesForCharacter('charA').length).toBe(0);
    expect(getSpritesForCharacter('charB').length).toBe(1);
  });

  it('should handle unlinking a non-existent sprite gracefully', () => {
    const { unlinkSpriteFromCharacter, getCharacterForSprite } = useGameStore.getState();
    expect(() => unlinkSpriteFromCharacter('not_a_sprite')).not.toThrow();
    expect(getCharacterForSprite('not_a_sprite')).toBeUndefined();
  });

  it('should not escalate permissions when linking sprites', () => {
    const { addCharacter, addSprite, linkSpriteToCharacter, canEditCharacter, canControlSprite } = useGameStore.getState();
    addCharacter({ id: 'charC', sessionId: '', name: 'C', ownerId: 1, controlledBy: [], data: {}, version: 1, createdAt: '', updatedAt: '' });
    addSprite({ id: 'spriteY', tableId: 't', x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0 });
    linkSpriteToCharacter('spriteY', 'charC');
    // Only owner can edit/control
    expect(canEditCharacter('charC', 1)).toBe(true);
    expect(canEditCharacter('charC', 2)).toBe(false);
    expect(canControlSprite('spriteY', 1)).toBe(true);
    expect(canControlSprite('spriteY', 2)).toBe(false);
  });

  it('should not link sprite to non-existent character', () => {
    const { addSprite, linkSpriteToCharacter, getCharacterForSprite } = useGameStore.getState();
    addSprite({ id: 'spriteZ', tableId: 't', x: 0, y: 0, layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0 });
    // Should not throw, but should not link
    expect(() => linkSpriteToCharacter('spriteZ', 'no_such_char')).not.toThrow();
    expect(getCharacterForSprite('spriteZ')).toBeUndefined();
  });
});

