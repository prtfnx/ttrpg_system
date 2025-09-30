/**
 * Main CharacterWizard Export File
 * Provides a wrapper around CharacterCreationWizard that manages modal state
 * and supports different modes for character creation, level-up, and spell management
 */

import { useState } from 'react';
import type { UserInfo } from '../../services/auth.service';
import { CharacterSummary } from '../CharacterSummary';
import { ExperienceTracker } from '../ExperienceTracker';
import { MulticlassManager } from '../MulticlassManager';
import { SpellPreparationManager } from '../SpellPreparationManager';
import { CharacterCreationWizard } from './CharacterCreationWizard';
import type { WizardFormData } from './WizardFormData';

interface Character {
  name: string;
  race: string;
  class: string;
  level: number;
  hitPoints?: number;
  maxHitPoints?: number;
  experience: number;
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  spellcastingAbility?: string;
  spellSlots?: Record<number, number>;
  knownSpells?: string[];
  domainSpells?: string[];
}

interface CharacterWizardProps {
  userInfo?: UserInfo;
  character?: Character;
  mode?: 'create' | 'level-up' | 'manage-spells';
  onFinish?: (data: WizardFormData | Character) => void;
  onCancel?: () => void;
}

export function CharacterWizard({ 
  userInfo, 
  character,
  mode = 'create',
  onFinish = () => {}, 
  onCancel = () => {} 
}: CharacterWizardProps) {
  // For testing purposes, always start with modal open
  // In real usage, this would be managed by a button click or other trigger
  const [isOpen, setIsOpen] = useState(true);
  const [currentCharacter, setCurrentCharacter] = useState<Character | null>(character || null);
  const [preparedSpells, setPreparedSpells] = useState<string[]>([]);

  const handleFinish = (data: WizardFormData | Character) => {
    setIsOpen(false);
    onFinish(data);
  };

  const handleCancel = () => {
    setIsOpen(false);
    onCancel();
  };

  // Character creation mode
  if (mode === 'create') {
    return (
      <CharacterCreationWizard
        isOpen={isOpen}
        onFinish={handleFinish}
        onCancel={handleCancel}
        userInfo={userInfo}
      />
    );
  }

  // Level-up mode
  if (mode === 'level-up' && currentCharacter) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        background: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{ 
          background: 'white', 
          padding: 24, 
          borderRadius: 8, 
          maxWidth: '800px', 
          maxHeight: '90vh', 
          overflow: 'auto' 
        }}>
          <h2>Character Management - {currentCharacter.name}</h2>
          
          {/* Character Class and Level Display */}
          <div style={{ marginBottom: 16 }}>
            <div data-testid="character-class">{currentCharacter.class}</div>
            <div data-testid="character-level">{currentCharacter.level}</div>
          </div>
          
          {/* Character Summary */}
          <CharacterSummary 
            character={{
              name: currentCharacter.name,
              level: currentCharacter.level,
              class: currentCharacter.class,
              race: currentCharacter.race,
              background: 'Unknown',
              abilityScores: {
                strength: currentCharacter.strength || 10,
                dexterity: currentCharacter.dexterity || 10,
                constitution: currentCharacter.constitution || 10,
                intelligence: currentCharacter.intelligence || 10,
                wisdom: currentCharacter.wisdom || 10,
                charisma: currentCharacter.charisma || 10
              },
              hitDice: 'd10',
              maxHitPoints: currentCharacter.maxHitPoints || 10,
              currentHitPoints: currentCharacter.hitPoints || 10,
              armorClass: 10,
              proficiencyBonus: 2,
              experience: currentCharacter.experience
            }}
          />

          {/* Experience Tracker */}
          <div style={{ marginTop: 16 }}>
            <ExperienceTracker
              currentExperience={currentCharacter.experience}
              currentLevel={currentCharacter.level}
              onExperienceChange={(newExp) => {
                const updated = { ...currentCharacter, experience: newExp };
                setCurrentCharacter(updated);
              }}
              onLevelUp={(newLevel) => {
                const updated = { ...currentCharacter, level: newLevel };
                setCurrentCharacter(updated);
              }}
            />
          </div>

          {/* Level 2+ Features */}
          {currentCharacter.level >= 2 && (
            <div style={{ marginTop: 16, padding: 16, background: '#f0f9ff', borderRadius: 8 }}>
              <h3>Level {currentCharacter.level} {currentCharacter.class} Features</h3>
              {currentCharacter.level >= 2 && currentCharacter.class === 'fighter' && (
                <div>
                  <h4>Action Surge</h4>
                  <p>You can take one additional action on your turn. This feature recharges after a short or long rest.</p>
                </div>
              )}
              {currentCharacter.level >= 3 && currentCharacter.class === 'fighter' && (
                <div>
                  <h4>Choose Martial Archetype</h4>
                  <label htmlFor="martial-archetype">Martial Archetype:</label>
                  <select id="martial-archetype" style={{ marginLeft: 8 }}>
                    <option value="">Select...</option>
                    <option value="champion">Champion</option>
                    <option value="battle-master">Battle Master</option>
                    <option value="eldritch-knight">Eldritch Knight</option>
                  </select>
                  <div style={{ marginTop: 8 }}>
                    <h5>Improved Critical</h5>
                    <p>Critical hit on 19-20</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HP Roll */}
          <div style={{ marginTop: 16, padding: 16, background: '#fef2f2', borderRadius: 8 }}>
            <h4>Hit Points</h4>
            <div data-testid="max-hit-points">{currentCharacter.maxHitPoints || 10}</div>
            <button 
              onClick={() => {
                const roll = Math.floor(Math.random() * 10) + 1; // d10
                const conMod = Math.floor(((currentCharacter.constitution || 10) - 10) / 2);
                const hpIncrease = Math.max(1, roll + conMod);
                const newMaxHP = (currentCharacter.maxHitPoints || 10) + hpIncrease;
                setCurrentCharacter(prev => prev ? { ...prev, maxHitPoints: newMaxHP } : null);
              }}
            >
              Roll for HP
            </button>
          </div>

          {/* Multiclass Manager */}
          <div style={{ marginTop: 16 }}>
            <MulticlassManager
              currentClasses={[currentCharacter.class]}
              currentLevel={currentCharacter.level}
              abilityScores={{
                strength: currentCharacter.strength || 10,
                dexterity: currentCharacter.dexterity || 10,
                constitution: currentCharacter.constitution || 10,
                intelligence: currentCharacter.intelligence || 10,
                wisdom: currentCharacter.wisdom || 10,
                charisma: currentCharacter.charisma || 10
              }}
              onMulticlass={(newClass: string) => {
                console.log('Multiclassing into:', newClass);
              }}
            />
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => handleFinish(currentCharacter)}>
              Save Changes
            </button>
            <button onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Spell management mode
  if (mode === 'manage-spells' && currentCharacter) {
    const canPrepare = (currentCharacter.wisdom ? Math.floor((currentCharacter.wisdom - 10) / 2) : 0) + currentCharacter.level;
    
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        background: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{ 
          background: 'white', 
          padding: 24, 
          borderRadius: 8, 
          maxWidth: '800px', 
          maxHeight: '90vh', 
          overflow: 'auto' 
        }}>
          <h2>Spell Management - {currentCharacter.name}</h2>
          
          <div style={{ marginBottom: 16 }}>
            <h3>Prepare Spells</h3>
            <p>You can prepare {canPrepare} spells</p>
          </div>

          {/* Spell Preparation */}
          <SpellPreparationManager
            characterClass={currentCharacter.class}
            characterLevel={currentCharacter.level}
            abilityScores={{
              strength: currentCharacter.strength || 10,
              dexterity: currentCharacter.dexterity || 10,
              constitution: currentCharacter.constitution || 10,
              intelligence: currentCharacter.intelligence || 10,
              wisdom: currentCharacter.wisdom || 10,
              charisma: currentCharacter.charisma || 10
            }}
            knownSpells={[]}
            preparedSpells={preparedSpells}
            onPrepareSpell={(spellId) => {
              setPreparedSpells(prev => [...prev, spellId]);
            }}
            onUnprepareSpell={(spellId) => {
              setPreparedSpells(prev => prev.filter(id => id !== spellId));
            }}
          />

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => handleFinish(currentCharacter)}>
              Save Spell Selection
            </button>
            <button onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
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

