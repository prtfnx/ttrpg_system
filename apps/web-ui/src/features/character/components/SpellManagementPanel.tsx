/**
 * Spell Management Panel
 * Re-exports the SpellManager as SpellManagementPanel
 */

export { SpellManager as SpellManagementPanel } from './CharacterWizard/SpellManager';

// Also export the default name for compatibility
export { SpellManager } from './CharacterWizard/SpellManager';

// Export related types
export type { WizardFormData } from './CharacterWizard/WizardFormData';
