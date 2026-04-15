import type { Spell } from '@features/compendium';
import { describe, expect, it } from 'vitest';

import {
    SPELL_SLOTS_BY_CLASS_AND_LEVEL,
    spellManagementService,
    SPELLS_KNOWN_BY_CLASS,
} from '../spellManagement.service';

// -- Helpers --

function makeSpell(overrides: Partial<Spell> = {}): Spell {
  return {
    name: 'Test Spell',
    level: 1,
    school: 'Evocation',
    ritual: false,
    casting_time: '1 action',
    range: '120 feet',
    duration: 'Instantaneous',
    concentration: false,
    components: {
      verbal: true,
      somatic: true,
      material: false,
      material_description: '',
      material_consumed: false,
    },
    classes: ['Wizard'],
    description: 'A test spell.',
    ...overrides,
  };
}

const FULL_CASTERS = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'] as const;
const HALF_CASTERS = ['Paladin', 'Ranger'] as const;

// -- getSpellSlots --

describe('spellManagementService.getSpellSlots', () => {
  it('returns correct slots for a level 1 Wizard', () => {
    const slots = spellManagementService.getSpellSlots('Wizard', 1);
    expect(slots).toEqual({ cantrips: 3, 1: 2 });
  });

  it('returns correct slots for a level 5 Bard (gains 3rd-level slots)', () => {
    const slots = spellManagementService.getSpellSlots('Bard', 5);
    expect(slots).toEqual({ cantrips: 3, 1: 4, 2: 3, 3: 2 });
  });

  it('returns level 20 full caster slots (all spell levels)', () => {
    const slots = spellManagementService.getSpellSlots('Cleric', 20);
    expect(slots[9]).toBe(1);
    expect(slots.cantrips).toBe(5);
  });

  it('returns pact magic slots for Warlock', () => {
    const slots = spellManagementService.getSpellSlots('Warlock', 5);
    expect(slots.pact_slots).toBe(2);
    expect(slots.pact_level).toBe(3);
    expect(slots.cantrips).toBe(3);
  });

  it('returns cantrips: 0 for Paladin level 1 (no spells yet)', () => {
    const slots = spellManagementService.getSpellSlots('Paladin', 1);
    expect(slots.cantrips).toBe(0);
    expect(slots[1]).toBeUndefined();
  });

  it('normalizes class name casing', () => {
    const slots = spellManagementService.getSpellSlots('wizard', 1);
    expect(slots).toEqual({ cantrips: 3, 1: 2 });
  });

  it('returns { cantrips: 0 } for an unknown class', () => {
    const slots = spellManagementService.getSpellSlots('Fighter', 5);
    expect(slots).toEqual({ cantrips: 0 });
  });

  it('returns { cantrips: 0 } for an out-of-range level', () => {
    const slots = spellManagementService.getSpellSlots('Wizard', 25);
    expect(slots).toEqual({ cantrips: 0 });
  });

  it.each(FULL_CASTERS)('has data for all 20 levels for %s', (cls) => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      const slots = spellManagementService.getSpellSlots(cls, lvl);
      expect(slots.cantrips).toBeDefined();
    }
  });

  it.each(HALF_CASTERS)('half-caster %s gets spell slots at level 2', (cls) => {
    const l1 = spellManagementService.getSpellSlots(cls, 1);
    const l2 = spellManagementService.getSpellSlots(cls, 2);
    expect(l1[1]).toBeUndefined();
    expect(l2[1]).toBe(2);
  });
});

// -- getSpellsKnown --

