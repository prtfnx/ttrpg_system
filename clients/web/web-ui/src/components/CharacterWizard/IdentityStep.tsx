import { useRef } from 'react';
import { useFormContext } from 'react-hook-form';

interface IdentityStepData {
  name: string;
  bio?: string;
  image?: string;
}

export function IdentityStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { register, setValue, getValues, formState, watch } = useFormContext<IdentityStepData>();
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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '0 8px' }}>
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#2c3e50' }}>Character Identity</h3>
        <p style={{ margin: '8px 0 0 0', fontSize: 14, color: '#7f8c8d' }}>Choose your character's name and background</p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#2c3e50' }}>Character Name <span style={{ color: '#e74c3c' }}>*</span></span>
          <input 
            {...register('name', { required: true })} 
            placeholder="Enter character name..."
            style={{ 
              padding: '10px 12px', 
              fontSize: 15,
              border: '2px solid #dfe6e9', 
              borderRadius: 8,
              outline: 'none',
              transition: 'border-color 0.2s'
            }} 
            onFocus={(e) => e.target.style.borderColor = '#3498db'}
            onBlur={(e) => e.target.style.borderColor = '#dfe6e9'}
          />
        </label>
        {formState.errors.name && (
          <span style={{ color: '#e74c3c', fontSize: 13, marginTop: -4 }}>{formState.errors.name.message as string}</span>
        )}
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#2c3e50' }}>Character Bio</span>
          <textarea 
            {...register('bio')} 
            placeholder="Describe your character's backstory..."
            rows={4}
            style={{ 
              padding: '10px 12px', 
              fontSize: 14,
              border: '2px solid #dfe6e9', 
              borderRadius: 8,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3498db'}
            onBlur={(e) => e.target.style.borderColor = '#dfe6e9'}
          />
        </label>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#2c3e50' }}>Character Portrait</span>
          <input 
            type="file" 
            accept="image/*" 
            ref={imageInputRef} 
            onChange={handleImageChange} 
            style={{ 
              padding: '10px 12px', 
              fontSize: 14,
              border: '2px solid #dfe6e9', 
              borderRadius: 8,
              outline: 'none',
              cursor: 'pointer',
              backgroundColor: '#f8f9fa'
            }} 
          />
          <span style={{ fontSize: 12, color: '#95a5a6' }}>Optional: Upload an image for your character sprite</span>
        </label>
      </div>
      
      {imageUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#2c3e50' }}>Preview:</span>
          <img 
            src={imageUrl} 
            alt="Character" 
            style={{ 
              width: 120, 
              height: 120, 
              objectFit: 'cover', 
              borderRadius: 12, 
              border: '3px solid #3498db',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }} 
          />
        </div>
      )}
      
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button 
          type="button" 
          onClick={onBack} 
          style={{ 
            background: '#ecf0f1', 
            color: '#2c3e50', 
            border: 'none', 
            borderRadius: 8, 
            padding: '10px 20px',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#dfe6e9'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#ecf0f1'}
        >
          Back
        </button>
        <button 
          type="submit" 
          style={{ 
            background: '#3498db', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 8, 
            padding: '10px 24px', 
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#2980b9'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#3498db'}
        >
          Next →
        </button>
      </div>
    </form>
  );
}

export default IdentityStep;
