// D&D 5e Race data with ability score increases, traits, and proficiencies

export interface RaceData {
  name: string;
  abilityScoreIncrease: Partial<Record<AbilityScore, number>>;
  size: 'Small' | 'Medium';
  speed: number;
  languages: string[];
  proficiencies?: {
    skills?: string[];
    tools?: string[];
    weapons?: string[];
  };
  traits: RaceTrait[];
  subraces?: Record<string, SubraceData>;
}

export interface SubraceData {
  name: string;
  abilityScoreIncrease: Partial<Record<AbilityScore, number>>;
  traits: RaceTrait[];
  proficiencies?: {
    skills?: string[];
    tools?: string[];
    weapons?: string[];
    spells?: string[];
  };
}

export interface RaceTrait {
  name: string;
  description: string;
}

export type AbilityScore = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

export const RACES: Record<string, RaceData> = {
  'Human': {
    name: 'Human',
    abilityScoreIncrease: {
      strength: 1,
      dexterity: 1,
      constitution: 1,
      intelligence: 1,
      wisdom: 1,
      charisma: 1
    },
    size: 'Medium',
    speed: 30,
    languages: ['Common'],
    traits: [
      {
        name: 'Extra Language',
        description: 'You can speak, read, and write one extra language of your choice.'
      },
      {
        name: 'Extra Skill',
        description: 'You gain proficiency in one skill of your choice.'
      }
    ],
    subraces: {
      'Variant Human': {
        name: 'Variant Human',
        abilityScoreIncrease: {}, // Player chooses +1 to two different abilities
        traits: [
          {
            name: 'Extra Skill',
            description: 'You gain proficiency in one skill of your choice.'
          },
          {
            name: 'Feat',
            description: 'You gain one feat of your choice.'
          }
        ],
        proficiencies: {
          skills: ['*'] // Choose any one skill
        }
      }
    }
  },
  
  'Elf': {
    name: 'Elf',
    abilityScoreIncrease: {
      dexterity: 2
    },
    size: 'Medium',
    speed: 30,
    languages: ['Common', 'Elvish'],
    traits: [
      {
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.'
      },
      {
        name: 'Keen Senses', 
        description: 'You have proficiency in the Perception skill.'
      },
      {
        name: 'Fey Ancestry',
        description: 'You have advantage on saving throws against being charmed, and magic can\'t put you to sleep.'
      },
      {
        name: 'Trance',
        description: 'You don\'t need to sleep and can\'t be forced to sleep. You can finish a long rest in 4 hours.'
      }
    ],
    proficiencies: {
      skills: ['Perception']
    },
    subraces: {
      'High Elf': {
        name: 'High Elf',
        abilityScoreIncrease: {
          intelligence: 1
        },
        traits: [
          {
            name: 'Elf Weapon Training',
            description: 'You have proficiency with longswords, shortswords, shortbows, and longbows.'
          },
          {
            name: 'Cantrip',
            description: 'You know one cantrip of your choice from the wizard spell list.'
          },
          {
            name: 'Extra Language',
            description: 'You can speak, read, and write one extra language of your choice.'
          }
        ],
        proficiencies: {
          weapons: ['Longsword', 'Shortsword', 'Shortbow', 'Longbow'],
          spells: ['*wizard-cantrip'] // Choose one wizard cantrip
        }
      },
      'Wood Elf': {
        name: 'Wood Elf', 
        abilityScoreIncrease: {
          wisdom: 1
        },
        traits: [
          {
            name: 'Elf Weapon Training',
            description: 'You have proficiency with longswords, shortswords, shortbows, and longbows.'
          },
          {
            name: 'Fleet of Foot',
            description: 'Your base walking speed increases to 35 feet.'
          },
          {
            name: 'Mask of the Wild',
            description: 'You can attempt to hide even when you are only lightly obscured by foliage, heavy rain, falling snow, mist, and other natural phenomena.'
          }
        ],
        proficiencies: {
          weapons: ['Longsword', 'Shortsword', 'Shortbow', 'Longbow']
        }
      }
    }
  },

  'Dwarf': {
    name: 'Dwarf',
    abilityScoreIncrease: {
      constitution: 2
    },
    size: 'Medium', 
    speed: 25,
    languages: ['Common', 'Dwarvish'],
    traits: [
      {
        name: 'Darkvision',
        description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.'
      },
      {
        name: 'Dwarven Resilience',
        description: 'You have advantage on saving throws against poison, and you have resistance against poison damage.'
      },
      {
        name: 'Dwarven Combat Training',
        description: 'You have proficiency with battleaxes, handaxes, light hammers, and warhammers.'
      },
      {
        name: 'Stonecunning',
        description: 'Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient and add double your proficiency bonus.'
      }
    ],
    proficiencies: {
      weapons: ['Battleaxe', 'Handaxe', 'Light Hammer', 'Warhammer']
    },
    subraces: {
      'Hill Dwarf': {
        name: 'Hill Dwarf',
        abilityScoreIncrease: {
          wisdom: 1
        },
        traits: [
          {
            name: 'Dwarven Toughness',
            description: 'Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.'
          }
        ]
      },
      'Mountain Dwarf': {
        name: 'Mountain Dwarf',
        abilityScoreIncrease: {
          strength: 2
        },
        traits: [
          {
            name: 'Armor Proficiency',
            description: 'You have proficiency with light and medium armor.'
          }
        ]
      }
    }
  },

  'Halfling': {
    name: 'Halfling',
    abilityScoreIncrease: {
      dexterity: 2
    },
    size: 'Small',
    speed: 25, 
    languages: ['Common', 'Halfling'],
    traits: [
      {
        name: 'Lucky',
        description: 'When you roll a 1 on the d20 for an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll.'
      },
      {
        name: 'Brave',
        description: 'You have advantage on saving throws against being frightened.'
      },
      {
        name: 'Halfling Nimbleness',
        description: 'You can move through the space of any creature that is of a size larger than yours.'
      }
    ],
    subraces: {
      'Lightfoot Halfling': {
        name: 'Lightfoot Halfling',
        abilityScoreIncrease: {
          charisma: 1
        },
        traits: [
          {
            name: 'Naturally Stealthy',
            description: 'You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you.'
          }
        ]
      },
      'Stout Halfling': {
        name: 'Stout Halfling',
        abilityScoreIncrease: {
          constitution: 1
        },
        traits: [
          {
            name: 'Stout Resilience', 
            description: 'You have advantage on saving throws against poison, and you have resistance against poison damage.'
          }
        ]
      }
    }
  }
};

