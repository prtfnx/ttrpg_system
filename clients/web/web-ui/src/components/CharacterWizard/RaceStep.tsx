
import { Controller, useFormContext } from 'react-hook-form';
import type { RaceStepData } from './schemas';

// Race data with bonuses and traits
const raceData = {
  'mountain-dwarf': {
    name: 'Mountain Dwarf',
    abilityBonuses: '+2 Constitution, +2 Strength',
    traits: ['Darkvision 60 feet', 'Dwarven Resilience', 'Stonecunning', 'Armor Proficiency']
  },
  'human': {
    name: 'Human',
    abilityBonuses: '+1 to all abilities',
    traits: ['Versatile', 'Extra Skill', 'Extra Language']
  },
  'elf': {
    name: 'Elf',
    abilityBonuses: '+2 Dexterity',
    traits: ['Darkvision 60 feet', 'Fey Ancestry', 'Keen Senses', 'Trance']
  },
  'halfling': {
    name: 'Halfling',
    abilityBonuses: '+2 Dexterity',
    traits: ['Lucky', 'Brave', 'Halfling Nimbleness']
  }
};

export function RaceStep({ onNext }: { onNext: () => void }) {
  const { control, formState, watch, getValues } = useFormContext<RaceStepData>();
  const selectedRace = watch('race');
  
  console.log('[RaceStep] Rendering, current race value:', watch('race'));
  console.log('[RaceStep] All form values:', getValues());
  console.log('[RaceStep] onNext function:', typeof onNext, onNext);
  
  // Debug: log validation errors on every render
  if (formState.errors && Object.keys(formState.errors).length > 0) {
    console.log('[RaceStep] Validation errors:', formState.errors);
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your race</div>
      
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
              {Object.entries(raceData).map(([key, race]) => (
                <option key={key} value={key}>{race.name}</option>
              ))}
            </select>
          )}
        />
      </label>
      
      {formState.errors.race && <span style={{ color: 'red' }}>{formState.errors.race.message}</span>}
      
      {/* Display race details when selected */}
      {selectedRace && raceData[selectedRace as keyof typeof raceData] && (
        <div style={{ 
          marginTop: 16, 
          padding: 16, 
          background: '#f8fafc', 
          borderRadius: 8,
          border: '1px solid #e2e8f0'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1em', color: '#1e293b' }}>
            {raceData[selectedRace as keyof typeof raceData].name} Traits
          </h3>
          
          <div style={{ marginBottom: 8 }}>
            <strong>Ability Score Bonuses:</strong>{' '}
            <span style={{ color: '#059669', fontWeight: 500 }}>
              {raceData[selectedRace as keyof typeof raceData].abilityBonuses}
            </span>
          </div>
          
          <div>
            <strong>Racial Traits:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
              {raceData[selectedRace as keyof typeof raceData].traits.map((trait, index) => (
                <li key={index} style={{ color: '#374151', fontSize: '0.9em' }}>
                  {trait}
                </li>
              ))}
            </ul>
          </div>
        </div>
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
