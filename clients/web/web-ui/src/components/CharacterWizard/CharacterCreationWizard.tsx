
import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { RaceStep } from './RaceStep';
import { ClassStep } from './ClassStep';
import { characterCreationSchema } from './schemas';
import type { CharacterFormData } from './schemas';


export function CharacterCreationWizard({ onFinish, onCancel }: { onFinish: (data: CharacterFormData) => void, onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const stepsCount = 2; // Race, Class
  const methods = useForm<CharacterFormData>({
    resolver: zodResolver(characterCreationSchema),
    mode: 'onChange',
    defaultValues: { race: '', class: '' },
  });

  function handleNext() {
    setStep((s) => s + 1);
  }
  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  function handleFinish(data: CharacterFormData) {
    onFinish(data);
  }

  return (
    <FormProvider {...methods}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 340, maxWidth: 420, boxShadow: '0 4px 32px rgba(0,0,0,0.15)' }}>
        <h2 style={{ marginBottom: 16 }}>Create Character</h2>
        <div style={{ marginBottom: 16 }}>
          Step {step + 1} of {stepsCount}
        </div>
        {step === 0 && <RaceStep onNext={handleNext} />}
        {step === 1 && <ClassStep onNext={methods.handleSubmit(handleFinish)} onBack={handleBack} />}
        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          {step > 0 && <button onClick={handleBack} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Back</button>}
          <button onClick={onCancel} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Cancel</button>
        </div>
      </div>
    </FormProvider>
  );
}

export default CharacterCreationWizard;
