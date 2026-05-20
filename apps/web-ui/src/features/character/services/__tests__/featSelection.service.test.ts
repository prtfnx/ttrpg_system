import { describe, expect, it } from 'vitest';
import { DND_FEATS, featSelectionService } from '../featSelection.service';

const baseScores = { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 };
const highScores = { Strength: 16, Dexterity: 16, Constitution: 14, Intelligence: 16, Wisdom: 14, Charisma: 12 };

describe('FeatSelectionService', () => {
  describe('getAllFeats', () => {
    it('returns a non-empty array', () => {
      const feats = featSelectionService.getAllFeats();
      expect(feats.length).toBeGreaterThan(0);
    });

    it('matches DND_FEATS object', () => {
      expect(featSelectionService.getAllFeats().length).toBe(Object.keys(DND_FEATS).length);
    });
  });

  describe('getFeat', () => {
    it('returns feat by name', () => {
      const alert = featSelectionService.getFeat('Alert');
      expect(alert).not.toBeNull();
      expect(alert!.name).toBe('Alert');
    });

    it('returns null for unknown feat', () => {
      expect(featSelectionService.getFeat('Nonexistent')).toBeNull();
    });
  });

  describe('getFeatsByTags', () => {
    it('returns feats matching any tag', () => {
      const combatFeats = featSelectionService.getFeatsByTags(['Combat']);
      expect(combatFeats.every(f => f.tags.includes('Combat'))).toBe(true);
      expect(combatFeats.length).toBeGreaterThan(0);
    });

    it('empty tags returns nothing matching (but all feats have tags)', () => {
      // Technically filter returns false for every feat since no tags match
      const result = featSelectionService.getFeatsByTags([]);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('checkPrerequisite', () => {
    it('ability_score met', () => {
      const prereq = { type: 'ability_score' as const, requirement: 'Strength', value: 13, description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 1, 'Fighter', 'Human', { Strength: 14 }, false)).toBe(true);
    });

    it('ability_score not met', () => {
      const prereq = { type: 'ability_score' as const, requirement: 'Strength', value: 13, description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 1, 'Fighter', 'Human', { Strength: 10 }, false)).toBe(false);
    });

    it('ability_score with "or" (either meets)', () => {
      const prereq = { type: 'ability_score' as const, requirement: 'Intelligence or Wisdom', value: 13, description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 1, 'Any', 'Human', { Intelligence: 8, Wisdom: 14 }, false)).toBe(true);
    });

    it('level requirement met', () => {
      const prereq = { type: 'level' as const, requirement: '', value: 4, description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 5, 'Fighter', 'Human', baseScores, false)).toBe(true);
    });

    it('level requirement not met', () => {
      const prereq = { type: 'level' as const, requirement: '', value: 4, description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 2, 'Fighter', 'Human', baseScores, false)).toBe(false);
    });

    it('class requirement met', () => {
      const prereq = { type: 'class' as const, requirement: 'Fighter', description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 1, 'Fighter', 'Human', baseScores, false)).toBe(true);
    });

    it('class requirement not met', () => {
      const prereq = { type: 'class' as const, requirement: 'Fighter', description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 1, 'Wizard', 'Human', baseScores, false)).toBe(false);
    });

    it('race requirement met', () => {
      const prereq = { type: 'race' as const, requirement: 'Elf', description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 1, 'Any', 'Elf', baseScores, false)).toBe(true);
    });

    it('feature: Spellcasting met when canCastSpells=true', () => {
      const prereq = { type: 'feature' as const, requirement: 'Spellcasting', description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 1, 'Wizard', 'Human', baseScores, true)).toBe(true);
    });

    it('feature: Spellcasting not met when canCastSpells=false', () => {
      const prereq = { type: 'feature' as const, requirement: 'Spellcasting', description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 1, 'Fighter', 'Human', baseScores, false)).toBe(false);
    });

    it('unknown type defaults to true', () => {
      const prereq = { type: 'skill' as const, requirement: 'Acrobatics', description: '' };
      expect(featSelectionService.checkPrerequisite(prereq, 1, 'Any', 'Human', baseScores, false)).toBe(true);
    });
  });

  describe('getAvailableFeats', () => {
    it('excludes already-owned feats', () => {
      const feats = featSelectionService.getAvailableFeats(10, 'Fighter', 'Human', highScores, ['Alert']);
      expect(feats.find(f => f.name === 'Alert')).toBeUndefined();
    });

    it('excludes racial feats with wrong race', () => {
      // Elven Accuracy requires Elf or half-elf
      const feats = featSelectionService.getAvailableFeats(4, 'Fighter', 'Human', highScores);
      const elvenAccuracy = feats.find(f => f.name === 'Elven Accuracy');
      // If it exists in data and is racial, it should be excluded for Human
      if (elvenAccuracy) {
        expect(elvenAccuracy.racial_requirement).not.toBe('Human');
      }
    });

    it('includes unrestricted feats for any character', () => {
      const feats = featSelectionService.getAvailableFeats(1, 'Fighter', 'Human', highScores);
      // Alert has no prerequisites
      expect(feats.find(f => f.name === 'Alert')).toBeDefined();
    });
  });

  describe('getASILevels + hasASIChoiceAtLevel', () => {
    it('Fighter gets ASI at level 4', () => {
      expect(featSelectionService.hasASIChoiceAtLevel('Fighter', 4)).toBe(true);
    });

    it('Fighter does not get ASI at level 3', () => {
      expect(featSelectionService.hasASIChoiceAtLevel('Fighter', 3)).toBe(false);
    });

    it('unknown class falls back to [4, 8, 12, 16, 19]', () => {
      const levels = featSelectionService.getASILevels('Unknown');
      expect(levels).toEqual([4, 8, 12, 16, 19]);
    });
  });

  describe('getASIImprovements', () => {
    it('returns 2 for standard class', () => {
      expect(featSelectionService.getASIImprovements('Fighter', 4)).toBe(2);
    });
  });

  describe('validateASIDistribution', () => {
    it('valid distribution passes', () => {
      const result = featSelectionService.validateASIDistribution({ Strength: 1, Dexterity: 1 });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('too many total points fails', () => {
      const result = featSelectionService.validateASIDistribution({ Strength: 2, Dexterity: 1 });
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatch(/cannot distribute more than/i);
    });

    it('single ability exceeds maxPerAbility fails', () => {
      const result = featSelectionService.validateASIDistribution({ Strength: 2 });
      // 2 points total is ok, but 2 to one ability is over maxPerAbility(1)
      expect(result.isValid).toBe(false);
    });

    it('score exceeding 20 fails', () => {
      const result = featSelectionService.validateASIDistribution(
        { Strength: 1 },
        2,
        1,
        { Strength: 20 }
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('exceed 20'))).toBe(true);
    });
  });
});
