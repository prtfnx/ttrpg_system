
import { Controller, useFormContext } from 'react-hook-form';
import type { RaceStepData } from './schemas';

export function RaceStep({ onNext }: { onNext: () => void }) {
  const { control, handleSubmit, formState } = useFormContext<RaceStepData>();
  const handleRaceNext = (data: RaceStepData) => {
    console.log('[RaceStep] onNext called, data:', data);
    onNext();
  };
  // Debug: log validation errors on every render
  if (formState.errors && Object.keys(formState.errors).length > 0) {
    console.log('[RaceStep] Validation errors:', formState.errors);
  }
  return (
    <form onSubmit={handleSubmit(handleRaceNext)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your character's race</div>
      <label>
        Race:
        <Controller
          name="race"
          control={control}
          defaultValue=""
          render={({ field }) => (
            <select
              value={field.value}
              onChange={field.onChange}
              style={{ marginLeft: 8 }}
            >
              <option value="">Select...</option>
              <option value="Human">Human</option>
              <option value="Elf">Elf</option>
              <option value="Dwarf">Dwarf</option>
              <option value="Halfling">Halfling</option>
            </select>
          )}
        />
      </label>
      {formState.errors.race && <span style={{ color: 'red' }}>{formState.errors.race.message}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Next</button>
      </div>
    </form>
  );
}
