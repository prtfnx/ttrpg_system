import { CombatPreviewService } from '@features/combat';
import clsx from 'clsx';
import React, { useMemo, useState } from 'react';
import styles from './CharacterSheet.module.css';
import type { WizardFormData } from './WizardFormData';

interface CharacterSheetProps {
  character: WizardFormData;
  onClose?: () => void;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ character, onClose }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'combat' | 'spells' | 'equipment' | 'notes'>('stats');
  
  const combatStats = useMemo(() => {
    return CombatPreviewService.generateCombatStats(character);
  }, [character]);

  const formatModifier = (score: number): string => {
    const modifier = Math.floor((score - 10) / 2);
    return modifier >= 0 ? `+${modifier}` : `${modifier}`;
  };

  const formatBonus = (bonus: number): string => {
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  };

  return (
    <div className={styles['character-sheet']}>
      <div className={styles['sheet-header']}>
        <div className={styles['character-title']}>
          {character.image && (
            <img src={character.image} alt="" className={styles['character-portrait']} />
          )}
          <div className={styles['character-info']}>
            <h2>{character.name}</h2>
            <div className={styles['character-subtitle']}>
              Level {character.advancement?.currentLevel || 1} {character.race} {character.class}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className={styles['close-sheet']}
            onClick={onClose}
            aria-label="Close character sheet"
          >
            ×
          </button>
        )}
      </div>

      <div className={styles['sheet-tabs']} role="tablist" aria-label="Character sheet sections">
        <button 
          type="button"
          role="tab"
          aria-selected={activeTab === 'stats'}
          className={clsx(styles['tab-button'], activeTab === 'stats' && styles.active)}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
        <button 
          type="button"
          role="tab"
          aria-selected={activeTab === 'combat'}
          className={clsx(styles['tab-button'], activeTab === 'combat' && styles.active)}
          onClick={() => setActiveTab('combat')}
        >
          Combat
        </button>
        <button 
          type="button"
          role="tab"
          aria-selected={activeTab === 'spells'}
          className={clsx(styles['tab-button'], activeTab === 'spells' && styles.active)}
          onClick={() => setActiveTab('spells')}
        >
          Spells
        </button>
        <button 
          type="button"
          role="tab"
          aria-selected={activeTab === 'equipment'}
          className={clsx(styles['tab-button'], activeTab === 'equipment' && styles.active)}
          onClick={() => setActiveTab('equipment')}
        >
          Equipment
        </button>
        <button 
          type="button"
          role="tab"
          aria-selected={activeTab === 'notes'}
          className={clsx(styles['tab-button'], activeTab === 'notes' && styles.active)}
          onClick={() => setActiveTab('notes')}
        >
          Notes
        </button>
      </div>

      <div className={styles['sheet-content']}>
        {activeTab === 'stats' && (
          <div className={styles['stats-tab']}>
            <div className={styles['ability-scores']}>
              <h3>Ability Scores</h3>
              <div className={styles['abilities-grid']}>
                {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map(ability => (
                  <div key={ability} className={styles['ability-card']}>
                    <div className={styles['ability-name']}>{ability.toUpperCase()}</div>
                    <div className={styles['ability-score']}>{character[ability] || 10}</div>
                    <div className={styles['ability-modifier']}>{formatModifier(character[ability] || 10)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles['combat-stats']}>
              <h3>Combat Statistics</h3>
              <div className={styles['combat-stats-grid']}>
                <div className={styles['combat-stat']}>
                  <div className={styles['stat-label']}>Armor Class</div>
                  <div className={styles['stat-value']}>{combatStats.armorClass}</div>
                </div>
                <div className={styles['combat-stat']}>
                  <div className={styles['stat-label']}>Hit Points</div>
                  <div className={styles['stat-value']}>{combatStats.hitPoints.maximum}</div>
                </div>
                <div className={styles['combat-stat']}>
                  <div className={styles['stat-label']}>Proficiency Bonus</div>
                  <div className={styles['stat-value']}>{formatBonus(combatStats.proficiencyBonus)}</div>
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
