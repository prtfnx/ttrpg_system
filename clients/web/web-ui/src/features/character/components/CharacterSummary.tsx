import { useMemo } from 'react';
import styles from './CharacterSummary.module.css';

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
    <div className={styles.summary}>
      {/* Character Header */}
      <div className={styles.header}>
        <h2 className={styles.charName}>{name}</h2>
        <div className={styles.classDisplay}>{classDisplay}</div>
        <div className={styles.identity}>{race} {background}</div>
      </div>

      {/* Core Stats Grid */}
      <div className={styles.statsGrid}>
        {/* Hit Points */}
        <div className={`${styles.statCard} ${styles.hpCard}`}>
          <div className={`${styles.statLabel} ${styles.hpLabel}`}>HIT POINTS</div>
          <div className={`${styles.statValue} ${styles.hpValue}`}>{currentHitPoints} / {calculatedMaxHP}</div>
          <div className={`${styles.statSub} ${styles.hpSub}`}>{hitDice}</div>
        </div>

        {/* Armor Class */}
        <div className={`${styles.statCard} ${styles.acCard}`}>
          <div className={`${styles.statLabel} ${styles.acLabel}`}>ARMOR CLASS</div>
          <div className={`${styles.statValue} ${styles.acValue}`}>{armorClass}</div>
        </div>

        {/* Proficiency Bonus */}
        <div className={`${styles.statCard} ${styles.profCard}`}>
          <div className={`${styles.statLabel} ${styles.profLabel}`}>PROFICIENCY</div>
          <div className={`${styles.statValue} ${styles.profValue}`}>{formatModifier(proficiencyBonus)}</div>
        </div>

        {/* Experience */}
        <div className={`${styles.statCard} ${styles.xpCard}`}>
          <div className={`${styles.statLabel} ${styles.xpLabel}`}>EXPERIENCE</div>
          <div className={`${styles.statValue} ${styles.xpValue}`}>{(experience || 0).toLocaleString()}</div>
          <div className={`${styles.statSub} ${styles.xpSub}`}>Level {displayLevel}</div>
        </div>
      </div>

      {/* Ability Scores */}
      <div className={styles.abilitiesSection}>
        <h3 className={styles.abilitiesTitle}>Ability Scores</h3>
        <div className={styles.abilityGrid}>
          {Object.entries(abilityScores).map(([ability, score]) => {
            const modifier = getAbilityModifier(score);
            return (
              <div key={ability} className={styles.abilityCard}>
                <div className={styles.abilityCode}>{ability.substring(0, 3)}</div>
                <div className={styles.abilityScore}>{score}</div>
                <div className={modifier >= 0 ? styles.abilityModPos : styles.abilityModNeg}>{formatModifier(modifier)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress to Next Level */}
      {displayLevel < 20 && (
        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>Progress to Level {displayLevel + 1}</span>
            <span className={styles.progressLabel}>
              {(experience - EXPERIENCE_THRESHOLDS[displayLevel - 1]).toLocaleString()} / {(EXPERIENCE_THRESHOLDS[displayLevel] - EXPERIENCE_THRESHOLDS[displayLevel - 1]).toLocaleString()} XP
            </span>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.min(100, ((experience - EXPERIENCE_THRESHOLDS[displayLevel - 1]) / (EXPERIENCE_THRESHOLDS[displayLevel] - EXPERIENCE_THRESHOLDS[displayLevel - 1])) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}