describe('spellManagementService.getSpellsKnown', () => {
  it('returns fixed spells-known for Bard level 1', () => {
    expect(spellManagementService.getSpellsKnown('Bard', 1)).toBe(4);
  });

  it('returns fixed spells-known for Sorcerer level 10', () => {
    expect(spellManagementService.getSpellsKnown('Sorcerer', 10)).toBe(11);
  });

  it('returns fixed spells-known for Warlock level 5', () => {
    expect(spellManagementService.getSpellsKnown('Warlock', 5)).toBe(6);
  });

  it('returns 0 for Ranger level 1 (no spells yet)', () => {
    expect(spellManagementService.getSpellsKnown('Ranger', 1)).toBe(0);
  });

  it('returns prepared count for Cleric (wisdom modifier + level)', () => {
    // Wisdom 16 → modifier +3, level 5 → 3+5 = 8
    const count = spellManagementService.getSpellsKnown('Cleric', 5, { wisdom: 16 });
    expect(count).toBe(8);
  });

  it('returns prepared count for Wizard (intelligence modifier + level)', () => {
    // Intelligence 20 → modifier +5, level 3 → 5+3 = 8
    const count = spellManagementService.getSpellsKnown('Wizard', 3, { intelligence: 20 });
    expect(count).toBe(8);
  });

  it('enforces minimum of 1 for prepared casters', () => {
    // Intelligence 6 → modifier -2, level 1 → -2+1 = -1, clamped to 1
    const count = spellManagementService.getSpellsKnown('Wizard', 1, { intelligence: 6 });
    expect(count).toBe(1);
  });

  it('returns 0 for prepared caster without ability scores', () => {
    // Cleric without ability scores → falls through to 0
    expect(spellManagementService.getSpellsKnown('Cleric', 5)).toBe(0);
  });

  it('returns 0 for non-spellcasting class', () => {
    expect(spellManagementService.getSpellsKnown('Fighter', 10)).toBe(0);
  });

  it('normalizes class name casing', () => {
    expect(spellManagementService.getSpellsKnown('bard', 1)).toBe(4);
  });
});

// -- getMaxSpellLevel --

describe('spellManagementService.getMaxSpellLevel', () => {
  it('returns 1 for a level 1 full caster', () => {
    expect(spellManagementService.getMaxSpellLevel('Wizard', 1)).toBe(1);
  });

  it('returns 3 for a level 5 full caster', () => {
    expect(spellManagementService.getMaxSpellLevel('Bard', 5)).toBe(3);
  });

  it('returns 9 for a level 17+ full caster', () => {
    expect(spellManagementService.getMaxSpellLevel('Cleric', 17)).toBe(9);
  });

  it('returns pact_level for Warlock', () => {
    // Warlock level 7: pact_level = 4
    expect(spellManagementService.getMaxSpellLevel('Warlock', 7)).toBe(4);
  });

  it('returns 0 for Paladin level 1 (no spell slots)', () => {
    expect(spellManagementService.getMaxSpellLevel('Paladin', 1)).toBe(0);
  });

  it('returns 0 for non-caster class', () => {
    expect(spellManagementService.getMaxSpellLevel('Fighter', 10)).toBe(0);
  });

  it('half casters cap at 5th level spells', () => {
    expect(spellManagementService.getMaxSpellLevel('Ranger', 20)).toBe(5);
    expect(spellManagementService.getMaxSpellLevel('Paladin', 20)).toBe(5);
  });
});

// -- getSpellsForClass --

describe('spellManagementService.getSpellsForClass', () => {
  const spells: Record<string, Spell> = {
    'Magic Missile': makeSpell({ name: 'Magic Missile', classes: ['Wizard', 'Sorcerer'] }),
    'Cure Wounds': makeSpell({ name: 'Cure Wounds', classes: ['Cleric', 'Bard', 'Druid'] }),
    'Eldritch Blast': makeSpell({ name: 'Eldritch Blast', level: 0, classes: ['Warlock'] }),
    'Shield': makeSpell({ name: 'Shield', classes: ['Wizard', 'Sorcerer'] }),
  };

  it('filters spells by class', () => {
    const wizardSpells = spellManagementService.getSpellsForClass(spells, 'Wizard');
    expect(Object.keys(wizardSpells)).toEqual(['Magic Missile', 'Shield']);
  });

  it('returns empty for class with no spells', () => {
    const result = spellManagementService.getSpellsForClass(spells, 'Ranger');
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const result = spellManagementService.getSpellsForClass(spells, 'wizard');
    expect(Object.keys(result)).toEqual(['Magic Missile', 'Shield']);
  });

  it('handles subclass notation like "Fighter (eldritch knight)"', () => {
    const spellsWithSubclass: Record<string, Spell> = {
      'Fire Bolt': makeSpell({ name: 'Fire Bolt', classes: ['Wizard', 'Fighter (eldritch knight)'] }),
    };
    const result = spellManagementService.getSpellsForClass(spellsWithSubclass, 'Fighter');
    expect(Object.keys(result)).toEqual(['Fire Bolt']);
  });

  it('returns empty record for empty input', () => {
    const result = spellManagementService.getSpellsForClass({}, 'Wizard');
    expect(result).toEqual({});
  });
});

