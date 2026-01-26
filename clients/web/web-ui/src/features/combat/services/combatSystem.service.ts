import type { WizardFormData } from '../components/CharacterWizard/WizardFormData';

/**
 * Combat System Service
 * Handles D&D 5e combat mechanics including attacks, damage, saves, and spell casting
 */

export interface CombatStats {
  armorClass: number;
  hitPoints: {
    current: number;
    maximum: number;
    temporary: number;
  };
  speed: number;
  initiative: number;
  proficiencyBonus: number;
  savingThrows: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  skills: Record<string, number>;
  passivePerception: number;
}

export interface AttackRoll {
  type: 'melee' | 'ranged' | 'spell';
  name: string;
  attackBonus: number;
  damage: DamageRoll[];
  properties: string[];
  range?: string;
  description?: string;
}

export interface DamageRoll {
  dice: string; // e.g., "1d8", "2d6"
  type: string; // e.g., "slashing", "fire", "psychic"
  bonus: number;
}

export interface SpellcastingInfo {
  spellcastingAbility: 'intelligence' | 'wisdom' | 'charisma' | null;
  spellAttackBonus: number;
  spellSaveDC: number;
  spellSlots: {
    level1: { total: number; used: number };
    level2: { total: number; used: number };
    level3: { total: number; used: number };
    level4: { total: number; used: number };
    level5: { total: number; used: number };
    level6: { total: number; used: number };
    level7: { total: number; used: number };
    level8: { total: number; used: number };
    level9: { total: number; used: number };
  };
  cantripsKnown: number;
  spellsKnown: number;
  ritualCasting: boolean;
}

export interface DiceResult {
  total: number;
  rolls: number[];
  modifier: number;
  formula: string;
  timestamp: Date;
}

export class CombatSystemService {
  /**
   * Calculate ability score modifier
   */
  static getAbilityModifier(abilityScore: number): number {
    return Math.floor((abilityScore - 10) / 2);
  }

  /**
   * Calculate proficiency bonus based on character level
   */
  static getProficiencyBonus(level: number): number {
    return Math.ceil(level / 4) + 1;
  }

  /**
   * Calculate initiative modifier
   */
  static getInitiativeModifier(dexterity: number): number {
    return this.getAbilityModifier(dexterity);
  }

  /**
   * Calculate Armor Class based on armor and dexterity
   */
  static calculateArmorClass(character: WizardFormData): number {
    const dexMod = this.getAbilityModifier(character.dexterity);
    
    // Base AC calculation (simplified - could be expanded with actual armor)
    let baseAC = 10;
    
    // Check for armor in equipment
    if (character.equipment?.items) {
      const armor = character.equipment.items.find(item => 
        item.equipment.name.toLowerCase().includes('armor') ||
        item.equipment.name.toLowerCase().includes('leather') ||
        item.equipment.name.toLowerCase().includes('chain') ||
        item.equipment.name.toLowerCase().includes('plate')
      );
      
      if (armor) {
        // Simplified armor AC values
        const armorName = armor.equipment.name.toLowerCase();
        if (armorName.includes('leather')) baseAC = 11;
        else if (armorName.includes('chain')) baseAC = 13;
        else if (armorName.includes('plate')) baseAC = 18;
      }
    }
    
    // Add dex modifier (capped by armor type)
    if (baseAC === 10) { // No armor - full dex
      baseAC += dexMod;
    } else if (baseAC <= 12) { // Light armor - full dex
      baseAC += dexMod;
    } else if (baseAC <= 14) { // Medium armor - max +2 dex
      baseAC += Math.min(dexMod, 2);
    }
    // Heavy armor - no dex bonus
    
    return Math.max(baseAC, 10);
  }

  /**
   * Calculate maximum hit points
   */
  static calculateMaxHitPoints(character: WizardFormData): number {
    const level = character.advancement?.currentLevel || 1;
    const conMod = this.getAbilityModifier(character.constitution);
    
    // Hit die by class
    const hitDieByClass: Record<string, number> = {
      'barbarian': 12,
      'fighter': 10,
      'paladin': 10,
      'ranger': 10,
      'bard': 8,
      'cleric': 8,
      'druid': 8,
      'monk': 8,
      'rogue': 8,
      'warlock': 8,
      'artificer': 8,
      'sorcerer': 6,
      'wizard': 6
    };
    
    const hitDie = hitDieByClass[character.class.toLowerCase()] || 8;
    
    // First level gets max hit die + con mod
    // Subsequent levels get average of hit die + con mod
    const baseHP = hitDie + conMod;
    const averagePerLevel = Math.floor(hitDie / 2) + 1 + conMod;
    const additionalHP = (level - 1) * averagePerLevel;
    
    return Math.max(1, baseHP + additionalHP);
  }

