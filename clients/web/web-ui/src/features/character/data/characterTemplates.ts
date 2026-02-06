/**
 * D&D 5e Character Templates
 * 
 * PC (Player Character) Template:
 * - Full detailed character sheet with all D&D 5e mechanics
 * - Proficiencies, skills, equipment, spells, features
 * - Suitable for long-term player character development
 * 
 * NPC (Non-Player Character) Template:
 * - Simplified stat block format (Monster Manual style)
 * - Focus on combat stats and key abilities
 * - Quick reference for DM during gameplay
 * 
 * Based on best practices from:
 * - D&D Beyond character sheets
 * - Roll20 character sheets
 * - Official D&D 5e character sheet
 * - D&D 5e Monster Manual stat blocks
 */

export interface CharacterTemplate {
  id: string;
  name: string;
  type: 'pc' | 'npc';
  description: string;
  icon: string;
  data: Record<string, any>;
}

/**
 * PC (Player Character) Template
 * Full D&D 5e character sheet structure
 */
export const PC_TEMPLATE: CharacterTemplate = {
  id: 'pc-default',
  name: 'Player Character',
  type: 'pc',
  description: 'Full character sheet for player characters with detailed stats, skills, equipment, and spells',
  icon: '🎭',
  data: {
    // === BASIC INFO ===
    characterName: 'New Character',
    class: 'Fighter',
    level: 1,
    race: 'Human',
    background: 'Soldier',
    alignment: 'Neutral',
    experiencePoints: 0,
    
    // === ABILITY SCORES ===
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    },
    
    // === ABILITY MODIFIERS (calculated) ===
    abilityModifiers: {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0
    },
    
    // === SAVING THROWS ===
    savingThrows: {
      strength: { proficient: false, bonus: 0 },
      dexterity: { proficient: false, bonus: 0 },
      constitution: { proficient: true, bonus: 2 },
      intelligence: { proficient: false, bonus: 0 },
      wisdom: { proficient: false, bonus: 0 },
      charisma: { proficient: false, bonus: 0 }
    },
    
    // === SKILLS ===
    skills: {
      acrobatics: { proficient: false, expertise: false, bonus: 0 },
      animalHandling: { proficient: false, expertise: false, bonus: 0 },
      arcana: { proficient: false, expertise: false, bonus: 0 },
      athletics: { proficient: true, expertise: false, bonus: 2 },
      deception: { proficient: false, expertise: false, bonus: 0 },
      history: { proficient: false, expertise: false, bonus: 0 },
      insight: { proficient: false, expertise: false, bonus: 0 },
      intimidation: { proficient: true, expertise: false, bonus: 2 },
      investigation: { proficient: false, expertise: false, bonus: 0 },
      medicine: { proficient: false, expertise: false, bonus: 0 },
      nature: { proficient: false, expertise: false, bonus: 0 },
      perception: { proficient: false, expertise: false, bonus: 0 },
      performance: { proficient: false, expertise: false, bonus: 0 },
      persuasion: { proficient: false, expertise: false, bonus: 0 },
      religion: { proficient: false, expertise: false, bonus: 0 },
      sleightOfHand: { proficient: false, expertise: false, bonus: 0 },
      stealth: { proficient: false, expertise: false, bonus: 0 },
      survival: { proficient: false, expertise: false, bonus: 0 }
    },
    
    // === COMBAT STATS ===
    stats: {
      hp: 10,
      maxHp: 10,
      tempHp: 0,
      ac: 16, // Chain mail
      initiative: 0,
      speed: 30,
      hitDice: '1d10',
      hitDiceUsed: 0,
      deathSaves: {
        successes: 0,
        failures: 0
      }
    },
    
    // === PROFICIENCIES & LANGUAGES ===
    proficiencies: {
      armor: ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shields'],
      weapons: ['Simple Weapons', 'Martial Weapons'],
      tools: ['Land Vehicles'],
      languages: ['Common', 'Dwarvish']
    },
    
    proficiencyBonus: 2,
    
    // === PERSONALITY ===
    personality: {
      personalityTraits: 'I can stare down a hell hound without flinching.',
      ideals: 'Greater Good. Our lot is to lay down our lives in defense of others.',
      bonds: 'I would still lay down my life for the people I served with.',
      flaws: 'I made a terrible mistake in battle that cost many lives—and I would do anything to keep that mistake secret.'
    },
    
    // === FEATURES & TRAITS ===
    featuresAndTraits: [
      {
        name: 'Second Wind',
        description: 'You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once you use this feature, you must finish a short or long rest before you can use it again.',
        uses: 1,
        maxUses: 1,
        recharge: 'short rest'
      },
      {
        name: 'Fighting Style: Defense',
        description: 'While you are wearing armor, you gain a +1 bonus to AC.',
        passive: true
      }
    ],
    
    // === EQUIPMENT ===
    equipment: {
      currency: {
        cp: 0,
        sp: 0,
        ep: 0,
        gp: 10,
        pp: 0
      },
      items: [
        { name: 'Chain Mail', quantity: 1, equipped: true, weight: 55 },
        { name: 'Longsword', quantity: 1, equipped: true, weight: 3 },
        { name: 'Shield', quantity: 1, equipped: true, weight: 6 },
        { name: 'Crossbow, light', quantity: 1, equipped: false, weight: 5 },
        { name: 'Crossbow bolts', quantity: 20, equipped: false, weight: 1.5 },
        { name: 'Backpack', quantity: 1, equipped: true, weight: 5 },
        { name: 'Bedroll', quantity: 1, equipped: false, weight: 7 },
        { name: 'Mess kit', quantity: 1, equipped: false, weight: 1 },
        { name: 'Rations (1 day)', quantity: 10, equipped: false, weight: 2 },
        { name: 'Rope, hempen (50 feet)', quantity: 1, equipped: false, weight: 10 },
        { name: 'Waterskin', quantity: 1, equipped: false, weight: 5 }
      ],
      carryCapacity: 150,
      encumbrance: 0
    },
    
    // === ATTACKS & ACTIONS ===
    attacks: [
      {
        name: 'Longsword',
        attackBonus: 4, // STR (2) + Prof (2)
        damage: '1d8+2',
        damageType: 'slashing',
        range: '5 ft',
        notes: 'Versatile (1d10)'
      },
      {
        name: 'Light Crossbow',
        attackBonus: 2, // DEX (0) + Prof (2)
        damage: '1d8',
        damageType: 'piercing',
        range: '80/320 ft',
        notes: 'Ammunition, loading, two-handed'
      }
    ],
    
    // === SPELLCASTING (for PC template, empty by default) ===
    spellcasting: {
      class: '',
      abilityModifier: 'intelligence',
      spellSaveDC: 0,
      spellAttackBonus: 0,
      spellSlots: {
        level1: { max: 0, used: 0 },
        level2: { max: 0, used: 0 },
        level3: { max: 0, used: 0 },
        level4: { max: 0, used: 0 },
        level5: { max: 0, used: 0 },
        level6: { max: 0, used: 0 },
        level7: { max: 0, used: 0 },
        level8: { max: 0, used: 0 },
        level9: { max: 0, used: 0 }
      },
      cantrips: [],
      spells: []
    },
    
    // === APPEARANCE & BACKSTORY ===
    appearance: {
      age: 25,
      height: '6\'2"',
      weight: '180 lbs',
      eyes: 'Brown',
      skin: 'Tan',
      hair: 'Black',
      description: ''
    },
    
    backstory: '',
    allies: '',
    treasure: '',
    
    // === ADDITIONAL NOTES ===
    notes: '',
    
    // === CONDITIONS ===
    conditions: []
  }
};

