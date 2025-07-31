
import { z } from 'zod';
import { classSchema } from './classSchema';

export const raceSchema = z.object({
  race: z.string().min(1, 'Select a race'),
});

export type RaceStepData = z.infer<typeof raceSchema>;

// Compose multi-step schema
export const characterCreationSchema = raceSchema.merge(classSchema);
export type CharacterFormData = z.infer<typeof characterCreationSchema>;
