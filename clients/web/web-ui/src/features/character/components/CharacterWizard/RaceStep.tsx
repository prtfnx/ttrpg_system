
import { useRaces } from '@features/compendium';
import { Controller, useFormContext } from 'react-hook-form';
import type { RaceStepData } from './schemas';

export function RaceStep({ onNext }: { onNext: () => void }) {
  const { control, formState, watch, getValues } = useFormContext<RaceStepData>();
  const selectedRace = watch('race');
  const { data: races, loading, error } = useRaces();
  
  console.log('[RaceStep] Rendering, current race value:', watch('race'));
  console.log('[RaceStep] All form values:', getValues());
  console.log('[RaceStep] onNext function:', typeof onNext, onNext);
  console.log('[RaceStep] Races from compendium:', races);
  
  // Debug: log validation errors on every render
  if (formState.errors && Object.keys(formState.errors).length > 0) {
    console.log('[RaceStep] Validation errors:', formState.errors);
  }
  
  // Find selected race data
  const selectedRaceData = races?.find(r => r.name.toLowerCase().replace(/\s+/g, '-') === selectedRace);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your race</div>
      
      {loading && <div>Loading races...</div>}
      {error && <div style={{ color: 'red' }}>Error loading races: {error}</div>}
      
      {!loading && !error && races && (
        <>
          <label>
            Select Race:
            <Controller
              name="race"
              control={control}
              defaultValue=""
              render={({ field }) => (
                <select
                  value={field.value}
                  onChange={field.onChange}
                  style={{ marginLeft: 8, padding: '4px 8px' }}
                >
                  <option value="">Select...</option>
                  {races.map((race) => {
                    const key = race.name.toLowerCase().replace(/\s+/g, '-');
                    return (
                      <option key={key} value={key}>{race.name}</option>
                    );
                  })}
                </select>
              )}
            />
          </label>
          
          {formState.errors.race && <span style={{ color: 'red' }}>{formState.errors.race.message}</span>}
          
          {/* Display race details when selected */}
          {selectedRace && selectedRaceData && (
            <div style={{ 
              marginTop: 16, 
              padding: 16, 
              background: '#f8fafc', 
              borderRadius: 8,
              border: '1px solid #e2e8f0'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1em', color: '#1e293b' }}>
                {selectedRaceData.name} Traits
              </h3>
              
              <div style={{ marginBottom: 8 }}>
                <strong>Ability Score Bonuses:</strong>{' '}
                <span style={{ color: '#059669', fontWeight: 500 }}>
                  {selectedRaceData.ability_score_increases.map(asi => 
                    `+${asi.increase} ${asi.ability}`
                  ).join(', ')}
                </span>
              </div>
              
              <div style={{ marginBottom: 8 }}>
                <strong>Size:</strong> {selectedRaceData.size}
              </div>
              
              <div style={{ marginBottom: 8 }}>
                <strong>Speed:</strong> {selectedRaceData.speed} ft
              </div>
              
              {selectedRaceData.darkvision && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Darkvision:</strong> {selectedRaceData.darkvision} ft
                </div>
              )}
              
              <div>
                <strong>Racial Traits:</strong>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                  {selectedRaceData.traits.map((trait, index) => (
                    <li key={index} style={{ color: '#374151', fontSize: '0.9em' }}>
                      <strong>{trait.name}:</strong> {trait.description}
                    </li>
                  ))}
                </ul>
              </div>
              
              {selectedRaceData.languages.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong>Languages:</strong> {selectedRaceData.languages.join(', ')}
                </div>
              )}
            </div>
          )}
        </>
      )}
      
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button 
          type="button"
          data-testid="race-next-button"
          disabled={!selectedRace}
          onClick={() => {
            console.log('[RaceStep] Button clicked! Race value:', selectedRace);
            console.log('[RaceStep] Calling onNext function');
            onNext();
            console.log('[RaceStep] onNext function called');
          }}
          style={{ 
            background: selectedRace ? '#6366f1' : '#9ca3af', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 4, 
            padding: '8px 16px', 
            fontWeight: 600,
            cursor: selectedRace ? 'pointer' : 'not-allowed'
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
