import { useState } from 'react';

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
      <div style={{ 
        padding: 16, 
        border: '1px solid #e2e8f0', 
        borderRadius: 8,
        background: '#f8fafc'
      }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1em', color: '#1e293b' }}>
          Multiclassing
        </h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
          Multiclassing becomes available at level 2.
        </p>
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
    <div style={{ 
      padding: 16, 
      border: '1px solid #e2e8f0', 
      borderRadius: 8,
      background: '#f8fafc'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 16
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1em', color: '#1e293b' }}>
          Multiclassing
        </h3>
        <button
          onClick={() => setShowRequirements(!showRequirements)}
          style={{
            padding: '4px 8px',
            background: 'transparent',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            fontSize: '0.8em',
            cursor: 'pointer',
            color: '#374151'
          }}
        >
          {showRequirements ? 'Hide' : 'Show'} Requirements
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>Current Classes:</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {currentClasses.map((cls, index) => (
            <span 
              key={index}
              style={{
                padding: '4px 8px',
                background: '#e0f2fe',
                border: '1px solid #0891b2',
                borderRadius: 4,
                fontSize: '0.9em',
                color: '#0e7490',
                fontWeight: 500
              }}
            >
              {cls}
            </span>
          ))}
        </div>
      </div>

      {showRequirements && (
        <div style={{ 
          marginBottom: 16, 
          padding: 12, 
          background: '#fffbeb', 
          border: '1px solid #fbbf24',
          borderRadius: 4 
        }}>
          <div style={{ fontWeight: 500, marginBottom: 8, color: '#92400e' }}>
            Multiclass Prerequisites
          </div>
          <div style={{ fontSize: '0.85em', color: '#92400e', lineHeight: 1.4 }}>
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

      <div style={{ 
        display: 'flex', 
        gap: 8, 
        alignItems: 'flex-end' 
      }}>
        <div style={{ flex: 1 }}>
          <label 
            htmlFor="multiclass-select"
            style={{ 
              display: 'block', 
              marginBottom: 4, 
              fontSize: '0.9em', 
              fontWeight: 500,
              color: '#374151'
            }}
          >
            Add Class:
          </label>
          <select
            id="multiclass-select"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.9em',
              background: 'white'
            }}
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
          onClick={handleMulticlass}
          disabled={!selectedClass || !checkMulticlassPrerequisites(selectedClass, abilityScores)}
          style={{
            padding: '6px 12px',
            background: selectedClass && checkMulticlassPrerequisites(selectedClass, abilityScores) ? '#059669' : '#9ca3af',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontSize: '0.9em',
            fontWeight: 500,
            cursor: selectedClass && checkMulticlassPrerequisites(selectedClass, abilityScores) ? 'pointer' : 'not-allowed'
          }}
        >
          Multiclass
        </button>
      </div>

      {selectedClass && checkMulticlassPrerequisites(selectedClass, abilityScores) && (
        <div style={{ 
          marginTop: 12, 
          padding: 12, 
          background: '#f0fdf4', 
          border: '1px solid #bbf7d0',
          borderRadius: 4 
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95em', color: '#15803d' }}>
            Multiclass Prerequisites
          </h4>
          <div style={{ fontSize: '0.85em', color: '#166534', marginBottom: 8 }}>
            {selectedClass === 'wizard' ? 
              `Wizard requires intelligence 13 (you have ${abilityScores.intelligence || 10})` :
              `${selectedClass.charAt(0).toUpperCase() + selectedClass.slice(1)} requirements met`
            }
          </div>
          
          <h5 style={{ margin: '8px 0 4px 0', fontSize: '0.9em', color: '#15803d' }}>
            Multiclass Proficiencies
          </h5>
          <div style={{ fontSize: '0.85em', color: '#166534' }}>
            {selectedClass === 'barbarian' && 'Shields, simple weapons, martial weapons'}
            {selectedClass === 'fighter' && 'Light armor, medium armor, shields, simple weapons, martial weapons'}
            {selectedClass === 'wizard' && 'None'}
            {selectedClass === 'cleric' && 'Light armor, medium armor, shields'}
          </div>
          
          {selectedClass === 'barbarian' && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.85em', color: '#166534', fontWeight: 500 }}>
                Rage (2 uses)
              </div>
              <div style={{ fontSize: '0.85em', color: '#166534', fontWeight: 500 }}>
                Unarmored Defense
              </div>
            </div>
          )}
          
          <button
            onClick={handleMulticlass}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              background: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: '0.85em',
              cursor: 'pointer'
            }}
          >
            Confirm Multiclass
          </button>
        </div>
      )}

      {selectedClass && !checkMulticlassPrerequisites(selectedClass, abilityScores) && (
        <div style={{ 
          marginTop: 8, 
          padding: 8, 
          background: '#fef2f2', 
          border: '1px solid #fca5a5',
          borderRadius: 4,
          fontSize: '0.85em',
          color: '#dc2626'
        }}>
          You don't meet the ability score requirements for {selectedClass}.
        </div>
      )}
    </div>
  );
}