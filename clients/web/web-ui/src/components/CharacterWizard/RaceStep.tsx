import { useFormContext } from 'react-hook-form';
import type { RaceStepData } from './schemas';

export function RaceStep({ onNext }: { onNext: () => void }) {
  const { register, handleSubmit, formState } = useFormContext<RaceStepData>();
  return (
    <form onSubmit={handleSubmit(() => onNext())} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label>
        Race:
        <select {...register('race')} style={{ marginLeft: 8 }}>
          <option value="">Select...</option>
          <option value="Human">Human</option>
          <option value="Elf">Elf</option>
          <option value="Dwarf">Dwarf</option>
          <option value="Halfling">Halfling</option>
        </select>
      </label>
      {formState.errors.race && <span style={{ color: 'red' }}>{formState.errors.race.message}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={!formState.isValid} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Next</button>
      </div>
    </form>
  );
}
