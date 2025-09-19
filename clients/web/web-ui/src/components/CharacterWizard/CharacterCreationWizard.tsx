import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Modal } from '../common/Modal';
import '../common/Modal.css';
import { AbilitiesStep } from './AbilitiesStep';
import { BackgroundStep } from './BackgroundStep';
import { CharacterAdvancementStep } from './CharacterAdvancementStep';
import CharacterExportStep from './CharacterExportStep';
import { classSchema } from './classSchema';
import { ClassStep } from './ClassStep';
import { CombatView } from './CombatView';
import IdentityStep from './IdentityStep';
import { RaceStep } from './RaceStepImproved';
import ReviewStep from './ReviewStep';
import { abilitiesSchema, raceSchema } from './schemas';
import { SkillsStep } from './SkillsStep';
import { SpellSelectionStep } from './SpellSelectionStep';
import type { WizardFormData } from './WizardFormData';

// D&D 5e class skills mapping
const CLASS_SKILLS = {
  Fighter: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
  Wizard: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'],
  Rogue: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'],
  Cleric: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
  Barbarian: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
  Bard: ['Any three skills of your choice'],
  Druid: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
  Monk: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'],
  Paladin: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'],
  Ranger: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
  Sorcerer: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'],
  Warlock: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'],
};

const CLASS_SKILL_CHOICES = {
  Fighter: 2, Wizard: 2, Rogue: 4, Cleric: 2, Barbarian: 2,
  Bard: 3, Druid: 2, Monk: 2, Paladin: 2, Ranger: 3, Sorcerer: 2, Warlock: 2,
};

const BACKGROUND_SKILLS = {
  Acolyte: ['Insight', 'Religion'],
  Criminal: ['Deception', 'Stealth'],
  'Folk Hero': ['Animal Handling', 'Survival'],
  Noble: ['History', 'Persuasion'],
  Sage: ['Arcana', 'History'],
  Soldier: ['Athletics', 'Intimidation'],
};

function getClassSkills(className: string): string[] {
  const key = className as keyof typeof CLASS_SKILLS;
  return CLASS_SKILLS[key] || [];
}

function getClassSkillChoices(className: string): number {
  const key = className as keyof typeof CLASS_SKILL_CHOICES;
  return CLASS_SKILL_CHOICES[key] || 2;
}

function getBackgroundSkills(background: string): string[] {
  const key = background as keyof typeof BACKGROUND_SKILLS;
  return BACKGROUND_SKILLS[key] || [];
}

const RACE_SKILLS = {};
function getRaceSkills(race: string): string[] {
  const key = race as keyof typeof RACE_SKILLS;
  return RACE_SKILLS[key] || [];
}

// Spellcasting classes for D&D 5e
const SPELLCASTING_CLASSES = [
  'Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'
];

function isSpellcaster(className: string): boolean {
  return SPELLCASTING_CLASSES.includes(className);
}

interface CharacterCreationWizardProps {
  onFinish: (data: WizardFormData) => void;
  onCancel: () => void;
  isOpen: boolean;
}

// Form validation schema
const wizardSchema = z.object({
  race: raceSchema.shape.race,
  class: classSchema.shape.class,
  background: z.string().min(1, 'Background is required'),
  strength: z.number().min(8).max(15),
  dexterity: z.number().min(8).max(15),
  constitution: z.number().min(8).max(15),
  intelligence: z.number().min(8).max(15),
  wisdom: z.number().min(8).max(15),
  charisma: z.number().min(8).max(15),
  skills: z.array(z.string()).min(1, 'At least one skill is required'),
  spells: z.object({
    cantrips: z.array(z.string()).optional(),
    knownSpells: z.array(z.string()).optional(),
    preparedSpells: z.array(z.string()).optional()
  }).optional(),
  name: z.string().min(1, 'Character name is required'),
  bio: z.string().optional(),
  image: z.string().optional()
});

