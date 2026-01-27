/**
 * Character Advancement System Service
 * Handles level progression, XP tracking, feature advancement, and multiclassing
 */

import type { WizardFormData } from '@features/character';

export interface ExperiencePoints {
  current: number;
  nextLevel: number;
  total: number;
}

export interface LevelProgression {
  level: number;
  totalXP: number;
  proficiencyBonus: number;
  newFeatures: ClassFeature[];
  newSpells?: SpellProgression;
  hitPointIncrease: number;
  asiOrFeatAvailable: boolean;
}

export interface ClassFeature {
  name: string;
  description: string;
  level: number;
  class: string;
  subclass?: string;
  choices?: FeatureChoice[];
}

export interface FeatureChoice {
  name: string;
  options: string[];
  description: string;
  required: boolean;
}

export interface SpellProgression {
  cantripsKnown: number;
  spellsKnown: number;
  spellSlots: Record<number, number>; // Spell level -> number of slots
  newCantrips: number;
  newSpells: number;
  spellcastingLevel: number;
}

export interface MulticlassRequirements {
  class: string;
  requirements: Record<string, number>; // ability -> minimum score
  met: boolean;
  missing: string[];
}

export interface CharacterLevel {
  class: string;
  level: number;
  subclass?: string;
}

export interface AdvancedCharacter extends WizardFormData {
  totalLevel: number;
  classLevels: CharacterLevel[];
  experiencePoints: ExperiencePoints;
  hitPoints: {
    maximum: number;
    current: number;
    temporary: number;
  };
  features: ClassFeature[];
  feats: string[];
  inspiration: boolean;
}

