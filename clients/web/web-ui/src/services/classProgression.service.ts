/**
 * D&D 5e Class Progression Service
 * Handles class features, subclasses, level progression, and multiclassing rules
 */

// Core D&D 5e class feature types
export interface ClassFeature {
  name: string;
  description: string;
  level: number;
  prerequisite?: string;
  choices?: ClassFeatureChoice[];
  usage?: {
    type: 'short_rest' | 'long_rest' | 'per_day' | 'at_will' | 'permanent';
    amount?: number;
    scaling?: { level: number; amount: number }[];
  };
  improvement_type?: 'spell' | 'combat' | 'utility' | 'social';
}

export interface ClassFeatureChoice {
  name: string;
  description: string;
  options: string[];
  choose: number;
}

export interface Subclass {
  name: string;
  description: string;
  source: string;
  features: ClassFeature[];
  spell_list?: string[]; // Additional spells for some subclasses
  expanded_spell_list?: Record<number, string[]>; // Level -> spell names
}

export interface ExtendedCharacterClass {
  name: string;
  description: string;
  hit_dice: number;
  primary_abilities: string[];
  saving_throw_proficiencies: string[];
  skill_proficiencies: {
    available: string[];
    choose: number;
  };
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  tool_proficiencies: string[];
  starting_equipment: {
    equipment: string[];
    equipment_packs: string[];
    starting_gold: { dice: string; multiplier: number };
  };
  features: ClassFeature[];
  subclasses: Subclass[];
  spellcasting?: {
    ability: string;
    ritual_casting: boolean;
    spellcasting_focus?: string;
    spells_known_progression?: number[];
    spell_slots_progression?: Record<number, Record<number, number>>;
    cantrips_known_progression?: number[];
  };
  archetype_level: number; // Level when subclass is chosen
  ability_score_improvement_levels: number[];
  source: string;
}

export interface MulticlassPrerequisites {
  [className: string]: {
    ability_requirements: Record<string, number>; // ability -> minimum score
    description: string;
  };
}

export interface LevelProgression {
  level: number;
  proficiency_bonus: number;
  features_gained: ClassFeature[];
  spell_slots?: Record<number, number>;
  cantrips_known?: number;
  spells_known?: number;
}