/**
 * NPC (Non-Player Character) Template
 * Simplified stat block (Monster Manual style)
 */
export const NPC_TEMPLATE: CharacterTemplate = {
  id: 'npc-default',
  name: 'NPC / Monster',
  type: 'npc',
  description: 'Simplified stat block for NPCs, monsters, and creatures. Quick reference format for combat.',
  icon: '👹',
  data: {
    // === BASIC INFO ===
    name: 'Goblin',
    type: 'humanoid',
    subtype: 'goblinoid',
    size: 'Small',
    alignment: 'Neutral Evil',
    
    // === ARMOR CLASS & HIT POINTS ===
    stats: {
      ac: 15, // Leather armor, shield
      acNotes: 'Leather Armor, Shield',
      hp: 7,
      maxHp: 7,
      hitDice: '2d6',
      speed: 30
    },
    
    // === ABILITY SCORES (stat block format) ===
    abilityScores: {
      strength: 8,      // -1
      dexterity: 14,    // +2
      constitution: 10, // +0
      intelligence: 10, // +0
      wisdom: 8,        // -1
      charisma: 8       // -1
    },
    
    // === SAVING THROWS (only if different from ability modifier) ===
    savingThrows: {},
    
    // === SKILLS (only list if proficient) ===
    skills: {
      stealth: { proficient: true, bonus: 6 } // +2 DEX + 2 Prof + 2 Expertise
    },
    
    // === RESISTANCES & IMMUNITIES ===
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    
    // === SENSES ===
    senses: {
      darkvision: 60,
      passivePerception: 9
    },
    
    // === LANGUAGES ===
    languages: ['Common', 'Goblin'],
    
    // === CHALLENGE RATING ===
    challengeRating: '1/4',
    experiencePoints: 50,
    proficiencyBonus: 2,
    
    // === SPECIAL TRAITS ===
    traits: [
      {
        name: 'Nimble Escape',
        description: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.'
      }
    ],
    
    // === ACTIONS ===
    actions: [
      {
        name: 'Scimitar',
        type: 'melee',
        attackBonus: 4, // +2 DEX + 2 Prof
        reach: '5 ft',
        targets: 'one target',
        damage: '1d6+2',
        damageType: 'slashing',
        description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.'
      },
      {
        name: 'Shortbow',
        type: 'ranged',
        attackBonus: 4, // +2 DEX + 2 Prof
        range: '80/320 ft',
        targets: 'one target',
        damage: '1d6+2',
        damageType: 'piercing',
        description: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.'
      }
    ],
    
    // === BONUS ACTIONS ===
    bonusActions: [
      {
        name: 'Nimble Escape',
        description: 'The goblin takes the Disengage or Hide action.'
      }
    ],
    
    // === REACTIONS ===
    reactions: [],
    
    // === LEGENDARY ACTIONS (for legendary creatures) ===
    legendaryActions: [],
    legendaryActionCount: 0,
    
    // === LAIR ACTIONS (for creatures with lairs) ===
    lairActions: [],
    
    // === REGIONAL EFFECTS ===
    regionalEffects: [],
    
    // === EQUIPMENT (simplified for NPCs) ===
    equipment: [
      'Scimitar',
      'Shortbow',
      '20 arrows',
      'Leather armor',
      'Shield'
    ],
    
    // === DESCRIPTION ===
    description: 'A small, black-hearted humanoid that lair in despoiled dungeons and other dismal settings. Individually weak, goblins gather in large numbers to torment other creatures.',
    
    // === TACTICAL INFO (for DM reference) ===
    tactics: 'Goblins prefer to attack from range and use Nimble Escape to hide after attacking. They flee if reduced to half HP.',
    
    // === CURRENT CONDITIONS ===
    conditions: [],
    
    // === NOTES ===
    notes: ''
  }
};

