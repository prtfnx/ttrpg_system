import React, { useState } from 'react';
import { AttackManager } from './AttackManager';
import { CharacterSheet } from './CharacterSheet';
import { CombatTracker } from './CombatTracker';
import { DiceRoller } from './DiceRoller';
import { SpellManager } from './SpellManager';
import type { WizardFormData } from './WizardFormData';

interface CombatViewProps {
  character: WizardFormData;
  onClose?: () => void;
  onUpdateCharacter?: (character: WizardFormData) => void;
}

type CombatTab = 'character' | 'attacks' | 'spells' | 'tracker' | 'dice';

export const CombatView: React.FC<CombatViewProps> = ({ 
  character, 
  onClose, 
  onUpdateCharacter 
}) => {
  const [activeTab, setActiveTab] = useState<CombatTab>('character');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleCharacterUpdate = (updatedCharacter: WizardFormData) => {
    if (onUpdateCharacter) {
      onUpdateCharacter(updatedCharacter);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'character':
        return (
          <CharacterSheet 
            character={character}
          />
        );
      case 'attacks':
        return (
          <AttackManager 
            character={character}
            onUpdateCharacter={handleCharacterUpdate}
          />
        );
      case 'spells':
        return (
          <SpellManager 
            character={character}
            onUpdateCharacter={handleCharacterUpdate}
          />
        );
      case 'tracker':
        return (
          <CombatTracker 
            characters={[character]}
          />
        );
      case 'dice':
        return <DiceRoller />;
      default:
        return null;
    }
  };

  const getTabLabel = (tab: CombatTab): string => {
    switch (tab) {
      case 'character':
        return 'Character';
      case 'attacks':
        return 'Attacks';
      case 'spells':
        return character.class && isSpellcaster(character.class) ? 'Spells' : 'Spells';
      case 'tracker':
        return 'Combat';
      case 'dice':
        return 'Dice';
      default:
        return '';
    }
  };

  // Check if character is a spellcaster
  const isSpellcaster = (className: string): boolean => {
    const spellcastingClasses = [
      'Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'
    ];
    return spellcastingClasses.includes(className);
  };

  const shouldShowSpells = character.class && isSpellcaster(character.class);

  return (
    <div className={`combat-view ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Header */}
      <div className="combat-header">
        <div className="combat-title">
          <h2>Combat Manager</h2>
          <div className="character-summary">
            <span className="character-name">{character.name}</span>
            <span className="character-details">
              {character.race} {character.class} - Level {character.advancement?.currentLevel || 1}
            </span>
          </div>
        </div>
        
        <div className="combat-actions">
          <button 
            className="fullscreen-toggle"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? '⊡' : '⊞'}
          </button>
          {onClose && (
            <button className="close-combat" onClick={onClose}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="combat-tabs">
        <button 
          className={`combat-tab ${activeTab === 'character' ? 'active' : ''}`}
          onClick={() => setActiveTab('character')}
        >
          <span className="tab-icon">👤</span>
          <span className="tab-label">{getTabLabel('character')}</span>
        </button>
        
        <button 
          className={`combat-tab ${activeTab === 'attacks' ? 'active' : ''}`}
          onClick={() => setActiveTab('attacks')}
        >
          <span className="tab-icon">⚔️</span>
          <span className="tab-label">{getTabLabel('attacks')}</span>
        </button>
        
        {shouldShowSpells && (
          <button 
            className={`combat-tab ${activeTab === 'spells' ? 'active' : ''}`}
            onClick={() => setActiveTab('spells')}
          >
            <span className="tab-icon">✨</span>
            <span className="tab-label">{getTabLabel('spells')}</span>
          </button>
        )}
        
        <button 
          className={`combat-tab ${activeTab === 'tracker' ? 'active' : ''}`}
          onClick={() => setActiveTab('tracker')}
        >
          <span className="tab-icon">🎯</span>
          <span className="tab-label">{getTabLabel('tracker')}</span>
        </button>
        
        <button 
          className={`combat-tab ${activeTab === 'dice' ? 'active' : ''}`}
          onClick={() => setActiveTab('dice')}
        >
          <span className="tab-icon">🎲</span>
          <span className="tab-label">{getTabLabel('dice')}</span>
        </button>
      </div>

      {/* Content */}
      <div className="combat-content">
        {renderTabContent()}
      </div>
    </div>
  );
};