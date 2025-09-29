/**
 * Main CharacterWizard Export File
 * Re-exports the CharacterCreationWizard as CharacterWizard for backward compatibility
 */

export { CharacterCreationWizard as CharacterWizard } from './CharacterCreationWizard';

// Re-export other commonly used components
export { CharacterSheet } from './CharacterSheet';
export { CombatTracker } from './CombatTracker';
export { DiceRoller } from './DiceRoller';
export type { WizardFormData } from './WizardFormData';

// Export all wizard steps for advanced usage
export { AbilitiesStep } from './AbilitiesStep';
export { BackgroundStep } from './BackgroundStep';
export { ClassStep } from './ClassStep';
export { default as IdentityStep } from './IdentityStep';
export { RaceStep } from './RaceStep';
export { default as ReviewStep } from './ReviewStep';
export { SkillsStep } from './SkillsStep';
export { SpellSelectionStep } from './SpellSelectionStep';
