import { useState } from 'react';

import { FormProvider, useForm } from 'react-hook-form';
// import { zodResolver } from '@hookform/resolvers/zod';
import { AbilitiesStep } from './AbilitiesStep';
import { BackgroundStep } from './BackgroundStep';
import { classSchema } from './classSchema';
import { ClassStep } from './ClassStep';
import { RaceStep } from './RaceStep';
import type { CharacterFormData } from './schemas';
import { abilitiesSchema, raceSchema } from './schemas';

type WizardFormData = CharacterFormData & { background: string } & {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
};


export function CharacterCreationWizard({ onFinish, onCancel }: { onFinish: (data: CharacterFormData) => void, onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const stepsCount = 4; // Race, Class, Background, Abilities
  // We'll use a single form context, but step-specific validation
  const methods = useForm<WizardFormData>({
    mode: 'onChange',
    defaultValues: {
      race: '',
      class: '',
      background: '',
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
    },
    // No resolver here, we'll validate per-step
  });
  console.log('[CharacterCreationWizard] Render, current step:', step);

  // Step-specific validation
  function handleNextRace() {
    const values = methods.getValues();
    const result = raceSchema.safeParse(values);
    if (result.success) {
      setStep((s) => {
        const nextStep = s + 1;
        console.log('[CharacterCreationWizard] Advancing to step', nextStep);
        return nextStep;
      });
    } else {
      methods.setError('race', { type: 'manual', message: result.error.issues[0]?.message || 'Select a race' });
    }
  }
  function handleNextClass() {
    const values = methods.getValues();
    const result = classSchema.safeParse(values);
    if (result.success) {
      setStep((s) => {
        const nextStep = s + 1;
        console.log('[CharacterCreationWizard] Advancing to step', nextStep);
        return nextStep;
      });
    } else {
      methods.setError('class', { type: 'manual', message: result.error.issues[0]?.message || 'Select a class' });
    }
  }

  function handleNextBackground() {
    const values = methods.getValues();
    if (values.background && values.background.length > 0) {
      setStep((s) => s + 1);
    } else {
      methods.setError('background' as any, { type: 'manual', message: 'Select a background' });
    }
  }

  function handleNextAbilities() {
    const values = methods.getValues();
    const result = abilitiesSchema.safeParse(values);
    if (result.success) {
      handleFinish(methods.getValues() as CharacterFormData);
    } else {
      // Set error for the first ability with an issue
      const issue = result.error.issues[0];
      if (issue) {
        methods.setError(issue.path[0] as any, { type: 'manual', message: issue.message });
      }
    }
  }
  function handleBack() {
    setStep((s) => {
      const prevStep = Math.max(0, s - 1);
      console.log('[CharacterCreationWizard] Going back to step', prevStep);
      return prevStep;
    });
  }

  function handleFinish(data: CharacterFormData) {
    onFinish(data);
  }

  // Progress bar calculation
  const progress = ((step + 1) / stepsCount) * 100;
  return (
    <FormProvider {...methods}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 340, maxWidth: 420, boxShadow: '0 4px 32px rgba(0,0,0,0.15)' }}>
        <h2 style={{ marginBottom: 16 }}>Create Character</h2>
        <div style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: 4 }}>Step {step + 1} of {stepsCount}</div>
          <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#6366f1', transition: 'width 0.3s' }} />
          </div>
        </div>
        {step === 0 && <RaceStep onNext={handleNextRace} />}
        {step === 1 && <ClassStep onNext={handleNextClass} onBack={handleBack} />}
        {step === 2 && <BackgroundStep onNext={handleNextBackground} onBack={handleBack} />}
        {step === 3 && <AbilitiesStep onNext={handleNextAbilities} onBack={handleBack} />}
        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          {step > 0 && <button onClick={handleBack} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Back</button>}
          <button onClick={onCancel} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Cancel</button>
        </div>
      </div>
    </FormProvider>
  );
}

export default CharacterCreationWizard;