// -- validateSpellSelection --

describe('spellManagementService.validateSpellSelection', () => {
  const spellsData: Record<string, Spell> = {
    'Fire Bolt': makeSpell({ name: 'Fire Bolt', level: 0, classes: ['Wizard'] }),
    'Light': makeSpell({ name: 'Light', level: 0, classes: ['Wizard', 'Cleric'] }),
    'Magic Missile': makeSpell({ name: 'Magic Missile', level: 1, classes: ['Wizard', 'Sorcerer'] }),
    'Fireball': makeSpell({ name: 'Fireball', level: 3, classes: ['Wizard', 'Sorcerer'] }),
    'Wish': makeSpell({ name: 'Wish', level: 9, classes: ['Wizard', 'Sorcerer'] }),
    'Cure Wounds': makeSpell({ name: 'Cure Wounds', level: 1, classes: ['Cleric', 'Bard'] }),
  };

  it('validates a correct spell selection for known-spells caster', () => {
    // Use Sorcerer (fixed spells-known list): level 5 knows 6 spells
    const result = spellManagementService.validateSpellSelection(
      'Sorcerer', 5,
      ['Magic Missile', 'Fireball'],
      spellsData,
    );
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.cantripsCount).toBe(0);
    expect(result.spellsCount).toBe(2);
  });

  it('rejects unknown spells', () => {
    const result = spellManagementService.validateSpellSelection(
      'Wizard', 5,
      ['Nonexistent Spell'],
      spellsData,
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Unknown spell: Nonexistent Spell');
  });

  it('rejects spells not available to the class', () => {
    const result = spellManagementService.validateSpellSelection(
      'Wizard', 5,
      ['Cure Wounds'],
      spellsData,
    );
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('not available to Wizard');
  });

  it('rejects spells above max level for character', () => {
    const result = spellManagementService.validateSpellSelection(
      'Wizard', 1,
      ['Wish'],
      spellsData,
    );
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('too high for character level');
  });

  it('validates empty selection as valid', () => {
    const result = spellManagementService.validateSpellSelection(
      'Wizard', 5, [], spellsData,
    );
    expect(result.isValid).toBe(true);
    expect(result.cantripsCount).toBe(0);
    expect(result.spellsCount).toBe(0);
  });

  it('reports maxCantrips and maxSpells', () => {
    const result = spellManagementService.validateSpellSelection(
      'Bard', 1,
      [],
      spellsData,
    );
    // Bard level 1: 2 cantrips, 4 spells known
    expect(result.maxCantrips).toBe(2);
    expect(result.maxSpells).toBe(4);
  });
});

// -- getSpellcastingStats --

