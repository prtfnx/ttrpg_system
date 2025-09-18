/**
 * Spell Management Service
 * Handles spell selection, spell slot calculation, and spell list management
 */

import type { Spell } from './compendiumService';

// D&D 5e spell slot progression tables
export const SPELL_SLOTS_BY_CLASS_AND_LEVEL = {
  // Full casters (Bard, Cleric, Druid, Sorcerer, Wizard)
  Bard: {
    1: { cantrips: 2, 1: 2 },
    2: { cantrips: 2, 1: 3 },
    3: { cantrips: 2, 1: 4, 2: 2 },
    4: { cantrips: 3, 1: 4, 2: 3 },
    5: { cantrips: 3, 1: 4, 2: 3, 3: 2 },
    6: { cantrips: 3, 1: 4, 2: 3, 3: 3 },
    7: { cantrips: 3, 1: 4, 2: 3, 3: 3, 4: 1 },
    8: { cantrips: 3, 1: 4, 2: 3, 3: 3, 4: 2 },
    9: { cantrips: 3, 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    10: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    11: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    12: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    13: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    14: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    15: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    16: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    17: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
    18: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
    19: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
    20: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 }
  },
  Cleric: {
    1: { cantrips: 3, 1: 2 },
    2: { cantrips: 3, 1: 3 },
    3: { cantrips: 3, 1: 4, 2: 2 },
    4: { cantrips: 4, 1: 4, 2: 3 },
    5: { cantrips: 4, 1: 4, 2: 3, 3: 2 },
    6: { cantrips: 4, 1: 4, 2: 3, 3: 3 },
    7: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 1 },
    8: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 2 },
    9: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    10: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    11: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    12: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    13: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    14: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    15: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    16: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    17: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
    18: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
    19: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
    20: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 }
  },
  Druid: {
    1: { cantrips: 2, 1: 2 },
    2: { cantrips: 2, 1: 3 },
    3: { cantrips: 2, 1: 4, 2: 2 },
    4: { cantrips: 3, 1: 4, 2: 3 },
    5: { cantrips: 3, 1: 4, 2: 3, 3: 2 },
    6: { cantrips: 3, 1: 4, 2: 3, 3: 3 },
    7: { cantrips: 3, 1: 4, 2: 3, 3: 3, 4: 1 },
    8: { cantrips: 3, 1: 4, 2: 3, 3: 3, 4: 2 },
    9: { cantrips: 3, 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    10: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    11: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    12: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    13: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    14: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    15: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    16: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    17: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
    18: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
    19: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
    20: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 }
  },
  Sorcerer: {
    1: { cantrips: 4, 1: 2 },
    2: { cantrips: 4, 1: 3 },
    3: { cantrips: 4, 1: 4, 2: 2 },
    4: { cantrips: 5, 1: 4, 2: 3 },
    5: { cantrips: 5, 1: 4, 2: 3, 3: 2 },
    6: { cantrips: 5, 1: 4, 2: 3, 3: 3 },
    7: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 1 },
    8: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 2 },
    9: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    10: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    11: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    12: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    13: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    14: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    15: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    16: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    17: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
    18: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
    19: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
    20: { cantrips: 6, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 }
  },
  Wizard: {
    1: { cantrips: 3, 1: 2 },
    2: { cantrips: 3, 1: 3 },
    3: { cantrips: 3, 1: 4, 2: 2 },
    4: { cantrips: 4, 1: 4, 2: 3 },
    5: { cantrips: 4, 1: 4, 2: 3, 3: 2 },
    6: { cantrips: 4, 1: 4, 2: 3, 3: 3 },
    7: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 1 },
    8: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 2 },
    9: { cantrips: 4, 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    10: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    11: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    12: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
    13: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    14: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
    15: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    16: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    17: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
    18: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
    19: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
    20: { cantrips: 5, 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 }
  },
  // Half casters (Paladin, Ranger)
  Paladin: {
    1: { cantrips: 0 },
    2: { cantrips: 0, 1: 2 },
    3: { cantrips: 0, 1: 3 },
    4: { cantrips: 0, 1: 3 },
    5: { cantrips: 0, 1: 4, 2: 2 },
    6: { cantrips: 0, 1: 4, 2: 2 },
    7: { cantrips: 0, 1: 4, 2: 3 },
    8: { cantrips: 0, 1: 4, 2: 3 },
    9: { cantrips: 0, 1: 4, 2: 3, 3: 2 },
    10: { cantrips: 0, 1: 4, 2: 3, 3: 2 },
    11: { cantrips: 0, 1: 4, 2: 3, 3: 3 },
    12: { cantrips: 0, 1: 4, 2: 3, 3: 3 },
    13: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 1 },
    14: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 1 },
    15: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 2 },
    16: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 2 },
    17: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    18: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    19: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    20: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 }
  },
  Ranger: {
    1: { cantrips: 0 },
    2: { cantrips: 0, 1: 2 },
    3: { cantrips: 0, 1: 3 },
    4: { cantrips: 0, 1: 3 },
    5: { cantrips: 0, 1: 4, 2: 2 },
    6: { cantrips: 0, 1: 4, 2: 2 },
    7: { cantrips: 0, 1: 4, 2: 3 },
    8: { cantrips: 0, 1: 4, 2: 3 },
    9: { cantrips: 0, 1: 4, 2: 3, 3: 2 },
    10: { cantrips: 0, 1: 4, 2: 3, 3: 2 },
    11: { cantrips: 0, 1: 4, 2: 3, 3: 3 },
    12: { cantrips: 0, 1: 4, 2: 3, 3: 3 },
    13: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 1 },
    14: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 1 },
    15: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 2 },
    16: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 2 },
    17: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    18: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    19: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    20: { cantrips: 0, 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 }
  },
  // Warlock (Pact Magic)
  Warlock: {
    1: { cantrips: 2, pact_slots: 1, pact_level: 1 },
    2: { cantrips: 2, pact_slots: 2, pact_level: 1 },
    3: { cantrips: 2, pact_slots: 2, pact_level: 2 },
    4: { cantrips: 3, pact_slots: 2, pact_level: 2 },
    5: { cantrips: 3, pact_slots: 2, pact_level: 3 },
    6: { cantrips: 3, pact_slots: 2, pact_level: 3 },
    7: { cantrips: 3, pact_slots: 2, pact_level: 4 },
    8: { cantrips: 3, pact_slots: 2, pact_level: 4 },
    9: { cantrips: 3, pact_slots: 2, pact_level: 5 },
    10: { cantrips: 4, pact_slots: 2, pact_level: 5 },
    11: { cantrips: 4, pact_slots: 3, pact_level: 5 },
    12: { cantrips: 4, pact_slots: 3, pact_level: 5 },
    13: { cantrips: 4, pact_slots: 3, pact_level: 5 },
    14: { cantrips: 4, pact_slots: 3, pact_level: 5 },
    15: { cantrips: 4, pact_slots: 3, pact_level: 5 },
    16: { cantrips: 4, pact_slots: 3, pact_level: 5 },
    17: { cantrips: 4, pact_slots: 4, pact_level: 5 },
    18: { cantrips: 4, pact_slots: 4, pact_level: 5 },
    19: { cantrips: 4, pact_slots: 4, pact_level: 5 },
    20: { cantrips: 4, pact_slots: 4, pact_level: 5 }
  }
};