export class AdvancementSystemService {
  private static readonly XP_TABLE = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
  ];
  
  private static readonly PROFICIENCY_BONUS = [
    2, 2, 2, 2, 3, 3, 3, 3, 4, 4,
    4, 4, 5, 5, 5, 5, 6, 6, 6, 6
  ];
  
  private static readonly ASI_LEVELS = [4, 8, 12, 16, 19];
  private static readonly FIGHTER_ASI_LEVELS = [4, 6, 8, 12, 14, 16, 19];
  private static readonly ROGUE_ASI_LEVELS = [4, 8, 10, 12, 16, 19];
  
  /**
   * Calculate XP required for next level
   */
  static calculateXPForLevel(level: number): number {
    if (level < 1 || level > 20) return 0;
    return this.XP_TABLE[level - 1];
  }
  
  /**
   * Calculate current level from XP
   */
  static calculateLevelFromXP(xp: number): number {
    for (let i = 19; i >= 0; i--) {
      if (xp >= this.XP_TABLE[i]) {
        return i + 1;
      }
    }
    return 1;
  }
  
  /**
   * Calculate XP needed for next level
   */
  static calculateXPToNextLevel(currentXP: number): { current: number; needed: number; nextLevel: number } {
    const currentLevel = this.calculateLevelFromXP(currentXP);
    if (currentLevel >= 20) {
      return { current: currentXP, needed: 0, nextLevel: 20 };
    }
    
    const nextLevelXP = this.XP_TABLE[currentLevel];
    return {
      current: currentXP,
      needed: nextLevelXP - currentXP,
      nextLevel: currentLevel + 1
    };
  }
  
  /**
   * Get proficiency bonus for level
   */
  static getProficiencyBonus(level: number): number {
    if (level < 1 || level > 20) return 2;
    return this.PROFICIENCY_BONUS[level - 1];
  }
  
  /**
   * Check if ASI or Feat is available at level
   */
  static isASILevel(characterClass: string, level: number): boolean {
    switch (characterClass.toLowerCase()) {
      case 'fighter':
        return this.FIGHTER_ASI_LEVELS.includes(level);
      case 'rogue':
        return this.ROGUE_ASI_LEVELS.includes(level);
      default:
        return this.ASI_LEVELS.includes(level);
    }
  }
  
  /**
   * Get class features for a specific level
   */
  static getClassFeaturesForLevel(characterClass: string, level: number, subclass?: string): ClassFeature[] {
    const features: ClassFeature[] = [];
    
    // Core class features
    const coreFeatures = this.getCoreClassFeatures(characterClass, level);
    features.push(...coreFeatures);
    
    // Subclass features
    if (subclass) {
      const subclassFeatures = this.getSubclassFeatures(characterClass, subclass, level);
      features.push(...subclassFeatures);
    }
    
    return features;
  }
  
  /**
   * Get core class features for level
   */
  private static getCoreClassFeatures(characterClass: string, level: number): ClassFeature[] {
    const classFeatures: Record<string, Record<number, ClassFeature[]>> = {
      'fighter': {
        1: [{
          name: 'Fighting Style',
          description: 'Choose a fighting style that reflects your combat training.',
          level: 1,
          class: 'fighter',
          choices: [{
            name: 'Fighting Style',
            options: ['Archery', 'Defense', 'Dueling', 'Great Weapon Fighting', 'Protection', 'Two-Weapon Fighting'],
            description: 'Choose your fighting style specialization.',
            required: true
          }]
        }, {
          name: 'Second Wind',
          description: 'Regain 1d10 + fighter level hit points as a bonus action.',
          level: 1,
          class: 'fighter'
        }],
        2: [{
          name: 'Action Surge',
          description: 'Take one additional action on your turn.',
          level: 2,
          class: 'fighter'
        }],
        3: [{
          name: 'Martial Archetype',
          description: 'Choose your martial archetype specialization.',
          level: 3,
          class: 'fighter'
        }],
        4: [{
          name: 'Ability Score Improvement',
          description: 'Increase ability scores by 2 total points or take a feat.',
          level: 4,
          class: 'fighter'
        }],
        5: [{
          name: 'Extra Attack',
          description: 'Attack twice when you take the Attack action.',
          level: 5,
          class: 'fighter'
        }],
        6: [{
          name: 'Ability Score Improvement',
          description: 'Increase ability scores by 2 total points or take a feat.',
          level: 6,
          class: 'fighter'
        }],
        9: [{
          name: 'Indomitable',
          description: 'Reroll a failed saving throw.',
          level: 9,
          class: 'fighter'
        }],
        11: [{
          name: 'Extra Attack (2)',
          description: 'Attack three times when you take the Attack action.',
          level: 11,
          class: 'fighter'
        }],
        13: [{
          name: 'Indomitable (2 uses)',
          description: 'Use Indomitable twice per long rest.',
          level: 13,
          class: 'fighter'
        }],
        17: [{
          name: 'Indomitable (3 uses)',
          description: 'Use Indomitable three times per long rest.',
          level: 17,
          class: 'fighter'
        }, {
          name: 'Action Surge (2 uses)',
          description: 'Use Action Surge twice per short rest.',
          level: 17,
          class: 'fighter'
        }],
        20: [{
          name: 'Extra Attack (3)',
          description: 'Attack four times when you take the Attack action.',
          level: 20,
          class: 'fighter'
        }]
      },
      
      'wizard': {
        1: [{
          name: 'Spellcasting',
          description: 'Cast wizard spells using Intelligence as your spellcasting ability.',
          level: 1,
          class: 'wizard'
        }, {
          name: 'Arcane Recovery',
          description: 'Recover spell slots totaling half your wizard level once per long rest.',
          level: 1,
          class: 'wizard'
        }],
        2: [{
          name: 'Arcane Tradition',
          description: 'Choose your arcane tradition specialization.',
          level: 2,
          class: 'wizard'
        }],
        18: [{
          name: 'Spell Mastery',
          description: 'Choose one 1st-level and one 2nd-level wizard spell to cast without expending spell slots.',
          level: 18,
          class: 'wizard'
        }],
        20: [{
          name: 'Signature Spells',
          description: 'Choose two 3rd-level wizard spells as signature spells.',
          level: 20,
          class: 'wizard'
        }]
      },
      
      'rogue': {
        1: [{
          name: 'Expertise',
          description: 'Double your proficiency bonus for two skills.',
          level: 1,
          class: 'rogue',
          choices: [{
            name: 'Expertise Skills',
            options: [], // Would be populated based on character's skill proficiencies
            description: 'Choose two skills to gain expertise.',
            required: true
          }]
        }, {
          name: 'Sneak Attack',
          description: 'Deal an extra 1d6 damage when you have advantage on attacks with finesse weapons.',
          level: 1,
          class: 'rogue'
        }, {
          name: 'Thieves\' Cant',
          description: 'Know the secret language of rogues and criminals.',
          level: 1,
          class: 'rogue'
        }],
        2: [{
          name: 'Cunning Action',
          description: 'Dash, Disengage, or Hide as a bonus action.',
          level: 2,
          class: 'rogue'
        }],
        3: [{
          name: 'Roguish Archetype',
          description: 'Choose your roguish archetype specialization.',
          level: 3,
          class: 'rogue'
        }, {
          name: 'Sneak Attack (2d6)',
          description: 'Sneak Attack damage increases to 2d6.',
          level: 3,
          class: 'rogue'
        }],
        5: [{
          name: 'Uncanny Dodge',
          description: 'Halve the damage from one attack per turn.',
          level: 5,
          class: 'rogue'
        }, {
          name: 'Sneak Attack (3d6)',
          description: 'Sneak Attack damage increases to 3d6.',
          level: 5,
          class: 'rogue'
        }],
        6: [{
          name: 'Expertise',
          description: 'Choose two more skills to gain expertise.',
          level: 6,
          class: 'rogue'
        }],
        7: [{
          name: 'Evasion',
          description: 'Take no damage on successful Dexterity saving throws, half on failures.',
          level: 7,
          class: 'rogue'
        }, {
          name: 'Sneak Attack (4d6)',
          description: 'Sneak Attack damage increases to 4d6.',
          level: 7,
          class: 'rogue'
        }],
        11: [{
          name: 'Reliable Talent',
          description: 'Treat d20 rolls of 9 or lower as 10 for skill checks you\'re proficient in.',
          level: 11,
          class: 'rogue'
        }],
        14: [{
          name: 'Blindsense',
          description: 'Detect hidden or invisible creatures within 10 feet.',
          level: 14,
          class: 'rogue'
        }],
        15: [{
          name: 'Slippery Mind',
          description: 'Gain proficiency in Wisdom saving throws.',
          level: 15,
          class: 'rogue'
        }],
        18: [{
          name: 'Elusive',
          description: 'No attack roll has advantage against you while you aren\'t incapacitated.',
          level: 18,
          class: 'rogue'
        }],
        20: [{
          name: 'Stroke of Luck',
          description: 'Turn a missed attack into a hit or failed ability check into a 20.',
          level: 20,
          class: 'rogue'
        }]
      }
    };
    
    return classFeatures[characterClass.toLowerCase()]?.[level] || [];
  }
  
  /**
   * Get subclass features for level
   */
  private static getSubclassFeatures(characterClass: string, subclass: string, level: number): ClassFeature[] {
    const subclassFeatures: Record<string, Record<string, Record<number, ClassFeature[]>>> = {
      'fighter': {
        'champion': {
          3: [{
            name: 'Improved Critical',
            description: 'Critical hits occur on rolls of 19-20.',
            level: 3,
            class: 'fighter',
            subclass: 'champion'
          }],
          7: [{
            name: 'Remarkable Athlete',
            description: 'Add half your proficiency bonus to Strength, Dexterity, and Constitution checks.',
            level: 7,
            class: 'fighter',
            subclass: 'champion'
          }],
          10: [{
            name: 'Additional Fighting Style',
            description: 'Learn an additional fighting style.',
            level: 10,
            class: 'fighter',
            subclass: 'champion'
          }],
          15: [{
            name: 'Superior Critical',
            description: 'Critical hits occur on rolls of 18-20.',
            level: 15,
            class: 'fighter',
            subclass: 'champion'
          }],
          18: [{
            name: 'Survivor',
            description: 'Regain hit points at the start of your turn if below half maximum.',
            level: 18,
            class: 'fighter',
            subclass: 'champion'
          }]
        },
        
        'battle master': {
          3: [{
            name: 'Combat Superiority',
            description: 'Learn maneuvers and gain superiority dice.',
            level: 3,
            class: 'fighter',
            subclass: 'battle master',
            choices: [{
              name: 'Maneuvers',
              options: ['Commander\'s Strike', 'Disarming Attack', 'Distracting Strike', 'Evasive Footwork', 'Feinting Attack', 'Goading Attack', 'Lunging Attack', 'Maneuvering Attack', 'Menacing Attack', 'Parry', 'Precision Attack', 'Pushing Attack', 'Rally', 'Riposte', 'Sweeping Attack', 'Trip Attack'],
              description: 'Choose 3 maneuvers to learn.',
              required: true
            }]
          }, {
            name: 'Student of War',
            description: 'Gain proficiency with one type of artisan\'s tools.',
            level: 3,
            class: 'fighter',
            subclass: 'battle master'
          }],
          7: [{
            name: 'Know Your Enemy',
            description: 'Learn information about creatures you study.',
            level: 7,
            class: 'fighter',
            subclass: 'battle master'
          }],
          10: [{
            name: 'Improved Combat Superiority',
            description: 'Superiority dice become d10s and you learn 2 more maneuvers.',
            level: 10,
            class: 'fighter',
            subclass: 'battle master'
          }],
          15: [{
            name: 'Relentless',
            description: 'Regain a superiority die if you have no superiority dice when you roll initiative.',
            level: 15,
            class: 'fighter',
            subclass: 'battle master'
          }],
          18: [{
            name: 'Improved Combat Superiority',
            description: 'Superiority dice become d12s and you learn 2 more maneuvers.',
            level: 18,
            class: 'fighter',
            subclass: 'battle master'
          }]
        }
      },
      
      'wizard': {
        'school of evocation': {
          2: [{
            name: 'Evocation Savant',
            description: 'Copy evocation spells at half cost and time.',
            level: 2,
            class: 'wizard',
            subclass: 'school of evocation'
          }, {
            name: 'Sculpt Spells',
            description: 'Protect allies from your evocation spells.',
            level: 2,
            class: 'wizard',
            subclass: 'school of evocation'
          }],
          6: [{
            name: 'Potent Cantrip',
            description: 'Cantrips deal half damage on successful saves.',
            level: 6,
            class: 'wizard',
            subclass: 'school of evocation'
          }],
          10: [{
            name: 'Empowered Evocation',
            description: 'Add Intelligence modifier to evocation spell damage.',
            level: 10,
            class: 'wizard',
            subclass: 'school of evocation'
          }],
          14: [{
            name: 'Overchannel',
            description: 'Maximize damage for spells of 5th level or lower.',
            level: 14,
            class: 'wizard',
            subclass: 'school of evocation'
          }]
        },
        
        'school of abjuration': {
          2: [{
            name: 'Abjuration Savant',
            description: 'Copy abjuration spells at half cost and time.',
            level: 2,
            class: 'wizard',
            subclass: 'school of abjuration'
          }, {
            name: 'Arcane Ward',
            description: 'Create a magical ward that absorbs damage.',
            level: 2,
            class: 'wizard',
            subclass: 'school of abjuration'
          }],
          6: [{
            name: 'Projected Ward',
            description: 'Use your Arcane Ward to protect allies.',
            level: 6,
            class: 'wizard',
            subclass: 'school of abjuration'
          }],
          10: [{
            name: 'Improved Abjuration',
            description: 'Add proficiency bonus to spell attack rolls for abjuration spells.',
            level: 10,
            class: 'wizard',
            subclass: 'school of abjuration'
          }],
          14: [{
            name: 'Spell Resistance',
            description: 'Gain advantage on saving throws against spells and resistance to spell damage.',
            level: 14,
            class: 'wizard',
            subclass: 'school of abjuration'
          }]
        }
      }
    };
    
    return subclassFeatures[characterClass.toLowerCase()]?.[subclass.toLowerCase()]?.[level] || [];
  }
  
  /**
   * Calculate spell progression for level
   */
  static getSpellProgression(characterClass: string, level: number): SpellProgression | null {
    const spellcastingClasses = ['wizard', 'cleric', 'druid', 'sorcerer', 'bard', 'warlock'];
    if (!spellcastingClasses.includes(characterClass.toLowerCase())) {
      return null;
    }
    
    // Full caster progression (Wizard, Cleric, Druid, Sorcerer, Bard)
    const fullCasterSpellSlots: Record<number, Record<number, number>> = {
      1: { 1: 2 },
      2: { 1: 3 },
      3: { 1: 4, 2: 2 },
      4: { 1: 4, 2: 3 },
      5: { 1: 4, 2: 3, 3: 2 },
      6: { 1: 4, 2: 3, 3: 3 },
      7: { 1: 4, 2: 3, 3: 3, 4: 1 },
      8: { 1: 4, 2: 3, 3: 3, 4: 2 },
      9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
      10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
      11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
      12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
      13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
      14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
      15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
      16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
      17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
      18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
      19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
      20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 }
    };
    
    // Wizard cantrips known progression
    const wizardCantrips = [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    
    const prevLevel = Math.max(1, level - 1);
    
    return {
      cantripsKnown: wizardCantrips[level - 1] || 0,
      spellsKnown: characterClass.toLowerCase() === 'wizard' ? 0 : level + 1, // Wizards learn spells differently
      spellSlots: fullCasterSpellSlots[level] || {},
      newCantrips: (wizardCantrips[level - 1] || 0) - (wizardCantrips[prevLevel - 1] || 0),
      newSpells: characterClass.toLowerCase() === 'wizard' ? 2 : 1, // Wizards learn 2 per level
      spellcastingLevel: level
    };
  }
  
  /**
   * Check multiclassing requirements
   */
  static checkMulticlassRequirements(
    newClass: string, 
    currentAbilities: Record<string, number>
  ): MulticlassRequirements {
    const requirements: Record<string, Record<string, number>> = {
      'fighter': { strength: 13, dexterity: 13 }, // Either STR or DEX 13+
      'wizard': { intelligence: 13 },
      'rogue': { dexterity: 13 },
      'cleric': { wisdom: 13 },
      'barbarian': { strength: 13 },
      'bard': { charisma: 13 },
      'druid': { wisdom: 13 },
      'monk': { dexterity: 13, wisdom: 13 },
      'paladin': { strength: 13, charisma: 13 },
      'ranger': { dexterity: 13, wisdom: 13 },
      'sorcerer': { charisma: 13 },
      'warlock': { charisma: 13 }
    };
    
    const classReqs = requirements[newClass.toLowerCase()] || {};
    const missing: string[] = [];
    let met = true;
    
    // Special case for Fighter (STR OR DEX 13+)
    if (newClass.toLowerCase() === 'fighter') {
      if (currentAbilities.strength >= 13 || currentAbilities.dexterity >= 13) {
        // Requirements met
      } else {
        met = false;
        missing.push('Strength 13 or Dexterity 13');
      }
    } else {
      // Standard requirements (all must be met)
      for (const [ability, required] of Object.entries(classReqs)) {
        if (currentAbilities[ability] < required) {
          met = false;
          missing.push(`${ability.charAt(0).toUpperCase() + ability.slice(1)} ${required}`);
        }
      }
    }
    
    return {
      class: newClass,
      requirements: classReqs,
      met,
      missing
    };
  }
  
  /**
   * Calculate hit point increase for level up
   */
  static calculateHitPointIncrease(
    characterClass: string, 
    constitutionModifier: number, 
    method: 'average' | 'roll' = 'average'
  ): number {
    const hitDice: Record<string, number> = {
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
      'sorcerer': 6,
      'wizard': 6
    };
    
    const hitDie = hitDice[characterClass.toLowerCase()] || 8;
    
    if (method === 'average') {
      return Math.floor(hitDie / 2) + 1 + constitutionModifier;
    } else {
      // For 'roll' method, return the average for planning purposes
      // In actual implementation, this would involve dice rolling
      return Math.floor(hitDie / 2) + 1 + constitutionModifier;
    }
  }
  
  /**
   * Generate level progression plan
   */
  static generateLevelProgression(
    character: AdvancedCharacter,
    targetLevel: number
  ): LevelProgression[] {
    const progressions: LevelProgression[] = [];
    
    for (let level = character.totalLevel + 1; level <= targetLevel; level++) {
      // Determine primary class for this level
      const primaryClass = character.classLevels[0]?.class || character.class;
      const primaryClassLevel = this.calculateClassLevel(character.classLevels, primaryClass) + 1;
      
      const progression: LevelProgression = {
        level,
        totalXP: this.calculateXPForLevel(level),
        proficiencyBonus: this.getProficiencyBonus(level),
        newFeatures: this.getClassFeaturesForLevel(primaryClass, primaryClassLevel),
        newSpells: this.getSpellProgression(primaryClass, primaryClassLevel) || undefined,
        hitPointIncrease: this.calculateHitPointIncrease(primaryClass, (character.constitution - 10) / 2),
        asiOrFeatAvailable: this.isASILevel(primaryClass, primaryClassLevel)
      };
      
      progressions.push(progression);
    }
    
    return progressions;
  }
  
  /**
   * Calculate class level for specific class
   */
  private static calculateClassLevel(classLevels: CharacterLevel[], targetClass: string): number {
    return classLevels
      .filter(cl => cl.class.toLowerCase() === targetClass.toLowerCase())
      .reduce((total, cl) => total + cl.level, 0);
  }
  
  /**
   * Apply level up to character
   */
  static applyLevelUp(
    character: AdvancedCharacter,
    levelUpChoices: {
      class: string;
      hitPointIncrease: number;
      asiChoices?: Record<string, number>;
      featChoice?: string;
      featureChoices?: Record<string, string>;
      newSpells?: string[];
      newCantrips?: string[];
    }
  ): AdvancedCharacter {
    const newLevel = character.totalLevel + 1;
    const updatedCharacter = { ...character };
    
    // Update total level
    updatedCharacter.totalLevel = newLevel;
    
    // Update class levels
    const existingClassIndex = updatedCharacter.classLevels.findIndex(
      cl => cl.class.toLowerCase() === levelUpChoices.class.toLowerCase()
    );
    
    if (existingClassIndex >= 0) {
      updatedCharacter.classLevels[existingClassIndex].level += 1;
    } else {
      updatedCharacter.classLevels.push({
        class: levelUpChoices.class,
        level: 1
      });
    }
    
    // Update hit points
    updatedCharacter.hitPoints.maximum += levelUpChoices.hitPointIncrease;
    updatedCharacter.hitPoints.current += levelUpChoices.hitPointIncrease;
    
    // Apply ASI choices
    if (levelUpChoices.asiChoices) {
      Object.entries(levelUpChoices.asiChoices).forEach(([ability, increase]) => {
        (updatedCharacter as any)[ability] += increase;
      });
    }
    
    // Apply feat choice
    if (levelUpChoices.featChoice) {
      updatedCharacter.feats.push(levelUpChoices.featChoice);
    }
    
    // Add new features
    const classLevel = this.calculateClassLevel(updatedCharacter.classLevels, levelUpChoices.class);
    const newFeatures = this.getClassFeaturesForLevel(levelUpChoices.class, classLevel);
    updatedCharacter.features.push(...newFeatures);
    
    // Update spells
    if (levelUpChoices.newSpells) {
      if (updatedCharacter.spells) {
        updatedCharacter.spells.knownSpells.push(...levelUpChoices.newSpells);
      }
    }
    
    if (levelUpChoices.newCantrips) {
      if (updatedCharacter.spells) {
        updatedCharacter.spells.cantrips.push(...levelUpChoices.newCantrips);
      }
    }
    
    // Update experience points
    updatedCharacter.experiencePoints = {
      current: this.calculateXPForLevel(newLevel),
      nextLevel: this.calculateXPForLevel(newLevel + 1),
      total: this.calculateXPForLevel(newLevel)
    };
    
    return updatedCharacter;
  }
}