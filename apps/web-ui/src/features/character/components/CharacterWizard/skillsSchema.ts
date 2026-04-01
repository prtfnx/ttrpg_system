import { z } from 'zod';

export const skillsSchema = z.object({
  skills: z.array(z.string()).min(1, 'Select at least one skill'),
});

export type SkillsStepData = z.infer<typeof skillsSchema>;
