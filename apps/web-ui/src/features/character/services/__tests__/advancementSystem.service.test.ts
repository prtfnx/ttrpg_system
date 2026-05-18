import { describe, it, expect } from 'vitest';
import { AdvancementSystemService } from '../advancementSystem.service';

describe('AdvancementSystemService', () => {
  describe('calculateXPForLevel', () => {
    it.each([
      [1, 0],
      [2, 300],
      [5, 6500],
      [10, 64000],
      [20, 355000],
    ])('level %i requires %i XP', (level, expected) => {
      expect(AdvancementSystemService.calculateXPForLevel(level)).toBe(expected);
    });

    it('returns 0 for out-of-range levels', () => {
      expect(AdvancementSystemService.calculateXPForLevel(0)).toBe(0);
      expect(AdvancementSystemService.calculateXPForLevel(21)).toBe(0);
    });
  });

  describe('calculateLevelFromXP', () => {
    it('0 XP is level 1', () => {
      expect(AdvancementSystemService.calculateLevelFromXP(0)).toBe(1);
    });

    it('exactly 300 XP is level 2', () => {
      expect(AdvancementSystemService.calculateLevelFromXP(300)).toBe(2);
    });

    it('6499 XP is level 4', () => {
      expect(AdvancementSystemService.calculateLevelFromXP(6499)).toBe(4);
    });

    it('355000+ XP is level 20', () => {
      expect(AdvancementSystemService.calculateLevelFromXP(355000)).toBe(20);
      expect(AdvancementSystemService.calculateLevelFromXP(999999)).toBe(20);
    });
  });

  describe('calculateXPToNextLevel', () => {
    it('returns needed XP for level up', () => {
      const result = AdvancementSystemService.calculateXPToNextLevel(0);
      expect(result.needed).toBe(300);
      expect(result.nextLevel).toBe(2);
    });

    it('caps at level 20 with 0 needed', () => {
      const result = AdvancementSystemService.calculateXPToNextLevel(355000);
      expect(result.needed).toBe(0);
      expect(result.nextLevel).toBe(20);
    });

    it('returns current XP in result', () => {
      const result = AdvancementSystemService.calculateXPToNextLevel(500);
      expect(result.current).toBe(500);
    });
  });

  describe('getProficiencyBonus', () => {
    it.each([
      [1, 2],
      [4, 2],
      [5, 3],
      [8, 3],
      [9, 4],
      [12, 4],
      [13, 5],
      [17, 6],
      [20, 6],
    ])('level %i → proficiency +%i', (level, expected) => {
      expect(AdvancementSystemService.getProficiencyBonus(level)).toBe(expected);
    });

    it('returns 2 for out-of-range levels', () => {
      expect(AdvancementSystemService.getProficiencyBonus(0)).toBe(2);
      expect(AdvancementSystemService.getProficiencyBonus(25)).toBe(2);
    });
  });

  describe('isASILevel', () => {
    it('standard class: level 4 is ASI', () => {
      expect(AdvancementSystemService.isASILevel('wizard', 4)).toBe(true);
    });

    it('standard class: level 5 is NOT ASI', () => {
      expect(AdvancementSystemService.isASILevel('wizard', 5)).toBe(false);
    });

    it('fighter gets ASI at level 6', () => {
      expect(AdvancementSystemService.isASILevel('fighter', 6)).toBe(true);
    });

    it('fighter does NOT get ASI at level 5', () => {
      expect(AdvancementSystemService.isASILevel('fighter', 5)).toBe(false);
    });

    it('rogue gets ASI at level 10', () => {
      expect(AdvancementSystemService.isASILevel('rogue', 10)).toBe(true);
    });

    it('rogue does NOT get ASI at level 9', () => {
      expect(AdvancementSystemService.isASILevel('rogue', 9)).toBe(false);
    });
  });

  describe('getClassFeaturesForLevel', () => {
    it('fighter level 1 has Fighting Style and Second Wind', () => {
      const features = AdvancementSystemService.getClassFeaturesForLevel('fighter', 1);
      const names = features.map(f => f.name);
      expect(names).toContain('Fighting Style');
      expect(names).toContain('Second Wind');
    });

    it('fighter level 5 has Extra Attack', () => {
      const features = AdvancementSystemService.getClassFeaturesForLevel('fighter', 5);
      expect(features.some(f => f.name === 'Extra Attack')).toBe(true);
    });

    it('wizard level 1 has Spellcasting and Arcane Recovery', () => {
      const features = AdvancementSystemService.getClassFeaturesForLevel('wizard', 1);
      const names = features.map(f => f.name);
      expect(names).toContain('Spellcasting');
      expect(names).toContain('Arcane Recovery');
    });

    it('unknown class returns empty array', () => {
      expect(AdvancementSystemService.getClassFeaturesForLevel('unknown', 1)).toEqual([]);
    });

    it('level with no defined features returns empty array', () => {
      expect(AdvancementSystemService.getClassFeaturesForLevel('fighter', 10)).toEqual([]);
    });
  });

  describe('checkMulticlassRequirements', () => {
    it('wizard requires INT 13', () => {
      const result = AdvancementSystemService.checkMulticlassRequirements('wizard', { intelligence: 13 });
      expect(result.met).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('wizard with INT 12 fails', () => {
      const result = AdvancementSystemService.checkMulticlassRequirements('wizard', { intelligence: 12 });
      expect(result.met).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('fighter can multiclass with STR 13 even if DEX < 13', () => {
      const result = AdvancementSystemService.checkMulticlassRequirements('fighter', { strength: 13, dexterity: 8 });
      expect(result.met).toBe(true);
    });

    it('fighter fails if both STR and DEX < 13', () => {
      const result = AdvancementSystemService.checkMulticlassRequirements('fighter', { strength: 12, dexterity: 12 });
      expect(result.met).toBe(false);
    });

    it('monk requires DEX 13 and WIS 13', () => {
      const result = AdvancementSystemService.checkMulticlassRequirements('monk', { dexterity: 13, wisdom: 12 });
      expect(result.met).toBe(false);
    });

    it('unknown class returns met=true with no requirements', () => {
      const result = AdvancementSystemService.checkMulticlassRequirements('unknown', {});
      expect(result.met).toBe(true);
    });
  });

  describe('calculateHitPointIncrease', () => {
    it('wizard (d6) average = 4 + CON modifier', () => {
      expect(AdvancementSystemService.calculateHitPointIncrease('wizard', 2)).toBe(6);
    });

    it('barbarian (d12) average = 7 + CON modifier', () => {
      expect(AdvancementSystemService.calculateHitPointIncrease('barbarian', 3)).toBe(10);
    });

    it('fighter (d10) average = 6 + CON modifier', () => {
      expect(AdvancementSystemService.calculateHitPointIncrease('fighter', 1)).toBe(7);
    });

    it('roll method returns same as average', () => {
      const avg = AdvancementSystemService.calculateHitPointIncrease('rogue', 2, 'average');
      const roll = AdvancementSystemService.calculateHitPointIncrease('rogue', 2, 'roll');
      expect(roll).toBe(avg);
    });

    it('unknown class defaults to d8', () => {
      // d8 average = 4 + 1 = 5, plus con mod
      expect(AdvancementSystemService.calculateHitPointIncrease('unknown', 0)).toBe(5);
    });
  });

  describe('getSpellProgression', () => {
    it('wizard level 1 has spell slots', () => {
      const prog = AdvancementSystemService.getSpellProgression('wizard', 1);
      expect(prog).not.toBeNull();
      expect(prog!.spellSlots[1]).toBeGreaterThan(0);
    });

    it('fighter (non-caster) returns null', () => {
      expect(AdvancementSystemService.getSpellProgression('fighter', 5)).toBeNull();
    });

    it('barbarian (non-caster) returns null', () => {
      expect(AdvancementSystemService.getSpellProgression('barbarian', 3)).toBeNull();
    });

    it('cleric level 5 has at least 3rd-level spell slots', () => {
      const prog = AdvancementSystemService.getSpellProgression('cleric', 5);
      expect(prog).not.toBeNull();
      expect(prog!.spellSlots[3]).toBeGreaterThan(0);
    });
  });
});