// Number of spells known for classes that don't learn all spells
export const SPELLS_KNOWN_BY_CLASS = {
  Bard: { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9, 7: 10, 8: 11, 9: 12, 10: 14, 11: 15, 12: 15, 13: 16, 14: 18, 15: 19, 16: 19, 17: 20, 18: 22, 19: 22, 20: 22 },
  Sorcerer: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11, 11: 12, 12: 12, 13: 13, 14: 13, 15: 14, 16: 14, 17: 15, 18: 15, 19: 15, 20: 15 },
  Warlock: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 10, 11: 11, 12: 11, 13: 12, 14: 12, 15: 13, 16: 13, 17: 14, 18: 14, 19: 15, 20: 15 },
  Ranger: { 1: 0, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 5, 9: 6, 10: 6, 11: 7, 12: 7, 13: 8, 14: 8, 15: 9, 16: 9, 17: 10, 18: 10, 19: 11, 20: 11 },
  Paladin: { 1: 0, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 5, 9: 6, 10: 6, 11: 7, 12: 7, 13: 8, 14: 8, 15: 9, 16: 9, 17: 10, 18: 10, 19: 11, 20: 11 }
};

export interface SpellSlots {
  cantrips?: number;
  [key: number]: number;
  pact_slots?: number;
  pact_level?: number;
}

export interface CharacterSpells {
  cantrips: string[];
  knownSpells: string[];
  preparedSpells: string[];
  spellSlots: SpellSlots;
}

class SpellManagementService {
  /**
   * Get spell slots available for a character class and level
   */
  getSpellSlots(characterClass: string, level: number): SpellSlots {
    const classData = SPELL_SLOTS_BY_CLASS_AND_LEVEL[characterClass as keyof typeof SPELL_SLOTS_BY_CLASS_AND_LEVEL];
    if (!classData) {
      return { cantrips: 0 };
    }
    
    return classData[level as keyof typeof classData] || { cantrips: 0 };
  }

  /**
   * Get number of spells known for classes that have limited spell knowledge
   */
  getSpellsKnown(characterClass: string, level: number): number {
    const classData = SPELLS_KNOWN_BY_CLASS[characterClass as keyof typeof SPELLS_KNOWN_BY_CLASS];
    if (!classData) {
      // Classes like Cleric, Druid, Wizard know all spells of their class
      return Infinity;
    }
    
    return classData[level as keyof typeof classData] || 0;
  }

