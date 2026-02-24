import { Shield } from 'lucide-react';
import React, { useState } from 'react';
import { CombatView } from './CombatView';
import type { WizardFormData } from './WizardFormData';

interface CombatLauncherProps {
  character: WizardFormData;
  onUpdateCharacter?: (character: WizardFormData) => void;
  buttonText?: string;
  buttonStyle?: 'primary' | 'secondary' | 'combat';
  size?: 'small' | 'medium' | 'large';
}

export const CombatLauncher: React.FC<CombatLauncherProps> = ({ 
  character,
  onUpdateCharacter,
  buttonText = 'Combat Manager',
  buttonStyle = 'combat',
  size = 'medium'
}) => {
  const [showCombat, setShowCombat] = useState(false);

  const handleCharacterUpdate = (updatedCharacter: WizardFormData) => {
    if (onUpdateCharacter) {
      onUpdateCharacter(updatedCharacter);
    }
  };

  const buttonClassName = `combat-launcher-btn ${buttonStyle} ${size}`;

  return (
    <>
      <button 
        className={buttonClassName}
        onClick={() => setShowCombat(true)}
        title={`Open Combat Manager for ${character.name}`}
      >
        <Shield size={16} className="btn-icon" aria-hidden />
        <span className="btn-text">{buttonText}</span>
      </button>

      {showCombat && (
        <div className="combat-overlay">
          <CombatView 
            character={character}
            onClose={() => setShowCombat(false)}
            onUpdateCharacter={handleCharacterUpdate}
          />
        </div>
      )}
    </>
  );
};