// D&D 5e Classes with full progression data
export const DND_CLASSES: Record<string, ExtendedCharacterClass> = {
  Fighter: {
    name: 'Fighter',
    description: 'A master of martial combat, skilled with a variety of weapons and armor.',
    hit_dice: 10,
    primary_abilities: ['Strength', 'Dexterity'],
    saving_throw_proficiencies: ['Strength', 'Constitution'],
    skill_proficiencies: {
      available: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
      choose: 2
    },
    armor_proficiencies: ['Light armor', 'Medium armor', 'Heavy armor', 'Shields'],
    weapon_proficiencies: ['Simple weapons', 'Martial weapons'],
    tool_proficiencies: [],
    starting_equipment: {
      equipment: ['Chain mail', 'Shield', 'Light crossbow with 20 bolts', 'Handaxe (2)', 'Dungeoneer\'s pack'],
      equipment_packs: ['Dungeoneer\'s pack'],
      starting_gold: { dice: '5d4', multiplier: 10 }
    },
    features: [
      {
        name: 'Fighting Style',
        description: 'You adopt a particular style of fighting as your specialty.',
        level: 1,
        choices: [{
          name: 'Fighting Style',
          description: 'Choose a fighting style that suits your combat preferences.',
          options: ['Archery', 'Defense', 'Dueling', 'Great Weapon Fighting', 'Protection', 'Two-Weapon Fighting'],
          choose: 1
        }],
        improvement_type: 'combat'
      },
      {
        name: 'Second Wind',
        description: 'You can use a bonus action to regain hit points equal to 1d10 + your fighter level.',
        level: 1,
        usage: { type: 'short_rest', amount: 1 },
        improvement_type: 'utility'
      },
      {
        name: 'Action Surge',
        description: 'You can take one additional action on your turn.',
        level: 2,
        usage: { 
          type: 'short_rest', 
          amount: 1,
          scaling: [{ level: 17, amount: 2 }]
        },
        improvement_type: 'combat'
      },
      {
        name: 'Martial Archetype',
        description: 'Choose a martial archetype that you strive to emulate in your combat styles and techniques.',
        level: 3,
        improvement_type: 'combat'
      },
      {
        name: 'Extra Attack',
        description: 'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
        level: 5,
        improvement_type: 'combat'
      },
      {
        name: 'Extra Attack (2)',
        description: 'You can attack three times whenever you take the Attack action on your turn.',
        level: 11,
        improvement_type: 'combat'
      },
      {
        name: 'Extra Attack (3)',
        description: 'You can attack four times whenever you take the Attack action on your turn.',
        level: 20,
        improvement_type: 'combat'
      },
      {
        name: 'Indomitable',
        description: 'You can reroll a saving throw that you fail.',
        level: 9,
        usage: { 
          type: 'long_rest', 
          amount: 1,
          scaling: [
            { level: 13, amount: 2 },
            { level: 17, amount: 3 }
          ]
        },
        improvement_type: 'utility'
      }
    ],
    subclasses: [
      {
        name: 'Champion',
        description: 'The archetypal Champion focuses on the development of raw physical power honed to deadly perfection.',
        source: 'PHB',
        features: [
          {
            name: 'Improved Critical',
            description: 'Your weapon attacks score a critical hit on a roll of 19 or 20.',
            level: 3,
            improvement_type: 'combat'
          },
          {
            name: 'Remarkable Athlete',
            description: 'You can add half your proficiency bonus to any Strength, Dexterity, or Constitution check.',
            level: 7,
            improvement_type: 'utility'
          },
          {
            name: 'Additional Fighting Style',
            description: 'You can choose a second option from the Fighting Style class feature.',
            level: 10,
            improvement_type: 'combat'
          },
          {
            name: 'Superior Critical',
            description: 'Your weapon attacks score a critical hit on a roll of 18-20.',
            level: 15,
            improvement_type: 'combat'
          },
          {
            name: 'Survivor',
            description: 'You regain hit points equal to 5 + your Constitution modifier at the start of your turn if you have no more than half of your hit points left.',
            level: 18,
            improvement_type: 'utility'
          }
        ]
      },
      {
        name: 'Battle Master',
        description: 'Those who emulate the archetypal Battle Master employ martial techniques passed down through generations.',
        source: 'PHB',
        features: [
          {
            name: 'Combat Superiority',
            description: 'You learn maneuvers that are fueled by special dice called superiority dice.',
            level: 3,
            usage: { type: 'short_rest', amount: 4, scaling: [{ level: 7, amount: 5 }, { level: 15, amount: 6 }] },
            improvement_type: 'combat'
          },
          {
            name: 'Student of War',
            description: 'You gain proficiency with one type of artisan\'s tools of your choice.',
            level: 3,
            improvement_type: 'utility'
          },
          {
            name: 'Know Your Enemy',
            description: 'You can spend 1 minute observing a creature to learn certain information about its capabilities.',
            level: 7,
            improvement_type: 'utility'
          },
          {
            name: 'Improved Combat Superiority',
            description: 'Your superiority dice turn into d10s.',
            level: 10,
            improvement_type: 'combat'
          },
          {
            name: 'Relentless',
            description: 'When you roll initiative and have no superiority dice remaining, you regain one superiority die.',
            level: 15,
            improvement_type: 'combat'
          },
          {
            name: 'Improved Combat Superiority (d12)',
            description: 'Your superiority dice turn into d12s.',
            level: 18,
            improvement_type: 'combat'
          }
        ]
      },
      {
        name: 'Eldritch Knight',
        description: 'The archetypal Eldritch Knight combines the martial mastery common to all fighters with a careful study of magic.',
        source: 'PHB',
        features: [
          {
            name: 'Spellcasting',
            description: 'You augment your martial prowess with the ability to cast spells.',
            level: 3,
            improvement_type: 'spell'
          },
          {
            name: 'Weapon Bond',
            description: 'You can bond with a weapon, allowing you to summon it to your hand.',
            level: 3,
            improvement_type: 'utility'
          },
          {
            name: 'War Magic',
            description: 'When you use your action to cast a cantrip, you can make one weapon attack as a bonus action.',
            level: 7,
            improvement_type: 'combat'
          },
          {
            name: 'Eldritch Strike',
            description: 'When you hit a creature with a weapon attack, that creature has disadvantage on the next saving throw it makes against a spell you cast.',
            level: 10,
            improvement_type: 'combat'
          },
          {
            name: 'Arcane Charge',
            description: 'When you use your Action Surge, you can teleport up to 30 feet to an unoccupied space you can see.',
            level: 15,
            improvement_type: 'utility'
          },
          {
            name: 'Improved War Magic',
            description: 'When you use your action to cast a spell, you can make one weapon attack as a bonus action.',
            level: 18,
            improvement_type: 'combat'
          }
        ]
      }
    ],
    archetype_level: 3,
    ability_score_improvement_levels: [4, 6, 8, 12, 14, 16, 19],
    source: 'PHB'
  },
  
  Wizard: {
    name: 'Wizard',
    description: 'A scholarly magic-user capable of manipulating the structures of reality in ways that other spellcasters cannot.',
    hit_dice: 6,
    primary_abilities: ['Intelligence'],
    saving_throw_proficiencies: ['Intelligence', 'Wisdom'],
    skill_proficiencies: {
      available: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'],
      choose: 2
    },
    armor_proficiencies: [],
    weapon_proficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
    tool_proficiencies: [],
    starting_equipment: {
      equipment: ['Quarterstaff', 'Spellbook', 'Component pouch', 'Scholar\'s pack'],
      equipment_packs: ['Scholar\'s pack'],
      starting_gold: { dice: '4d4', multiplier: 10 }
    },
    spellcasting: {
      ability: 'Intelligence',
      ritual_casting: true,
      spellcasting_focus: 'Arcane focus',
      cantrips_known_progression: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      spell_slots_progression: {
        1: { 1: 2 }, 2: { 1: 3 }, 3: { 1: 4, 2: 2 }, 4: { 1: 4, 2: 3 },
        5: { 1: 4, 2: 3, 3: 2 }, 6: { 1: 4, 2: 3, 3: 3 }, 7: { 1: 4, 2: 3, 3: 3, 4: 1 },
        8: { 1: 4, 2: 3, 3: 3, 4: 2 }, 9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
        10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 }, 11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
        12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 }, 13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
        14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 }, 15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
        16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 }, 17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
        18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 }, 19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
        20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 }
      }
    },
    features: [
      {
        name: 'Spellcasting',
        description: 'As a student of arcane magic, you have a spellbook containing spells that show the first glimmerings of your true power.',
        level: 1,
        improvement_type: 'spell'
      },
      {
        name: 'Arcane Recovery',
        description: 'You can regain some of your magical energy by studying your spellbook.',
        level: 1,
        usage: { type: 'long_rest', amount: 1 },
        improvement_type: 'spell'
      },
      {
        name: 'Arcane Tradition',
        description: 'When you reach 2nd level, you choose an arcane tradition, shaping your practice of magic.',
        level: 2,
        improvement_type: 'spell'
      },
      {
        name: 'Spell Mastery',
        description: 'You have achieved such mastery over certain spells that you can cast them at will.',
        level: 18,
        improvement_type: 'spell'
      },
      {
        name: 'Signature Spells',
        description: 'You gain mastery over two powerful spells and can cast them with little effort.',
        level: 20,
        improvement_type: 'spell'
      }
    ],
    subclasses: [
      {
        name: 'School of Evocation',
        description: 'You focus your study on magic that creates powerful elemental effects such as bitter cold, searing flame, rolling thunder, crackling lightning, and burning acid.',
        source: 'PHB',
        features: [
          {
            name: 'Evocation Savant',
            description: 'The gold and time you must spend to copy an evocation spell into your spellbook is halved.',
            level: 2,
            improvement_type: 'spell'
          },
          {
            name: 'Sculpt Spells',
            description: 'You can create pockets of relative safety within the effects of your evocation spells.',
            level: 2,
            improvement_type: 'spell'
          },
          {
            name: 'Potent Cantrip',
            description: 'Your damaging cantrips affect even creatures that avoid the brunt of the effect.',
            level: 6,
            improvement_type: 'combat'
          },
          {
            name: 'Empowered Evocation',
            description: 'You can add your Intelligence modifier to one damage roll of any wizard evocation spell you cast.',
            level: 10,
            improvement_type: 'spell'
          },
          {
            name: 'Overchannel',
            description: 'You can increase the power of your simpler spells.',
            level: 14,
            usage: { type: 'long_rest', amount: 1 },
            improvement_type: 'spell'
          }
        ]
      },
      {
        name: 'School of Abjuration',
        description: 'The School of Abjuration emphasizes magic that blocks, banishes, or protects.',
        source: 'PHB',
        features: [
          {
            name: 'Abjuration Savant',
            description: 'The gold and time you must spend to copy an abjuration spell into your spellbook is halved.',
            level: 2,
            improvement_type: 'spell'
          },
          {
            name: 'Arcane Ward',
            description: 'You can weave magic around yourself for protection.',
            level: 2,
            improvement_type: 'utility'
          },
          {
            name: 'Projected Ward',
            description: 'When a creature that you can see within 30 feet of you takes damage, you can use your reaction to cause your Arcane Ward to absorb that damage.',
            level: 6,
            improvement_type: 'utility'
          },
          {
            name: 'Improved Abjuration',
            description: 'When you cast an abjuration spell of 1st level or higher, you can simultaneously use a strand of the spell\'s magic to restore your Arcane Ward.',
            level: 10,
            improvement_type: 'utility'
          },
          {
            name: 'Spell Resistance',
            description: 'You have advantage on saving throws against spells, and you have resistance against the damage of spells.',
            level: 14,
            improvement_type: 'utility'
          }
        ]
      }
    ],
    archetype_level: 2,
    ability_score_improvement_levels: [4, 8, 12, 16, 19],
    source: 'PHB'
  }
};

