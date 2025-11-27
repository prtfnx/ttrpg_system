import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import styles from './XPTracker.module.css';

interface XPTrackerProps {
  currentXP: number;
  currentLevel: number;
  onXPChange: (newXP: number) => void;
  className?: string;
  compact?: boolean;
}

export const XPTracker: React.FC<XPTrackerProps> = ({
  currentXP,
  currentLevel,
  onXPChange,
  className = '',
  compact = false
}) => {
  const [xpInput, setXpInput] = useState(currentXP.toString());
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useEffect(() => {
    setXpInput(currentXP.toString());
  }, [currentXP]);

  const getXPForLevel = (level: number): number => {
    const xpThresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
    return xpThresholds[level - 1] || 0;
  };

  const getXPProgress = () => {
    if (currentLevel >= 20) return { current: 0, needed: 0, total: 0, percentage: 100 };
    
    const currentLevelXP = getXPForLevel(currentLevel);
    const nextLevelXP = getXPForLevel(currentLevel + 1);
    const progressXP = currentXP - currentLevelXP;
    const neededXP = nextLevelXP - currentLevelXP;
    const percentage = Math.min(100, (progressXP / neededXP) * 100);
    
    return {
      current: progressXP,
      needed: neededXP,
      total: nextLevelXP - currentXP,
      percentage
    };
  };

  const handleXPInputChange = (value: string) => {
    setXpInput(value);
    const numericValue = parseInt(value) || 0;
    if (numericValue !== currentXP) {
      onXPChange(Math.max(0, Math.min(355000, numericValue)));
    }
  };

  const handleQuickAdd = (amount: number) => {
    const newXP = Math.min(355000, currentXP + amount);
    onXPChange(newXP);
    setShowQuickAdd(false);
  };

  const progress = getXPProgress();
  const canLevelUp = currentLevel < 20 && currentXP >= getXPForLevel(currentLevel + 1);

  if (compact) {
    return (
      <div className={clsx(styles.xpTracker, styles.compact, className)}>
        <div className={styles.xpDisplay}>
          <div className={styles.currentXp}>{currentXP.toLocaleString()} XP</div>
          <div className={styles.levelDisplay}>Level {currentLevel}</div>
        </div>
        {currentLevel < 20 && (
          <div className={styles.xpProgressCompact}>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <div className={styles.progressText}>
              {progress.total > 0 ? `${progress.total.toLocaleString()} XP to level ${currentLevel + 1}` : 'Ready to level up!'}
            </div>
          </div>
        )}
        {canLevelUp && (
          <div className={styles.levelUpIndicator}>
            🎉 Level Up Available!
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={clsx(styles.xpTracker, className)}>
      <div className={styles.xpHeader}>
        <h3>Experience Points</h3>
        {canLevelUp && (
          <div className={styles.levelUpBadge}>
            Level Up Available!
          </div>
        )}
      </div>

      <div className={styles.xpInputSection}>
        <label htmlFor="xp-input">Current XP</label>
        <div className={styles.xpInputContainer}>
          <input
            id="xp-input"
            type="number"
            min="0"
            max="355000"
            value={xpInput}
            onChange={(e) => handleXPInputChange(e.target.value)}
            onBlur={() => setXpInput(currentXP.toString())}
            className={styles.xpInput}
          />
          <button
            type="button"
            onClick={() => setShowQuickAdd(!showQuickAdd)}
            className={styles.quickAddToggle}
            title="Quick Add XP"
          >
            +
          </button>
        </div>

        {showQuickAdd && (
          <div className={styles.quickAddPanel}>
            <div className={styles.quickAddHeader}>Quick Add XP</div>
            <div className={styles.quickAddButtons}>
              {[50, 100, 250, 500, 1000, 2500].map(amount => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => handleQuickAdd(amount)}
                  className={clsx(styles.quickAddBtn, {[styles.small]: amount <= 250, [styles.medium]: amount > 250 && amount <= 1000, [styles.large]: amount > 1000})}
                >
                  +{amount}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={styles.levelInfo}>
        <div className={styles.currentLevel}>
          <div className={styles.levelNumber}>{currentLevel}</div>
          <div className="level-label">Current Level</div>
        </div>
        
        {currentLevel < 20 && (
          <>
            <div className="level-arrow">→</div>
            <div className="next-level">
              <div className={styles.levelNumber}>{currentLevel + 1}</div>
              <div className="level-label">Next Level</div>
            </div>
          </>
        )}
      </div>

      {currentLevel < 20 ? (
        <div className={styles.xpProgress}>
          <div className="progress-header">
            <span>Progress to Level {currentLevel + 1}</span>
            <span>{progress.current.toLocaleString()} / {progress.needed.toLocaleString()} XP</span>
          </div>
          <div className={styles.progressBar}>
            <div 
              className={`progress-fill ${canLevelUp ? 'ready' : ''}`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className="progress-footer">
            {progress.total > 0 ? (
              <span className="xp-remaining">{progress.total.toLocaleString()} XP remaining</span>
            ) : (
              <span className="xp-ready">Ready to level up!</span>
            )}
          </div>
        </div>
      ) : (
        <div className="max-level-indicator">
          <div className="max-level-icon">👑</div>
          <div className="max-level-text">
            <strong>Maximum Level Reached</strong>
            <p>Your character has reached the pinnacle of power at level 20!</p>
          </div>
        </div>
      )}

      <div className="xp-milestones">
        <div className="milestone-header">XP Milestones</div>
        <div className="milestone-grid">
          {[1, 5, 10, 15, 20].map(level => {
            const xpRequired = getXPForLevel(level);
            const isReached = currentXP >= xpRequired;
            const isCurrent = level === currentLevel;
            
            return (
              <div 
                key={level}
                className={`milestone ${isReached ? 'reached' : ''} ${isCurrent ? 'current' : ''}`}
              >
                <div className={styles.milestoneLevel}>Level {level}</div>
                <div className={styles.milestoneXp}>{xpRequired.toLocaleString()} XP</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};