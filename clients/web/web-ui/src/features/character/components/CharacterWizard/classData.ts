// D&D 5e Class data with hit dice, proficiencies, and starting features

export interface ClassData {
  name: string;
  hitDie: 'd6' | 'd8' | 'd10' | 'd12';
  primaryAbility: string[];
  savingThrowProficiencies: string[];
  skillChoices: {
    choose: number;
    from: string[];
  };
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  startingEquipment: {
    weapons: string[];
    armor: string[];
    equipment: string[];
    goldAlternative: number;
  };
  features: ClassFeature[];
  spellcasting?: SpellcastingInfo;
  subclasses?: Record<string, SubclassData>;
}

export interface ClassFeature {
  name: string;
  level: number;
  description: string;
}

export interface SpellcastingInfo {
  ability: 'intelligence' | 'wisdom' | 'charisma';
  cantrips: number[];
  spellsKnown: number[];
  spellSlots: {
    [level: number]: number[];
  };
  ritual: boolean;
  spellbook: boolean;
}

export interface SubclassData {
  name: string;
  features: ClassFeature[];
}

export const CLASSES: Record<string, ClassData> = {
  'Fighter': {
    name: 'Fighter',
    hitDie: 'd10',
    primaryAbility: ['Strength', 'Dexterity'],
    savingThrowProficiencies: ['Strength', 'Constitution'],
    skillChoices: {
      choose: 2,
      from: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival']
    },
    armorProficiencies: ['All armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    toolProficiencies: [],
    startingEquipment: {
      weapons: ['Choice of martial weapon + shield OR two martial weapons', 'Light crossbow + 20 bolts OR two handaxes'],
      armor: ['Chain mail OR leather armor + longbow + 20 arrows'],
      equipment: ["Dungeoneer's pack OR explorer's pack"],
      goldAlternative: 125
    },
    features: [
      {
        name: 'Fighting Style',
        level: 1,
        description: 'Choose a fighting style: Archery, Defense, Dueling, Great Weapon Fighting, Protection, or Two-Weapon Fighting.'
      },
      {
        name: 'Second Wind',
        level: 1,
        description: 'Regain 1d10 + fighter level hit points once per short/long rest.'
      }
    ],
    subclasses: {
      'Champion': {
        name: 'Champion',
        features: [
          {
            name: 'Improved Critical',
            level: 3,
            description: 'Critical hits occur on rolls of 19 or 20.'
          }
        ]
      },
      'Battle Master': {
        name: 'Battle Master',
        features: [
          {
            name: 'Combat Superiority',
            level: 3,
            description: 'Gain 4 superiority dice (d8) and 3 maneuvers.'
          }
        ]
      }
    }
  },

  'Wizard': {
    name: 'Wizard',
    hitDie: 'd6',
    primaryAbility: ['Intelligence'],
    savingThrowProficiencies: ['Intelligence', 'Wisdom'],
    skillChoices: {
      choose: 2,
      from: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion']
    },
    armorProficiencies: [],
    weaponProficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
    toolProficiencies: [],
    startingEquipment: {
      weapons: ['Quarterstaff OR dagger', 'Light crossbow + 20 bolts OR any simple weapon'],
      armor: [],
      equipment: ["Component pouch OR arcane focus", "Scholar's pack OR explorer's pack", 'Spellbook'],
      goldAlternative: 100
    },
    features: [
      {
        name: 'Spellcasting',
        level: 1,
        description: 'Cast wizard spells using Intelligence. Know 3 cantrips and 6 1st-level spells in spellbook.'
      },
      {
        name: 'Arcane Recovery',
        level: 1,
        description: 'Recover spell slots totaling half wizard level (rounded up) once per long rest.'
      }
    ],
    spellcasting: {
      ability: 'intelligence',
      cantrips: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      spellsKnown: [], // Wizards prepare spells, don't have "spells known"
      spellSlots: {
        1: [2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        2: [0, 0, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        // Additional levels...
      },
      ritual: true,
      spellbook: true
    },
    subclasses: {
      'School of Evocation': {
        name: 'School of Evocation',
        features: [
          {
            name: 'Evocation Savant',
            level: 2,
            description: 'Time and gold cost to copy evocation spells into spellbook is halved.'
          },
          {
            name: 'Sculpt Spells',
            level: 2,
            description: 'Protect allies from your evocation spells.'
          }
        ]
      }
    }
  },

  'Rogue': {
    name: 'Rogue',
    hitDie: 'd8',
    primaryAbility: ['Dexterity'],
    savingThrowProficiencies: ['Dexterity', 'Intelligence'],
    skillChoices: {
      choose: 4,
      from: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth']
    },
    armorProficiencies: ['Light armor'],
    weaponProficiencies: ['Simple weapons', 'Hand crossbows', 'Longswords', 'Rapiers', 'Shortswords'],
    toolProficiencies: ["Thieves' tools"],
    startingEquipment: {
      weapons: ['Rapier OR shortsword', 'Shortbow + quiver of 20 arrows'],
      armor: ['Leather armor'],
      equipment: ["Burglar's pack", "Thieves' tools", '2 daggers'],
      goldAlternative: 100
    },
    features: [
      {
        name: 'Expertise',
        level: 1,
        description: 'Double proficiency bonus for 2 skills you are proficient in.'
      },
      {
        name: 'Sneak Attack',
        level: 1,
        description: 'Deal extra 1d6 damage once per turn when you have advantage.'
      },
      {
        name: "Thieves' Cant",
        level: 1,
        description: 'Secret language known by rogues and criminals.'
      }
    ],
    subclasses: {
      'Thief': {
        name: 'Thief',
        features: [
          {
            name: 'Fast Hands',
            level: 3,
            description: 'Use bonus action for Sleight of Hand, use thieves\' tools, or Use an Object.'
          },
          {
            name: 'Second-Story Work',
            level: 3,
            description: 'Climb at normal speed and gain distance bonus to running jumps.'
          }
        ]
      }
    }
  },

  'Cleric': {
    name: 'Cleric',
    hitDie: 'd8',
    primaryAbility: ['Wisdom'],
    savingThrowProficiencies: ['Wisdom', 'Charisma'],
    skillChoices: {
      choose: 2,
      from: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion']
    },
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    weaponProficiencies: ['Simple weapons'],
    toolProficiencies: [],
    startingEquipment: {
      weapons: ['Mace OR warhammer (if proficient)', 'Light crossbow + 20 bolts OR any simple weapon'],
      armor: ['Scale mail OR leather armor OR chain mail (if proficient)', 'Shield'],
      equipment: ["Priest's pack OR explorer's pack", 'Holy symbol'],
      goldAlternative: 125
    },
    features: [
      {
        name: 'Spellcasting',
        level: 1,
        description: 'Cast cleric spells using Wisdom. Know 3 cantrips and prepare spells equal to Wis mod + level.'
      },
      {
        name: 'Divine Domain',
        level: 1,
        description: 'Choose a divine domain that grants domain spells and features.'
      }
    ],
    spellcasting: {
      ability: 'wisdom',
      cantrips: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      spellsKnown: [], // Clerics prepare spells
      spellSlots: {
        1: [2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        2: [0, 0, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      },
      ritual: true,
      spellbook: false
    },
    subclasses: {
      'Life Domain': {
        name: 'Life Domain',
        features: [
          {
            name: 'Disciple of Life',
            level: 1,
            description: 'Healing spells restore additional hit points equal to 2 + spell level.'
          },
          {
            name: 'Bonus Proficiency',
            level: 1,
            description: 'Gain proficiency with heavy armor.'
          }
        ]
      }
    }
  }
};

// Helper functions
export function getClassHitPoints(className: string, level: number, conModifier: number): number {
  const classData = CLASSES[className];
  if (!classData) return 8; // Default
  
  const hitDieSize = parseInt(classData.hitDie.substring(1));
  const baseHP = hitDieSize + conModifier; // Max at level 1
  
  if (level === 1) return Math.max(1, baseHP);
  
  // Average HP gain per level after 1st
  const avgPerLevel = Math.floor(hitDieSize / 2) + 1 + conModifier;
  return baseHP + (avgPerLevel * (level - 1));
}

export function getClassSkills(className: string): { choose: number; from: string[] } {
  const classData = CLASSES[className];
  return classData?.skillChoices || { choose: 0, from: [] };
}

export function getClassFeatures(className: string, level: number = 1): ClassFeature[] {
  const classData = CLASSES[className];
  return classData?.features.filter(f => f.level <= level) || [];
}

export function isSpellcaster(className: string): boolean {
  return !!CLASSES[className]?.spellcasting;
}

export function getSpellcastingInfo(className: string): SpellcastingInfo | undefined {
  return CLASSES[className]?.spellcasting;
}