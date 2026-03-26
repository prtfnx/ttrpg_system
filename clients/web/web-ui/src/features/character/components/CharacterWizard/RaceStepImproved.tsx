import { useRacesForCharacterWizard } from '@features/compendium';
import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { calculateRacialASI, getRacialTraits } from './raceData';
import type { RaceStepData } from './schemas';
import styles from './RaceStepImproved.module.css';

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
  
  const handleRaceNext = (_data: ExtendedRaceData) => {
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
      <div className={styles.step}>
        <div className={styles.title}>Choose your character's race</div>
        <div className={styles.loading}>Loading races from compendium...</div>
      </div>
    );
  }

  // Show error state
  if (racesError) {
    return (
      <div className={styles.step}>
        <div className={styles.title}>Choose your character's race</div>
        <div className={styles.error}>Error loading races: {racesError}</div>
      </div>
    );
  }

  // If no races loaded, show fallback
  if (!RACES || Object.keys(RACES).length === 0) {
    return (
      <div className={styles.step}>
        <div className={styles.title}>Choose your character's race</div>
        <div className={styles.empty}>No races available from compendium</div>
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
    <form onSubmit={handleSubmit(handleRaceNext)} className={styles.step}>
      <div className={styles.title}>Choose your character's race</div>

      <label className={styles['select-label']}>
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
              className={styles.select}
            >
              <option value="">Select...</option>
              {Object.keys(RACES).map(raceName => (
                <option key={raceName} value={raceName}>{raceName}</option>
              ))}
            </select>
          )}
        />
      </label>
      {formState.errors.race && <span className={styles['field-error']}>{formState.errors.race.message}</span>}

      {hasSubraces && (
        <label className={styles['select-label']}>
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
                className={styles.select}
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

      {selectedRaceData && (
        <div className={styles['race-info']}>
          <h4>
            {selectedRace} {selectedSubrace && `(${selectedSubrace})`} Traits
          </h4>

          {Object.keys(racialASI).length > 0 && (
            <div>
              <strong>Ability Score Increase:</strong>
              <ul className={styles['asi-list']}>
                {Object.entries(racialASI).map(([ability, bonus]) => (
                  <li key={ability}>
                    {ability.charAt(0).toUpperCase() + ability.slice(1)} +{bonus}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles['stats-row']}>
            <span><strong>Size:</strong> {selectedRaceData.size}</span>
            <span><strong>Speed:</strong> {selectedRaceData.speed} feet</span>
            <span><strong>Languages:</strong> {selectedRaceData.languages.join(', ')}</span>
          </div>

          {racialTraits.length > 0 && (
            <div>
              <strong>Racial Traits:</strong>
              {racialTraits.map((trait, index) => (
                <div key={index} className={styles['trait-item']}>
                  <strong className={styles['trait-name']}>{trait.name}:</strong>
                  <span className={styles['trait-desc']}>{trait.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </form>
  );
}

export default RaceStep;