describe('spellManagementService.getSpellcastingStats', () => {
  const defaultAbilities = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 16,
    wisdom: 14,
    charisma: 12,
  };

  it('returns correct stats for a Wizard', () => {
    const stats = spellManagementService.getSpellcastingStats('Wizard', 5, defaultAbilities);
    expect(stats.spellcastingAbility).toBe('Intelligence');
    // proficiency = ceil(5/4) + 1 = 3
    expect(stats.proficiencyBonus).toBe(3);
    // INT 16 → modifier +3
    // Save DC = 8 + 3 + 3 = 14
    expect(stats.spellSaveDC).toBe(14);
    // Attack = 3 + 3 = 6
    expect(stats.spellAttackBonus).toBe(6);
  });

  it('returns correct stats for a Cleric (wisdom-based)', () => {
    const stats = spellManagementService.getSpellcastingStats('Cleric', 1, defaultAbilities);
    expect(stats.spellcastingAbility).toBe('Wisdom');
    // proficiency = ceil(1/4) + 1 = 2
    expect(stats.proficiencyBonus).toBe(2);
    // WIS 14 → modifier +2
    // Save DC = 8 + 2 + 2 = 12
    expect(stats.spellSaveDC).toBe(12);
    expect(stats.spellAttackBonus).toBe(4);
  });

  it('returns correct stats for a Bard (charisma-based)', () => {
    const stats = spellManagementService.getSpellcastingStats('Bard', 9, defaultAbilities);
    expect(stats.spellcastingAbility).toBe('Charisma');
    // proficiency = ceil(9/4) + 1 = 4
    expect(stats.proficiencyBonus).toBe(4);
    // CHA 12 → modifier +1
    // Save DC = 8 + 4 + 1 = 13
    expect(stats.spellSaveDC).toBe(13);
    expect(stats.spellAttackBonus).toBe(5);
  });

  it('handles missing ability scores gracefully (defaults to 10)', () => {
    const stats = spellManagementService.getSpellcastingStats('Wizard', 1, {} as Record<string, number>);
    // INT not found → defaults to 10 → modifier 0
    // proficiency = 2
    // Save DC = 8 + 2 + 0 = 10
    expect(stats.spellSaveDC).toBe(10);
    expect(stats.spellAttackBonus).toBe(2);
  });

  it('handles null/undefined ability scores', () => {
    const stats = spellManagementService.getSpellcastingStats('Wizard', 1, null as unknown as Record<string, number>);
    // Falls back to all 10s → modifier 0, proficiency 2
    expect(stats.spellSaveDC).toBe(10);
  });

  it('proficiency bonus scales correctly with level', () => {
    // Level 1-4: +2, Level 5-8: +3, Level 9-12: +4, Level 13-16: +5, Level 17-20: +6
    const abilities = { intelligence: 10 };
    expect(spellManagementService.getSpellcastingStats('Wizard', 1, abilities).proficiencyBonus).toBe(2);
    expect(spellManagementService.getSpellcastingStats('Wizard', 4, abilities).proficiencyBonus).toBe(2);
    expect(spellManagementService.getSpellcastingStats('Wizard', 5, abilities).proficiencyBonus).toBe(3);
    expect(spellManagementService.getSpellcastingStats('Wizard', 9, abilities).proficiencyBonus).toBe(4);
    expect(spellManagementService.getSpellcastingStats('Wizard', 13, abilities).proficiencyBonus).toBe(5);
    expect(spellManagementService.getSpellcastingStats('Wizard', 17, abilities).proficiencyBonus).toBe(6);
  });

  it('defaults to Intelligence for unknown class', () => {
    const stats = spellManagementService.getSpellcastingStats('Fighter', 5, defaultAbilities);
    expect(stats.spellcastingAbility).toBe('Intelligence');
  });
});

// -- getSuggestedSpells --

