import { useFormContext } from 'react-hook-form';
import { useBackgrounds } from '../../hooks/useCompendium';
import type { BackgroundStepData } from './schemas';

export function BackgroundStep({ onNext: _onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { register, formState, watch } = useFormContext<BackgroundStepData>();
  const selectedBackground = watch('background');
  const { data: backgrounds, loading, error } = useBackgrounds();
  
  // Show loading state
  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading backgrounds...</div>;
  }

  // Show error state
  if (error) {
    return (
      <div style={{ color: 'red', padding: '1rem' }}>
        Error loading backgrounds: {error}
      </div>
    );
  }

  // Show if no backgrounds available
  if (!backgrounds || backgrounds.length === 0) {
    return <div style={{ padding: '1rem' }}>No backgrounds available</div>;
  }

  // Find selected background details
  const selectedBackgroundData = backgrounds.find(bg => bg.name === selectedBackground);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose background</div>
      
      <label>
        Background:
        <select 
          {...register('background', { required: 'Select a background' })} 
          style={{ marginLeft: 8, padding: '4px 8px' }}
        >
          <option value="">Select...</option>
          {backgrounds.map((bg) => (
            <option key={bg.name} value={bg.name}>{bg.name}</option>
          ))}
        </select>
      </label>
      
      {formState.errors.background && typeof formState.errors.background === 'object' && 'message' in formState.errors.background && (
        <span style={{ color: 'red' }}>{formState.errors.background.message as string}</span>
      )}
      
      {/* Display background details when selected */}
      {selectedBackgroundData && (
        <div style={{ 
          marginTop: 16, 
          padding: 16, 
          background: '#f8fafc', 
          borderRadius: 8,
          border: '1px solid #e2e8f0'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1em', color: '#1e293b' }}>
            {selectedBackgroundData.name} Benefits
          </h3>
          
          {selectedBackgroundData.skill_proficiencies && selectedBackgroundData.skill_proficiencies.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong>Skill Proficiencies:</strong>{' '}
              <span style={{ color: '#059669', fontWeight: 500 }}>
                {selectedBackgroundData.skill_proficiencies.join(', ')}
              </span>
            </div>
          )}
          
          {selectedBackgroundData.tool_proficiencies && selectedBackgroundData.tool_proficiencies.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong>Tool Proficiencies:</strong>{' '}
              <span style={{ color: '#7c3aed', fontWeight: 500 }}>
                {selectedBackgroundData.tool_proficiencies.join(', ')}
              </span>
            </div>
          )}
          
          {selectedBackgroundData.language_proficiencies && selectedBackgroundData.language_proficiencies.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong>Languages:</strong>{' '}
              <span style={{ color: '#0369a1', fontWeight: 500 }}>
                {selectedBackgroundData.language_proficiencies.join(', ')}
              </span>
            </div>
          )}
          
          {/* Display background features */}
          {selectedBackgroundData.features && selectedBackgroundData.features.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {selectedBackgroundData.features.map((feature, index) => (
                <div key={index} style={{ marginBottom: 12 }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95em', color: '#475569' }}>
                    {feature.name}
                  </h4>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em', lineHeight: 1.4 }}>
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

