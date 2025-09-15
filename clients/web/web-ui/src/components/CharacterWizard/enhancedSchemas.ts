import { z } from 'zod';

// Core D&D 5e ability scores
export const abilityScoreSchema = z.number().int().min(3).max(20);

export const extendedAbilitiesSchema = z.object({
  strength: abilityScoreSchema,
  dexterity: abilityScoreSchema,
  constitution: abilityScoreSchema,
  intelligence: abilityScoreSchema,
  wisdom: abilityScoreSchema,
  charisma: abilityScoreSchema,
});

// Extended race schema with subraces
export const extendedRaceSchema = z.object({
  race: z.string().min(1, 'Select a race'),
  subrace: z.string().optional(),
});

// Class schema with subclass support
export const extendedClassSchema = z.object({
  class: z.string().min(1, 'Select a class'),
  subclass: z.string().optional(),
});

// Enhanced background schema
export const extendedBackgroundSchema = z.object({
  background: z.string().min(1, 'Select a background'),
});

// Skills with proper D&D 5e skill list
export const DND5E_SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival'
] as const;

export const extendedSkillsSchema = z.object({
  skills: z.array(z.enum(DND5E_SKILLS)),
  expertise: z.array(z.enum(DND5E_SKILLS)).optional(), // For rogues/bards
});

// Character identity
export const identitySchema = z.object({
  name: z.string().min(1, 'Enter character name'),
  bio: z.string().optional(),
  image: z.string().optional(),
  alignment: z.enum([
    'Lawful Good', 'Neutral Good', 'Chaotic Good',
    'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 
    'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'
  ]).optional(),
  deity: z.string().optional(),
});

// Hit points and health
export const healthSchema = z.object({
  hitPoints: z.number().int().positive(),
  hitDie: z.enum(['d6', 'd8', 'd10', 'd12']),
  tempHP: z.number().int().nonnegative().optional().default(0),
});

// Proficiencies
export const proficienciesSchema = z.object({
  armorProficiencies: z.array(z.string()).optional(),
  weaponProficiencies: z.array(z.string()).optional(), 
  toolProficiencies: z.array(z.string()).optional(),
  languageProficiencies: z.array(z.string()).optional(),
});

// Spells (for casters)
export const spellsSchema = z.object({
  cantripsKnown: z.array(z.string()).optional(),
  spellsKnown: z.array(z.string()).optional(),
  spellsPrepared: z.array(z.string()).optional(),
  spellSlots: z.object({
    1: z.number().int().nonnegative().optional(),
    2: z.number().int().nonnegative().optional(),
    3: z.number().int().nonnegative().optional(),
    4: z.number().int().nonnegative().optional(),
    5: z.number().int().nonnegative().optional(),
    6: z.number().int().nonnegative().optional(),
    7: z.number().int().nonnegative().optional(),
    8: z.number().int().nonnegative().optional(),
    9: z.number().int().nonnegative().optional(),
  }).optional(),
  spellcastingAbility: z.enum(['intelligence', 'wisdom', 'charisma']).optional(),
});

// Equipment
export const equipmentSchema = z.object({
  weapons: z.array(z.string()).optional(),
  armor: z.array(z.string()).optional(),
  shield: z.string().optional(),
  equipment: z.array(z.string()).optional(),
  gold: z.number().int().nonnegative().optional().default(0),
});

// Complete enhanced character schema
export const enhancedCharacterSchema = extendedRaceSchema
  .merge(extendedClassSchema)
  .merge(extendedBackgroundSchema)
  .merge(extendedAbilitiesSchema)
  .merge(extendedSkillsSchema)
  .merge(identitySchema)
  .merge(healthSchema)
  .merge(proficienciesSchema)
  .merge(spellsSchema)
  .merge(equipmentSchema)
  .extend({
    level: z.number().int().min(1).max(20).default(1),
    proficiencyBonus: z.number().int().positive().default(2),
    armorClass: z.number().int().positive().optional(),
    initiative: z.number().int().optional(),
    speed: z.number().int().positive().default(30),
  });

export type EnhancedCharacterData = z.infer<typeof enhancedCharacterSchema>;

// Helper function to calculate ability modifiers
export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Helper to calculate proficiency bonus by level
export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// Helper to calculate AC (basic calculation)
export function calculateArmorClass(dexModifier: number, armorType?: string, shield?: boolean): number {
  // Basic calculation - would need full armor data for complete implementation
  let baseAC = 10 + dexModifier; // Unarmored
  
  if (armorType === 'Leather Armor') baseAC = 11 + dexModifier;
  else if (armorType === 'Studded Leather') baseAC = 12 + dexModifier;
  else if (armorType === 'Chain Shirt') baseAC = 13 + Math.min(dexModifier, 2);
  else if (armorType === 'Chain Mail') baseAC = 16;
  else if (armorType === 'Plate Armor') baseAC = 18;
  
  return baseAC + (shield ? 2 : 0);
}