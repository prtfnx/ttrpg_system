export type WizardFormData = {
  race: string;
  class: string;
  background: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  skills: string[];
  spells?: {
    cantrips: string[];
    knownSpells: string[];
    preparedSpells: string[];
  };
  name: string;
  bio?: string;
  image?: string;
  // Equipment and inventory
  equipment?: {
    items: Array<{
      equipment: {
        name: string;
        weight: number;
        cost: {
          amount: number;
          unit: string;
        };
      };
      quantity: number;
      equipped?: boolean;
    }>;
    currency: {
      cp: number;
      sp: number;
      ep: number;
      gp: number;
      pp: number;
    };
    carrying_capacity: {
      current_weight: number;
      max_weight: number;
      encumbered_at: number;
      heavily_encumbered_at: number;
    };
  };
  // Character advancement tracking
  advancement?: {
    experiencePoints: number;
    currentLevel: number;
    levelHistory: Array<{
      level: number;
      className: string;
      subclassName?: string;
      hitPointIncrease: number;
      abilityScoreImprovements?: Array<{
        ability: string;
        increase: number;
      }>;
      featGained?: string;
      featuresGained: string[];
      spellsLearned?: string[];
    }>;
  };
  // Multiclassing support
  classes?: Array<{
    name: string;
    level: number;
    subclass?: string;
  }>;
};

// Enhanced validation schema with Zod
import { z } from 'zod';

export const enhancedWizardSchema = z.object({
  name: z.string().min(1, 'Character name is required').max(50, 'Name must be 50 characters or less'),
  race: z.string().min(1, 'Race selection is required'),
  class: z.string().min(1, 'Class selection is required'),
  background: z.string().min(1, 'Background selection is required'),
  
  // Ability scores (standard array or point buy range)
  strength: z.number().min(3).max(20),
  dexterity: z.number().min(3).max(20),
  constitution: z.number().min(3).max(20),
  intelligence: z.number().min(3).max(20),
  wisdom: z.number().min(3).max(20),
  charisma: z.number().min(3).max(20),
  
  skills: z.array(z.string()).min(1, 'At least one skill must be selected'),
  
  spells: z.object({
    cantrips: z.array(z.string()).default([]),
    knownSpells: z.array(z.string()).default([]),
    preparedSpells: z.array(z.string()).default([])
  }).optional(),
  
  bio: z.string().max(1000, 'Bio must be 1000 characters or less').optional(),
  image: z.string().url('Invalid image URL').optional().or(z.literal('')),
  
  equipment: z.object({
    items: z.array(z.object({
      equipment: z.object({
        name: z.string(),
        weight: z.number(),
        cost: z.object({
          amount: z.number(),
          unit: z.string()
        })
      }),
      quantity: z.number().min(1),
      equipped: z.boolean().optional()
    })).default([]),
    currency: z.object({
      cp: z.number().min(0),
      sp: z.number().min(0),
      ep: z.number().min(0),
      gp: z.number().min(0),
      pp: z.number().min(0)
    }),
    carrying_capacity: z.object({
      current_weight: z.number().min(0),
      max_weight: z.number().min(0),
      encumbered_at: z.number().min(0),
      heavily_encumbered_at: z.number().min(0)
    })
  }).optional(),
  
  advancement: z.object({
    experiencePoints: z.number().min(0).max(355000), // Maximum XP for level 20
    currentLevel: z.number().min(1).max(20),
    levelHistory: z.array(z.object({
      level: z.number().min(1).max(20),
      className: z.string(),
      subclassName: z.string().optional(),
      hitPointIncrease: z.number().min(1),
      abilityScoreImprovements: z.array(z.object({
        ability: z.string(),
        increase: z.number()
      })).optional(),
      featGained: z.string().optional(),
      featuresGained: z.array(z.string()),
      spellsLearned: z.array(z.string()).optional()
    })).default([])
  }).optional(),
  
  classes: z.array(z.object({
    name: z.string(),
    level: z.number().min(1).max(20),
    subclass: z.string().optional()
  })).optional()
});
