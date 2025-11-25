import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { UserInfo } from '../../services/auth.service';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Modal } from '../common/Modal';
import { AbilitiesStep } from './AbilitiesStep';
import { BackgroundStep } from './BackgroundStep';
import { CharacterAdvancementStep } from './CharacterAdvancementStep';
import CharacterExportStep from './CharacterExportStep';
import { classSchema } from './classSchema';
import { ClassStep } from './ClassStep';
import IdentityStep from './IdentityStep';
import { RaceStep } from './RaceStep';
import ReviewStep from './ReviewStep';
import { abilitiesSchema, raceSchema } from './schemas';
import { SkillsStep } from './SkillsStep';
import { SpellSelectionStep } from './SpellSelectionStep';
import type { WizardFormData } from './WizardFormData';

// D&D 5e class skills mapping
const CLASS_SKILLS = {
  'fighter': ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
  'wizard': ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'],
  'rogue': ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'],
  'cleric': ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
  'barbarian': ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
  'bard': ['Any three skills of your choice'],
  'druid': ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
  'monk': ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'],
  'paladin': ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'],
  'ranger': ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
  'sorcerer': ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'],
  Warlock: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'],
};

const CLASS_SKILL_CHOICES = {
  'fighter': 2, 'wizard': 2, 'rogue': 4, 'cleric': 2, 'barbarian': 2,
  'bard': 3, 'druid': 2, 'monk': 2, 'paladin': 2, 'ranger': 3, 'sorcerer': 2, 'warlock': 2,
};

const BACKGROUND_SKILLS = {
  'acolyte': ['Insight', 'Religion'],
  'criminal': ['Deception', 'Stealth'],
  'folk-hero': ['Animal Handling', 'Survival'],
  'noble': ['History', 'Persuasion'],
  'sage': ['Arcana', 'History'],
  'soldier': ['Athletics', 'Intimidation'],
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
  'bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'
];

function isSpellcaster(className: string): boolean {
  return SPELLCASTING_CLASSES.includes(className);
}

interface CharacterCreationWizardProps {
  onFinish: (data: WizardFormData) => void;
  onCancel: () => void;
  isOpen: boolean;
  userInfo?: UserInfo;
  character?: Partial<WizardFormData>;
  mode?: string;
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

export function CharacterCreationWizard({ onFinish, onCancel, isOpen, userInfo: _userInfo, character: _character, mode: _mode }: CharacterCreationWizardProps) {
  const [step, setStep] = useState(0);
  const stepsCount = 11; // Name, Race, Class, Background, Abilities, Skills, Spells(optional), Identity, Export/Import, Advancement, Review
  
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
    console.log('[CharacterCreationWizard] handleNextRace called, values:', values);
    const result = raceSchema.safeParse(values);
    console.log('[CharacterCreationWizard] raceSchema validation result:', result);
    if (result.success) {
      console.log('[CharacterCreationWizard] Race validation passed, advancing to step 2');
      setStep((s) => s + 1);
    } else {
      console.log('[CharacterCreationWizard] Race validation failed:', result.error);
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

            {/* Step 0: Character Name */}
            {step === 0 && (
              <div style={{ 
                marginBottom: 24, 
                padding: 16, 
                background: '#f8fafc', 
                borderRadius: 8,
                border: '1px solid #e2e8f0'
              }}>
                <h2 style={{ 
                  margin: '0 0 8px 0', 
                  fontSize: '1.25em', 
                  color: '#1e293b',
                  fontWeight: 600
                }}>
                  Create your character
                </h2>
                <p style={{ 
                  margin: '0 0 16px 0', 
                  color: '#64748b', 
                  fontSize: '0.95em',
                  lineHeight: 1.5
                }}>
                  Welcome to character creation! Follow the steps to build your D&D 5e character. 
                  Start by giving your character a name, then choose their race and class.
                </p>
                
                {/* Character Name Input */}
                <div style={{ marginTop: 16 }}>
                  <label 
                    htmlFor="character-name"
                    style={{ 
                      display: 'block', 
                      marginBottom: 8, 
                      fontSize: '0.9em', 
                      fontWeight: 500,
                      color: '#374151'
                    }}
                  >
                    Character Name:
                  </label>
                  <input
                    id="character-name"
                    {...methods.register('name', { required: 'Character name is required' })}
                    style={{
                      width: '100%',
                      maxWidth: 300,
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: '0.95em',
                      background: '#fff'
                    }}
                    placeholder="Enter your character's name"
                    autoFocus
                  />
                  {methods.formState.errors.name && (
                    <div style={{ 
                      marginTop: 4, 
                      color: '#dc2626', 
                      fontSize: '0.85em' 
                    }}>
                      {methods.formState.errors.name.message}
                    </div>
                  )}
                </div>
                
                {/* Next Button for Name Step */}
                <div style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => {
                      const name = methods.getValues().name;
                      if (name && name.trim()) {
                        setStep(1);
                      } else {
                        methods.setError('name', { type: 'manual', message: 'Character name is required' });
                      }
                    }}
                    style={{
                      background: methods.watch('name') ? '#3b82f6' : '#9ca3af',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '8px 16px',
                      fontWeight: 600,
                      cursor: methods.watch('name') ? 'pointer' : 'not-allowed'
                    }}
                    disabled={!methods.watch('name')}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step content */}
            {step === 1 && <RaceStep onNext={handleNextRace} />}
            {step === 2 && <ClassStep onNext={handleNextClass} onBack={() => setStep(1)} />}
            {step === 3 && <BackgroundStep onNext={() => setStep(4)} onBack={() => setStep(2)} />}
            {step === 4 && <AbilitiesStep onNext={handleNextAbilities} onBack={() => setStep(3)} />}
            {step === 5 && (
              <SkillsStep
                onNext={() => setStep(isSpellcaster(methods.getValues().class) ? 6 : 7)}
                onBack={() => setStep(4)}
                classSkills={getClassSkills(methods.getValues().class)}
                classSkillChoices={getClassSkillChoices(methods.getValues().class)}
                backgroundSkills={getBackgroundSkills(methods.getValues().background)}
                raceSkills={getRaceSkills(methods.getValues().race)}
              />
            )}
            {step === 6 && isSpellcaster(methods.getValues().class) && (
              <SpellSelectionStep
                onNext={() => setStep(7)}
                onBack={() => setStep(5)}
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
            {step === 7 && (
              <IdentityStep
                onNext={() => setStep(8)}
                onBack={() => setStep(isSpellcaster(methods.getValues().class) ? 6 : 5)}
              />
            )}
            {step === 8 && (
              <CharacterExportStep
                onNext={() => setStep(9)}
                onBack={() => setStep(7)}
              />
            )}
            {step === 9 && (
              <CharacterAdvancementStep
                data={methods.getValues() as WizardFormData}
                onChange={(field, value) => {
                  methods.setValue(field, value);
                }}
                onComplete={() => setStep(10)}
              />
            )}
            {step === 10 && (
              <ReviewStep
                data={methods.getValues() as WizardFormData}
                onBack={() => setStep(9)}
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
