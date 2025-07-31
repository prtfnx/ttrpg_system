import { useFormContext } from 'react-hook-form';

export function AbilitiesStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { register, handleSubmit, formState } = useFormContext();
  return (
    <form onSubmit={handleSubmit(() => onNext())} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label>
        Strength:
        <input type="number" {...register('strength', { valueAsNumber: true })} min={1} max={20} />
      </label>
      <label>
        Dexterity:
        <input type="number" {...register('dexterity', { valueAsNumber: true })} min={1} max={20} />
      </label>
      <label>
        Constitution:
        <input type="number" {...register('constitution', { valueAsNumber: true })} min={1} max={20} />
      </label>
      <label>
        Intelligence:
        <input type="number" {...register('intelligence', { valueAsNumber: true })} min={1} max={20} />
      </label>
      <label>
        Wisdom:
        <input type="number" {...register('wisdom', { valueAsNumber: true })} min={1} max={20} />
      </label>
      <label>
        Charisma:
        <input type="number" {...register('charisma', { valueAsNumber: true })} min={1} max={20} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onBack} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Back</button>
        <button type="submit" disabled={!formState.isValid} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Next</button>
      </div>
    </form>
  );
}
