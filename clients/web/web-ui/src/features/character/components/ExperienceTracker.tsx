import { useState } from 'react';
import styles from './ExperienceTracker.module.css';

interface ExperienceTrackerProps {
  currentLevel: number;
  currentExperience: number;
  onExperienceChange: (newExperience: number) => void;
  onLevelUp: (newLevel: number) => void;
}

// D&D 5e Experience Point Requirements
const EXPERIENCE_THRESHOLDS = [
  0,      // Level 1
  300,    // Level 2
  900,    // Level 3
  2700,   // Level 4
  6500,   // Level 5
  14000,  // Level 6
  23000,  // Level 7
  34000,  // Level 8
  48000,  // Level 9
  64000,  // Level 10
  85000,  // Level 11
  100000, // Level 12
  120000, // Level 13
  140000, // Level 14
  165000, // Level 15
  195000, // Level 16
  225000, // Level 17
  265000, // Level 18
  305000, // Level 19
  355000  // Level 20
];

function calculateLevel(experience: number): number {
  for (let i = EXPERIENCE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (experience >= EXPERIENCE_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

function getNextLevelExperience(currentLevel: number): number {
  return EXPERIENCE_THRESHOLDS[currentLevel] || EXPERIENCE_THRESHOLDS[EXPERIENCE_THRESHOLDS.length - 1];
}

export function ExperienceTracker({ 
  currentLevel, 
  currentExperience, 
  onExperienceChange, 
  onLevelUp 
}: ExperienceTrackerProps) {
  const [experienceToAdd, setExperienceToAdd] = useState('');

  const nextLevelExp = getNextLevelExperience(currentLevel);
  const progressToNext = currentLevel < 20 ? 
    ((currentExperience - EXPERIENCE_THRESHOLDS[currentLevel - 1]) / 
     (nextLevelExp - EXPERIENCE_THRESHOLDS[currentLevel - 1])) * 100 : 100;

  // Check if character can level up (has enough XP for next level)
  const canLevelUp = currentLevel < 20 && currentExperience >= nextLevelExp;
  const targetLevel = canLevelUp ? currentLevel + 1 : currentLevel;

  const handleAddExperience = () => {
    const expToAdd = parseInt(experienceToAdd);
    if (!isNaN(expToAdd) && expToAdd > 0) {
      const newExp = currentExperience + expToAdd;
      const newLevel = calculateLevel(newExp);
      
      onExperienceChange(newExp);
      
      if (newLevel > currentLevel) {
        onLevelUp(newLevel);
      }
      
      setExperienceToAdd('');
    }
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Experience Tracker</h3>
      
      <div>
        <div className={styles.progressHeader}>
          <span className={styles.levelLabel}>Level {currentLevel}</span>
          <span className={styles.xpLabel}>{currentExperience} / {nextLevelExp} XP</span>
        </div>
        
        {/* Progress bar */}
        <div className={styles.progressTrack}>
          <div
            className={`${styles.progressFill} ${currentLevel < 20 ? styles.progressFillActive : styles.progressFillMax}`}
            style={{ width: `${Math.min(progressToNext, 100)}%` }}
          />
        </div>
        
        {currentLevel < 20 && (
          <div className={styles.progressNote}>
            {nextLevelExp - currentExperience} XP needed for level {currentLevel + 1}
          </div>
        )}
        
        {currentLevel >= 20 && (
          <div className={styles.maxLevelNote}>
            Maximum level reached!
          </div>
        )}
      </div>
      
      <div className={styles.inputRow}>
        <div className={styles.inputField}>
          <label htmlFor="add-experience" className={styles.inputLabel}>Add Experience:</label>
          <input
            id="add-experience"
            type="number"
            min="0"
            value={experienceToAdd}
            onChange={(e) => setExperienceToAdd(e.target.value)}
            placeholder="Enter XP to add"
            aria-label="Add Experience"
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
        
        {/* Level Up button when enough XP has been gained */}
        {canLevelUp && (
          <button className={styles.levelUpBtn} onClick={() => onLevelUp(targetLevel)}>
            Level Up
          </button>
        )}
      </div>
    </div>
  );
}