export function CharacterCreationWizard({ onFinish, onCancel, isOpen }: CharacterCreationWizardProps) {
  const [step, setStep] = useState(0);
  const stepsCount = 10; // Race, Class, Background, Abilities, Skills, Spells, Identity, Export/Import, Advancement, Review
  
  const methods = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    mode: 'onChange',
    defaultValues: {
      race: '',
      class: '',
      background: '',
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
      skills: [],
      spells: {
        cantrips: [],
        knownSpells: [],
        preparedSpells: []
      },
      name: '',
      bio: '',
      image: ''
    }
  });

  console.log('[CharacterCreationWizard] Render, current step:', step);

  // Step-specific validation with proper error handling
  function handleNextRace() {
    const values = methods.getValues();
    const result = raceSchema.safeParse(values);
    if (result.success) {
      setStep((s) => s + 1);
    } else {
      const errors = result.error.flatten().fieldErrors;
      if (errors.race) {
        methods.setError('race', { type: 'manual', message: errors.race[0] });
      }
    }
  }

  function handleNextClass() {
    const values = methods.getValues();
    const result = classSchema.safeParse(values);
    if (result.success) {
      setStep((s) => s + 1);
    } else {
      const errors = result.error.flatten().fieldErrors;
      if (errors.class) {
        methods.setError('class', { type: 'manual', message: errors.class[0] });
      }
    }
  }

  function handleNextAbilities() {
    const values = methods.getValues();
    const result = abilitiesSchema.safeParse(values);
    if (result.success) {
      setStep((s) => s + 1);
    } else {
      const errors = result.error.flatten().fieldErrors;
      Object.keys(errors).forEach(key => {
        methods.setError(key as any, { type: 'manual', message: errors[key as keyof typeof errors]?.[0] });
      });
    }
  }

  function handleFinish(data: WizardFormData) {
    const result = wizardSchema.safeParse(data);
    if (result.success) {
      onFinish(data);
    } else {
      const errors = result.error.flatten().fieldErrors;
      Object.keys(errors).forEach(key => {
        methods.setError(key as any, { type: 'manual', message: errors[key as keyof typeof errors]?.[0] });
      });
      // Go to first step with error
      const firstErrorStep = getFirstErrorStep(errors);
      setStep(firstErrorStep);
    }
  }

  function getFirstErrorStep(errors: Record<string, string[] | undefined>): number {
    if (errors.race) return 0;
    if (errors.class) return 1;
    if (errors.background) return 2;
    if (errors.strength || errors.dexterity || errors.constitution || 
        errors.intelligence || errors.wisdom || errors.charisma) return 3;
    if (errors.skills) return 4;
    if (errors.spells) return 5;
    if (errors.name) return 6;
    return step;
  }

  function handleNextBackground() {
    const values = methods.getValues();
    if (values.background && values.background.length > 0) {
      setStep((s) => s + 1);
    } else {
      methods.setError('background', { type: 'manual', message: 'Select a background' });
    }
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  const progress = ((step + 1) / stepsCount) * 100;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Create New Character"
      size="large"
      closeOnEscape={false}
      closeOnOverlayClick={false}
    >
      <ErrorBoundary
        fallback={
          <div className="error-content">
            <h3>Character Creation Error</h3>
            <p>Something went wrong while creating your character. Please try again.</p>
            <button onClick={onCancel} className="retry-button">
              Close Wizard
            </button>
          </div>
        }
      >
        <FormProvider {...methods}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 16
              }}>
                <div style={{ fontSize: '0.9em', color: '#666' }}>
                  Step {step + 1} of {stepsCount}
                </div>
              </div>
              
              {/* Progress bar */}
              <div style={{ 
                width: '100%', 
                height: 4, 
                background: '#e5e7eb', 
                borderRadius: 2,
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: `${progress}%`, 
                  height: '100%', 
                  background: '#3b82f6',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>

            {/* Step content */}
            {step === 0 && <RaceStep onNext={handleNextRace} />}
            {step === 1 && <ClassStep onNext={handleNextClass} onBack={handleBack} />}
            {step === 2 && <BackgroundStep onNext={handleNextBackground} onBack={handleBack} />}
            {step === 3 && <AbilitiesStep onNext={handleNextAbilities} onBack={handleBack} />}
            {step === 4 && (
              <SkillsStep
                onNext={() => setStep(5)}
                onBack={handleBack}
                classSkills={getClassSkills(methods.getValues().class)}
                classSkillChoices={getClassSkillChoices(methods.getValues().class)}
                backgroundSkills={getBackgroundSkills(methods.getValues().background)}
                raceSkills={getRaceSkills(methods.getValues().race)}
              />
            )}
            {step === 5 && isSpellcaster(methods.getValues().class) && (
              <SpellSelectionStep
                onNext={() => setStep(6)}
                onBack={handleBack}
                characterClass={methods.getValues().class}
                characterLevel={1}
                abilityScores={{
                  Strength: methods.getValues().strength,
                  Dexterity: methods.getValues().dexterity,
                  Constitution: methods.getValues().constitution,
                  Intelligence: methods.getValues().intelligence,
                  Wisdom: methods.getValues().wisdom,
                  Charisma: methods.getValues().charisma
                }}
              />
            )}
            {step === 5 && !isSpellcaster(methods.getValues().class) && (
              <IdentityStep
                onNext={() => setStep(7)}
                onBack={() => setStep(4)}
              />
            )}
            {step === 6 && (
              <IdentityStep
                onNext={() => setStep(7)}
                onBack={() => setStep(isSpellcaster(methods.getValues().class) ? 5 : 4)}
              />
            )}
            {step === 7 && (
              <CharacterExportStep
                onNext={() => setStep(8)}
                onBack={() => setStep(isSpellcaster(methods.getValues().class) ? 6 : 5)}
              />
            )}
            {step === 8 && (
              <CharacterAdvancementStep
                data={methods.getValues() as WizardFormData}
                onChange={(field, value) => {
                  methods.setValue(field, value);
                }}
                onComplete={() => setStep(9)}
              />
            )}
            {step === 9 && (
              <ReviewStep
                data={methods.getValues() as WizardFormData}
                onBack={() => setStep(8)}
                onConfirm={() => handleFinish(methods.getValues() as WizardFormData)}
              />
            )}

            <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <div>
                {step > 0 && (
                  <button 
                    onClick={handleBack} 
                    type="button"
                    style={{ 
                      background: '#f3f4f6', 
                      color: '#374151', 
                      border: '1px solid #d1d5db', 
                      borderRadius: 6, 
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    ← Back
                  </button>
                )}
              </div>
              <button 
                onClick={onCancel} 
                type="button"
                style={{ 
                  background: '#ef4444', 
                  color: '#fff', 
                  border: 'none', 
                  borderRadius: 6, 
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </FormProvider>
      </ErrorBoundary>
    </Modal>
  );
}

export default CharacterCreationWizard;
