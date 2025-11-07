import { useFormContext } from 'react-hook-form';
import { useClasses } from '../../hooks/useCompendium';
import type { ClassStepData } from './classSchema';

export function ClassStep({ onNext: _onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { register, formState, watch } = useFormContext<ClassStepData>();
  const selectedClass = watch('class');
  const { data: classes, loading, error } = useClasses();
  
  // Find selected class data
  const selectedClassData = classes?.find(c => c.name.toLowerCase().replace(/\s+/g, '-') === selectedClass);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your class</div>
      
      {loading && <div>Loading classes...</div>}
      {error && <div style={{ color: 'red' }}>Error loading classes: {error}</div>}
      
      {!loading && !error && classes && (
        <>
          <label>
            Select Class:
            <select 
              {...register('class', { required: 'Class is required' })} 
              style={{ marginLeft: 8, padding: '4px 8px' }}
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
          
          {formState.errors.class && <span style={{ color: 'red' }}>{formState.errors.class.message}</span>}
          
          {/* Display class details when selected */}
          {selectedClass && selectedClassData && (
            <div style={{ 
              marginTop: 16, 
              padding: 16, 
              background: '#f8fafc', 
              borderRadius: 8,
              border: '1px solid #e2e8f0'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1em', color: '#1e293b' }}>
                {selectedClassData.name}
              </h3>
              
              <div style={{ marginBottom: 8 }}>
                <strong>Hit Die:</strong>{' '}
                <span style={{ color: '#dc2626', fontWeight: 500 }}>
                  d{selectedClassData.hit_die}
                </span>
              </div>
              
              {selectedClassData.primary_abilities && selectedClassData.primary_abilities.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Primary Abilities:</strong>{' '}
                  {selectedClassData.primary_abilities.join(', ')}
                </div>
              )}
              
              {selectedClassData.saving_throw_proficiencies && selectedClassData.saving_throw_proficiencies.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Saving Throw Proficiencies:</strong>{' '}
                  {selectedClassData.saving_throw_proficiencies.join(', ')}
                </div>
              )}
              
              {selectedClassData.skill_proficiencies && selectedClassData.skill_proficiencies.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Skill Proficiencies:</strong>{' '}
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