  /**
   * Filter spells available to a specific class
   */
  getSpellsForClass(spells: Record<string, Spell>, characterClass: string): Record<string, Spell> {
    const filtered: Record<string, Spell> = {};
    
    for (const [name, spell] of Object.entries(spells)) {
      if (spell.classes.includes(characterClass)) {
        filtered[name] = spell;
      }
    }
    
    return filtered;
  }

  /**
   * Get maximum spell level a character can cast
   */
  getMaxSpellLevel(characterClass: string, level: number): number {
    const slots = this.getSpellSlots(characterClass, level);
    
    // For warlocks, use pact magic level
    if (characterClass === 'Warlock' && slots.pact_level) {
      return slots.pact_level;
    }
    
    // Find highest spell level with available slots
    for (let spellLevel = 9; spellLevel >= 1; spellLevel--) {
      if (slots[spellLevel] && slots[spellLevel] > 0) {
        return spellLevel;
      }
    }
    
    return 0; // Only cantrips available
  }

  /**
   * Validate spell selection for a character
   */
  validateSpellSelection(
    characterClass: string,
    characterLevel: number,
    selectedSpells: string[],
    spellsData: Record<string, Spell>
  ): {
    isValid: boolean;
    errors: string[];
    cantripsCount: number;
    spellsCount: number;
    maxCantrips: number;
    maxSpells: number;
  } {
    const errors: string[] = [];
    const slots = this.getSpellSlots(characterClass, characterLevel);
    const maxSpells = this.getSpellsKnown(characterClass, characterLevel);
    const maxSpellLevel = this.getMaxSpellLevel(characterClass, characterLevel);
    
    let cantripsCount = 0;
    let spellsCount = 0;
    
    // Count cantrips and spells
    selectedSpells.forEach(spellName => {
      const spell = spellsData[spellName];
      if (!spell) {
        errors.push(`Unknown spell: ${spellName}`);
        return;
      }
      
      if (spell.level === 0) {
        cantripsCount++;
      } else {
        spellsCount++;
      }
      
      // Check if spell is available to this class
      if (!spell.classes.includes(characterClass)) {
        errors.push(`${spellName} is not available to ${characterClass}`);
      }
      
      // Check spell level
      if (spell.level > maxSpellLevel) {
        errors.push(`${spellName} (level ${spell.level}) is too high for character level ${characterLevel}`);
      }
    });
    
    // Validate cantrip count
    if (slots.cantrips && cantripsCount > slots.cantrips) {
      errors.push(`Too many cantrips selected: ${cantripsCount}/${slots.cantrips}`);
    }
    
    // Validate spell count
    if (maxSpells !== Infinity && spellsCount > maxSpells) {
      errors.push(`Too many spells selected: ${spellsCount}/${maxSpells}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      cantripsCount,
      spellsCount,
      maxCantrips: slots.cantrips || 0,
      maxSpells: maxSpells === Infinity ? 999 : maxSpells
    };
  }

  /**
   * Get suggested spells for a class and level (for AI assistance)
   */
  getSuggestedSpells(
    spells: Record<string, Spell>,
    characterClass: string,
    characterLevel: number
  ): {
    cantrips: Spell[];
    spells: Spell[];
  } {
    const classSpells = this.getSpellsForClass(spells, characterClass);
    const maxSpellLevel = this.getMaxSpellLevel(characterClass, characterLevel);
    
    const cantrips = Object.values(classSpells)
      .filter(spell => spell.level === 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const spellsList = Object.values(classSpells)
      .filter(spell => spell.level > 0 && spell.level <= maxSpellLevel)
      .sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
      });
    
    return {
      cantrips,
      spells: spellsList
    };
  }

  /**
   * Calculate spell save DC and spell attack bonus
   */
  getSpellcastingStats(
    characterClass: string,
    characterLevel: number,
    abilityScores: Record<string, number>
  ): {
    spellcastingAbility: string;
    spellSaveDC: number;
    spellAttackBonus: number;
    proficiencyBonus: number;
  } {
    // Map classes to their spellcasting abilities
    const spellcastingAbilities = {
      Bard: 'Charisma',
      Cleric: 'Wisdom',
      Druid: 'Wisdom',
      Paladin: 'Charisma',
      Ranger: 'Wisdom',
      Sorcerer: 'Charisma',
      Warlock: 'Charisma',
      Wizard: 'Intelligence'
    };
    
    const spellcastingAbility = spellcastingAbilities[characterClass as keyof typeof spellcastingAbilities] || 'Intelligence';
    const proficiencyBonus = Math.ceil(characterLevel / 4) + 1;
    const abilityModifier = Math.floor((abilityScores[spellcastingAbility] - 10) / 2);
    
    const spellSaveDC = 8 + proficiencyBonus + abilityModifier;
    const spellAttackBonus = proficiencyBonus + abilityModifier;
    
    return {
      spellcastingAbility,
      spellSaveDC,
      spellAttackBonus,
      proficiencyBonus
    };
  }
}

export const spellManagementService = new SpellManagementService();
export default spellManagementService;