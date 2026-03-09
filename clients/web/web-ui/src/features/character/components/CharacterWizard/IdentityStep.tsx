import { useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import styles from './IdentityStep.module.css';

interface IdentityStepData {
  name: string;
  bio?: string;
  image?: string;
}

export function IdentityStep({ onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
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
    onNext?.();
  }

  return (
    <form onSubmit={handleSubmit} className={styles.step}>
      <div className={styles.header}>
        <h3 className={styles.title}>Character Identity</h3>
        <p className={styles.subtitle}>Choose your character's name and background</p>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles['label-text']}>Character Name <span className={styles.required}>*</span></span>
          <input
            {...register('name', { required: true })}
            placeholder="Enter character name..."
            className={styles.input}
          />
        </label>
        {formState.errors.name && (
          <span className={styles.error}>{formState.errors.name.message as string}</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles['label-text']}>Character Bio</span>
          <textarea
            {...register('bio')}
            placeholder="Describe your character's backstory..."
            rows={4}
            className={styles.textarea}
          />
        </label>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles['label-text']}>Character Portrait</span>
          <input
            type="file"
            accept="image/*"
            ref={imageInputRef}
            onChange={handleImageChange}
            className={styles['file-input']}
          />
          <span className={styles.hint}>Optional: Upload an image for your character sprite</span>
        </label>
      </div>

      {imageUrl && (
        <div className={styles.preview}>
          <span className={styles['preview-label']}>Preview:</span>
          <img
            src={imageUrl}
            alt="Character"
            className={styles.portrait}
          />
        </div>
      )}
    </form>
  );
}

export default IdentityStep;
