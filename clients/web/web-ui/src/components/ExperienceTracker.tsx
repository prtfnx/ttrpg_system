import { useState } from 'react';

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
    <div style={{ 
      padding: 16, 
      border: '1px solid #e2e8f0', 
      borderRadius: 8,
      background: '#f8fafc'
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1em', color: '#1e293b' }}>
        Experience Tracker
      </h3>
      
      <div style={{ marginBottom: 16 }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 8
        }}>
          <span style={{ fontWeight: 500 }}>Level {currentLevel}</span>
          <span style={{ fontSize: '0.9em', color: '#64748b' }}>
            {currentExperience} / {nextLevelExp} XP
          </span>
        </div>
        
        {/* Progress bar */}
        <div style={{ 
          width: '100%', 
          height: 8, 
          background: '#e2e8f0', 
          borderRadius: 4,
          overflow: 'hidden'
        }}>
          <div style={{ 
            width: `${Math.min(progressToNext, 100)}%`, 
            height: '100%', 
            background: currentLevel < 20 ? '#059669' : '#dc2626',
            transition: 'width 0.3s ease'
          }} />
        </div>
        
        {currentLevel < 20 && (
          <div style={{ 
            fontSize: '0.85em', 
            color: '#64748b', 
            marginTop: 4 
          }}>
            {nextLevelExp - currentExperience} XP needed for level {currentLevel + 1}
          </div>
        )}
        
        {currentLevel >= 20 && (
          <div style={{ 
            fontSize: '0.85em', 
            color: '#dc2626', 
            marginTop: 4,
            fontWeight: 500
          }}>
            Maximum level reached!
          </div>
        )}
      </div>
      
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        alignItems: 'flex-end' 
      }}>
        <div style={{ flex: 1 }}>
          <label 
            htmlFor="add-experience"
            style={{ 
              display: 'block', 
              marginBottom: 4, 
              fontSize: '0.9em', 
              fontWeight: 500,
              color: '#374151'
            }}
          >
            Add Experience:
          </label>
          <input
            id="add-experience"
            type="number"
            min="0"
            value={experienceToAdd}
            onChange={(e) => setExperienceToAdd(e.target.value)}
            placeholder="Enter XP to add"
            style={{
              width: '100%',
              padding: '6px 10px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.9em'
            }}
          />
        </div>
        
        <button
          onClick={handleAddExperience}
          disabled={!experienceToAdd || isNaN(parseInt(experienceToAdd))}
          style={{
            padding: '6px 12px',
            background: experienceToAdd && !isNaN(parseInt(experienceToAdd)) ? '#059669' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontSize: '0.9em',
            fontWeight: 500,
            cursor: experienceToAdd && !isNaN(parseInt(experienceToAdd)) ? 'pointer' : 'not-allowed'
          }}
        >
          Add XP
        </button>
      </div>
    </div>
  );
}