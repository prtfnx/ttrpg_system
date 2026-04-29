import type { CharacterTemplate } from '@features/character';
import { ALL_TEMPLATES } from '@features/character';
import { useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import styles from './IdentityStep.module.css';

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
] as const;

interface IdentityStepData {
  name: string;
  bio?: string;
  image?: string;
  alignment?: string;
}

export function IdentityStep({ onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { register, setValue, getValues, formState, watch } = useFormContext<IdentityStepData>();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageUrl = watch('image');

  function handleTemplateSelect(templateId: string) {
    if (!templateId) return;
    const template = ALL_TEMPLATES.find((t: CharacterTemplate) => t.id === templateId);
    if (!template) return;
    Object.entries(template.data).forEach(([key, value]) => {
      setValue(key as keyof IdentityStepData, value as IdentityStepData[keyof IdentityStepData], { shouldValidate: true });
    });
  }

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
          <span className={styles['label-text']}>Start with a template (optional)</span>
          <select
            className={styles.select}
            defaultValue=""
            onChange={(e) => handleTemplateSelect(e.target.value)}
          >
            <option value="">None — start from scratch</option>
            <optgroup label="Player Characters">
              {ALL_TEMPLATES.filter((t: CharacterTemplate) => t.type === 'pc').map((t: CharacterTemplate) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
            <optgroup label="NPCs / Monsters">
              {ALL_TEMPLATES.filter((t: CharacterTemplate) => t.type === 'npc').map((t: CharacterTemplate) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
          </select>
        </label>
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
        <span className={styles['label-text']}>Alignment</span>
        <select {...register('alignment')} className={styles.select}>
          <option value="">— Choose alignment —</option>
          {ALIGNMENTS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <span className={styles['label-text']}>Character Portrait / Token Image</span>
        <div className={styles.portraitSection}>
          {imageUrl ? (
            <img src={imageUrl} alt="Character portrait" className={styles.portrait} />
          ) : (
            <div className={styles.portraitPlaceholder}>
              <span>No image</span>
            </div>
          )}
          <div className={styles.portraitActions}>
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={() => imageInputRef.current?.click()}
            >
              {imageUrl ? 'Change Image' : 'Upload Image'}
            </button>
            {imageUrl && (
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => setValue('image', '', { shouldValidate: true })}
              >
                Remove
              </button>
            )}
            <span className={styles.hint}>PNG, JPG, WebP — used as token on the table</span>
          </div>
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          ref={imageInputRef}
          onChange={handleImageChange}
          className={styles['file-input-hidden']}
        />
      </div>
    </form>
  );
}

export default IdentityStep;
