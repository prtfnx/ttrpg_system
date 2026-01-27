/**
 * D&D 5e Feat System Service
 * Handles feat prerequisites, ASI vs feat choices, racial feats, and feat progression
 */

// Core D&D 5e feat interfaces
export interface FeatPrerequisite {
  type: 'ability_score' | 'race' | 'class' | 'level' | 'feature' | 'spell' | 'skill';
  requirement: string;
  value?: number;
  description: string;
}

export interface FeatBenefit {
  type: 'ability_score' | 'proficiency' | 'feature' | 'spell' | 'resistance' | 'immunity';
  description: string;
  value?: string | number;
  choices?: string[];
}

export interface Feat {
  name: string;
  description: string;
  prerequisites: FeatPrerequisite[];
  benefits: FeatBenefit[];
  source: string;
  is_half_feat: boolean; // Whether this feat also grants +1 to an ability score
  ability_score_options?: string[]; // Which abilities can be improved if half feat
  is_racial_feat: boolean;
  racial_requirement?: string; // Required race for racial feats
  tags: string[]; // Combat, Utility, Social, Magic, etc.
}

export interface AbilityScoreImprovement {
  type: 'asi';
  improvements: number; // How many +1 improvements can be made
  max_per_ability: number; // Maximum improvement per ability (usually 1)
  description: string;
}

export interface FeatChoice {
  level: number;
  character_class: string;
  choice_type: 'asi' | 'feat' | 'both';
  selected_type?: 'asi' | 'feat';
  selected_feat?: string;
  asi_improvements?: Record<string, number>; // ability -> improvement amount
}

