/**
 * Main CharacterWizard Export File
 * Provides a wrapper around CharacterCreationWizard that manages modal state
 */

import { useState } from 'react';
import type { UserInfo } from '../../services/auth.service';
import { CharacterCreationWizard } from './CharacterCreationWizard';
import type { WizardFormData } from './WizardFormData';

interface CharacterWizardProps {
  userInfo?: UserInfo;
  onFinish?: (data: WizardFormData) => void;
  onCancel?: () => void;
}

export function CharacterWizard({ 
  userInfo, 
  onFinish = () => {}, 
  onCancel = () => {} 
}: CharacterWizardProps) {
  // For testing purposes, always start with modal open
  // In real usage, this would be managed by a button click or other trigger
  const [isOpen, setIsOpen] = useState(true);

  const handleFinish = (data: WizardFormData) => {
    setIsOpen(false);
    onFinish(data);
  };

  const handleCancel = () => {
    setIsOpen(false);
    onCancel();
  };

  return (
    <CharacterCreationWizard
      isOpen={isOpen}
      onFinish={handleFinish}
      onCancel={handleCancel}
      userInfo={userInfo}
    />
  );
}

// Re-export the core wizard for advanced usage
export { CharacterCreationWizard } from './CharacterCreationWizard';

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