// Multiclass prerequisites (simplified)
export const MULTICLASS_PREREQUISITES: MulticlassPrerequisites = {
  Fighter: {
    ability_requirements: { Strength: 13, Dexterity: 13 },
    description: 'Strength 13 or Dexterity 13'
  },
  Wizard: {
    ability_requirements: { Intelligence: 13 },
    description: 'Intelligence 13'
  },
  Cleric: {
    ability_requirements: { Wisdom: 13 },
    description: 'Wisdom 13'
  },
  Rogue: {
    ability_requirements: { Dexterity: 13 },
    description: 'Dexterity 13'
  },
  Barbarian: {
    ability_requirements: { Strength: 13 },
    description: 'Strength 13'
  },
  Bard: {
    ability_requirements: { Charisma: 13 },
    description: 'Charisma 13'
  },
  Druid: {
    ability_requirements: { Wisdom: 13 },
    description: 'Wisdom 13'
  },
  Monk: {
    ability_requirements: { Dexterity: 13, Wisdom: 13 },
    description: 'Dexterity 13 and Wisdom 13'
  },
  Paladin: {
    ability_requirements: { Strength: 13, Charisma: 13 },
    description: 'Strength 13 and Charisma 13'
  },
  Ranger: {
    ability_requirements: { Dexterity: 13, Wisdom: 13 },
    description: 'Dexterity 13 and Wisdom 13'
  },
  Sorcerer: {
    ability_requirements: { Charisma: 13 },
    description: 'Charisma 13'
  },
  Warlock: {
    ability_requirements: { Charisma: 13 },
    description: 'Charisma 13'
  }
};