  /**
   * Calculate saving throw modifiers
   */
  static calculateSavingThrows(character: WizardFormData): CombatStats['savingThrows'] {
    const level = character.advancement?.currentLevel || 1;
    const profBonus = this.getProficiencyBonus(level);
    
    // Determine proficient saves by class
    const saveProficiencies = this.getClassSaveProficiencies(character.class);
    
    return {
      strength: this.getAbilityModifier(character.strength) + 
        (saveProficiencies.includes('strength') ? profBonus : 0),
      dexterity: this.getAbilityModifier(character.dexterity) + 
        (saveProficiencies.includes('dexterity') ? profBonus : 0),
      constitution: this.getAbilityModifier(character.constitution) + 
        (saveProficiencies.includes('constitution') ? profBonus : 0),
      intelligence: this.getAbilityModifier(character.intelligence) + 
        (saveProficiencies.includes('intelligence') ? profBonus : 0),
      wisdom: this.getAbilityModifier(character.wisdom) + 
        (saveProficiencies.includes('wisdom') ? profBonus : 0),
      charisma: this.getAbilityModifier(character.charisma) + 
        (saveProficiencies.includes('charisma') ? profBonus : 0)
    };
  }

  /**
   * Get class saving throw proficiencies
   */
  static getClassSaveProficiencies(className: string): string[] {
    const proficiencies: Record<string, string[]> = {
      'barbarian': ['strength', 'constitution'],
      'bard': ['dexterity', 'charisma'],
      'cleric': ['wisdom', 'charisma'],
      'druid': ['intelligence', 'wisdom'],
      'fighter': ['strength', 'constitution'],
      'monk': ['strength', 'dexterity'],
      'paladin': ['wisdom', 'charisma'],
      'ranger': ['strength', 'dexterity'],
      'rogue': ['dexterity', 'intelligence'],
      'sorcerer': ['constitution', 'charisma'],
      'warlock': ['wisdom', 'charisma'],
      'wizard': ['intelligence', 'wisdom'],
      'artificer': ['constitution', 'intelligence']
    };
    
    return proficiencies[className.toLowerCase()] || [];
  }

  /**
   * Calculate skill bonuses
   */
  static calculateSkillBonuses(character: WizardFormData): Record<string, number> {
    const level = character.advancement?.currentLevel || 1;
    const profBonus = this.getProficiencyBonus(level);
    
    const skillAbilities: Record<string, keyof Pick<WizardFormData, 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'>> = {
      'Acrobatics': 'dexterity',
      'Animal Handling': 'wisdom',
      'Arcana': 'intelligence',
      'Athletics': 'strength',
      'Deception': 'charisma',
      'History': 'intelligence',
      'Insight': 'wisdom',
      'Intimidation': 'charisma',
      'Investigation': 'intelligence',
      'Medicine': 'wisdom',
      'Nature': 'intelligence',
      'Perception': 'wisdom',
      'Performance': 'charisma',
      'Persuasion': 'charisma',
      'Religion': 'intelligence',
      'Sleight of Hand': 'dexterity',
      'Stealth': 'dexterity',
      'Survival': 'wisdom'
    };
    
    const skillBonuses: Record<string, number> = {};
    
    Object.entries(skillAbilities).forEach(([skill, ability]) => {
      const abilityMod = this.getAbilityModifier(character[ability]);
      const isProficient = character.skills?.includes(skill) || false;
      skillBonuses[skill] = abilityMod + (isProficient ? profBonus : 0);
    });
    
