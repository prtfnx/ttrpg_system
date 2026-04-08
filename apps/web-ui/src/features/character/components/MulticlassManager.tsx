import { useState } from 'react';
import styles from './MulticlassManager.module.css';
import type { ClassMulticlassData } from '../../compendium/services/compendiumService';

interface MulticlassManagerProps {
  currentClasses: string[];
  currentLevel: number;
  abilityScores: Record<string, number>;
  onMulticlass: (newClass: string) => void;
  classPrerequisites?: Record<string, ClassMulticlassData>;
}

// Fallback D&D 5e Multiclassing Prerequisites
const MULTICLASS_PREREQUISITES: Record<string, Record<string, number>> = {
  'barbarian': { strength: 13 },
  'bard': { charisma: 13 },
  'cleric': { wisdom: 13 },
  'druid': { wisdom: 13 },
  'fighter': { strength: 13, dexterity: 13 },
  'monk': { dexterity: 13, wisdom: 13 },
  'paladin': { strength: 13, charisma: 13 },
  'ranger': { dexterity: 13, wisdom: 13 },
  'rogue': { dexterity: 13 },
  'sorcerer': { charisma: 13 },
  'warlock': { charisma: 13 },
  'wizard': { intelligence: 13 },
};

const AVAILABLE_CLASSES = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter',
  'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
];

function fmt(mod: number) { return mod >= 0 ? `+${mod}` : `${mod}`; }
function modifier(score: number) { return Math.floor((score - 10) / 2); }

function checkPrereqs(
  targetClass: string,
  abilityScores: Record<string, number>,
  compendiumData?: Record<string, ClassMulticlassData>
): boolean {
  const cls = targetClass.toLowerCase();
  const prereqs = compendiumData?.[cls]?.prerequisites ?? MULTICLASS_PREREQUISITES[cls];
  if (!prereqs) return false;
  if (cls === 'fighter') return (abilityScores.strength ?? 0) >= 13 || (abilityScores.dexterity ?? 0) >= 13;
  return Object.entries(prereqs).every(([ability, min]) => (abilityScores[ability] ?? 0) >= min);
}

export function MulticlassManager({
  currentClasses,
  currentLevel,
  abilityScores,
  onMulticlass,
  classPrerequisites,
}: MulticlassManagerProps) {
  const [selectedClass, setSelectedClass] = useState('');
  const [showRequirements, setShowRequirements] = useState(false);

  if (currentLevel < 2) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Multiclassing</h3>
        <p className={styles.requirementsText}>Multiclassing becomes available at level 2.</p>
      </div>
    );
  }

  const normalized = currentClasses.map(c => c.toLowerCase());
  const availableClasses = AVAILABLE_CLASSES.filter(cls => !normalized.includes(cls));

  const handleMulticlass = () => {
    if (selectedClass && checkPrereqs(selectedClass, abilityScores, classPrerequisites)) {
      onMulticlass(selectedClass);
      setSelectedClass('');
    }
  };

  const selectedData = selectedClass ? classPrerequisites?.[selectedClass] : undefined;
  const selectedMeetsReqs = selectedClass
    ? checkPrereqs(selectedClass, abilityScores, classPrerequisites)
    : false;

  const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
  const ABBREV: Record<string, string> = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Multiclassing</h3>
        <button className={styles.requirementsBtn} onClick={() => setShowRequirements(v => !v)}>
          {showRequirements ? 'Hide' : 'Show'} Requirements
        </button>
      </div>

      <div className={styles.classList}>
        <div className={styles.classListLabel}>Current Classes:</div>
        <div className={styles.classChips}>
          {currentClasses.map((cls, i) => (
            <span key={i} className={styles.classChip}>{cls}</span>
          ))}
        </div>
      </div>

      {showRequirements && (
        <div className={styles.requirementsBox}>
          <div className={styles.requirementsTitle}>Multiclass Prerequisites</div>
          <div className={styles.requirementsText}>
            You must have at least 13 in the primary ability of both your current and new class.
            <br /><strong>Your Ability Scores:</strong><br />
            {ABILITIES.map((a, i) => (
              <span key={a}>
                {ABBREV[a]}: {abilityScores[a] ?? 10} ({fmt(modifier(abilityScores[a] ?? 10))})
                {i < ABILITIES.length - 1 ? ' | ' : ''}
                {i === 2 ? <br /> : null}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.selectRow}>
        <div className={styles.selectField}>
          <label htmlFor="multiclass-select" className={styles.selectLabel}>Add Class:</label>
          <select
            id="multiclass-select" className={styles.select}
            value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
          >
            <option value="">Select a class...</option>
            {availableClasses.map(cls => {
              const meetsReqs = checkPrereqs(cls, abilityScores, classPrerequisites);
              return (
                <option key={cls} value={cls} disabled={!meetsReqs}>
                  {cls.charAt(0).toUpperCase() + cls.slice(1)}{!meetsReqs ? ' (Requirements not met)' : ''}
                </option>
              );
            })}
          </select>
        </div>
        <button
          className={styles.multiclassBtn}
          onClick={handleMulticlass}
          disabled={!selectedClass || !selectedMeetsReqs}
        >
          Multiclass
        </button>
      </div>

      {selectedClass && selectedMeetsReqs && (
        <div className={styles.confirmBox}>
          <h4 className={styles.confirmTitle}>
            {selectedClass.charAt(0).toUpperCase() + selectedClass.slice(1)} — Requirements Met
          </h4>
          {selectedData?.proficiencies?.length ? (
            <>
              <h5 className={styles.confirmSubtitle}>Multiclass Proficiencies Gained</h5>
              <div className={styles.proficiencyText}>
                {selectedData.proficiencies.join(', ')}
              </div>
            </>
          ) : (
            <div className={styles.proficiencyText}>Check PHB for proficiencies gained.</div>
          )}
          {selectedData?.spellcasting_type && selectedData.spellcasting_type !== 'none' && (
            <div className={styles.proficiencyText} style={{ marginTop: '4px' }}>
              Spellcasting: {selectedData.spellcasting_type} caster
            </div>
          )}
          <button className={styles.confirmBtn} onClick={handleMulticlass}>
            Confirm Multiclass
          </button>
        </div>
      )}

      {selectedClass && !selectedMeetsReqs && (
        <div className={styles.errBox ?? ''} style={{ color: 'var(--color-error, #e53)', marginTop: '8px' }}>
          You don&apos;t meet the ability score requirements for {selectedClass}.
        </div>
      )}
    </div>
  );
}