// D&D 5e Feats Database
export const DND_FEATS: Record<string, Feat> = {
  'Alert': {
    name: 'Alert',
    description: 'Always on the lookout for danger, you gain the following benefits: +5 bonus to initiative, you can\'t be surprised while conscious, other creatures don\'t gain advantage on attack rolls against you as a result of being unseen.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: '+5 bonus to initiative rolls' },
      { type: 'feature', description: 'Cannot be surprised while conscious' },
      { type: 'feature', description: 'Creatures don\'t gain advantage from being unseen by you' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat', 'Utility']
  },
  
  'Athlete': {
    name: 'Athlete',
    description: 'You have undergone extensive physical training to gain the following benefits: Increase your Strength or Dexterity by 1, climbing doesn\'t cost you extra movement, you can make a running long jump or high jump after moving only 5 feet.',
    prerequisites: [],
    benefits: [
      { type: 'ability_score', description: 'Increase Strength or Dexterity by 1', choices: ['Strength', 'Dexterity'] },
      { type: 'feature', description: 'Climbing doesn\'t cost extra movement' },
      { type: 'feature', description: 'Running jump after moving only 5 feet' }
    ],
    source: 'PHB',
    is_half_feat: true,
    ability_score_options: ['Strength', 'Dexterity'],
    is_racial_feat: false,
    tags: ['Utility', 'Athletics']
  },

  'Actor': {
    name: 'Actor',
    description: 'Skilled at mimicry and dramatics, you gain the following benefits: Increase your Charisma by 1, you have advantage on Charisma (Deception) and Charisma (Performance) checks when trying to pass yourself off as a different person, you can mimic speech patterns and sounds of creatures you\'ve heard speak for at least 1 minute.',
    prerequisites: [],
    benefits: [
      { type: 'ability_score', description: 'Increase Charisma by 1' },
      { type: 'feature', description: 'Advantage on Deception and Performance when impersonating' },
      { type: 'feature', description: 'Mimic speech patterns after 1 minute of listening' }
    ],
    source: 'PHB',
    is_half_feat: true,
    ability_score_options: ['Charisma'],
    is_racial_feat: false,
    tags: ['Social', 'Utility']
  },

  'Charger': {
    name: 'Charger',
    description: 'When you use your action to Dash, you can use a bonus action to make one melee weapon attack or to shove a creature. If you move at least 10 feet in a straight line immediately before taking this bonus action, you either gain a +5 bonus to the attack\'s damage roll or push the target up to 10 feet away.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Bonus action attack or shove after Dash action' },
      { type: 'feature', description: '+5 damage or 10-foot push with 10+ foot charge' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat']
  },

  'Crossbow Expert': {
    name: 'Crossbow Expert',
    description: 'Thanks to extensive practice with the crossbow, you gain the following benefits: You ignore the loading quality of crossbows, being within 5 feet of a hostile creature doesn\'t impose disadvantage on your ranged attack rolls, when you use the Attack action and attack with a one-handed weapon, you can use a bonus action to attack with a hand crossbow.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Ignore loading quality of crossbows' },
      { type: 'feature', description: 'No disadvantage on ranged attacks when enemies are within 5 feet' },
      { type: 'feature', description: 'Bonus action hand crossbow attack after one-handed weapon attack' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat', 'Ranged']
  },

  'Defensive Duelist': {
    name: 'Defensive Duelist',
    description: 'When you are wielding a finesse weapon with which you are proficient and another creature hits you with a melee attack, you can use your reaction to add your proficiency bonus to your AC for that attack, potentially causing the attack to miss you.',
    prerequisites: [
      { type: 'ability_score', requirement: 'Dexterity', value: 13, description: 'Dexterity 13 or higher' }
    ],
    benefits: [
      { type: 'feature', description: 'Reaction to add proficiency bonus to AC when wielding finesse weapon' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat', 'Defense']
  },

  'Dual Wielder': {
    name: 'Dual Wielder',
    description: 'You master fighting with two weapons, gaining the following benefits: +1 bonus to AC while wielding separate melee weapons in each hand, you can use two-weapon fighting even when weapons aren\'t light, you can draw or stow two one-handed weapons when you would normally draw or stow only one.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: '+1 AC while dual wielding' },
      { type: 'feature', description: 'Two-weapon fighting with non-light weapons' },
      { type: 'feature', description: 'Draw/stow two weapons simultaneously' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat']
  },

  'Dungeon Delver': {
    name: 'Dungeon Delver',
    description: 'Alert to the hidden traps and secret doors found in many dungeons, you gain the following benefits: Advantage on Perception and Investigation checks made to detect secret doors, advantage on saving throws to avoid or resist traps, resistance to damage dealt by traps, traveling at fast pace doesn\'t impose penalty on passive Perception.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Advantage on checks to detect secret doors' },
      { type: 'feature', description: 'Advantage on saves against traps' },
      { type: 'resistance', description: 'Resistance to trap damage' },
      { type: 'feature', description: 'No penalty to passive Perception when traveling fast' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Utility', 'Exploration']
  },

  'Durable': {
    name: 'Durable',
    description: 'Hardy and resilient, you gain the following benefits: Increase your Constitution by 1, when you roll a Hit Die to regain hit points, the minimum number you can roll is twice your Constitution modifier.',
    prerequisites: [],
    benefits: [
      { type: 'ability_score', description: 'Increase Constitution by 1' },
      { type: 'feature', description: 'Minimum hit die roll equals 2× Constitution modifier' }
    ],
    source: 'PHB',
    is_half_feat: true,
    ability_score_options: ['Constitution'],
    is_racial_feat: false,
    tags: ['Utility', 'Healing']
  },

  'Elemental Adept': {
    name: 'Elemental Adept',
    description: 'When you gain this feat, choose one of the following damage types: acid, cold, fire, lightning, or thunder. Spells you cast ignore resistance to damage of the chosen type. When you roll damage for a spell you cast that deals damage of that type, you can treat any 1 on a damage die as a 2.',
    prerequisites: [
      { type: 'feature', requirement: 'Spellcasting', description: 'The ability to cast at least one spell' }
    ],
    benefits: [
      { type: 'feature', description: 'Spells ignore resistance to chosen element', choices: ['acid', 'cold', 'fire', 'lightning', 'thunder'] },
      { type: 'feature', description: 'Treat 1s as 2s on damage dice for chosen element' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Magic', 'Damage']
  },

  'Fey Touched': {
    name: 'Fey Touched',
    description: 'Your exposure to the Feywild\'s magic has changed you, granting you the following benefits: Increase your Intelligence, Wisdom, or Charisma by 1, you learn the misty step spell and one 1st-level spell of your choice from divination or enchantment schools, you can cast each of these spells once without expending a spell slot.',
    prerequisites: [],
    benefits: [
      { type: 'ability_score', description: 'Increase Intelligence, Wisdom, or Charisma by 1', choices: ['Intelligence', 'Wisdom', 'Charisma'] },
      { type: 'spell', description: 'Learn misty step spell' },
      { type: 'spell', description: 'Learn one 1st-level divination or enchantment spell' },
      { type: 'feature', description: 'Cast each spell once per long rest without spell slot' }
    ],
    source: 'TCE',
    is_half_feat: true,
    ability_score_options: ['Intelligence', 'Wisdom', 'Charisma'],
    is_racial_feat: false,
    tags: ['Magic', 'Utility']
  },

  'Great Weapon Master': {
    name: 'Great Weapon Master',
    description: 'You\'ve learned to put the weight of a weapon to your advantage, letting its momentum empower your strikes. You gain the following benefits: On your turn, when you score a critical hit with a melee weapon or reduce a creature to 0 hit points with one, you can make one melee weapon attack as a bonus action. Before you make a melee attack with a heavy weapon, you can choose to take a -5 penalty to the attack roll. If the attack hits, you add +10 to the attack\'s damage roll.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Bonus action attack on critical hit or kill with melee weapon' },
      { type: 'feature', description: 'Take -5 to hit for +10 damage with heavy weapons' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat', 'Damage']
  },

  'Healer': {
    name: 'Healer',
    description: 'You are an able physician, allowing you to mend wounds quickly and get your allies back in the fight. You gain the following benefits: When you use a healer\'s kit to stabilize a dying creature, that creature also regains 1 hit point. As an action, you can spend one use of a healer\'s kit to tend to a creature and restore 1d4 + 4 hit points to it, plus additional hit points equal to the creature\'s maximum number of Hit Dice.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Stabilizing with healer\'s kit also restores 1 HP' },
      { type: 'feature', description: 'Heal 1d4 + 4 + target\'s HD maximum with healer\'s kit (once per short/long rest per creature)' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Utility', 'Healing']
  },

  'Lucky': {
    name: 'Lucky',
    description: 'You have inexplicable luck that seems to kick in at just the right moment. You have 3 luck points. Whenever you make an attack roll, ability check, or saving throw, you can spend one luck point to roll an additional d20. You can choose to spend one of your luck points after you roll the die, but before the outcome is determined.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: '3 luck points per long rest' },
      { type: 'feature', description: 'Spend luck point to roll additional d20 for attack, check, or save' },
      { type: 'feature', description: 'Can decide to use luck after seeing initial roll' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Utility']
  },

  'Magic Initiate': {
    name: 'Magic Initiate',
    description: 'Choose a class: bard, cleric, druid, sorcerer, warlock, or wizard. You learn two cantrips of your choice from that class\'s spell list. You also learn one 1st-level spell of your choice from that same list. You can cast this spell once without expending a spell slot, and you must finish a long rest before you can cast it in this way again.',
    prerequisites: [],
    benefits: [
      { type: 'spell', description: 'Learn 2 cantrips from chosen class', choices: ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'] },
      { type: 'spell', description: 'Learn 1 1st-level spell from chosen class' },
      { type: 'feature', description: 'Cast the 1st-level spell once per long rest without spell slot' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Magic']
  },

  'Martial Adept': {
    name: 'Martial Adept',
    description: 'You have martial training that allows you to perform special combat maneuvers. You gain the following benefits: You learn two maneuvers of your choice from among those available to the Battle Master archetype. If a maneuver you use requires your target to make a saving throw, the DC equals 8 + proficiency bonus + Str or Dex modifier. You gain one superiority die (d6).',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Learn 2 Battle Master maneuvers' },
      { type: 'feature', description: 'Gain 1 superiority die (d6), regain on short/long rest' },
      { type: 'feature', description: 'Maneuver save DC = 8 + prof + Str/Dex mod' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat']
  },

  'Mobile': {
    name: 'Mobile',
    description: 'You are exceptionally speedy and agile. You gain the following benefits: Your speed increases by 10 feet, when you use the Dash action, difficult terrain doesn\'t cost you extra movement, when you make a melee attack against a creature, you don\'t provoke opportunity attacks from that creature for the rest of the turn.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Speed increases by 10 feet' },
      { type: 'feature', description: 'Dash action ignores difficult terrain' },
      { type: 'feature', description: 'No opportunity attacks from creatures you attack in melee' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat', 'Utility']
  },

  'Observant': {
    name: 'Observant',
    description: 'Quick to notice details of your environment, you gain the following benefits: Increase your Intelligence or Wisdom by 1, if you can see a creature\'s mouth and know the language, you can interpret what it\'s saying by reading its lips, you have a +5 bonus to your passive Perception and passive Investigation scores.',
    prerequisites: [],
    benefits: [
      { type: 'ability_score', description: 'Increase Intelligence or Wisdom by 1', choices: ['Intelligence', 'Wisdom'] },
      { type: 'feature', description: 'Read lips if you can see mouth and know language' },
      { type: 'feature', description: '+5 to passive Perception and Investigation' }
    ],
    source: 'PHB',
    is_half_feat: true,
    ability_score_options: ['Intelligence', 'Wisdom'],
    is_racial_feat: false,
    tags: ['Utility', 'Exploration']
  },

  'Polearm Master': {
    name: 'Polearm Master',
    description: 'You can keep your enemies at bay with reach weapons. You gain the following benefits: When you take the Attack action and attack with only a glaive, halberd, quarterstaff, or spear, you can use a bonus action to make a melee attack with the opposite end of the weapon (1d4 bludgeoning). When you are wielding a glaive, halberd, pike, quarterstaff, or spear, other creatures provoke an opportunity attack when they enter your reach.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Bonus action attack with weapon\'s opposite end (1d4 damage)' },
      { type: 'feature', description: 'Opportunity attacks when creatures enter your reach with polearm' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat']
  },

  'Resilient': {
    name: 'Resilient',
    description: 'Choose one ability score. You gain the following benefits: Increase the chosen ability score by 1, you gain proficiency in saving throws using the chosen ability.',
    prerequisites: [],
    benefits: [
      { type: 'ability_score', description: 'Increase chosen ability score by 1', choices: ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] },
      { type: 'proficiency', description: 'Gain saving throw proficiency in chosen ability' }
    ],
    source: 'PHB',
    is_half_feat: true,
    ability_score_options: ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'],
    is_racial_feat: false,
    tags: ['Utility']
  },

  'Ritual Caster': {
    name: 'Ritual Caster',
    description: 'You have learned a number of spells that you can cast as rituals. Choose one of the following classes: bard, cleric, druid, sorcerer, warlock, or wizard. You must have an Intelligence or Wisdom of 13 or higher (your choice). You acquire a ritual book holding two 1st-level spells of your choice. You can cast these spells only as rituals.',
    prerequisites: [
      { type: 'ability_score', requirement: 'Intelligence or Wisdom', value: 13, description: 'Intelligence 13 or Wisdom 13' }
    ],
    benefits: [
      { type: 'feature', description: 'Acquire ritual book with 2 1st-level ritual spells' },
      { type: 'feature', description: 'Can copy ritual spells of appropriate level into book' },
      { type: 'feature', description: 'Cast ritual spells from book (ritual only, not regular casting)' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Magic', 'Utility']
  },

  'Savage Attacker': {
    name: 'Savage Attacker',
    description: 'Once per turn when you roll damage for a melee weapon attack, you can reroll the weapon\'s damage dice and use either total.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Reroll weapon damage dice once per turn, use either result' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat', 'Damage']
  },

  'Sentinel': {
    name: 'Sentinel',
    description: 'You have mastered techniques to take advantage of every drop in any enemy\'s guard: When you hit a creature with an opportunity attack, the creature\'s speed becomes 0 for the rest of the turn. Creatures provoke opportunity attacks even if they take the Disengage action. When a creature makes an attack against a target other than you, you can use your reaction to make a melee weapon attack against the attacking creature.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Opportunity attacks reduce target speed to 0' },
      { type: 'feature', description: 'Creatures provoke opportunity attacks even when disengaging' },
      { type: 'feature', description: 'Reaction attack when enemy attacks your ally (if enemy is within reach)' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat', 'Tank']
  },

  'Sharpshooter': {
    name: 'Sharpshooter',
    description: 'You have mastered ranged weapons and can make shots that others find impossible: Attacking at long range doesn\'t impose disadvantage, your ranged weapon attacks ignore half and three-quarters cover, before you make an attack with a ranged weapon, you can choose to take a -5 penalty to the attack roll. If the attack hits, you add +10 to the attack\'s damage roll.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'No disadvantage for long range attacks' },
      { type: 'feature', description: 'Ignore half and three-quarters cover' },
      { type: 'feature', description: 'Take -5 to hit for +10 damage with ranged weapons' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat', 'Ranged', 'Damage']
  },

  'Shield Master': {
    name: 'Shield Master',
    description: 'You use shields not just for protection but also for offense. You gain the following benefits: If you take the Attack action on your turn, you can use a bonus action to try to shove a creature within 5 feet with your shield. If you aren\'t incapacitated, you can add your shield\'s AC bonus to any Dex save you make against a spell or harmful effect. If you are subjected to an effect that allows you to make a Dex save to take only half damage, you can use your reaction to take no damage if you succeed.',
    prerequisites: [],
    benefits: [
      { type: 'feature', description: 'Bonus action shield shove after Attack action' },
      { type: 'feature', description: 'Add shield AC bonus to Dex saves against spells/effects' },
      { type: 'feature', description: 'Take no damage on successful Dex save (if normally half damage)' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Combat', 'Defense']
  },

  'Skilled': {
    name: 'Skilled',
    description: 'You gain proficiency in any combination of three skills or tools of your choice.',
    prerequisites: [],
    benefits: [
      { type: 'proficiency', description: 'Gain proficiency in 3 skills or tools of your choice' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Utility']
  },

  'Skulker': {
    name: 'Skulker',
    description: 'You are expert at slinking through shadows. You gain the following benefits: You can try to hide when you are lightly obscured. When you are hidden from a creature and miss it with a ranged weapon attack, making the attack doesn\'t reveal your position. Dim light doesn\'t impose disadvantage on your Wisdom (Perception) checks relying on sight.',
    prerequisites: [
      { type: 'ability_score', requirement: 'Dexterity', value: 13, description: 'Dexterity 13 or higher' }
    ],
    benefits: [
      { type: 'feature', description: 'Can hide when lightly obscured' },
      { type: 'feature', description: 'Missing ranged attacks while hidden doesn\'t reveal position' },
      { type: 'feature', description: 'No disadvantage on sight-based Perception in dim light' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Utility', 'Stealth']
  },

  'Spell Sniper': {
    name: 'Spell Sniper',
    description: 'You have learned techniques to enhance your attacks with certain kinds of spells, gaining the following benefits: When you cast a spell that requires you to make an attack roll, the spell\'s range is doubled. Your ranged spell attacks ignore half and three-quarters cover. You learn one cantrip that requires an attack roll from the spell list of bard, cleric, druid, sorcerer, warlock, or wizard.',
    prerequisites: [
      { type: 'feature', requirement: 'Spellcasting', description: 'The ability to cast at least one spell' }
    ],
    benefits: [
      { type: 'feature', description: 'Double range for attack roll spells' },
      { type: 'feature', description: 'Ranged spell attacks ignore half and three-quarters cover' },
      { type: 'spell', description: 'Learn 1 attack roll cantrip from any class' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Magic', 'Combat']
  },

  'Telekinetic': {
    name: 'Telekinetic',
    description: 'You learn to move things with your mind, granting you the following benefits: Increase your Intelligence, Wisdom, or Charisma by 1. You learn the mage hand cantrip. You can cast it without verbal or somatic components, and you can make the spectral hand invisible. As a bonus action, you can try to shove one creature within 30 feet with telekinetic force.',
    prerequisites: [],
    benefits: [
      { type: 'ability_score', description: 'Increase Intelligence, Wisdom, or Charisma by 1', choices: ['Intelligence', 'Wisdom', 'Charisma'] },
      { type: 'spell', description: 'Learn mage hand cantrip (enhanced version)' },
      { type: 'feature', description: 'Bonus action telekinetic shove (30 feet range)' }
    ],
    source: 'TCE',
    is_half_feat: true,
    ability_score_options: ['Intelligence', 'Wisdom', 'Charisma'],
    is_racial_feat: false,
    tags: ['Magic', 'Utility']
  },

  'Telepathic': {
    name: 'Telepathic',
    description: 'You awaken the ability to mentally connect with others, granting you the following benefits: Increase your Intelligence, Wisdom, or Charisma by 1. You can speak telepathically to any creature you can see within 60 feet. You don\'t need to share a language, but the creature must understand at least one language. You can cast the detect thoughts spell once per long rest.',
    prerequisites: [],
    benefits: [
      { type: 'ability_score', description: 'Increase Intelligence, Wisdom, or Charisma by 1', choices: ['Intelligence', 'Wisdom', 'Charisma'] },
      { type: 'feature', description: 'Telepathic communication with creatures within 60 feet' },
      { type: 'spell', description: 'Cast detect thoughts once per long rest' }
    ],
    source: 'TCE',
    is_half_feat: true,
    ability_score_options: ['Intelligence', 'Wisdom', 'Charisma'],
    is_racial_feat: false,
    tags: ['Magic', 'Social']
  },

  'War Caster': {
    name: 'War Caster',
    description: 'You have practiced casting spells in the midst of combat, learning techniques that grant you the following benefits: You have advantage on Constitution saving throws to maintain your concentration on a spell when you take damage. You can perform the somatic components of spells even when you have weapons or a shield in one or both hands. When a hostile creature\'s movement provokes an opportunity attack from you, you can use your reaction to cast a spell at the creature, rather than making an opportunity attack.',
    prerequisites: [
      { type: 'feature', requirement: 'Spellcasting', description: 'The ability to cast at least one spell' }
    ],
    benefits: [
      { type: 'feature', description: 'Advantage on concentration saves' },
      { type: 'feature', description: 'Perform somatic components with weapons/shield in hands' },
      { type: 'feature', description: 'Cast spell as opportunity attack' }
    ],
    source: 'PHB',
    is_half_feat: false,
    is_racial_feat: false,
    tags: ['Magic', 'Combat']
  }
};

// ASI levels for different classes
export const ASI_LEVELS_BY_CLASS: Record<string, number[]> = {
  'Fighter': [4, 6, 8, 12, 14, 16, 19],
  'Rogue': [4, 8, 10, 12, 16, 19],
  'Wizard': [4, 8, 12, 16, 19],
  'Cleric': [4, 8, 12, 16, 19],
  'Bard': [4, 8, 12, 16, 19],
  'Druid': [4, 8, 12, 16, 19],
  'Monk': [4, 8, 12, 16, 19],
  'Paladin': [4, 8, 12, 16, 19],
  'Ranger': [4, 8, 12, 16, 19],
  'Sorcerer': [4, 8, 12, 16, 19],
  'Warlock': [4, 8, 12, 16, 19],
  'Barbarian': [4, 8, 12, 16, 19]
};

class FeatSelectionService {
  /**
   * Get all available feats
   */
  getAllFeats(): Feat[] {
    return Object.values(DND_FEATS);
  }

  /**
   * Get feat by name
   */
  getFeat(name: string): Feat | null {
    return DND_FEATS[name] || null;
  }

  /**
   * Get feats filtered by tags
   */
  getFeatsByTags(tags: string[]): Feat[] {
    return this.getAllFeats().filter(feat => 
      tags.some(tag => feat.tags.includes(tag))
    );
  }

  /**
   * Get feats available for a specific character
   */
  getAvailableFeats(
    characterLevel: number,
    characterClass: string,
    race: string,
    abilityScores: Record<string, number>,
    existingFeats: string[] = [],
    canCastSpells: boolean = false
  ): Feat[] {
    return this.getAllFeats().filter(feat => {
      // Skip if already have this feat
      if (existingFeats.includes(feat.name)) {
        return false;
      }

      // Check racial requirements
      if (feat.is_racial_feat && feat.racial_requirement && feat.racial_requirement !== race) {
        return false;
      }

      // Check prerequisites
      for (const prereq of feat.prerequisites) {
        if (!this.checkPrerequisite(prereq, characterLevel, characterClass, race, abilityScores, canCastSpells)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Check if a character meets a feat prerequisite
   */
  checkPrerequisite(
    prerequisite: FeatPrerequisite,
    characterLevel: number,
    characterClass: string,
    race: string,
    abilityScores: Record<string, number>,
    canCastSpells: boolean
  ): boolean {
    switch (prerequisite.type) {
      case 'ability_score':
        if (prerequisite.requirement.includes('or')) {
          // Handle "Intelligence or Wisdom" requirements
          const abilities = prerequisite.requirement.split(' or ');
          return abilities.some(ability => abilityScores[ability.trim()] >= (prerequisite.value || 13));
        } else {
          const ability = prerequisite.requirement;
          return abilityScores[ability] >= (prerequisite.value || 13);
        }
      
      case 'level':
        return characterLevel >= (prerequisite.value || 1);
      
      case 'class':
        return characterClass === prerequisite.requirement;
      
      case 'race':
        return race === prerequisite.requirement;
      
      case 'feature':
        if (prerequisite.requirement === 'Spellcasting') {
          return canCastSpells;
        }
        // Add other feature checks as needed
        return true;
      
      default:
        return true;
    }
  }

  /**
   * Get ASI levels for a class
   */
  getASILevels(characterClass: string): number[] {
    return ASI_LEVELS_BY_CLASS[characterClass] || [4, 8, 12, 16, 19];
  }

  /**
   * Check if a character gets ASI/feat choice at this level
   */
  hasASIChoiceAtLevel(characterClass: string, level: number): boolean {
    return this.getASILevels(characterClass).includes(level);
  }

  /**
   * Get the number of ASI improvements available (usually 2, but can vary)
   */
  getASIImprovements(_characterClass: string, _level: number): number {
    // Standard D&D 5e gives 2 points to distribute
    return 2;
  }

  /**
   * Validate ASI distribution
   */
  validateASIDistribution(
    improvements: Record<string, number>,
    maxPoints: number = 2,
    maxPerAbility: number = 1,
    currentScores: Record<string, number> = {}
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    const totalPoints = Object.values(improvements).reduce((sum, val) => sum + val, 0);
    if (totalPoints > maxPoints) {
      errors.push(`Cannot distribute more than ${maxPoints} points`);
    }

    for (const [ability, improvement] of Object.entries(improvements)) {
      if (improvement > maxPerAbility) {
        errors.push(`Cannot improve ${ability} by more than ${maxPerAbility}`);
      }
      
      const newScore = (currentScores[ability] || 10) + improvement;
      if (newScore > 20) {
        errors.push(`${ability} cannot exceed 20`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get feat recommendations based on character build
   */
  getFeatRecommendations(
    characterClass: string,
    abilityScores: Record<string, number>,
    race: string,
    playStyle: 'combat' | 'utility' | 'magic' | 'social' = 'combat'
  ): Feat[] {
    const availableFeats = this.getAvailableFeats(
      4, // Assuming level 4 for recommendations
      characterClass,
      race,
      abilityScores,
      [],
      ['Wizard', 'Sorcerer', 'Cleric', 'Bard', 'Druid', 'Warlock'].includes(characterClass)
    );

    const tagPriority: Record<string, string[]> = {
      'combat': ['Combat', 'Damage', 'Defense'],
      'utility': ['Utility', 'Exploration', 'Healing'],
      'magic': ['Magic', 'Spell'],
      'social': ['Social', 'Utility']
    };

    const preferredTags = tagPriority[playStyle] || ['Combat'];
    
    return availableFeats
      .filter(feat => feat.tags.some(tag => preferredTags.includes(tag)))
      .slice(0, 6); // Return top 6 recommendations
  }

  /**
   * Calculate the impact of taking a feat vs ASI
   */
  analyzeFeatVsASI(
    feat: Feat,
    currentAbilityScores: Record<string, number>,
    characterClass: string
  ): {
    featBenefits: string[];
    asiBenefits: string[];
    recommendation: 'feat' | 'asi' | 'either';
    reasoning: string;
  } {
    const primaryAbilities = this.getPrimaryAbilities(characterClass);
    const hasLowPrimaryScores = primaryAbilities.some(ability => currentAbilityScores[ability] < 16);
    
    const featBenefits = feat.benefits.map(benefit => benefit.description);
    
    const asiBenefits = primaryAbilities.map(ability => {
      const current = currentAbilityScores[ability] || 10;
      const modifier = Math.floor((current - 10) / 2);
      const newModifier = Math.floor((current + 1 - 10) / 2);
      
      if (newModifier > modifier) {
        return `+1 to ${ability} (modifier increases to +${newModifier})`;
      } else {
        return `+1 to ${ability}`;
      }
    });

    let recommendation: 'feat' | 'asi' | 'either' = 'either';
    let reasoning = 'Both options provide valuable benefits.';

    if (hasLowPrimaryScores && !feat.is_half_feat) {
      recommendation = 'asi';
      reasoning = 'ASI recommended to improve primary ability modifiers first.';
    } else if (feat.is_half_feat && hasLowPrimaryScores) {
      recommendation = 'feat';
      reasoning = 'This half-feat provides both ability score improvement and valuable features.';
    } else if (feat.tags.includes('Combat') && ['Fighter', 'Barbarian', 'Paladin', 'Ranger'].includes(characterClass)) {
      recommendation = 'feat';
      reasoning = 'Combat feats provide significant tactical advantages for martial classes.';
    }

    return {
      featBenefits,
      asiBenefits,
      recommendation,
      reasoning
    };
  }

  /**
   * Get primary abilities for a class
   */
  private getPrimaryAbilities(characterClass: string): string[] {
    const primaryAbilities: Record<string, string[]> = {
      'Fighter': ['Strength', 'Dexterity'],
      'Wizard': ['Intelligence'],
      'Cleric': ['Wisdom'],
      'Rogue': ['Dexterity'],
      'Barbarian': ['Strength'],
      'Bard': ['Charisma'],
      'Druid': ['Wisdom'],
      'Monk': ['Dexterity', 'Wisdom'],
      'Paladin': ['Strength', 'Charisma'],
      'Ranger': ['Dexterity', 'Wisdom'],
      'Sorcerer': ['Charisma'],
      'Warlock': ['Charisma']
    };

    return primaryAbilities[characterClass] || ['Strength'];
  }
}

export const featSelectionService = new FeatSelectionService();
export default featSelectionService;