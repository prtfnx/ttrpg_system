import { useBackgrounds } from '@features/compendium';
import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { BackgroundStepData } from './schemas';
import styles from './BackgroundStep.module.css';

const ALL_SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

const CLASS_SKILL_MAP: Record<string, { skills: string[]; choices: number }> = {
  barbarian: { skills: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'], choices: 2 },
  bard: { skills: ALL_SKILLS, choices: 3 },
  cleric: { skills: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'], choices: 2 },
  druid: { skills: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'], choices: 2 },
  fighter: { skills: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'], choices: 2 },
  monk: { skills: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'], choices: 2 },
  paladin: { skills: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'], choices: 2 },
  ranger: { skills: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'], choices: 3 },
  rogue: { skills: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'], choices: 4 },
  sorcerer: { skills: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'], choices: 2 },
  warlock: { skills: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'], choices: 2 },
  wizard: { skills: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'], choices: 2 },
};

const RACE_BONUS_SKILLS: Record<string, string[]> = {
  elf: ['Perception'],
  half_elf: [],
  human: [],
};

export function BackgroundStep({ onNext: _onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { register, formState, watch, setValue, getValues } = useFormContext<BackgroundStepData>();
  const selectedBackground = watch('background');
  const { data: backgrounds, loading, error } = useBackgrounds();

  const characterClass: string = (watch as any)('class') ?? '';
  const characterRace: string = (watch as any)('race') ?? '';

  const classEntry = CLASS_SKILL_MAP[characterClass.toLowerCase()] ?? { skills: [], choices: 2 };
  const raceSkills: string[] = RACE_BONUS_SKILLS[characterRace.toLowerCase()] ?? [];

  // Find selected background skills from compendium data
  const selectedBackgroundData = backgrounds?.find(bg => bg.name === selectedBackground);
  const backgroundSkills: string[] = selectedBackgroundData?.skill_proficiencies ?? [];

  const alreadyGranted = useMemo(() => [...backgroundSkills, ...raceSkills], [backgroundSkills, raceSkills]);
  const availableClassSkills = classEntry.skills.filter(s => !alreadyGranted.includes(s));

  const [selectedClassSkills, setSelectedClassSkills] = useState<string[]>(() => {
    const existing = (getValues as any)().skills;
    if (Array.isArray(existing) && existing.length > 0) return existing.filter((s: string) => availableClassSkills.includes(s));
    return [];
  });

  useEffect(() => {
    const allSkills = [...new Set([...alreadyGranted, ...selectedClassSkills])];
    (setValue as any)('skills', allSkills, { shouldValidate: false });
  }, [alreadyGranted, selectedClassSkills, setValue]);

  function toggleClassSkill(skill: string) {
    setSelectedClassSkills(prev => {
      if (prev.includes(skill)) return prev.filter(s => s !== skill);
      if (prev.length >= classEntry.choices) return prev;
      return [...prev, skill];
    });
  }

  // Show loading state
  if (loading) {
    return <div className={styles.centered}>Loading backgrounds...</div>;
  }

  // Show error state
  if (error) {
    return <div className={styles.error}>Error loading backgrounds: {error}</div>;
  }

  // Show if no backgrounds available
  if (!backgrounds || backgrounds.length === 0) {
    return <div className={styles.centered}>No backgrounds available</div>;
  }

  return (
    <div className={styles.step}>
      <div className={styles.title}>Choose background</div>

      <label className={styles['select-label']}>
        Background:
        <select
          {...register('background', { required: 'Select a background' })}
          className={styles.select}
        >
          <option value="">Select...</option>
          {backgrounds.map((bg) => (
            <option key={bg.name} value={bg.name}>{bg.name}</option>
          ))}
        </select>
      </label>

      {formState.errors.background && typeof formState.errors.background === 'object' && 'message' in formState.errors.background && (
        <span className={styles['field-error']}>{formState.errors.background.message as string}</span>
      )}

      {selectedBackgroundData && (
        <div className={styles['details-card']}>
          <h3>{selectedBackgroundData.name} Benefits</h3>

          {backgroundSkills.length > 0 && (
            <div className={styles['detail-row']}>
              <strong>Skill Proficiencies:</strong>{' '}
              <span className={styles['skill-text']}>{backgroundSkills.join(', ')}</span>
            </div>
          )}

          {selectedBackgroundData.tool_proficiencies && selectedBackgroundData.tool_proficiencies.length > 0 && (
            <div className={styles['detail-row']}>
              <strong>Tool Proficiencies:</strong>{' '}
              <span className={styles['tool-text']}>{selectedBackgroundData.tool_proficiencies.join(', ')}</span>
            </div>
          )}

          {selectedBackgroundData.language_proficiencies && selectedBackgroundData.language_proficiencies.length > 0 && (
            <div className={styles['detail-row']}>
              <strong>Languages:</strong>{' '}
              <span className={styles['language-text']}>{selectedBackgroundData.language_proficiencies.join(', ')}</span>
            </div>
          )}

          {selectedBackgroundData.features && selectedBackgroundData.features.length > 0 && (
            <div>
              {selectedBackgroundData.features.map((feature, index) => (
                <div key={index} className={styles['feature-item']}>
                  <h4 className={styles['feature-title']}>{feature.name}</h4>
                  <p className={styles['feature-desc']}>{feature.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {availableClassSkills.length > 0 && (
        <div className={styles['skills-section']}>
          <h4 className={styles['skills-title']}>
            Class Skill Proficiencies
            <span className={styles['skills-count']}>
              {selectedClassSkills.length} / {classEntry.choices} chosen
            </span>
          </h4>
          <div className={styles['skills-grid']}>
            {availableClassSkills.map(skill => {
              const checked = selectedClassSkills.includes(skill);
              const maxed = selectedClassSkills.length >= classEntry.choices;
              return (
                <label
                  key={skill}
                  className={styles['skill-item']}
                  data-disabled={!checked && maxed ? true : undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && maxed}
                    onChange={() => toggleClassSkill(skill)}
                  />
                  {skill}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