    return skillBonuses;
  }

  /**
   * Calculate spellcasting information
   */
  static calculateSpellcastingInfo(character: WizardFormData): SpellcastingInfo | null {
    const className = character.class.toLowerCase();
    const level = character.advancement?.currentLevel || 1;
    
    // Non-spellcasters
    const nonCasters = ['barbarian', 'fighter', 'monk', 'rogue'];
    if (nonCasters.includes(className)) return null;
    
    // Determine spellcasting ability
    let spellcastingAbility: 'intelligence' | 'wisdom' | 'charisma' | null = null;
    
    if (['wizard', 'artificer'].includes(className)) {
      spellcastingAbility = 'intelligence';
    } else if (['cleric', 'druid', 'ranger'].includes(className)) {
      spellcastingAbility = 'wisdom';
    } else if (['bard', 'paladin', 'sorcerer', 'warlock'].includes(className)) {
      spellcastingAbility = 'charisma';
    }
    
    if (!spellcastingAbility) return null;
    
    const abilityMod = this.getAbilityModifier(character[spellcastingAbility]);
    const profBonus = this.getProficiencyBonus(level);
    
    const spellAttackBonus = abilityMod + profBonus;
    const spellSaveDC = 8 + abilityMod + profBonus;
    
    // Calculate spell slots (simplified - full casters only)
    const spellSlots = this.calculateSpellSlots(className, level);
    
    return {
      spellcastingAbility,
      spellAttackBonus,
      spellSaveDC,
      spellSlots,
      cantripsKnown: this.getCantripsKnown(className, level),
      spellsKnown: this.getSpellsKnown(className, level),
      ritualCasting: ['cleric', 'druid', 'wizard'].includes(className)
    };
  }

  /**
   * Calculate spell slots by class and level
   */
  static calculateSpellSlots(className: string, level: number): SpellcastingInfo['spellSlots'] {
    const emptySlots = {
      level1: { total: 0, used: 0 },
      level2: { total: 0, used: 0 },
      level3: { total: 0, used: 0 },
      level4: { total: 0, used: 0 },
      level5: { total: 0, used: 0 },
      level6: { total: 0, used: 0 },
      level7: { total: 0, used: 0 },
      level8: { total: 0, used: 0 },
      level9: { total: 0, used: 0 }
    };
    
    // Full casters spell slot progression
    const fullCasterSlots: Record<number, number[]> = {
      1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
      2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
      3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
      4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
      5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
      6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
      7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
      8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
      9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
      10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
      11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
      12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
      13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
      14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
      15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
      16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
      17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
      18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
      19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
      20: [4, 3, 3, 3, 3, 2, 2, 1, 1]
    };
    
    const fullCasters = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'];
    
    if (fullCasters.includes(className) && level >= 1) {
      const slots = fullCasterSlots[Math.min(level, 20)];
      return {
        level1: { total: slots[0], used: 0 },
        level2: { total: slots[1], used: 0 },
        level3: { total: slots[2], used: 0 },
        level4: { total: slots[3], used: 0 },
        level5: { total: slots[4], used: 0 },
        level6: { total: slots[5], used: 0 },
        level7: { total: slots[6], used: 0 },
        level8: { total: slots[7], used: 0 },
        level9: { total: slots[8], used: 0 }
      };
    }
    
    // Half-casters (paladin, ranger) get slots starting at level 2
    if (['paladin', 'ranger'].includes(className) && level >= 2) {
      const halfCasterLevel = Math.ceil(level / 2);
      const slots = fullCasterSlots[Math.min(halfCasterLevel, 20)];
      return {
        level1: { total: slots[0], used: 0 },
        level2: { total: slots[1], used: 0 },
        level3: { total: slots[2], used: 0 },
        level4: { total: slots[3], used: 0 },
        level5: { total: slots[4], used: 0 },
        level6: { total: 0, used: 0 },
        level7: { total: 0, used: 0 },
        level8: { total: 0, used: 0 },
        level9: { total: 0, used: 0 }
      };
    }
    
    // Warlocks have unique spell slot progression
    if (className === 'warlock') {
      const warlockSlots = Math.min(Math.ceil(level / 2), 4);
      const slotLevel = Math.min(Math.ceil((level + 1) / 2), 5);
      
      return {
        level1: slotLevel === 1 ? { total: warlockSlots, used: 0 } : { total: 0, used: 0 },
        level2: slotLevel === 2 ? { total: warlockSlots, used: 0 } : { total: 0, used: 0 },
        level3: slotLevel === 3 ? { total: warlockSlots, used: 0 } : { total: 0, used: 0 },
        level4: slotLevel === 4 ? { total: warlockSlots, used: 0 } : { total: 0, used: 0 },
        level5: slotLevel === 5 ? { total: warlockSlots, used: 0 } : { total: 0, used: 0 },
        level6: { total: 0, used: 0 },
        level7: { total: 0, used: 0 },
        level8: { total: 0, used: 0 },
        level9: { total: 0, used: 0 }
      };
    }
    
    return emptySlots;
  }

  /**
   * Get cantrips known by class and level
   */
  static getCantripsKnown(className: string, level: number): number {
    const cantripProgression: Record<string, Record<number, number>> = {
      'bard': { 1: 2, 4: 3, 10: 4 },
      'cleric': { 1: 3, 4: 4, 10: 5 },
      'druid': { 1: 2, 4: 3, 10: 4 },
      'sorcerer': { 1: 4, 4: 5, 10: 6 },
      'warlock': { 1: 2, 4: 3, 10: 4 },
      'wizard': { 1: 3, 4: 4, 10: 5 }
    };
    
    const progression = cantripProgression[className];
    if (!progression) return 0;
    
    let cantrips = 0;
    for (const [lvl, count] of Object.entries(progression)) {
      if (level >= parseInt(lvl)) {
        cantrips = count;
      }
    }
    
    return cantrips;
  }

  /**
   * Get spells known by class and level
   */
  static getSpellsKnown(className: string, level: number): number {
    // Known spell casters
    const knownSpellProgression: Record<string, number[]> = {
      'bard': [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
      'ranger': [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11],
      'sorcerer': [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
      'warlock': [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]
    };
    
    const progression = knownSpellProgression[className];
    if (progression && level >= 1) {
      return progression[Math.min(level - 1, 19)];
    }
    
    // Prepared spell casters (all spells of appropriate level)
    if (['cleric', 'druid', 'wizard'].includes(className)) {
      return -1; // Indicates all spells available
    }
    
    return 0;
  }

  /**
   * Generate combat statistics
   */
  static generateCombatStats(character: WizardFormData): CombatStats {
    const level = character.advancement?.currentLevel || 1;
    
    return {
      armorClass: this.calculateArmorClass(character),
      hitPoints: {
        current: this.calculateMaxHitPoints(character),
        maximum: this.calculateMaxHitPoints(character),
        temporary: 0
      },
      speed: 30, // Base speed - could be modified by race
      initiative: this.getInitiativeModifier(character.dexterity),
      proficiencyBonus: this.getProficiencyBonus(level),
      savingThrows: this.calculateSavingThrows(character),
      skills: this.calculateSkillBonuses(character),
      passivePerception: 10 + this.calculateSkillBonuses(character)['Perception'] || 0
    };
  }

  /**
   * Roll dice with formula (e.g., "1d20+5", "2d8+3")
   */
  static rollDice(formula: string): DiceResult {
    const timestamp = new Date();
    
    // Parse dice formula
    const match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) {
      throw new Error(`Invalid dice formula: ${formula}`);
    }
    
    const numDice = parseInt(match[1]);
    const dieSize = parseInt(match[2]);
    const modifier = parseInt(match[3]) || 0;
    
    // Roll dice
    const rolls: number[] = [];
    for (let i = 0; i < numDice; i++) {
      rolls.push(Math.floor(Math.random() * dieSize) + 1);
    }
    
    const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;
    
    return {
      total,
      rolls,
      modifier,
      formula,
      timestamp
    };
  }

  /**
   * Roll attack
   */
  static rollAttack(attackBonus: number): DiceResult {
    return this.rollDice(`1d20+${attackBonus}`);
  }

  /**
   * Roll damage
   */
  static rollDamage(damageRolls: DamageRoll[]): { total: number; results: Array<DiceResult & { type: string }> } {
    const results = damageRolls.map(damage => {
      const result = this.rollDice(`${damage.dice}+${damage.bonus}`);
      return { ...result, type: damage.type };
    });
    
    const total = results.reduce((sum, result) => sum + result.total, 0);
    
    return { total, results };
  }

  /**
   * Roll saving throw
   */
  static rollSavingThrow(saveBonus: number): DiceResult {
    return this.rollDice(`1d20+${saveBonus}`);
  }

  /**
   * Roll ability check
   */
  static rollAbilityCheck(abilityModifier: number, proficient: boolean = false, proficiencyBonus: number = 0): DiceResult {
    const bonus = abilityModifier + (proficient ? proficiencyBonus : 0);
    return this.rollDice(`1d20+${bonus}`);
  }

  /**
   * Roll initiative
   */
  static rollInitiative(initiativeModifier: number): DiceResult {
    return this.rollDice(`1d20+${initiativeModifier}`);
  }
}