describe('spellManagementService.getSuggestedSpells', () => {
  const spells: Record<string, Spell> = {
    'Fire Bolt': makeSpell({ name: 'Fire Bolt', level: 0, classes: ['Wizard'] }),
    'Prestidigitation': makeSpell({ name: 'Prestidigitation', level: 0, classes: ['Wizard'] }),
    'Magic Missile': makeSpell({ name: 'Magic Missile', level: 1, classes: ['Wizard'] }),
    'Fireball': makeSpell({ name: 'Fireball', level: 3, classes: ['Wizard'] }),
    'Wish': makeSpell({ name: 'Wish', level: 9, classes: ['Wizard'] }),
    'Cure Wounds': makeSpell({ name: 'Cure Wounds', level: 1, classes: ['Cleric'] }),
  };

  it('separates cantrips from leveled spells', () => {
    const result = spellManagementService.getSuggestedSpells(spells, 'Wizard', 5);
    expect(result.cantrips).toHaveLength(2);
    expect(result.cantrips.every(s => s.level === 0)).toBe(true);
    expect(result.spells.every(s => s.level > 0)).toBe(true);
  });

  it('filters out spells above max spell level', () => {
    // Wizard level 5 can cast up to 3rd level
    const result = spellManagementService.getSuggestedSpells(spells, 'Wizard', 5);
    const spellLevels = result.spells.map(s => s.level);
    expect(spellLevels).not.toContain(9);
    expect(spellLevels).toContain(1);
    expect(spellLevels).toContain(3);
  });

  it('sorts cantrips alphabetically', () => {
    const result = spellManagementService.getSuggestedSpells(spells, 'Wizard', 5);
    const names = result.cantrips.map(s => s.name);
    expect(names).toEqual(['Fire Bolt', 'Prestidigitation']);
  });

  it('sorts spells by level then name', () => {
    const result = spellManagementService.getSuggestedSpells(spells, 'Wizard', 20);
    const entries = result.spells.map(s => [s.level, s.name]);
    // Level 1: Magic Missile, Level 3: Fireball, Level 9: Wish
    expect(entries).toEqual([
      [1, 'Magic Missile'],
      [3, 'Fireball'],
      [9, 'Wish'],
    ]);
  });

  it('returns empty arrays for class with no spells', () => {
    const result = spellManagementService.getSuggestedSpells(spells, 'Ranger', 5);
    expect(result.cantrips).toHaveLength(0);
    expect(result.spells).toHaveLength(0);
  });
});

// -- Data table integrity --

describe('spell slot data tables', () => {
  it('all full casters have entries for levels 1-20', () => {
    for (const cls of FULL_CASTERS) {
      const classData = SPELL_SLOTS_BY_CLASS_AND_LEVEL[cls];
      for (let lvl = 1; lvl <= 20; lvl++) {
        expect(classData[lvl as keyof typeof classData], `${cls} missing level ${lvl}`).toBeDefined();
      }
    }
  });

  it('all half casters have entries for levels 1-20', () => {
    for (const cls of HALF_CASTERS) {
      const classData = SPELL_SLOTS_BY_CLASS_AND_LEVEL[cls];
      for (let lvl = 1; lvl <= 20; lvl++) {
        expect(classData[lvl as keyof typeof classData], `${cls} missing level ${lvl}`).toBeDefined();
      }
    }
  });

  it('Warlock has entries for levels 1-20', () => {
    const classData = SPELL_SLOTS_BY_CLASS_AND_LEVEL.Warlock;
    for (let lvl = 1; lvl <= 20; lvl++) {
      expect(classData[lvl as keyof typeof classData], `Warlock missing level ${lvl}`).toBeDefined();
    }
  });

  it('SPELLS_KNOWN_BY_CLASS has entries for levels 1-20 for each class', () => {
    for (const cls of Object.keys(SPELLS_KNOWN_BY_CLASS) as (keyof typeof SPELLS_KNOWN_BY_CLASS)[]) {
      const classData = SPELLS_KNOWN_BY_CLASS[cls];
      for (let lvl = 1; lvl <= 20; lvl++) {
        expect(classData[lvl as keyof typeof classData], `${cls} spells-known missing level ${lvl}`).toBeDefined();
      }
    }
  });

  it('spell slot counts are non-negative', () => {
    for (const cls of [...FULL_CASTERS, ...HALF_CASTERS, 'Warlock'] as const) {
      const classData = SPELL_SLOTS_BY_CLASS_AND_LEVEL[cls];
      for (let lvl = 1; lvl <= 20; lvl++) {
        const slots = classData[lvl as keyof typeof classData] as Record<string, number>;
        for (const [key, value] of Object.entries(slots)) {
          expect(value, `${cls} level ${lvl} ${key} is negative`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