// Helper function to calculate total ability score increases
export function calculateRacialASI(race: string, subrace?: string, racesData?: Record<string, any>): Partial<Record<AbilityScore, number>> {
  const RACES_SOURCE = racesData || RACES;
  const raceData = RACES_SOURCE[race];
  if (!raceData) return {};
  
  let totalASI = { ...raceData.abilityScoreIncrease };
  
  if (subrace && raceData.subraces && raceData.subraces[subrace]) {
    const subraceData = raceData.subraces[subrace];
    // Add subrace ASI to race ASI
    Object.entries(subraceData.abilityScoreIncrease).forEach(([ability, bonus]) => {
      const abilityKey = ability as AbilityScore;
      totalASI[abilityKey] = (totalASI[abilityKey] || 0) + bonus;
    });
  }
  
  return totalASI;
}

// Helper to get all racial traits (race + subrace)
export function getRacialTraits(race: string, subrace?: string, racesData?: Record<string, any>): RaceTrait[] {
  const RACES_SOURCE = racesData || RACES;
  const raceData = RACES_SOURCE[race];
  if (!raceData) return [];
  
  let traits = [...raceData.traits];
  
  if (subrace && raceData.subraces && raceData.subraces[subrace]) {
    traits.push(...raceData.subraces[subrace].traits);
  }
  
  return traits;
}

// Helper to get racial proficiencies
export function getRacialProficiencies(race: string, subrace?: string): NonNullable<RaceData['proficiencies']> {
  const raceData = RACES[race];
  if (!raceData) return {};
  
  let proficiencies = { ...raceData.proficiencies };
  
  if (subrace && raceData.subraces && raceData.subraces[subrace]) {
    const subraceProficiencies = raceData.subraces[subrace].proficiencies || {};
    // Merge proficiencies
    Object.entries(subraceProficiencies).forEach(([type, profs]) => {
      const profType = type as keyof NonNullable<RaceData['proficiencies']>;
      if (proficiencies[profType]) {
        proficiencies[profType] = [...(proficiencies[profType] || []), ...(profs || [])];
      } else {
        proficiencies[profType] = profs;
      }
    });
  }
  
  return proficiencies;
}