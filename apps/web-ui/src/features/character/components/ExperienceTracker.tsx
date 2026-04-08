import { useState } from 'react';
import styles from './ExperienceTracker.module.css';
import type { AdvancementConfig } from '../../compendium/services/compendiumService';

interface ExperienceTrackerProps {
  currentLevel: number;
  currentExperience: number;
  onExperienceChange: (newExperience: number) => void;
  onLevelUp: (newLevel: number) => void;
  advancementConfig?: AdvancementConfig;
  isDM?: boolean;
  characterId?: string;
  onAwardXP?: (amount: number, source: string, description: string) => void;
}

// D&D 5e Experience Point Requirements (fallback)
const EXPERIENCE_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];

const XP_SOURCES = ['quest', 'discovery', 'roleplay', 'combat', 'other'];

export function ExperienceTracker({
  currentLevel,
  currentExperience,
  onExperienceChange,
  onLevelUp,
  advancementConfig,
  isDM = false,
  onAwardXP,
}: ExperienceTrackerProps) {
  const [experienceToAdd, setExperienceToAdd] = useState('');
  const [showAwardDialog, setShowAwardDialog] = useState(false);
  const [awardAmount, setAwardAmount] = useState('');
  const [awardSource, setAwardSource] = useState('quest');
  const [awardDesc, setAwardDesc] = useState('');

  const xpTable = advancementConfig?.xp_table ?? EXPERIENCE_THRESHOLDS;

  const calculateLevel = (exp: number) => {
    for (let i = xpTable.length - 1; i >= 0; i--) {
      if (exp >= xpTable[i]) return i + 1;
    }
    return 1;
  };

  const nextLevelExp = xpTable[currentLevel] ?? xpTable[xpTable.length - 1];
  const prevLevelExp = xpTable[currentLevel - 1] ?? 0;
  const progressToNext = currentLevel < 20
    ? ((currentExperience - prevLevelExp) / (nextLevelExp - prevLevelExp)) * 100
    : 100;
  const canLevelUp = currentLevel < 20 && currentExperience >= nextLevelExp;

  const handleAddExperience = () => {
    const expToAdd = parseInt(experienceToAdd);
    if (!isNaN(expToAdd) && expToAdd > 0) {
      const newExp = currentExperience + expToAdd;
      onExperienceChange(newExp);
      const newLevel = calculateLevel(newExp);
      if (newLevel > currentLevel) onLevelUp(newLevel);
      setExperienceToAdd('');
    }
  };

  const handleAwardXP = () => {
    const amount = parseInt(awardAmount);
    if (!isNaN(amount) && amount > 0) {
      if (onAwardXP) {
        onAwardXP(amount, awardSource, awardDesc);
      } else {
        const newExp = currentExperience + amount;
        onExperienceChange(newExp);
        const newLevel = calculateLevel(newExp);
        if (newLevel > currentLevel) onLevelUp(newLevel);
      }
      setAwardAmount('');
      setAwardDesc('');
      setShowAwardDialog(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Experience Tracker</h3>
        {isDM && (
          <button className={styles.addBtn} onClick={() => setShowAwardDialog(v => !v)}>
            {showAwardDialog ? 'Cancel Award' : 'Award XP'}
          </button>
        )}
      </div>

      <div>
        <div className={styles.progressHeader}>
          <span className={styles.levelLabel}>Level {currentLevel}</span>
          <span className={styles.xpLabel}>{currentExperience.toLocaleString()} / {nextLevelExp.toLocaleString()} XP</span>
        </div>
        <div className={styles.progressTrack}>
          <div
            className={`${styles.progressFill} ${currentLevel < 20 ? styles.progressFillActive : styles.progressFillMax}`}
            style={{ width: `${Math.min(progressToNext, 100)}%` }}
          />
        </div>
        {currentLevel < 20 ? (
          <div className={styles.progressNote}>
            {(nextLevelExp - currentExperience).toLocaleString()} XP needed for level {currentLevel + 1}
          </div>
        ) : (
          <div className={styles.maxLevelNote}>Maximum level reached!</div>
        )}
      </div>

      {isDM && showAwardDialog && (
        <div className={styles.awardForm}>
          <strong>Award XP</strong>
          <div className={styles.awardFormRow}>
            <input
              type="number" min="1" value={awardAmount}
              onChange={e => setAwardAmount(e.target.value)}
              placeholder="XP amount" className={styles.input}
            />
            <select value={awardSource} onChange={e => setAwardSource(e.target.value)} className={styles.input}>
              {XP_SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <input
            type="text" value={awardDesc}
            onChange={e => setAwardDesc(e.target.value)}
            placeholder="Description (optional)" className={styles.input}
          />
          <button className={styles.addBtn} onClick={handleAwardXP} disabled={!awardAmount || isNaN(parseInt(awardAmount))}>
            Confirm Award
          </button>
        </div>
      )}

      {!isDM && (
        <div className={styles.inputRow}>
          <div className={styles.inputField}>
            <label htmlFor="add-experience" className={styles.inputLabel}>Add Experience:</label>
            <input
              id="add-experience" type="number" min="0"
              value={experienceToAdd}
              onChange={e => setExperienceToAdd(e.target.value)}
              placeholder="Enter XP to add"
              className={styles.input}
            />
          </div>
          <button
            className={styles.addBtn}
            onClick={handleAddExperience}
            disabled={!experienceToAdd || isNaN(parseInt(experienceToAdd))}
          >
            Add Experience
          </button>
          {canLevelUp && (
            <button className={styles.levelUpBtn} onClick={() => onLevelUp(currentLevel + 1)}>
              Level Up
            </button>
          )}
        </div>
      )}

      {isDM && !showAwardDialog && canLevelUp && (
        <button className={styles.levelUpBtnMt} onClick={() => onLevelUp(currentLevel + 1)}>
          Level Up
        </button>
      )}
    </div>
  );
}