/**
 * Additional PC Templates (Common Classes)
 */
export const PC_WIZARD_TEMPLATE: CharacterTemplate = {
  id: 'pc-wizard',
  name: 'Wizard (Spellcaster)',
  type: 'pc',
  description: 'A scholarly magic-user with full spellcasting capabilities',
  icon: '🧙',
  data: {
    ...PC_TEMPLATE.data,
    characterName: 'New Wizard',
    class: 'Wizard',
    background: 'Sage',
    
    abilityScores: {
      strength: 8,
      dexterity: 14,
      constitution: 12,
      intelligence: 16,
      wisdom: 10,
      charisma: 10
    },
    
    stats: {
      hp: 6,
      maxHp: 6,
      tempHp: 0,
      ac: 12, // 10 + DEX(2)
      initiative: 2,
      speed: 30,
      hitDice: '1d6',
      hitDiceUsed: 0,
      deathSaves: { successes: 0, failures: 0 }
    },
    
    savingThrows: {
      strength: { proficient: false, bonus: -1 },
      dexterity: { proficient: false, bonus: 2 },
      constitution: { proficient: false, bonus: 1 },
      intelligence: { proficient: true, bonus: 5 },
      wisdom: { proficient: true, bonus: 2 },
      charisma: { proficient: false, bonus: 0 }
    },
    
    skills: {
      ...PC_TEMPLATE.data.skills,
      arcana: { proficient: true, expertise: false, bonus: 5 },
      history: { proficient: true, expertise: false, bonus: 5 },
      investigation: { proficient: true, expertise: false, bonus: 5 }
    },
    
    proficiencies: {
      armor: [],
      weapons: ['Dagger', 'Dart', 'Sling', 'Quarterstaff', 'Light Crossbow'],
      tools: [],
      languages: ['Common', 'Draconic', 'Elvish', 'Dwarvish']
    },
    
    spellcasting: {
      class: 'Wizard',
      abilityModifier: 'intelligence',
      spellSaveDC: 13, // 8 + Prof(2) + INT(3)
      spellAttackBonus: 5, // Prof(2) + INT(3)
      spellSlots: {
        level1: { max: 2, used: 0 },
        level2: { max: 0, used: 0 },
        level3: { max: 0, used: 0 },
        level4: { max: 0, used: 0 },
        level5: { max: 0, used: 0 },
        level6: { max: 0, used: 0 },
        level7: { max: 0, used: 0 },
        level8: { max: 0, used: 0 },
        level9: { max: 0, used: 0 }
      },
      cantrips: [
        { name: 'Fire Bolt', description: 'Ranged spell attack, 1d10 fire damage', prepared: true },
        { name: 'Mage Hand', description: 'Create a spectral hand', prepared: true },
        { name: 'Prestidigitation', description: 'Minor magical trick', prepared: true }
      ],
      spells: [
        { name: 'Magic Missile', level: 1, prepared: true, ritual: false },
        { name: 'Shield', level: 1, prepared: true, ritual: false },
        { name: 'Detect Magic', level: 1, prepared: true, ritual: true },
        { name: 'Identify', level: 1, prepared: false, ritual: true },
        { name: 'Mage Armor', level: 1, prepared: true, ritual: false },
        { name: 'Sleep', level: 1, prepared: true, ritual: false }
      ]
    },
    
    featuresAndTraits: [
      {
        name: 'Arcane Recovery',
        description: 'Once per day when you finish a short rest, you can recover spell slots totaling up to half your wizard level (rounded up).',
        uses: 1,
        maxUses: 1,
        recharge: 'long rest'
      },
      {
        name: 'Spellbook',
        description: 'You have a spellbook containing six 1st-level wizard spells of your choice.',
        passive: true
      }
    ],
    
    equipment: {
      currency: { cp: 0, sp: 0, ep: 0, gp: 8, pp: 0 },
      items: [
        { name: 'Quarterstaff', quantity: 1, equipped: true, weight: 4 },
        { name: 'Spellbook', quantity: 1, equipped: false, weight: 3 },
        { name: 'Component pouch', quantity: 1, equipped: true, weight: 2 },
        { name: 'Scholar\'s pack', quantity: 1, equipped: true, weight: 10 },
        { name: 'Robes', quantity: 1, equipped: true, weight: 4 }
      ],
      carryCapacity: 120,
      encumbrance: 0
    },
    
    attacks: [
      {
        name: 'Fire Bolt',
        attackBonus: 5,
        damage: '1d10',
        damageType: 'fire',
        range: '120 ft',
        notes: 'Cantrip'
      },
      {
        name: 'Quarterstaff',
        attackBonus: 1, // STR(-1) + Prof(2)
        damage: '1d6-1',
        damageType: 'bludgeoning',
        range: '5 ft',
        notes: 'Versatile (1d8)'
      }
    ]
  }
};

