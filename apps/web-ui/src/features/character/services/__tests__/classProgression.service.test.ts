import { describe, it, expect } from 'vitest';
import { classProgressionService, DND_CLASSES } from '../classProgression.service';

describe('classProgressionService', () => {
  describe('getClass', () => {
    it('returns class data for known class', () => {
      const fighter = classProgressionService.getClass('Fighter');
      expect(fighter).not.toBeNull();
      expect(fighter!.hit_dice).toBe(10);
    });

    it('returns null for unknown class', () => {
      expect(classProgressionService.getClass('Unknown')).toBeNull();
    });
  });

  describe('getAllClasses', () => {
    it('returns all D&D classes', () => {
      const classes = classProgressionService.getAllClasses();
      expect(classes.length).toBeGreaterThan(0);
    });

    it('includes Fighter and Wizard', () => {
      const names = classProgressionService.getAllClasses().map(c => c.name);
      expect(names).toContain('Fighter');
      expect(names).toContain('Wizard');
    });
  });

  describe('getSubclasses', () => {
    it('returns subclasses for Fighter', () => {
      const subclasses = classProgressionService.getSubclasses('Fighter');
      expect(subclasses.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown class', () => {
      expect(classProgressionService.getSubclasses('Unknown')).toEqual([]);
    });
  });

  describe('getFeaturesAtLevel', () => {
    it('returns features for Fighter level 1', () => {
      const features = classProgressionService.getFeaturesAtLevel('Fighter', 1);
      expect(features.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown class', () => {
      expect(classProgressionService.getFeaturesAtLevel('Unknown', 1)).toEqual([]);
    });
  });

  describe('getLevelProgression', () => {
    it('returns 20 levels for Fighter', () => {
      const progression = classProgressionService.getLevelProgression('Fighter');
      expect(progression).toHaveLength(20);
    });

    it('returns empty array for unknown class', () => {
      expect(classProgressionService.getLevelProgression('Unknown')).toEqual([]);
    });

    it('proficiency bonus increases correctly', () => {
      const prog = classProgressionService.getLevelProgression('Fighter');
      expect(prog[0].proficiency_bonus).toBe(2); // Level 1
      expect(prog[4].proficiency_bonus).toBe(3); // Level 5
      expect(prog[16].proficiency_bonus).toBe(6); // Level 17
    });
  });

  describe('getProficiencyBonus', () => {
    it.each([
      [1, 2],
      [4, 2],
      [5, 3],
      [9, 4],
      [13, 5],
      [17, 6],
    ])('level %i → +%i', (level, expected) => {
      expect(classProgressionService.getProficiencyBonus(level)).toBe(expected);
    });
  });

  describe('hasSpellcasting', () => {
    it('Wizard has spellcasting', () => {
      expect(classProgressionService.hasSpellcasting('Wizard')).toBe(true);
    });

    it('Fighter does not have spellcasting', () => {
      expect(classProgressionService.hasSpellcasting('Fighter')).toBe(false);
    });

    it('unknown class returns false', () => {
      expect(classProgressionService.hasSpellcasting('Unknown')).toBe(false);
    });
  });

  describe('getSpellcastingAbility', () => {
    it('Wizard uses Intelligence (capitalized)', () => {
      expect(classProgressionService.getSpellcastingAbility('Wizard')).toBe('Intelligence');
    });

    it('Fighter returns null', () => {
      expect(classProgressionService.getSpellcastingAbility('Fighter')).toBeNull();
    });

    it('unknown class returns null', () => {
      expect(classProgressionService.getSpellcastingAbility('Unknown')).toBeNull();
    });
  });

  describe('calculateSpellcastingStats', () => {
    it('wizard level 1, Intelligence 18: spell save DC 14, attack +6', () => {
      // Wizard spellcasting uses 'Intelligence' key (capitalized)
      const result = classProgressionService.calculateSpellcastingStats('Wizard', 1, { Intelligence: 18 });
      expect(result).not.toBeNull();
      expect(result!.spellSaveDC).toBe(14); // 8 + 2 prof + 4 mod
      expect(result!.spellAttackBonus).toBe(6); // 2 prof + 4 mod
      expect(result!.spellcastingAbility).toBe('Intelligence');
    });

    it('fighter returns null', () => {
      expect(classProgressionService.calculateSpellcastingStats('Fighter', 5, { Strength: 18 })).toBeNull();
    });
  });

  describe('getHitPointsForLevel', () => {
    it('Fighter level 1, CON 14: 10 + 2 = 12', () => {
      expect(classProgressionService.getHitPointsForLevel('Fighter', 1, 14)).toBe(12);
    });

    it('Wizard level 1, CON 10: 6 + 0 = 6', () => {
      expect(classProgressionService.getHitPointsForLevel('Wizard', 1, 10)).toBe(6);
    });

    it('average method for level 2+', () => {
      const hp = classProgressionService.getHitPointsForLevel('Fighter', 2, 14, true);
      // average = floor(10/2) + 1 + 2 = 8
      expect(hp).toBe(8);
    });

    it('unknown class returns 0', () => {
      expect(classProgressionService.getHitPointsForLevel('Unknown', 1, 10)).toBe(0);
    });
  });

  describe('DND_CLASSES data', () => {
    it('Fighter has correct hit dice', () => {
      expect(DND_CLASSES['Fighter'].hit_dice).toBe(10);
    });

    it('Wizard has hit dice 6', () => {
      expect(DND_CLASSES['Wizard'].hit_dice).toBe(6);
    });

    it('Fighter has no spellcasting', () => {
      expect(DND_CLASSES['Fighter'].spellcasting).toBeUndefined();
    });
  });
});
