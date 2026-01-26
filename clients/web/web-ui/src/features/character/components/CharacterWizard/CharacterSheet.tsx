import React, { useMemo, useState } from 'react';
import { CombatSystemService } from '../../services/combatSystem.service';
import type { WizardFormData } from './WizardFormData';

interface CharacterSheetProps {
  character: WizardFormData;
  onClose?: () => void;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ character, onClose }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'combat' | 'spells' | 'equipment' | 'notes'>('stats');
  
  // For now, create mock combat stats to avoid service dependency issues during build
  const combatStats = useMemo(() => {
    try {
      return CombatSystemService.generateCombatStats(character);
    } catch (error) {
      // Fallback if service isn't available during build
      return {
        armorClass: 10,
        hitPoints: { current: 8, maximum: 8, temporary: 0 },
        proficiencyBonus: 2,
        savingThrows: {
          strength: 0,
          dexterity: 0,
          constitution: 0,
          intelligence: 0,
          wisdom: 0,
          charisma: 0
        },
        spellSlots: {}
      };
    }
  }, [character]);

  const formatModifier = (score: number): string => {
    const modifier = Math.floor((score - 10) / 2);
    return modifier >= 0 ? `+${modifier}` : `${modifier}`;
  };

  const formatBonus = (bonus: number): string => {
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  };

  return (
    <div className="character-sheet">
      <div className="sheet-header">
        <div className="character-title">
          {character.image && (
            <img src={character.image || "/default-avatar.png"} alt={character.name} className="character-portrait" />
          )}
          <div className="character-info">
            <h2>{character.name}</h2>
            <div className="character-subtitle">
              Level {character.advancement?.currentLevel || 1} {character.race} {character.class}
            </div>
          </div>
        </div>
        {onClose && (
          <button className="close-sheet" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      <div className="sheet-tabs">
        <button 
          className={`tab-button ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
        <button 
          className={`tab-button ${activeTab === 'combat' ? 'active' : ''}`}
          onClick={() => setActiveTab('combat')}
        >
          Combat
        </button>
        <button 
          className={`tab-button ${activeTab === 'spells' ? 'active' : ''}`}
          onClick={() => setActiveTab('spells')}
        >
          Spells
        </button>
        <button 
          className={`tab-button ${activeTab === 'equipment' ? 'active' : ''}`}
          onClick={() => setActiveTab('equipment')}
        >
          Equipment
        </button>
        <button 
          className={`tab-button ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes
        </button>
      </div>

      <div className="sheet-content">
        {activeTab === 'stats' && (
          <div className="stats-tab">
            <div className="ability-scores">
              <h3>Ability Scores</h3>
              <div className="abilities-grid">
                {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map(ability => (
                  <div key={ability} className="ability-card">
                    <div className="ability-name">{ability.toUpperCase()}</div>
                    <div className="ability-score">{character[ability] || 10}</div>
                    <div className="ability-modifier">{formatModifier(character[ability] || 10)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="combat-stats">
              <h3>Combat Statistics</h3>
              <div className="combat-stats-grid">
                <div className="stat-item">
                  <div className="stat-label">Armor Class</div>
                  <div className="stat-value">{combatStats.armorClass}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Hit Points</div>
                  <div className="stat-value">{combatStats.hitPoints.maximum}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Proficiency Bonus</div>
                  <div className="stat-value">{formatBonus(combatStats.proficiencyBonus)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab !== 'stats' && (
          <div>Other tab content will be implemented here.</div>
        )}
      </div>
    </div>
  );
};