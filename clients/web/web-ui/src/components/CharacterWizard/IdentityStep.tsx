import { useRef } from 'react';
import { useFormContext } from 'react-hook-form';

export function IdentityStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { register, setValue, getValues, formState, watch } = useFormContext<any>();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageUrl = watch('image');

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setValue('image', ev.target?.result as string, { shouldValidate: true });
      };
      reader.readAsDataURL(file);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!getValues('name')) {
      formState.errors.name = { type: 'manual', message: 'Name is required' };
      return;
    }
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Character Identity</div>
      <label>
        Name:
        <input {...register('name', { required: true })} style={{ marginLeft: 8, width: 200 }} />
      </label>
      {formState.errors.name && (
        <span style={{ color: 'red' }}>{formState.errors.name.message as string}</span>
      )}
      <label>
        Bio:
        <textarea {...register('bio')} style={{ marginLeft: 8, width: 300, height: 60 }} />
      </label>
      <label>
        Image (for sprite):
        <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageChange} style={{ marginLeft: 8 }} />
      </label>
      {imageUrl && (
        <img src={imageUrl} alt="Character" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #ccc' }} />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onBack} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Back</button>
        <button type="submit" style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Next</button>
      </div>
    </form>
  );
}

export default IdentityStep;
