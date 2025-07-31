import { useFormContext } from 'react-hook-form';
import type { ClassStepData } from './classSchema';

export function ClassStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { register, handleSubmit, formState } = useFormContext<ClassStepData>();
  return (
    <form onSubmit={handleSubmit(() => onNext())} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your character's class</div>
      <label>
        Class:
        <select {...register('class')} style={{ marginLeft: 8 }}>
          <option value="">Select...</option>
          <option value="Fighter">Fighter</option>
          <option value="Wizard">Wizard</option>
          <option value="Rogue">Rogue</option>
          <option value="Cleric">Cleric</option>
        </select>
      </label>
      {formState.errors.class && <span style={{ color: 'red' }}>{formState.errors.class.message}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onBack} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Back</button>
        <button type="submit" disabled={!formState.isValid} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Next</button>
      </div>
    </form>
  );
}