/**
 * Additional NPC Templates
 */
export const NPC_HUMANOID_TEMPLATE: CharacterTemplate = {
  id: 'npc-humanoid',
  name: 'NPC Humanoid (Guard)',
  type: 'npc',
  description: 'A standard humanoid NPC suitable for guards, bandits, or common folk',
  icon: '🛡️',
  data: {
    ...NPC_TEMPLATE.data,
    name: 'Guard',
    type: 'humanoid',
    subtype: 'any race',
    size: 'Medium',
    alignment: 'Any alignment',
    
    stats: {
      ac: 16,
      acNotes: 'Chain shirt, shield',
      hp: 11,
      maxHp: 11,
      hitDice: '2d8+2',
      speed: 30
    },
    
    abilityScores: {
      strength: 13,   // +1
      dexterity: 12,  // +1
      constitution: 12, // +1
      intelligence: 10, // +0
      wisdom: 11,     // +0
      charisma: 10    // +0
    },
    
    skills: {
      perception: { proficient: true, bonus: 2 }
    },
    
    senses: {
      passivePerception: 12
    },
    
    languages: ['Any one language (usually Common)'],
    
    challengeRating: '1/8',
    experiencePoints: 25,
    
    traits: [],
    
    actions: [
      {
        name: 'Spear',
        type: 'melee or ranged',
        attackBonus: 3,
        reach: '5 ft or range 20/60 ft',
        targets: 'one target',
        damage: '1d6+1',
        damageType: 'piercing',
        description: 'Melee or Ranged Weapon Attack: +3 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d6 + 1) piercing damage, or 5 (1d8 + 1) piercing damage if used with two hands to make a melee attack.'
      }
    ],
    
    equipment: [
      'Spear',
      'Chain shirt',
      'Shield',
      'Whistle'
    ],
    
    description: 'Guards include members of a city watch, sentries in a citadel or fortified town, and the bodyguards of merchants and nobles.',
    
    tactics: 'Guards attempt to subdue rather than kill intruders. They call for help and fight defensively.'
  }
};

