import { CombatPreviewService } from '../combatPreview.service';
import type { WizardFormData } from '@features/character/components/CharacterWizard/WizardFormData';

const makeChar = (overrides: Partial<WizardFormData> = {}): WizardFormData => ({
  name: 'Test',
  race: 'Human',
  class: 'fighter',
  background: 'soldier',
  strength: 16,
  dexterity: 14,
  constitution: 12,
  intelligence: 10,
  wisdom: 10,
  charisma: 8,
  skills: [],
  advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] },
  equipment: {
    items: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    carrying_capacity: { current_weight: 0, max_weight: 240, encumbered_at: 80, heavily_encumbered_at: 160 },
  },
  ...overrides,
});

describe('CombatPreviewService', () => {
  describe('getAbilityModifier', () => {
    it.each([
      [1, -5],
      [3, -4],
      [8, -1],
      [9, -1],
      [10, 0],
      [11, 0],
      [12, 1],
      [13, 1],
      [20, 5],
      [30, 10],
    ])('score %i → modifier %i', (score, expected) => {
      expect(CombatPreviewService.getAbilityModifier(score)).toBe(expected);
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
      [16, 5],
      [17, 6],
      [20, 6],
    ])('level %i → proficiency bonus %i', (level, expected) => {
      expect(CombatPreviewService.getProficiencyBonus(level)).toBe(expected);
    });
  });

  describe('getInitiativeModifier', () => {
    it('returns dex modifier', () => {
      expect(CombatPreviewService.getInitiativeModifier(14)).toBe(2);
      expect(CombatPreviewService.getInitiativeModifier(8)).toBe(-1);
    });
  });

  describe('calculateArmorClass', () => {
    it('no armor: 10 + dex modifier', () => {
      const char = makeChar({ dexterity: 14 }); // +2
      expect(CombatPreviewService.calculateArmorClass(char)).toBe(12);
    });

    it('negative dex: minimum AC is 10', () => {
      const char = makeChar({ dexterity: 1 }); // -5
      expect(CombatPreviewService.calculateArmorClass(char)).toBe(10);
    });

    it('leather armor: 11 + full dex modifier', () => {
      const char = makeChar({
        dexterity: 16, // +3
        equipment: {
          items: [{ equipment: { name: 'Leather Armor', weight: 10, cost: { amount: 10, unit: 'gp' } }, quantity: 1, equipped: true }],
          currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
          carrying_capacity: { current_weight: 0, max_weight: 240, encumbered_at: 80, heavily_encumbered_at: 160 },
        },
      });
      expect(CombatPreviewService.calculateArmorClass(char)).toBe(14); // 11 + 3
    });

    it('chain mail: 13 + max +2 dex', () => {
      const char = makeChar({
        dexterity: 18, // +4 — should be capped at +2
        equipment: {
          items: [{ equipment: { name: 'Chain Mail', weight: 55, cost: { amount: 75, unit: 'gp' } }, quantity: 1, equipped: true }],
          currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
          carrying_capacity: { current_weight: 0, max_weight: 240, encumbered_at: 80, heavily_encumbered_at: 160 },
        },
      });
      expect(CombatPreviewService.calculateArmorClass(char)).toBe(15); // 13 + 2
    });

    it('plate armor: 18, no dex bonus', () => {
      const char = makeChar({
        dexterity: 20, // +5 — irrelevant for plate
        equipment: {
          items: [{ equipment: { name: 'Plate Armor', weight: 65, cost: { amount: 1500, unit: 'gp' } }, quantity: 1, equipped: true }],
          currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
          carrying_capacity: { current_weight: 0, max_weight: 240, encumbered_at: 80, heavily_encumbered_at: 160 },
        },
      });
      expect(CombatPreviewService.calculateArmorClass(char)).toBe(18);
    });
  });

  describe('calculateMaxHitPoints', () => {
    it('fighter level 1, CON 12 (+1): 10 + 1 = 11', () => {
      const char = makeChar({ class: 'fighter', constitution: 12, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      expect(CombatPreviewService.calculateMaxHitPoints(char)).toBe(11);
    });

    it('barbarian level 1, CON 16 (+3): 12 + 3 = 15', () => {
      const char = makeChar({ class: 'barbarian', constitution: 16, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      expect(CombatPreviewService.calculateMaxHitPoints(char)).toBe(15);
    });

    it('wizard level 1, CON 10 (0): 6 + 0 = 6', () => {
      const char = makeChar({ class: 'wizard', constitution: 10, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      expect(CombatPreviewService.calculateMaxHitPoints(char)).toBe(6);
    });

    it('fighter level 5, CON 14 (+2): 10+2 + 4*(5+1+2) = 12 + 32 = 44', () => {
      const char = makeChar({ class: 'fighter', constitution: 14, advancement: { experiencePoints: 0, currentLevel: 5, levelHistory: [] } });
      // Level 1: 10+2=12, levels 2-5: 4*(floor(10/2)+1+2) = 4*8 = 32
      expect(CombatPreviewService.calculateMaxHitPoints(char)).toBe(44);
    });

    it('minimum 1 HP even with very low CON', () => {
      const char = makeChar({ class: 'wizard', constitution: 1, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      expect(CombatPreviewService.calculateMaxHitPoints(char)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getClassSaveProficiencies', () => {
    it.each([
      ['fighter', ['strength', 'constitution']],
      ['wizard', ['intelligence', 'wisdom']],
      ['rogue', ['dexterity', 'intelligence']],
      ['cleric', ['wisdom', 'charisma']],
      ['bard', ['dexterity', 'charisma']],
    ])('%s has correct saving throw proficiencies', (className, expected) => {
      const result = CombatPreviewService.getClassSaveProficiencies(className);
      expect(result).toEqual(expect.arrayContaining(expected));
      expect(result).toHaveLength(expected.length);
    });

    it('unknown class returns empty array', () => {
      expect(CombatPreviewService.getClassSaveProficiencies('unknown')).toEqual([]);
    });
  });

  describe('calculateSavingThrows', () => {
    it('fighter proficient in STR and CON saves', () => {
      const char = makeChar({ class: 'fighter', strength: 16, constitution: 14, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      const saves = CombatPreviewService.calculateSavingThrows(char);
      // STR: +3 mod + 2 prof = +5
      expect(saves.strength).toBe(5);
      // CON: +2 mod + 2 prof = +4
      expect(saves.constitution).toBe(4);
    });

    it('non-proficient save equals raw ability modifier', () => {
      const char = makeChar({ class: 'fighter', wisdom: 12, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      const saves = CombatPreviewService.calculateSavingThrows(char);
      // WIS: +1 mod, not proficient
      expect(saves.wisdom).toBe(1);
    });

    it('proficiency bonus scales with level', () => {
      const charLv1 = makeChar({ class: 'wizard', intelligence: 18, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      const charLv9 = makeChar({ class: 'wizard', intelligence: 18, advancement: { experiencePoints: 0, currentLevel: 9, levelHistory: [] } });
      // INT: +4 mod. Lv1 prof=2 → +6; Lv9 prof=4 → +8
      expect(CombatPreviewService.calculateSavingThrows(charLv1).intelligence).toBe(6);
      expect(CombatPreviewService.calculateSavingThrows(charLv9).intelligence).toBe(8);
    });
  });

  describe('calculateSkillBonuses', () => {
    it('proficient skill adds proficiency bonus', () => {
      const char = makeChar({
        class: 'fighter',
        intelligence: 14, // +2
        skills: ['Arcana'],
        advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] },
      });
      const skills = CombatPreviewService.calculateSkillBonuses(char);
      // Arcana is INT-based: +2 mod + 2 prof = +4
      expect(skills['Arcana']).toBe(4);
    });

    it('non-proficient skill equals raw ability modifier', () => {
      const char = makeChar({
        wisdom: 16, // +3
        skills: [],
        advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] },
      });
      const skills = CombatPreviewService.calculateSkillBonuses(char);
      expect(skills['Perception']).toBe(3);
    });

    it('returns all 18 skills', () => {
      const char = makeChar();
      const skills = CombatPreviewService.calculateSkillBonuses(char);
      expect(Object.keys(skills)).toHaveLength(18);
    });
  });

  describe('calculateSpellcastingInfo', () => {
    it('wizard uses Intelligence', () => {
      const char = makeChar({ class: 'wizard', intelligence: 18, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      const info = CombatPreviewService.calculateSpellcastingInfo(char);
      expect(info).not.toBeNull();
      expect(info!.spellcastingAbility).toBe('intelligence');
    });

    it('cleric uses Wisdom', () => {
      const char = makeChar({ class: 'cleric', wisdom: 16, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      const info = CombatPreviewService.calculateSpellcastingInfo(char);
      expect(info!.spellcastingAbility).toBe('wisdom');
    });

    it('sorcerer uses Charisma', () => {
      const char = makeChar({ class: 'sorcerer', charisma: 16, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      const info = CombatPreviewService.calculateSpellcastingInfo(char);
      expect(info!.spellcastingAbility).toBe('charisma');
    });

    it('fighter (non-caster) returns null', () => {
      const char = makeChar({ class: 'fighter' });
      expect(CombatPreviewService.calculateSpellcastingInfo(char)).toBeNull();
    });

    it('barbarian (non-caster) returns null', () => {
      const char = makeChar({ class: 'barbarian' });
      expect(CombatPreviewService.calculateSpellcastingInfo(char)).toBeNull();
    });

    it('spell save DC = 8 + mod + prof', () => {
      // Wizard level 1, INT 18 (+4), prof +2 → DC = 14
      const char = makeChar({ class: 'wizard', intelligence: 18, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      const info = CombatPreviewService.calculateSpellcastingInfo(char);
      expect(info!.spellSaveDC).toBe(14);
    });

    it('spell attack bonus = mod + prof', () => {
      // Wizard level 1, INT 18 (+4), prof +2 → +6
      const char = makeChar({ class: 'wizard', intelligence: 18, advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] } });
      const info = CombatPreviewService.calculateSpellcastingInfo(char);
      expect(info!.spellAttackBonus).toBe(6);
    });

    it('ritual casting: wizard/cleric/druid = true', () => {
      const wizard = makeChar({ class: 'wizard' });
      const bard = makeChar({ class: 'bard' });
      expect(CombatPreviewService.calculateSpellcastingInfo(wizard)!.ritualCasting).toBe(true);
      expect(CombatPreviewService.calculateSpellcastingInfo(bard)!.ritualCasting).toBe(false);
    });
  });

  describe('calculateSpellSlots', () => {
    it('wizard level 1: 2 first-level slots', () => {
      const slots = CombatPreviewService.calculateSpellSlots('wizard', 1);
      expect(slots.level1.total).toBe(2);
      expect(slots.level2.total).toBe(0);
    });

    it('wizard level 5: 4/3/2 spell slots', () => {
      const slots = CombatPreviewService.calculateSpellSlots('wizard', 5);
      expect(slots.level1.total).toBe(4);
      expect(slots.level2.total).toBe(3);
      expect(slots.level3.total).toBe(2);
      expect(slots.level4.total).toBe(0);
    });

    it('fighter (non-caster): all slots are 0', () => {
      const slots = CombatPreviewService.calculateSpellSlots('fighter', 5);
      expect(slots.level1.total).toBe(0);
      expect(slots.level9.total).toBe(0);
    });

    it('paladin (half-caster) level 4: no slots below level 2', () => {
      const slots = CombatPreviewService.calculateSpellSlots('paladin', 4);
      // half-caster level = ceil(4/2) = 2 → 3 level-1 slots
      expect(slots.level1.total).toBeGreaterThan(0);
    });
  });

  describe('rollDice', () => {
    it('parses valid formula and returns total in expected range', () => {
      const result = CombatPreviewService.rollDice('1d6+0');
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeLessThanOrEqual(6);
      expect(result.rolls).toHaveLength(1);
      expect(result.modifier).toBe(0);
    });

    it('2d8+3: total between 5 and 19', () => {
      const result = CombatPreviewService.rollDice('2d8+3');
      expect(result.total).toBeGreaterThanOrEqual(5);
      expect(result.total).toBeLessThanOrEqual(19);
      expect(result.rolls).toHaveLength(2);
    });

    it('throws on invalid formula', () => {
      expect(() => CombatPreviewService.rollDice('invalid')).toThrow();
    });

    it('returns formula in result', () => {
      const result = CombatPreviewService.rollDice('1d20+5');
      expect(result.formula).toBe('1d20+5');
    });
  });

  describe('generateCombatStats', () => {
    it('returns all expected fields', () => {
      const char = makeChar({ class: 'fighter', advancement: { experiencePoints: 0, currentLevel: 3, levelHistory: [] } });
      const stats = CombatPreviewService.generateCombatStats(char);
      expect(stats).toMatchObject({
        armorClass: expect.any(Number),
        hitPoints: { current: expect.any(Number), maximum: expect.any(Number), temporary: 0 },
        speed: expect.any(Number),
        initiative: expect.any(Number),
        proficiencyBonus: expect.any(Number),
        savingThrows: expect.any(Object),
        skills: expect.any(Object),
      });
    });

    it('proficiency bonus matches level', () => {
      const char = makeChar({ advancement: { experiencePoints: 0, currentLevel: 5, levelHistory: [] } });
      const stats = CombatPreviewService.generateCombatStats(char);
      expect(stats.proficiencyBonus).toBe(3);
    });
  });
});
