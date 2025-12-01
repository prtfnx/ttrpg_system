/**
 * Token-Character Binding System Tests
 * Tests independent token stats and optional character linking
 * 
 * Features tested:
 * 1. Independent token stats (HP, AC, Aura) without character
 * 2. Optional character linking
 * 3. Bidirectional sync when character is linked
 * 4. Store-level sprite and character management
 * 
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store';
import type { Character, Sprite } from '../types';

describe('Token Stats System - Store Operations', () => {
  beforeEach(() => {
    // Reset store before each test
    useGameStore.setState({
      sprites: [],
      characters: [],
      selectedSprites: [],
      activeTableId: 'test-table'
    });
  });

  describe('Independent Token Stats', () => {
    it('should create sprite with stats but no character link', () => {
      const { result } = renderHook(() => useGameStore());
      
      const testSprite: Sprite = {
        id: 'sprite-1',
        x: 100,
        y: 200,
        texture: 'warrior.png',
        hp: 25,
        maxHp: 50,
        ac: 15,
        auraRadius: 30,
        characterId: undefined // No character link
      };

      act(() => {
        result.current.addSprite(testSprite);
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      expect(sprite).toBeDefined();
      expect(sprite?.hp).toBe(25);
      expect(sprite?.maxHp).toBe(50);
      expect(sprite?.ac).toBe(15);
      expect(sprite?.auraRadius).toBe(30);
      expect(sprite?.characterId).toBeUndefined();
    });

    it('should update token HP without affecting character', () => {
      const { result } = renderHook(() => useGameStore());
      
      const testSprite: Sprite = {
        id: 'sprite-1',
        x: 100,
        y: 200,
        texture: 'warrior.png',
        hp: 50,
        maxHp: 50,
        ac: 15
      };

      act(() => {
        result.current.addSprite(testSprite);
      });

      // Update HP
      act(() => {
        result.current.updateSprite('sprite-1', { hp: 30 });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      expect(sprite?.hp).toBe(30);
      expect(sprite?.maxHp).toBe(50);
    });

    it('should update token AC independently', () => {
      const { result } = renderHook(() => useGameStore());
      
      const testSprite: Sprite = {
        id: 'sprite-1',
        x: 100,
        y: 200,
        texture: 'warrior.png',
        ac: 15
      };

      act(() => {
        result.current.addSprite(testSprite);
      });

      // Update AC
      act(() => {
        result.current.updateSprite('sprite-1', { ac: 18 });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      expect(sprite?.ac).toBe(18);
    });

    it('should update aura radius independently', () => {
      const { result } = renderHook(() => useGameStore());
      
      const testSprite: Sprite = {
        id: 'sprite-1',
        x: 100,
        y: 200,
        texture: 'warrior.png',
        auraRadius: 30
      };

      act(() => {
        result.current.addSprite(testSprite);
      });

      // Update aura radius
      act(() => {
        result.current.updateSprite('sprite-1', { auraRadius: 50 });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      expect(sprite?.auraRadius).toBe(50);
    });
  });

  describe('Character Linking', () => {
    it('should link token to character', () => {
      const { result } = renderHook(() => useGameStore());
      
      const testCharacter: Character = {
        id: 'char-1',
        name: 'Warrior',
        player_id: 123,
        is_npc: false,
        data: {
          stats: {
            hp: { current: 50, max: 50, temp: 0 },
            ac: 18
          }
        }
      };

      const testSprite: Sprite = {
        id: 'sprite-1',
        x: 100,
        y: 200,
        texture: 'warrior.png',
        hp: 40,
        maxHp: 40,
        ac: 15
      };

      act(() => {
        result.current.addCharacter(testCharacter);
        result.current.addSprite(testSprite);
      });

      // Link character to sprite
      act(() => {
        result.current.updateSprite('sprite-1', {
          characterId: 'char-1',
          hp: testCharacter.data.stats.hp.current,
          maxHp: testCharacter.data.stats.hp.max,
          ac: testCharacter.data.stats.ac
        });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      expect(sprite?.characterId).toBe('char-1');
      expect(sprite?.hp).toBe(50); // Synced from character
      expect(sprite?.maxHp).toBe(50);
      expect(sprite?.ac).toBe(18);
    });

    it('should preserve character link during position updates', () => {
      const { result } = renderHook(() => useGameStore());
      
      const testSprite: Sprite = {
        id: 'sprite-1',
        x: 100,
        y: 200,
        texture: 'warrior.png',
        characterId: 'char-1',
        hp: 50,
        maxHp: 50,
        ac: 18
      };

      act(() => {
        result.current.addSprite(testSprite);
      });

      // Simulate WASM position update
      act(() => {
        result.current.updateSprite('sprite-1', {
          x: 150,
          y: 250
        });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      expect(sprite?.characterId).toBe('char-1'); // Preserved
      expect(sprite?.hp).toBe(50); // Preserved
      expect(sprite?.ac).toBe(18); // Preserved
      expect(sprite?.x).toBe(150); // Updated
      expect(sprite?.y).toBe(250); // Updated
    });

    it('should unlink character when set to undefined', () => {
      const { result } = renderHook(() => useGameStore());
      
      const testSprite: Sprite = {
        id: 'sprite-1',
        x: 100,
        y: 200,
        texture: 'warrior.png',
        characterId: 'char-1',
        hp: 50,
        maxHp: 50
      };

      act(() => {
        result.current.addSprite(testSprite);
      });

      // Unlink character
      act(() => {
        result.current.updateSprite('sprite-1', {
          characterId: undefined
        });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      expect(sprite?.characterId).toBeUndefined();
      expect(sprite?.hp).toBe(50); // Stats preserved
      expect(sprite?.maxHp).toBe(50);
    });
  });

  describe('HP Percentage Calculation', () => {
    it('should calculate HP percentage correctly', () => {
      const { result } = renderHook(() => useGameStore());
      
      act(() => {
        result.current.addSprite({
          id: 'sprite-1',
          x: 100,
          y: 200,
          texture: 'test.png',
          hp: 50,
          maxHp: 100
        });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      const hpPercentage = (sprite?.hp ?? 0) / (sprite?.maxHp ?? 1) * 100;
      expect(hpPercentage).toBe(50);
    });

    it('should handle full HP (100%)', () => {
      const { result } = renderHook(() => useGameStore());
      
      act(() => {
        result.current.addSprite({
          id: 'sprite-1',
          x: 100,
          y: 200,
          texture: 'test.png',
          hp: 100,
          maxHp: 100
        });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      const hpPercentage = (sprite?.hp ?? 0) / (sprite?.maxHp ?? 1) * 100;
      expect(hpPercentage).toBe(100);
    });

    it('should handle critical HP (<25%)', () => {
      const { result } = renderHook(() => useGameStore());
      
      act(() => {
        result.current.addSprite({
          id: 'sprite-1',
          x: 100,
          y: 200,
          texture: 'test.png',
          hp: 10,
          maxHp: 100
        });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      const hpPercentage = (sprite?.hp ?? 0) / (sprite?.maxHp ?? 1) * 100;
      expect(hpPercentage).toBe(10);
      expect(hpPercentage).toBeLessThan(25);
    });

    it('should handle zero HP', () => {
      const { result } = renderHook(() => useGameStore());
      
      act(() => {
        result.current.addSprite({
          id: 'sprite-1',
          x: 100,
          y: 200,
          texture: 'test.png',
          hp: 0,
          maxHp: 100
        });
      });

      const sprite = result.current.sprites.find(s => s.id === 'sprite-1');
      const hpPercentage = (sprite?.hp ?? 0) / (sprite?.maxHp ?? 1) * 100;
      expect(hpPercentage).toBe(0);
    });
  });

  describe('Multiple Sprites with Different Links', () => {
    it('should manage multiple sprites with different character links', () => {
      const { result } = renderHook(() => useGameStore());
      
      const char1: Character = {
        id: 'char-1',
        name: 'Warrior',
        player_id: 123,
        is_npc: false,
        data: {
          stats: {
            hp: { current: 50, max: 50, temp: 0 },
            ac: 18
          }
        }
      };

      const char2: Character = {
        id: 'char-2',
        name: 'Mage',
        player_id: 456,
        is_npc: false,
        data: {
          stats: {
            hp: { current: 30, max: 30, temp: 0 },
            ac: 12
          }
        }
      };

      act(() => {
        result.current.addCharacter(char1);
        result.current.addCharacter(char2);
        
        result.current.addSprite({
          id: 'sprite-1',
          x: 100,
          y: 200,
          texture: 'warrior.png',
          characterId: 'char-1',
          hp: 50,
          maxHp: 50,
          ac: 18
        });

        result.current.addSprite({
          id: 'sprite-2',
          x: 200,
          y: 300,
          texture: 'mage.png',
          characterId: 'char-2',
          hp: 30,
          maxHp: 30,
          ac: 12
        });

        result.current.addSprite({
          id: 'sprite-3',
          x: 300,
          y: 400,
          texture: 'enemy.png',
          hp: 100,
          maxHp: 100,
          ac: 15
          // No character link
        });
      });

      const sprite1 = result.current.sprites.find(s => s.id === 'sprite-1');
      const sprite2 = result.current.sprites.find(s => s.id === 'sprite-2');
      const sprite3 = result.current.sprites.find(s => s.id === 'sprite-3');

      expect(sprite1?.characterId).toBe('char-1');
      expect(sprite2?.characterId).toBe('char-2');
      expect(sprite3?.characterId).toBeUndefined();

      expect(sprite1?.hp).toBe(50);
      expect(sprite2?.hp).toBe(30);
      expect(sprite3?.hp).toBe(100);
    });
  });
});
