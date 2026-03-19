import { useState } from 'react';
import styles from './MulticlassManager.module.css';

interface MulticlassManagerProps {
  currentClasses: string[];
  currentLevel: number;
  abilityScores: Record<string, number>;
  onMulticlass: (newClass: string) => void;
}

// D&D 5e Multiclassing Prerequisites
const MULTICLASS_PREREQUISITES = {
  'barbarian': { strength: 13 },
  'bard': { charisma: 13 },
  'cleric': { wisdom: 13 },
  'druid': { wisdom: 13 },
  'fighter': { strength: 13, dexterity: 13 }, // Either STR 13 OR DEX 13
  'monk': { dexterity: 13, wisdom: 13 },
  'paladin': { strength: 13, charisma: 13 },
  'ranger': { dexterity: 13, wisdom: 13 },
  'rogue': { dexterity: 13 },
  'sorcerer': { charisma: 13 },
  'warlock': { charisma: 13 },
  'wizard': { intelligence: 13 }
};

const AVAILABLE_CLASSES = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 
  'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'
];

function checkMulticlassPrerequisites(targetClass: string, abilityScores: Record<string, number>): boolean {
  const prereqs = MULTICLASS_PREREQUISITES[targetClass.toLowerCase() as keyof typeof MULTICLASS_PREREQUISITES];
  if (!prereqs) return false;

  // Special case for Fighter (STR 13 OR DEX 13)
  if (targetClass.toLowerCase() === 'fighter') {
    return abilityScores.strength >= 13 || abilityScores.dexterity >= 13;
  }

  // Check all prerequisites
  return Object.entries(prereqs).every(([ability, required]) => {
    const score = abilityScores[ability] || 0;
    return score >= required;
  });
}

function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function MulticlassManager({ 
  currentClasses, 
  currentLevel, 
  abilityScores, 
  onMulticlass 
}: MulticlassManagerProps) {
  const [selectedClass, setSelectedClass] = useState('');
  const [showRequirements, setShowRequirements] = useState(false);

  // Can't multiclass until level 2
  if (currentLevel < 2) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Multiclassing</h3>
        <p className={styles.requirementsText}>Multiclassing becomes available at level 2.</p>
      </div>
    );
  }

  const availableClasses = AVAILABLE_CLASSES.filter(cls => 
    !currentClasses.map(c => c.toLowerCase()).includes(cls.toLowerCase())
  );

  const handleMulticlass = () => {
    if (selectedClass && checkMulticlassPrerequisites(selectedClass, abilityScores)) {
      onMulticlass(selectedClass);
      setSelectedClass('');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Multiclassing</h3>
        <button className={styles.requirementsBtn} onClick={() => setShowRequirements(!showRequirements)}>
          {showRequirements ? 'Hide' : 'Show'} Requirements
        </button>
      </div>

      <div className={styles.classList}>
        <div className={styles.classListLabel}>Current Classes:</div>
        <div className={styles.classChips}>
          {currentClasses.map((cls, index) => (
            <span key={index} className={styles.classChip}>{cls}</span>
          ))}
        </div>
      </div>

      {showRequirements && (
        <div className={styles.requirementsBox}>
          <div className={styles.requirementsTitle}>Multiclass Prerequisites</div>
          <div className={styles.requirementsText}>
            To multiclass, you must have at least 13 in the primary ability of both your current class and your new class.
            <br />
            <strong>Your Ability Scores:</strong>
            <br />
            STR: {abilityScores.strength || 10} ({getAbilityModifier(abilityScores.strength || 10) >= 0 ? '+' : ''}{getAbilityModifier(abilityScores.strength || 10)})
            {' '}| DEX: {abilityScores.dexterity || 10} ({getAbilityModifier(abilityScores.dexterity || 10) >= 0 ? '+' : ''}{getAbilityModifier(abilityScores.dexterity || 10)})
            {' '}| CON: {abilityScores.constitution || 10} ({getAbilityModifier(abilityScores.constitution || 10) >= 0 ? '+' : ''}{getAbilityModifier(abilityScores.constitution || 10)})
            <br />
            INT: {abilityScores.intelligence || 10} ({getAbilityModifier(abilityScores.intelligence || 10) >= 0 ? '+' : ''}{getAbilityModifier(abilityScores.intelligence || 10)})
            {' '}| WIS: {abilityScores.wisdom || 10} ({getAbilityModifier(abilityScores.wisdom || 10) >= 0 ? '+' : ''}{getAbilityModifier(abilityScores.wisdom || 10)})
            {' '}| CHA: {abilityScores.charisma || 10} ({getAbilityModifier(abilityScores.charisma || 10) >= 0 ? '+' : ''}{getAbilityModifier(abilityScores.charisma || 10)})
          </div>
        </div>
      )}

      <div className={styles.selectRow}>
        <div className={styles.selectField}>
          <label htmlFor="multiclass-select" className={styles.selectLabel}>Add Class:</label>
          <select
            id="multiclass-select"
            className={styles.select}
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            <option value="">Select a class...</option>
            {availableClasses.map(cls => {
              const meetsReqs = checkMulticlassPrerequisites(cls, abilityScores);
              return (
                <option 
                  key={cls} 
                  value={cls}
                  disabled={!meetsReqs}
                >
                  {cls.charAt(0).toUpperCase() + cls.slice(1)}
                  {!meetsReqs ? ' (Requirements not met)' : ''}
                </option>
              );
            })}
          </select>
        </div>
        
        <button
          className={styles.multiclassBtn}
          onClick={handleMulticlass}
          disabled={!selectedClass || !checkMulticlassPrerequisites(selectedClass, abilityScores)}
        >
          Multiclass
        </button>
      </div>

      {selectedClass && checkMulticlassPrerequisites(selectedClass, abilityScores) && (
        <div className={styles.confirmBox}>
          <h4 className={styles.confirmTitle}>Multiclass Prerequisites</h4>
          <div className={styles.confirmText}>
            {selectedClass === 'wizard' ? 
              `Wizard requires intelligence 13 (you have ${abilityScores.intelligence || 10})` :
              `${selectedClass.charAt(0).toUpperCase() + selectedClass.slice(1)} requirements met`
            }
          </div>
          
          <h5 className={styles.confirmSubtitle}>Multiclass Proficiencies</h5>
          <div className={styles.proficiencyText}>
            {selectedClass === 'barbarian' && 'Shields, simple weapons, martial weapons'}
            {selectedClass === 'fighter' && 'Light armor, medium armor, shields, simple weapons, martial weapons'}
            {selectedClass === 'wizard' && 'None'}
            {selectedClass === 'cleric' && 'Light armor, medium armor, shields'}
          </div>
          
          {selectedClass === 'barbarian' && (
            <div>
              <div className={styles.proficiencyText}>
                Rage (2 uses)
              </div>
              <div className={styles.proficiencyText}>
                Unarmored Defense
              </div>
            </div>
          )}
          
          <button className={styles.confirmBtn} onClick={handleMulticlass}>
            Confirm Multiclass
          </button>
        </div>
      )}

      {selectedClass && !checkMulticlassPrerequisites(selectedClass, abilityScores) && (
        <div className={styles.errBox}>
          You don&apos;t meet the ability score requirements for {selectedClass}.
        </div>
      )}
    </div>
  );
}