class ClassProgressionService {
  /**
   * Get detailed class information including subclasses and features
   */
  getClass(className: string): ExtendedCharacterClass | null {
    return DND_CLASSES[className] || null;
  }

  /**
   * Get all available classes
   */
  getAllClasses(): ExtendedCharacterClass[] {
    return Object.values(DND_CLASSES);
  }

  /**
   * Get subclasses for a specific class
   */
  getSubclasses(className: string): Subclass[] {
    const characterClass = this.getClass(className);
    return characterClass?.subclasses || [];
  }

  /**
   * Get features gained at a specific level for a class
   */
  getFeaturesAtLevel(className: string, level: number, subclass?: string): ClassFeature[] {
    const characterClass = this.getClass(className);
    if (!characterClass) return [];

    const classFeatures = characterClass.features.filter(feature => feature.level === level);
    
    if (subclass && level >= characterClass.archetype_level) {
      const subclassObj = characterClass.subclasses.find(sc => sc.name === subclass);
      if (subclassObj) {
        const subclassFeatures = subclassObj.features.filter(feature => feature.level === level);
        classFeatures.push(...subclassFeatures);
      }
    }

    return classFeatures;
  }

  /**
   * Get complete level progression for a class
   */
  getLevelProgression(className: string, subclass?: string): LevelProgression[] {
    const characterClass = this.getClass(className);
    if (!characterClass) return [];

    const progression: LevelProgression[] = [];

    for (let level = 1; level <= 20; level++) {
      const proficiencyBonus = Math.ceil(level / 4) + 1;
      const featuresGained = this.getFeaturesAtLevel(className, level, subclass);
      
      let spellSlots: Record<number, number> | undefined;
      let cantripsKnown: number | undefined;
      let spellsKnown: number | undefined;

      if (characterClass.spellcasting) {
        spellSlots = characterClass.spellcasting.spell_slots_progression?.[level];
        cantripsKnown = characterClass.spellcasting.cantrips_known_progression?.[level - 1];
        spellsKnown = characterClass.spellcasting.spells_known_progression?.[level - 1];
      }

      progression.push({
        level,
        proficiency_bonus: proficiencyBonus,
        features_gained: featuresGained,
        spell_slots: spellSlots,
        cantrips_known: cantripsKnown,
        spells_known: spellsKnown
      });
    }

    return progression;
  }

