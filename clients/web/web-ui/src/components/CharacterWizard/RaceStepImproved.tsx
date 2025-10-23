import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useRacesForCharacterWizard } from '../../hooks/useCompendium';
import { calculateRacialASI, getRacialTraits } from './raceData';
import type { RaceStepData } from './schemas';

interface ExtendedRaceData extends RaceStepData {
  subrace?: string;
}

export function RaceStep({ onNext }: { onNext: () => void }) {
  const { control, handleSubmit, formState, setValue } = useFormContext<ExtendedRaceData>();
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [selectedSubrace, setSelectedSubrace] = useState<string>('');
  // DON'T watch fields here - causes infinite loop when setValue is called
  
  // Load races from compendium
  const { data: RACES, loading: racesLoading, error: racesError } = useRacesForCharacterWizard();
  
  const handleRaceNext = (data: ExtendedRaceData) => {
    console.log('[RaceStep] onNext called, data:', data);
    onNext();
  };

  const handleRaceChange = (raceName: string) => {
    setSelectedRace(raceName);
    setValue('race', raceName);
    // Clear subrace when race changes
    setSelectedSubrace('');
    setValue('subrace', '');
  };

  // Show loading state
  if (racesLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your character's race</div>
        <div>Loading races from compendium...</div>
      </div>
    );
  }

  // Show error state
  if (racesError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your character's race</div>
        <div style={{ color: 'red' }}>
          Error loading races: {racesError}
          <br />
          <small>Falling back to local data would go here</small>
        </div>
      </div>
    );
  }

  // If no races loaded, show fallback
  if (!RACES || Object.keys(RACES).length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your character's race</div>
        <div>No races available from compendium</div>
      </div>
    );
  }

  const selectedRaceData = RACES[selectedRace];
  const hasSubraces = selectedRaceData?.subraces && Object.keys(selectedRaceData.subraces).length > 0;
  // Use local state instead of watch() to avoid infinite loops
  
  // Show racial traits
  const racialTraits = selectedRace ? getRacialTraits(selectedRace, selectedSubrace, RACES) : [];
  const racialASI = selectedRace ? calculateRacialASI(selectedRace, selectedSubrace, RACES) : {};

  return (
    <form onSubmit={handleSubmit(handleRaceNext)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your character's race</div>
      
      {/* Race Selection */}
      <label>
        Race:
        <Controller
          name="race"
          control={control}
          defaultValue=""
          render={({ field }) => (
            <select
              value={field.value}
              onChange={(e) => {
                field.onChange(e);
                handleRaceChange(e.target.value);
              }}
              style={{ marginLeft: 8, padding: '4px 8px' }}
            >
              <option value="">Select...</option>
              {Object.keys(RACES).map(raceName => (
                <option key={raceName} value={raceName}>{raceName}</option>
              ))}
            </select>
          )}
        />
      </label>
      {formState.errors.race && <span style={{ color: 'red' }}>{formState.errors.race.message}</span>}

      {/* Subrace Selection */}
      {hasSubraces && (
        <label>
          Subrace:
          <Controller
            name="subrace"
            control={control}
            defaultValue=""
            render={({ field }) => (
              <select
                value={field.value || ''}
                onChange={(e) => {
                  field.onChange(e);
                  setSelectedSubrace(e.target.value);
                }}
                style={{ marginLeft: 8, padding: '4px 8px' }}
              >
                <option value="">Select subrace...</option>
                {selectedRaceData && Object.keys(selectedRaceData.subraces || {}).map(subraceName => (
                  <option key={subraceName} value={subraceName}>{subraceName}</option>
                ))}
              </select>
            )}
          />
        </label>
      )}

      {/* Race Information Display */}
      {selectedRaceData && (
        <div style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '16px', 
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#495057' }}>
            {selectedRace} {selectedSubrace && `(${selectedSubrace})`} Traits
          </h4>
          
          {/* Ability Score Increases */}
          {Object.keys(racialASI).length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <strong>Ability Score Increase:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                {Object.entries(racialASI).map(([ability, bonus]) => (
                  <li key={ability}>
                    {ability.charAt(0).toUpperCase() + ability.slice(1)} +{bonus}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Basic Stats */}
          <div style={{ marginBottom: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span><strong>Size:</strong> {selectedRaceData.size}</span>
            <span><strong>Speed:</strong> {selectedRaceData.speed} feet</span>
            <span><strong>Languages:</strong> {selectedRaceData.languages.join(', ')}</span>
          </div>

          {/* Racial Traits */}
          {racialTraits.length > 0 && (
            <div>
              <strong>Racial Traits:</strong>
              {racialTraits.map((trait, index) => (
                <div key={index} style={{ margin: '8px 0' }}>
                  <strong style={{ color: '#6366f1' }}>{trait.name}:</strong>
                  <span style={{ marginLeft: '8px', fontSize: '14px' }}>{trait.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button 
          type="submit" 
          disabled={!selectedRace || (hasSubraces && !selectedSubrace)}
          style={{ 
            background: selectedRace && (!hasSubraces || selectedSubrace) ? '#6366f1' : '#9ca3af', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 4, 
            padding: '8px 16px', 
            fontWeight: 600,
            cursor: selectedRace && (!hasSubraces || selectedSubrace) ? 'pointer' : 'not-allowed'
          }}
        >
          Next
        </button>
      </div>
    </form>
  );
}

export default RaceStep;