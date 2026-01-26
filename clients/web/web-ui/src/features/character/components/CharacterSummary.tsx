import { useMemo } from 'react';

interface CharacterSummaryProps {
  character: {
    name: string;
    level: number;
    class: string;
    race: string;
    background: string;
    abilityScores: Record<string, number>;
    hitDice: string;
    maxHitPoints: number;
    currentHitPoints: number;
    armorClass: number;
    proficiencyBonus: number;
    experience: number;
  };
}

function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

// D&D 5e experience thresholds for level advancement
const EXPERIENCE_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];

function getLevelFromExperience(experience: number): number {
  for (let i = EXPERIENCE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (experience >= EXPERIENCE_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

function formatClassDisplay(classString: string, level: number): string {
  const classes = classString.split(',').map(c => c.trim());
  
  if (classes.length === 1) {
    return `${classes[0]} ${level}`;
  }
  
  // For multiclass, show class breakdown (simplified - assumes equal split for demo)
  const levelPerClass = Math.floor(level / classes.length);
  const remainder = level % classes.length;
  
  return classes.map((cls, index) => {
    const classLevel = levelPerClass + (index < remainder ? 1 : 0);
    return `${cls} ${classLevel}`;
  }).join(' / ');
}

export function CharacterSummary({ character }: CharacterSummaryProps) {
  const { 
    name, 
    level, 
    class: characterClass, 
    race, 
    background, 
    abilityScores,
    hitDice,
    maxHitPoints,
    currentHitPoints,
    armorClass,
    proficiencyBonus,
    experience
  } = character;

  const modifiers = useMemo(() => ({
    strength: getAbilityModifier(abilityScores.strength || 10),
    dexterity: getAbilityModifier(abilityScores.dexterity || 10),
    constitution: getAbilityModifier(abilityScores.constitution || 10),
    intelligence: getAbilityModifier(abilityScores.intelligence || 10),
    wisdom: getAbilityModifier(abilityScores.wisdom || 10),
    charisma: getAbilityModifier(abilityScores.charisma || 10)
  }), [abilityScores]);

  const calculatedLevel = getLevelFromExperience(experience);
  const displayLevel = Math.max(level, calculatedLevel);
  const classDisplay = formatClassDisplay(characterClass, displayLevel);

  // Calculate hit points with constitution modifier
  const constitutionBonus = modifiers.constitution * displayLevel;
  const calculatedMaxHP = maxHitPoints + constitutionBonus;

  return (
    <div style={{ 
      padding: 20, 
      border: '2px solid #e2e8f0', 
      borderRadius: 12,
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
    }}>
      {/* Character Header */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '2px solid #cbd5e1'
      }}>
        <h2 style={{ 
          margin: '0 0 8px 0', 
          fontSize: '1.8em', 
          color: '#1e293b',
          fontWeight: 'bold'
        }}>
          {name}
        </h2>
        <div style={{ 
          fontSize: '1.1em', 
          color: '#475569',
          marginBottom: 4
        }}>
          {classDisplay}
        </div>
        <div style={{ 
          fontSize: '1em', 
          color: '#64748b'
        }}>
          {race} {background}
        </div>
      </div>

      {/* Core Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
        gap: 16,
        marginBottom: 20
      }}>
        {/* Hit Points */}
        <div style={{ 
          background: '#fef2f2', 
          border: '2px solid #fca5a5',
          borderRadius: 8, 
          padding: 12, 
          textAlign: 'center' 
        }}>
          <div style={{ fontSize: '0.8em', color: '#991b1b', fontWeight: 600 }}>
            HIT POINTS
          </div>
          <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#dc2626' }}>
            {currentHitPoints} / {calculatedMaxHP}
          </div>
          <div style={{ fontSize: '0.7em', color: '#7f1d1d' }}>
            {hitDice}
          </div>
        </div>

        {/* Armor Class */}
        <div style={{ 
          background: '#f0f9ff', 
          border: '2px solid #7dd3fc',
          borderRadius: 8, 
          padding: 12, 
          textAlign: 'center' 
        }}>
          <div style={{ fontSize: '0.8em', color: '#0c4a6e', fontWeight: 600 }}>
            ARMOR CLASS
          </div>
          <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#0284c7' }}>
            {armorClass}
          </div>
        </div>

        {/* Proficiency Bonus */}
        <div style={{ 
          background: '#f0fdf4', 
          border: '2px solid #86efac',
          borderRadius: 8, 
          padding: 12, 
          textAlign: 'center' 
        }}>
          <div style={{ fontSize: '0.8em', color: '#14532d', fontWeight: 600 }}>
            PROFICIENCY
          </div>
          <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#16a34a' }}>
            {formatModifier(proficiencyBonus)}
          </div>
        </div>

        {/* Experience */}
        <div style={{ 
          background: '#fefce8', 
          border: '2px solid #facc15',
          borderRadius: 8, 
          padding: 12, 
          textAlign: 'center' 
        }}>
          <div style={{ fontSize: '0.8em', color: '#92400e', fontWeight: 600 }}>
            EXPERIENCE
          </div>
          <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#ca8a04' }}>
            {(experience || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.7em', color: '#a16207' }}>
            Level {displayLevel}
          </div>
        </div>
      </div>

      {/* Ability Scores */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '1.2em', 
          color: '#374151',
          textAlign: 'center'
        }}>
          Ability Scores
        </h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(6, 1fr)', 
          gap: 8
        }}>
          {Object.entries(abilityScores).map(([ability, score]) => {
            const modifier = getAbilityModifier(score);
            return (
              <div 
                key={ability}
                style={{ 
                  background: 'white', 
                  border: '1px solid #d1d5db',
                  borderRadius: 6, 
                  padding: 8, 
                  textAlign: 'center',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                }}
              >
                <div style={{ 
                  fontSize: '0.7em', 
                  color: '#6b7280', 
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {ability.substring(0, 3)}
                </div>
                <div style={{ 
                  fontSize: '1.2em', 
                  fontWeight: 'bold', 
                  color: '#111827',
                  margin: '2px 0'
                }}>
                  {score}
                </div>
                <div style={{ 
                  fontSize: '0.8em', 
                  color: modifier >= 0 ? '#16a34a' : '#dc2626',
                  fontWeight: 500
                }}>
                  {formatModifier(modifier)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress to Next Level */}
      {displayLevel < 20 && (
        <div style={{ 
          background: '#f8fafc', 
          border: '1px solid #e2e8f0',
          borderRadius: 6, 
          padding: 12 
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginBottom: 4 
          }}>
            <span style={{ fontSize: '0.9em', color: '#64748b' }}>
              Progress to Level {displayLevel + 1}
            </span>
            <span style={{ fontSize: '0.9em', color: '#64748b' }}>
              {(experience - EXPERIENCE_THRESHOLDS[displayLevel - 1]).toLocaleString()} / {(EXPERIENCE_THRESHOLDS[displayLevel] - EXPERIENCE_THRESHOLDS[displayLevel - 1]).toLocaleString()} XP
            </span>
          </div>
          <div style={{ 
            width: '100%', 
            height: 8, 
            background: '#e2e8f0', 
            borderRadius: 4 
          }}>
            <div 
              style={{ 
                height: '100%', 
                background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                borderRadius: 4,
                width: `${Math.min(100, ((experience - EXPERIENCE_THRESHOLDS[displayLevel - 1]) / (EXPERIENCE_THRESHOLDS[displayLevel] - EXPERIENCE_THRESHOLDS[displayLevel - 1])) * 100)}%`,
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}