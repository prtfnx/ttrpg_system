import { useClasses } from '@features/compendium';
import { useFormContext } from 'react-hook-form';
import type { ClassStepData } from './classSchema';
import styles from './ClassStep.module.css';

export function ClassStep({ onNext: _onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { register, formState, watch } = useFormContext<ClassStepData>();
  const selectedClass = watch('class');
  const { data: classes, loading, error } = useClasses();
  
  // Find selected class data
  const selectedClassData = classes?.find(c => c.name.toLowerCase().replace(/\s+/g, '-') === selectedClass);

  return (
    <div className={styles.step}>
      <div className={styles.title}>Choose your class</div>

      {loading && <div className={styles.loading}>Loading classes...</div>}
      {error && <div className={styles['error-text']}>Error loading classes: {error}</div>}

      {!loading && !error && classes && (
        <>
          <label className={styles['select-label']}>
            Select Class:
            <select
              {...register('class', { required: 'Class is required' })}
              className={styles.select}
            >
              <option value="">Select...</option>
              {classes.map((classInfo) => {
                const key = classInfo.name.toLowerCase().replace(/\s+/g, '-');
                return (
                  <option key={key} value={key}>{classInfo.name}</option>
                );
              })}
            </select>
          </label>

          {formState.errors.class && <span className={styles['error-text']}>{formState.errors.class.message}</span>}

          {selectedClass && selectedClassData && (
            <div className={styles['details-card']}>
              <h3>{selectedClassData.name}</h3>

              {selectedClassData.description && (
                <p className={styles.description}>{selectedClassData.description}</p>
              )}

              <div className={styles['detail-row']}>
                <strong>Hit Die:</strong>{' '}
                <span className={styles['hit-die']}>d{selectedClassData.hit_die}</span>
              </div>

              {selectedClassData.primary_abilities && selectedClassData.primary_abilities.length > 0 && (
                <div className={styles['detail-row']}>
                  <strong>Primary Abilities:</strong>{' '}
                  {selectedClassData.primary_abilities.join(', ')}
                </div>
              )}

              {selectedClassData.saving_throw_proficiencies && selectedClassData.saving_throw_proficiencies.length > 0 && (
                <div className={styles['detail-row']}>
                  <strong>Saving Throws:</strong>{' '}
                  {selectedClassData.saving_throw_proficiencies.join(', ')}
                </div>
              )}

              {selectedClassData.armor_proficiencies && selectedClassData.armor_proficiencies.length > 0 && (
                <div className={styles['detail-row']}>
                  <strong>Armor:</strong>{' '}
                  {selectedClassData.armor_proficiencies.join(', ')}
                </div>
              )}

              {selectedClassData.weapon_proficiencies && selectedClassData.weapon_proficiencies.length > 0 && (
                <div className={styles['detail-row']}>
                  <strong>Weapons:</strong>{' '}
                  {selectedClassData.weapon_proficiencies.join(', ')}
                </div>
              )}

              {selectedClassData.spell_ability && (
                <div className={styles['detail-row']}>
                  <strong>Spellcasting Ability:</strong>{' '}
                  {selectedClassData.spell_ability}
                </div>
              )}

              {selectedClassData.skill_proficiencies && selectedClassData.skill_proficiencies.length > 0 && (
                <div className={styles['detail-row']}>
                  <strong>Skills:</strong>{' '}
                  Choose {selectedClassData.num_skills || 2} from: {selectedClassData.skill_proficiencies.join(', ')}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
