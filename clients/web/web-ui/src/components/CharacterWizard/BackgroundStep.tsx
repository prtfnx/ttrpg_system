import { useFormContext } from 'react-hook-form';

export function BackgroundStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { register, handleSubmit, formState } = useFormContext<any>();
  return (
    <form onSubmit={handleSubmit(() => onNext())} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Choose your character's background</div>
      <label>
        Background:
        <select {...register('background', { required: 'Select a background' })} style={{ marginLeft: 8 }}>
          <option value="">Select...</option>
          <option value="Acolyte">Acolyte</option>
          <option value="Criminal">Criminal</option>
          <option value="Folk Hero">Folk Hero</option>
          <option value="Noble">Noble</option>
          <option value="Sage">Sage</option>
          <option value="Soldier">Soldier</option>
        </select>
      </label>
      {formState.errors.background && typeof formState.errors.background === 'object' && 'message' in formState.errors.background && (
        <span style={{ color: 'red' }}>{formState.errors.background.message as string}</span>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onBack} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Back</button>
        <button type="submit" disabled={!formState.isValid} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Next</button>
      </div>
    </form>
  );
}
