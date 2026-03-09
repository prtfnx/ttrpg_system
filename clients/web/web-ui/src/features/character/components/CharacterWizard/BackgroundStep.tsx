import { useBackgrounds } from '@features/compendium';
import { useFormContext } from 'react-hook-form';
import type { BackgroundStepData } from './schemas';
import styles from './BackgroundStep.module.css';

export function BackgroundStep({ onNext: _onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { register, formState, watch } = useFormContext<BackgroundStepData>();
  const selectedBackground = watch('background');
  const { data: backgrounds, loading, error } = useBackgrounds();
  
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

  // Find selected background details
  const selectedBackgroundData = backgrounds.find(bg => bg.name === selectedBackground);

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

          {selectedBackgroundData.skill_proficiencies && selectedBackgroundData.skill_proficiencies.length > 0 && (
            <div className={styles['detail-row']}>
              <strong>Skill Proficiencies:</strong>{' '}
              <span className={styles['skill-text']}>{selectedBackgroundData.skill_proficiencies.join(', ')}</span>
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
    </div>
  );
}

