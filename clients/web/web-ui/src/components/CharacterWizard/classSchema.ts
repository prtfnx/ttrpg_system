import { z } from 'zod';

export const classSchema = z.object({
  class: z.string().min(1, 'Select a class'),
});

export type ClassStepData = z.infer<typeof classSchema>;
