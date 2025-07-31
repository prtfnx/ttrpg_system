
import { z } from 'zod';
import { classSchema } from './classSchema';

export const backgroundSchema = z.object({
  background: z.string().min(1, 'Select a background'),
});

export type BackgroundStepData = z.infer<typeof backgroundSchema>;

export const raceSchema = z.object({
  race: z.string().min(1, 'Select a race'),
});

export type RaceStepData = z.infer<typeof raceSchema>;

export const abilitiesSchema = z.object({
  strength: z.number().min(1, 'Assign a score'),
  dexterity: z.number().min(1, 'Assign a score'),
  constitution: z.number().min(1, 'Assign a score'),
  intelligence: z.number().min(1, 'Assign a score'),
  wisdom: z.number().min(1, 'Assign a score'),
  charisma: z.number().min(1, 'Assign a score'),
});

export type AbilitiesStepData = z.infer<typeof abilitiesSchema>;

// Compose multi-step schema
export const characterCreationSchema = raceSchema
  .merge(classSchema)
  .merge(backgroundSchema)
  .merge(abilitiesSchema);
export type CharacterFormData = z.infer<typeof characterCreationSchema>;