  /**
   * Check if multiclassing prerequisites are met
   */
  canMulticlass(fromClass: string, toClass: string, abilityScores: Record<string, number>): {
    canMulticlass: boolean;
    missingRequirements: string[];
  } {
    const missingRequirements: string[] = [];

    // Check prerequisites for current class (to multiclass out)
    const fromPrereqs = MULTICLASS_PREREQUISITES[fromClass];
    if (fromPrereqs) {
      for (const [ability, required] of Object.entries(fromPrereqs.ability_requirements)) {
        if (abilityScores[ability] < required) {
          missingRequirements.push(`${fromClass} requires ${ability} ${required}`);
        }
      }
    }

    // Check prerequisites for target class (to multiclass into)
    const toPrereqs = MULTICLASS_PREREQUISITES[toClass];
    if (toPrereqs) {
      for (const [ability, required] of Object.entries(toPrereqs.ability_requirements)) {
        if (abilityScores[ability] < required) {
          missingRequirements.push(`${toClass} requires ${ability} ${required}`);
        }
      }
    }

    return {
      canMulticlass: missingRequirements.length === 0,
      missingRequirements
    };
  }

  /**
   * Get hit points for a class level
   */
  getHitPointsForLevel(className: string, level: number, constitution: number, useAverage: boolean = true): number {
    const characterClass = this.getClass(className);
    if (!characterClass) return 0;

    const constitutionModifier = Math.floor((constitution - 10) / 2);

    if (level === 1) {
      // Always max HP at level 1
      return characterClass.hit_dice + constitutionModifier;
    }

    if (useAverage) {
      // Use average hit points (standard rule)
      const averageRoll = Math.floor(characterClass.hit_dice / 2) + 1;
      return averageRoll + constitutionModifier;
    } else {
      // For manual rolling - return the die size (frontend handles the rolling)
      return characterClass.hit_dice + constitutionModifier;
    }
  }

  /**
   * Get proficiency bonus for a character level
   */
  getProficiencyBonus(characterLevel: number): number {
    return Math.ceil(characterLevel / 4) + 1;
  }

  /**
   * Check if a class has spellcasting
   */
  hasSpellcasting(className: string): boolean {
    const characterClass = this.getClass(className);
    return !!characterClass?.spellcasting;
  }

  /**
   * Get spellcasting ability for a class
   */
  getSpellcastingAbility(className: string): string | null {
    const characterClass = this.getClass(className);
    return characterClass?.spellcasting?.ability || null;
  }

  /**
   * Calculate spell save DC and attack bonus
   */
  calculateSpellcastingStats(className: string, characterLevel: number, abilityScores: Record<string, number>): {
    spellSaveDC: number;
    spellAttackBonus: number;
    spellcastingAbility: string;
  } | null {
    const spellcastingAbility = this.getSpellcastingAbility(className);
    if (!spellcastingAbility) return null;

    const proficiencyBonus = this.getProficiencyBonus(characterLevel);
    const abilityModifier = Math.floor((abilityScores[spellcastingAbility] - 10) / 2);

    return {
      spellSaveDC: 8 + proficiencyBonus + abilityModifier,
      spellAttackBonus: proficiencyBonus + abilityModifier,
      spellcastingAbility
    };
  }
}

export const classProgressionService = new ClassProgressionService();
export default classProgressionService;