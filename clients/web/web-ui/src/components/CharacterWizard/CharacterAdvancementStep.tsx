import React from 'react';
import type { WizardFormData } from './WizardFormData';
import type { AdvancedCharacter } from '../../services/advancementSystem.service';
import { LevelUpWizard } from './LevelUpWizard';
import { XPTracker } from './XPTracker';
import './CharacterAdvancementStep.css';
import './CharacterAdvancementStep.css';

interface CharacterAdvancementStepProps {
  data: WizardFormData;
  onChange: (field: keyof WizardFormData, value: any) => void;
  onComplete?: () => void;
}

export const CharacterAdvancementStep: React.FC<CharacterAdvancementStepProps> = ({
  data,
  onChange,
  onComplete
}) => {
  const [showLevelUpWizard, setShowLevelUpWizard] = React.useState(false);
  const [currentXP, setCurrentXP] = React.useState(data.advancement?.experiencePoints || 0);
  const [targetLevel, setTargetLevel] = React.useState<number | null>(null);

  // Calculate current level from XP
  const calculateLevelFromXP = (xp: number): number => {
    const xpThresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
    
    for (let i = xpThresholds.length - 1; i >= 0; i--) {
      if (xp >= xpThresholds[i]) {
        return i + 1;
      }
    }
    return 1;
  };

  // Calculate XP needed for next level
  const getXPForLevel = (level: number): number => {
    const xpThresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
    return level <= 20 ? xpThresholds[level - 1] : xpThresholds[19];
  };

  const currentLevel = calculateLevelFromXP(currentXP);
  const nextLevel = Math.min(currentLevel + 1, 20);
  const xpForNextLevel = getXPForLevel(nextLevel);
  const xpNeeded = Math.max(0, xpForNextLevel - currentXP);
  const canLevelUp = currentLevel < 20 && currentXP >= xpForNextLevel;

  const handleXPChange = (newXP: number) => {
    setCurrentXP(newXP);
    const newLevel = calculateLevelFromXP(newXP);
    
    // Update advancement data
    const updatedAdvancement = {
      ...data.advancement,
      experiencePoints: newXP,
      currentLevel: newLevel,
      levelHistory: data.advancement?.levelHistory || []
    };
    
    onChange('advancement', updatedAdvancement);
    
    // Check if we can level up to multiple levels
    if (newLevel > currentLevel) {
      const levelsToGain = newLevel - currentLevel;
      if (levelsToGain > 0) {
        setTargetLevel(newLevel);
      }
    }
  };

  const handleLevelUp = () => {
    if (canLevelUp || targetLevel) {
      setShowLevelUpWizard(true);
    }
  };

  const handleLevelUpComplete = (levelUpData: any) => {
    // Update character with level up data
    const updatedData = {
      ...data,
      ...levelUpData,
      advancement: {
        ...data.advancement,
        ...levelUpData.advancement,
        experiencePoints: currentXP,
        currentLevel: targetLevel || calculateLevelFromXP(currentXP)
      }
    };
    
    // Update each field that might have changed
    Object.keys(levelUpData).forEach(key => {
      if (key !== 'advancement') {
        onChange(key as keyof WizardFormData, levelUpData[key]);
      }
    });
    
    onChange('advancement', updatedData.advancement);
    
    setShowLevelUpWizard(false);
    setTargetLevel(null);
    
    if (onComplete) {
      onComplete();
    }
  };

  const handleManualLevelUp = () => {
    // Allow manual level up even without XP requirements
    setTargetLevel(Math.min(currentLevel + 1, 20));
    setShowLevelUpWizard(true);
  };

  if (showLevelUpWizard) {
    return (
      <LevelUpWizard
        character={data as AdvancedCharacter}
        onComplete={handleLevelUpComplete}
        onCancel={() => {
          setShowLevelUpWizard(false);
          setTargetLevel(null);
        }}
      />
    );
  }

  return (
    <div className="character-advancement-step">
      <div className="advancement-header">
        <h2>Character Advancement</h2>
        <p>Manage your character's experience points and level progression.</p>
      </div>

      <div className="advancement-content">
        {/* Current Status */}
        <div className="advancement-section">
          <h3>Current Status</h3>
          <div className="status-grid">
            <div className="status-item">
              <label>Current Level</label>
              <div className="status-value level">{currentLevel}</div>
            </div>
            <div className="status-item">
              <label>Experience Points</label>
              <div className="status-value xp">{currentXP.toLocaleString()} XP</div>
            </div>
            <div className="status-item">
              <label>Next Level</label>
              <div className="status-value next-level">
                {currentLevel < 20 ? `Level ${nextLevel}` : 'Max Level'}
              </div>
            </div>
            <div className="status-item">
              <label>XP Needed</label>
              <div className="status-value xp-needed">
                {currentLevel < 20 ? `${xpNeeded.toLocaleString()} XP` : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* XP Management */}
        <div className="advancement-section">
          <XPTracker
            currentXP={currentXP}
            currentLevel={currentLevel}
            onXPChange={handleXPChange}
          />
        </div>

        {/* Level Up Actions */}
        <div className="advancement-section">
          <h3>Level Up</h3>
          <div className="level-up-controls">
            {canLevelUp || targetLevel ? (
              <div className="level-up-ready">
                <div className="level-up-notice">
                  <h4>🎉 Level Up Available!</h4>
                  <p>
                    You have enough experience to advance to level {targetLevel || nextLevel}!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLevelUp}
                  className="level-up-btn primary"
                >
                  Level Up to {targetLevel || nextLevel}
                </button>
              </div>
            ) : (
              <div className="level-up-waiting">
                <p>
                  {currentLevel < 20
                    ? `You need ${xpNeeded.toLocaleString()} more XP to reach level ${nextLevel}.`
                    : 'Your character has reached the maximum level of 20!'
                  }
                </p>
                {currentLevel < 20 && (
                  <button
                    type="button"
                    onClick={handleManualLevelUp}
                    className="level-up-btn secondary"
                  >
                    Manual Level Up
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Level History */}
        {data.advancement?.levelHistory && data.advancement.levelHistory.length > 0 && (
          <div className="advancement-section">
            <h3>Level History</h3>
            <div className="level-history">
              {data.advancement.levelHistory.map((entry: any, index: number) => (
                <div key={index} className="history-entry">
                  <div className="history-level">Level {entry.level}</div>
                  <div className="history-class">
                    {entry.className}
                    {entry.subclassName && ` (${entry.subclassName})`}
                  </div>
                  <div className="history-details">
                    <span>HP: +{entry.hitPointIncrease}</span>
                    {entry.abilityScoreImprovements && (
                      <span>ASI: {entry.abilityScoreImprovements.map((asi: any) => `${asi.ability} +${asi.increase}`).join(', ')}</span>
                    )}
                    {entry.featGained && <span>Feat: {entry.featGained}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Multiclassing Info */}
        {data.classes && data.classes.length > 1 && (
          <div className="advancement-section">
            <h3>Multiclassing</h3>
            <div className="multiclass-info">
              <p>Your character is multiclassed across the following classes:</p>
              <div className="multiclass-breakdown">
                {data.classes.map((cls: any, index: number) => (
                  <div key={index} className="multiclass-entry">
                    <strong>{cls.name}</strong>
                    <span>Level {cls.level}</span>
                    {cls.subclass && <span>({cls.subclass})</span>}
                  </div>
                ))}
              </div>
              <div className="total-level">
                <strong>Total Character Level: {data.classes.reduce((sum: number, cls: any) => sum + cls.level, 0)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};