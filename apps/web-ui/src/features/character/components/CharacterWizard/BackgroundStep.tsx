import { useBackgrounds, useClasses, useRacesForCharacterWizard } from '@features/compendium';
import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { BackgroundStepData } from './schemas';
import styles from './BackgroundStep.module.css';

export function BackgroundStep({ onNext: _onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { register, formState, watch, setValue, getValues } = useFormContext<BackgroundStepData>();
  const selectedBackground = watch('background');
  const { data: backgrounds, loading: bgLoading, error: bgError } = useBackgrounds();
  const { data: classes } = useClasses();
  const { data: races } = useRacesForCharacterWizard();

  const characterClass: string = (watch as any)('class') ?? '';
  const characterRace: string = (watch as any)('race') ?? '';

  // Derive class skill data from compendium
  const classData = classes?.find(c => c.name.toLowerCase() === characterClass.toLowerCase());
  const classSkills: string[] = classData?.skill_proficiencies ?? [];
  const classChoices: number = classData?.num_skills ?? 2;

  // Derive race bonus skills from compendium
  const raceEntry = races?.[characterRace];
  // eslint-disable-next-line react-hooks/exhaustive-deps -- known: optional chaining result is stable per race/background
  const raceSkills: string[] = raceEntry?.proficiencies?.skills ?? [];

  // Find selected background skills from compendium data
  const selectedBackgroundData = backgrounds?.find(bg => bg.name === selectedBackground);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- known: optional chaining result is stable per race/background
  const backgroundSkills: string[] = selectedBackgroundData?.skill_proficiencies ?? [];

  const alreadyGranted = useMemo(() => [...backgroundSkills, ...raceSkills], [backgroundSkills, raceSkills]);
  const availableClassSkills = classSkills.filter(s => !alreadyGranted.includes(s));

  const [selectedClassSkills, setSelectedClassSkills] = useState<string[]>(() => {
    const existing = (getValues as any)().skills;
    if (Array.isArray(existing) && existing.length > 0) return existing.filter((s: string) => classSkills.includes(s));
    return [];
  });

  useEffect(() => {
    const allSkills = [...new Set([...alreadyGranted, ...selectedClassSkills])];
    (setValue as any)('skills', allSkills, { shouldValidate: false });
  }, [alreadyGranted, selectedClassSkills, setValue]);

  function toggleClassSkill(skill: string) {
    setSelectedClassSkills(prev => {
      if (prev.includes(skill)) return prev.filter(s => s !== skill);
      if (prev.length >= classChoices) return prev;
      return [...prev, skill];
    });
  }

  if (bgLoading) {
    return <div className={styles.centered}>Loading backgrounds...</div>;
  }

  if (bgError) {
    return <div className={styles.error}>Error loading backgrounds: {bgError}</div>;
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
              {selectedClassSkills.length} / {classChoices} chosen
            </span>
          </h4>
          <div className={styles['skills-grid']}>
            {availableClassSkills.map(skill => {
              const checked = selectedClassSkills.includes(skill);
              const maxed = selectedClassSkills.length >= classChoices;
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
