/**
 * Enhanced Character Creation Wizard with production-ready features
 * - React Portal-based modal management
 * - Comprehensive form validation with Zod schemas
 * - Error boundaries for each step
 * - Loading states and skeleton UI
 * - Server-backed draft persistence
 * - Accessibility (ARIA) support
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { ErrorBoundary, LoadingSpinner } from '@shared/components';
import { logger } from '@shared/utils/logger';
import clsx from 'clsx';
import { AlertTriangle, Check, Save, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import { AbilitiesStep } from './AbilitiesStep';
import { BackgroundStep } from './BackgroundStep';
import { ClassStep } from './ClassStep';
import styles from './EnhancedCharacterWizard.module.css';
import { EquipmentSelectionStep } from './EquipmentSelectionStep';
import { IdentityStep } from './IdentityStep';
import { RaceStep } from './RaceStepImproved';
import ReviewStep from './ReviewStep';
import { SpellSelectionStep } from './SpellSelectionStep';
import { enhancedWizardSchema, type WizardFormData } from './WizardFormData';

// Step definitions with metadata
interface WizardStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<Record<string, unknown>>;
  validation?: z.ZodSchema<Record<string, unknown>>;
  canSkip?: boolean;
  requirements?: string[];
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'identity',
    title: 'Character Identity',
    description: 'Name, portrait, bio, and optional template preset',
    component: IdentityStep as unknown as React.ComponentType<Record<string, unknown>>,
    canSkip: false
  },
  {
    id: 'race',
    title: 'Race Selection',
    description: 'Select your character\'s race from the compendium',
    component: RaceStep as unknown as React.ComponentType<Record<string, unknown>>,
    canSkip: false,
    requirements: ['Compendium API connection']
  },
  {
    id: 'class',
    title: 'Class Selection',
    description: 'Choose your character\'s class and archetype',
    component: ClassStep as unknown as React.ComponentType<Record<string, unknown>>,
    canSkip: false
  },
  {
    id: 'abilities',
    title: 'Ability Scores',
    description: 'Assign your character\'s ability scores with racial bonuses',
    component: AbilitiesStep as unknown as React.ComponentType<Record<string, unknown>>,
    canSkip: false
  },
  {
    id: 'background',
    title: 'Background & Skills',
    description: 'Select background, languages, and class skill proficiencies',
    component: BackgroundStep as unknown as React.ComponentType<Record<string, unknown>>,
    canSkip: false
  },
  {
    id: 'equipment',
    title: 'Equipment',
    description: 'Choose your starting equipment and gear',
    component: EquipmentSelectionStep as unknown as React.ComponentType<Record<string, unknown>>,
    canSkip: false
  },
  {
    id: 'spells',
    title: 'Spells',
    description: 'Select spells for spellcasting classes',
    component: SpellSelectionStep as unknown as React.ComponentType<Record<string, unknown>>,
    canSkip: true,
    requirements: ['Spellcasting class selected']
  },
  {
    id: 'review',
    title: 'Review & Save',
    description: 'Review and save your character to the server',
    component: ReviewStep as unknown as React.ComponentType<Record<string, unknown>>,
    canSkip: false
  }
];

interface EnhancedCharacterWizardProps {
  isOpen: boolean;
  onFinish: (character: WizardFormData, expectedVersion?: number) => void | Promise<void>;
  onCancel: () => void;
  initialData?: Partial<WizardFormData>;
  initialStep?: number;
  draftId?: string;
  draftVersion?: number;
  readOnly?: boolean;
  onSave?: (data: Partial<WizardFormData>, currentStep: number, expectedVersion: number) => void;
  className?: string;
}

export const EnhancedCharacterWizard: React.FC<EnhancedCharacterWizardProps> = ({
  isOpen,
  onFinish,
  onCancel,
  initialData,
  initialStep = 0,
  draftId,
  draftVersion = 1,
  readOnly = false,
  onSave,
  className = ''
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [stepErrors, setStepErrors] = useState<Record<number, string>>({});
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const previousVersionRef = useRef(draftVersion);
  const previousStepRef = useRef(initialStep);

  // Form setup with enhanced validation
  const form = useForm<WizardFormData>({
    resolver: zodResolver(enhancedWizardSchema),
    defaultValues: {
      name: '',
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
      equipment: {
        items: [],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        carrying_capacity: {
          current_weight: 0,
          max_weight: 0,
          encumbered_at: 0,
          heavily_encumbered_at: 0
        }
      },
      advancement: {
        experiencePoints: 0,
        currentLevel: 1,
        levelHistory: []
      },
      ...initialData
    },
    mode: 'onChange'
  });

  const { reset, getValues } = form;
  
  // DON'T watch fields here - it causes infinite re-renders!
  // Child components will watch what they need via useFormContext

  // Current step data
  const currentStep = WIZARD_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;

  // A server draft is the only source of resumable wizard state. Resetting here
  // also lets a DM see a newly received remote snapshot without local leakage.
  useEffect(() => {
    if (isOpen) {
      if (initializedRef.current && !readOnly) return;
      reset({
        name: '', race: '', class: '', background: '',
        strength: 8, dexterity: 8, constitution: 8,
        intelligence: 8, wisdom: 8, charisma: 8,
        skills: [],
        spells: { cantrips: [], knownSpells: [], preparedSpells: [] },
        equipment: {
          items: [],
          currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
          carrying_capacity: { current_weight: 0, max_weight: 0, encumbered_at: 0, heavily_encumbered_at: 0 }
        },
        advancement: { experiencePoints: 0, currentLevel: 1, levelHistory: [] },
        ...initialData
      });
      const safeStep = Math.max(0, Math.min(initialStep, WIZARD_STEPS.length - 1));
      setCurrentStepIndex(safeStep);
      setCompletedSteps(new Set(Array.from({ length: safeStep }, (_, index) => index)));
      setHasUnsavedChanges(false);
      setSaveState(draftId ? 'saved' : 'idle');
      initializedRef.current = true;
      setIsInitializing(false);
    }
  }, [draftId, initialData, initialStep, isOpen, readOnly, reset]);

  const scheduleSave = useCallback((data: Partial<WizardFormData>, step: number) => {
    if (!draftId || !onSave || readOnly || !initializedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setHasUnsavedChanges(true);
    setSaveState('pending');
    saveTimerRef.current = setTimeout(() => {
      onSave(data, step, draftVersion);
      saveTimerRef.current = null;
    }, 1000);
  }, [draftId, draftVersion, onSave, readOnly]);

  // Subscribe to actual value changes. isDirty only changes once and caused
  // subsequent edits in the old local draft to be silently omitted.
  useEffect(() => {
    if (!isOpen || isInitializing || readOnly || !draftId) return;
    const subscription = form.watch(values => scheduleSave(values as Partial<WizardFormData>, currentStepIndex));
    return () => subscription.unsubscribe();
  }, [currentStepIndex, draftId, form, isInitializing, isOpen, readOnly, scheduleSave]);

  useEffect(() => {
    if (currentStepIndex === previousStepRef.current) return;
    previousStepRef.current = currentStepIndex;
    scheduleSave(getValues(), currentStepIndex);
  }, [currentStepIndex, getValues, scheduleSave]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    if (draftVersion > previousVersionRef.current) {
      previousVersionRef.current = draftVersion;
      setHasUnsavedChanges(false);
      setSaveState('saved');
    }
  }, [draftVersion]);

  // Check if step can be navigated to
  const canNavigateToStep = useCallback((stepIndex: number): boolean => {
    if (readOnly) return true;
    if (stepIndex <= currentStepIndex) return true; // Can always go back
    if (stepIndex === 0) return true; // Can always go to first step
    
    // Check if previous steps are completed
    for (let i = 0; i < stepIndex; i++) {
      const step = WIZARD_STEPS[i];
      if (!step.canSkip && !completedSteps.has(i)) {
        return false;
      }
    }
    return true;
  }, [currentStepIndex, completedSteps, readOnly]);

  // Validate current step
  const validateCurrentStep = useCallback(async (): Promise<boolean> => {
    try {
      const currentData = getValues();
      const step = WIZARD_STEPS[currentStepIndex];
      
      if (step.validation) {
        await step.validation.parseAsync(currentData);
      }
      
      // Remove any existing error for this step
      setStepErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[currentStepIndex];
        return newErrors;
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof z.ZodError 
        ? error.errors.map(e => e.message).join(', ')
        : 'Validation failed';
      
      setStepErrors(prev => ({
        ...prev,
        [currentStepIndex]: errorMessage
      }));
      
      return false;
    }
  }, [getValues, currentStepIndex]);

  // Navigation handlers
  const handleNext = useCallback(async () => {
    if (readOnly) {
      if (!isLastStep) setCurrentStepIndex(currentStepIndex + 1);
      return;
    }

    const isValid = await validateCurrentStep();
    if (!isValid && !currentStep.canSkip) return;

    // Mark step as completed
    setCompletedSteps(prev => new Set([...prev, currentStepIndex]));
    
    if (isLastStep) {
      // Final submission
      try {
        const finalData = getValues();
        await enhancedWizardSchema.parseAsync(finalData);
        
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        await onFinish(finalData, draftVersion);
      } catch (error) {
        logger.warn('Character wizard final validation failed', error);
        setStepErrors(prev => ({
          ...prev,
          [currentStepIndex]: 'Please complete all required fields'
        }));
      }
    } else {
      // Move to next step
      let nextStepIndex = currentStepIndex + 1;
      
      // Skip steps that don't apply
      while (nextStepIndex < WIZARD_STEPS.length) {
        const nextStep = WIZARD_STEPS[nextStepIndex];
        if (shouldShowStep(nextStep, getValues())) break;
        nextStepIndex++;
      }
      
      if (nextStepIndex < WIZARD_STEPS.length) {
        setCurrentStepIndex(nextStepIndex);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- shouldShowStep has [] deps and never changes
  }, [validateCurrentStep, currentStep.canSkip, isLastStep, currentStepIndex, getValues, onFinish, readOnly, draftVersion]);

  const handlePrevious = useCallback(() => {
    if (!isFirstStep) {
      let prevStepIndex = currentStepIndex - 1;
      
      // Find the previous applicable step
      while (prevStepIndex >= 0) {
        const prevStep = WIZARD_STEPS[prevStepIndex];
        if (shouldShowStep(prevStep, getValues())) break;
        prevStepIndex--;
      }
      
      if (prevStepIndex >= 0) {
        setCurrentStepIndex(prevStepIndex);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- shouldShowStep has [] deps and never changes
  }, [isFirstStep, currentStepIndex, getValues]);

  const handleStepClick = useCallback((stepIndex: number) => {
    if (canNavigateToStep(stepIndex)) {
      setCurrentStepIndex(stepIndex);
    }
  }, [canNavigateToStep]);

  // Determine if step should be shown based on character data
  const shouldShowStep = useCallback((step: WizardStep, data: WizardFormData): boolean => {
    switch (step.id) {
      case 'spells': {
        // Only show spells step for spellcasting classes (case-insensitive)
        const spellcastingClasses = ['wizard', 'sorcerer', 'warlock', 'bard', 'cleric', 'druid', 'paladin', 'ranger'];
        return spellcastingClasses.includes(data.class?.toLowerCase() || '');
      }
      case 'advancement':
        // Optional step, always show but allow skipping
        return true;
      default:
        return true;
    }
  }, []);

  // Handle wizard close
  const handleClose = useCallback(() => {
    if (!readOnly && hasUnsavedChanges && draftId && onSave) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      onSave(getValues(), currentStepIndex, draftVersion);
    }
    onCancel();
  }, [currentStepIndex, draftId, draftVersion, getValues, hasUnsavedChanges, onCancel, onSave, readOnly]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (event.key) {
        case 'Escape':
          handleClose();
          break;
        case 'ArrowLeft':
          if (event.ctrlKey) {
            handlePrevious();
            event.preventDefault();
          }
          break;
        case 'ArrowRight':
          if (event.ctrlKey) {
            handleNext();
            event.preventDefault();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handlePrevious, handleNext]);

  // Progress calculation (simplified to avoid infinite loops)
  // Just use current step position as progress, not completed steps filter
  const progress = useMemo(() => {
    return Math.round((currentStepIndex / (WIZARD_STEPS.length - 1)) * 100);
  }, [currentStepIndex]);

  // Render current step component
  const renderCurrentStep = () => {
    const StepComponent = currentStep.component;
    
    return (
      <ErrorBoundary
        fallback={
          <div className={styles['step-error']}>
            <h3><AlertTriangle size={16} aria-hidden /> Step Error</h3>
            <p>There was an error loading this step. Please try refreshing or contact support.</p>
            <button onClick={() => window.location.reload()}>Refresh Page</button>
          </div>
        }
      >
        <StepComponent
          onNext={handleNext}
          onPrevious={handlePrevious}
          // Don't pass watched values - child components access via useFormContext
          {...(currentStep.id === 'equipment' ? {
            onBack: handlePrevious
          } : {})}
        />
      </ErrorBoundary>
    );
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className={clsx(styles['enhanced-wizard-overlay'], className)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
      aria-describedby="wizard-description"
    >
      <div className={styles['enhanced-wizard-modal']}>
        {isInitializing ? (
          <div className={styles['wizard-initializing']}>
            <LoadingSpinner size="large" />
            <p>Initializing character wizard...</p>
          </div>
        ) : (
          <FormProvider {...form}>
            {/* Header */}
            <div className={styles['wizard-header']}>
              <div className={styles['wizard-title-section']}>
                <h1 id="wizard-title">Character Creation Wizard</h1>
                <p id="wizard-description">Create your D&D 5e character</p>
                <button
                  className={styles['wizard-close']}
                  onClick={handleClose}
                  aria-label="Close wizard"
                  type="button"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
              
              {/* Progress Bar */}
              <div className={styles['wizard-progress']}>
                <div className={styles['progress-bar']}>
                  <div
                    className={styles['progress-fill']}
                    style={{ width: `${progress}%` }}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${progress}% complete`}
                  />
                </div>
                <span className={styles['progress-text']}>{progress}% Complete</span>
              </div>

              {/* Step Navigation */}
              <nav className={styles.wizardSteps} aria-label="Wizard steps">
                {WIZARD_STEPS.map((step, originalIndex) => {
                  // Skip steps that shouldn't be shown
                  if (!shouldShowStep(step, getValues())) {
                    return null;
                  }
                  
                  return (
                    <button
                      key={step.id}
                      className={clsx(styles['step-button'], {
                        [styles.active]: originalIndex === currentStepIndex,
                        [styles.completed]: completedSteps.has(originalIndex),
                        [styles.disabled]: !canNavigateToStep(originalIndex)
                      })}
                      onClick={() => handleStepClick(originalIndex)}
                      disabled={!canNavigateToStep(originalIndex)}
                      aria-current={originalIndex === currentStepIndex ? 'step' : undefined}
                      title={step.description}
                    >
                      <span className={styles['step-number']}>
                        {WIZARD_STEPS.filter((s, i) => i <= originalIndex && shouldShowStep(s, getValues())).length})
                      </span>
                      <span className={styles['step-title']}>{step.title}</span>
                      {completedSteps.has(originalIndex) && (
                        <span className={styles['step-check']} aria-label="Completed"><Check size={14} aria-hidden /></span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Current Step Content */}
            <div className={styles.wizardContent}>
              <div className={styles['step-header']}>
                <h2>{currentStep.title}</h2>
                <p>{currentStep.description}</p>
                {stepErrors[currentStepIndex] && (
                  <div className={styles['step-error-message']} role="alert">
                    {stepErrors[currentStepIndex]}
                  </div>
                )}
              </div>
              
              {readOnly && (
                <div className={styles['step-error-message']} role="status">
                  DM view: this live draft is read-only. Only its owner can change or finalize it.
                </div>
              )}
              <fieldset disabled={readOnly} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
                <div className={styles['step-content']}>
                  {renderCurrentStep()}
                </div>
              </fieldset>
            </div>

            {/* Footer with navigation */}
            <div className={styles['wizard-footer']}>
              <div className={styles['wizard-actions']}>
                <button
                  type="button"
                  className={clsx(styles['wizard-btn'], styles['wizard-btn-secondary'])}
                  onClick={handlePrevious}
                  disabled={isFirstStep}
                >
                  ← Previous
                </button>
                
                <div className={styles['wizard-actions-right']}>
                  {!readOnly && currentStep.canSkip && (
                    <button
                      type="button"
                      className={clsx(styles['wizard-btn'], styles['wizard-btn-tertiary'])}
                      onClick={handleNext}
                    >
                      Skip →
                    </button>
                  )}
                  
                  <button
                    type="button"
                    className={clsx(styles['wizard-btn'], styles['wizard-btn-primary'])}
                    onClick={handleNext}
                  >
                    {readOnly && isLastStep ? 'End of draft' : isLastStep ? 'Create Character' : 'Next →'}
                  </button>
                </div>
              </div>
              
              {draftId && !readOnly && (
                <div className={styles['auto-save-indicator']}>
                  <Save size={14} aria-hidden />
                  {saveState === 'pending' ? 'Saving draft…' : 'Draft saved to server'}
                </div>
              )}
            </div>
          </FormProvider>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default EnhancedCharacterWizard;