export const NPC_BEAST_TEMPLATE: CharacterTemplate = {
  id: 'npc-beast',
  name: 'NPC Beast (Wolf)',
  type: 'npc',
  description: 'A beast or animal creature',
  icon: '🐺',
  data: {
    ...NPC_TEMPLATE.data,
    name: 'Wolf',
    type: 'beast',
    subtype: '',
    size: 'Medium',
    alignment: 'Unaligned',
    
    stats: {
      ac: 13,
      acNotes: 'Natural armor',
      hp: 11,
      maxHp: 11,
      hitDice: '2d8+2',
      speed: 40
    },
    
    abilityScores: {
      strength: 12,   // +1
      dexterity: 15,  // +2
      constitution: 12, // +1
      intelligence: 3,  // -4
      wisdom: 12,     // +1
      charisma: 6     // -2
    },
    
    skills: {
      perception: { proficient: true, bonus: 3 },
      stealth: { proficient: true, bonus: 4 }
    },
    
    senses: {
      passivePerception: 13
    },
    
    languages: [],
    
    challengeRating: '1/4',
    experiencePoints: 50,
    
    traits: [
      {
        name: 'Keen Hearing and Smell',
        description: 'The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.'
      },
      {
        name: 'Pack Tactics',
        description: 'The wolf has advantage on an attack roll against a creature if at least one of the wolf\'s allies is within 5 feet of the creature and the ally isn\'t incapacitated.'
      }
    ],
    
    actions: [
      {
        name: 'Bite',
        type: 'melee',
        attackBonus: 4,
        reach: '5 ft',
        targets: 'one target',
        damage: '2d4+2',
        damageType: 'piercing',
        description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.'
      }
    ],
    
    equipment: [],
    
    description: 'A predatory mammal that hunts in packs.',
    
    tactics: 'Wolves use Pack Tactics to gain advantage. They attempt to knock prey prone and then attack with advantage.'
  }
};

// Export all templates as an array for easy iteration
export const ALL_TEMPLATES: CharacterTemplate[] = [
  PC_TEMPLATE,
  PC_WIZARD_TEMPLATE,
  NPC_TEMPLATE,
  NPC_HUMANOID_TEMPLATE,
  NPC_BEAST_TEMPLATE
];

// Helper function to get template by ID
export function getTemplateById(id: string): CharacterTemplate | undefined {
  return ALL_TEMPLATES.find(t => t.id === id);
}

// Helper function to get templates by type
export function getTemplatesByType(type: 'pc' | 'npc'): CharacterTemplate[] {
  return ALL_TEMPLATES.filter(t => t.type === type);
}
